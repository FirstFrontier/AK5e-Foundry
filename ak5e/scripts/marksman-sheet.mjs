/**
 * Marksman sheet UI: header control and Features-tab panel that open guided dialogs.
 * Opening the panel or dialogs never writes to Actor state (WORKFLOW.md §3.2: confirm before use).
 */
import {
  marksmanProfile, marksmanLevel, marksmanBranch, marksmanState, martialDC,
  targetLockBonus, isMarksman, marksmanEnabled, flag, isTargetLockActive
} from "./marksman-rules.mjs";
import { targetLockPool, unerringPool, steelRainPool } from "./marksman-features.mjs";
import { applyMarksmanSetup } from "./marksman-setup.mjs";
import { previewMarksmanProgression, applyMarksmanProgression, inspectMarksmanFields } from "./marksman-progression.mjs";
import { marksmanUses } from "./marksman-uses.mjs";
import { confirmPlayUse, openPlayUndoList, retryPlayUse, renderPlayUseCard } from "./play-uses-sheet.mjs";
import { isArtilleryman, artillerymanSplashDC } from "./artilleryman-features.mjs";
import { isBesieger, inSiegeMode } from "./besieger-features.mjs";
import { isAntiAir, lastOptionActive } from "./anti-air-features.mjs";
import { isDeadeye, inDeadshot } from "./deadeye-features.mjs";
import { isFlinger, boundWeaponsList } from "./flinger-features.mjs";
import { isHeavyshot } from "./heavyshot-features.mjs";
import { isHunter, inLetTheLightIn } from "./hunter-features.mjs";
import { isSpreadshot, getLoadedShells, getShellInventory } from "./spreadshot-features.mjs";
import {
  flingerSpellDC, flingerArtsPoints, flingerMaxBoundWeapons, deadeyeVitalStrikeDice,
  hunterMaxCharges
} from "./marksman-rules.mjs";
import { getPool } from "./resource-pools.mjs";

let installed = false;
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const actorFor = app => app?.document?.documentName === "Actor" ? app.document : app?.actor?.documentName === "Actor" ? app.actor : null;
const safe = fn => Promise.resolve().then(fn).catch(error => { console.error("AK5e | Marksman UI", error); ui.notifications.error(error?.message ?? String(error)); });
const node = (tag, content, cls) => { const el = document.createElement(tag); if (content != null) el.textContent = String(content); if (cls) el.className = cls; return el; };
const button = (label, handler, cls = "") => {
  const el = node("button", label, cls); el.type = "button";
  el.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); el.disabled = true; safe(handler).finally(() => { el.disabled = false; }); });
  return el;
};

/** Read-only collection of the use's cost, target, trigger facts and manual-resolution notes. */
export async function confirmMarksmanCommand(actor, cmd, data = {}) {
  const weapons = Array.from(actor.items ?? []).filter(item => item.type === "weapon");
  const names = {
    unerring: "Unerring — 1 Short Rest use; no Action", steelRain: "Steel Rain — 1 Short Rest use; Bonus Action",
    clearTargetLock: "Clear Target Lock — no resource cost",
    targetLock: "Target Lock — 1 use; no Action", shiftingFocus: "Shifting Focus — Bonus Action; remainder of Target Lock",
    weightOfFire: "Weight of Fire — once per Turn; forgo Advantage", versatileApproach: "Versatile Approach — 1 use (own-Turn stance allowance may be free)",
    unapproachable: "Unapproachable — Reaction (free against Target)", theLastOption: "The Last Option — 1 Long Rest use; no Action", endLastOption: "End The Last Option — no resource cost",
    delayedDetonation: "Deploy Munition — 1 Short Rest use; replaces Splash Attack", detonateMunition: "Detonate Munition — Reaction to movement, or ten-minute timer",
    disarmMunition: "Disarm Munition — Action; within 5 feet", secondaryDetonation: "Secondary Detonation — 1 Long Rest use; no Action",
    scatterThem: "Scatter Them — 1 Short Rest use; no Action", chooseMartialDC: "Choose Martial DC ability — no resource cost",
    siegeMode: "Siege Mode — beginning of your Turn; no Action or resource cost", endSiegeMode: "End Siege Mode — no resource cost",
    deliberateEfficient: "Deliberate, Efficient — reduce Attack Action to one Attack; no resource cost",
    siegeBolt: "Siege Bolt — 1 Long Rest use; Action", goliathsBane: "Goliath's Bane — 1 Long Rest use; no Action",
    deadshot: "Deadshot — Bonus Action (free with Killchain); no resource cost", endDeadshot: "End Deadshot — no resource cost",
    targetOfOpportunity: "Target of Opportunity — Short Rest Action; no resource cost", vitalStrike: "Vital Strike — Action; no resource cost",
    deathblow: "Deathblow — hit against an eligible target; no resource cost",
    bindWeapon: "Bind Weapon — ten-minute ritual; no resource cost", unbindWeapon: "Unbind Weapon — no resource cost",
    commandBoundWeapons: "Command Bound Weapons — Attack Action; no resource cost", recallBoundWeapons: "Recall Bound Weapons — Action; no resource cost",
    spendArtsPoints: "Spend Arts Points — chosen Art's AP and action cost", kineticStrike: "Kinetic Strike — 1 Long Rest use; Action",
    whirlingDeath: "Whirling Death — 1 Long Rest use; Action", endWhirlingDeath: "End Whirling Death — no resource cost",
    tuneWeapon: "Weapon Tuning — Short Rest Action; no resource cost", devastatorCleave: "Devastator cleave — no resource cost",
    savageShots: "Savage Shots — 1 use; Bonus Action", heartseeker: "Heartseeker — 1 Long Rest use; no Action",
    regainCharges: `Regain Charges — ${inLetTheLightIn(actor) ? "Bonus Action" : "Action"}; no resource cost`,
    empoweredShot: "Empowered Shot — 1 Charge per option; one option free against your Target; no Action",
    railgun: `Railgun — 1 Long Rest use + ${getPool(actor, "hunterCharges")?.value ?? 0} Charges (all remaining, minimum 1); Action`,
    letTheLightIn: "Let the Light In — 1 Long Rest use; Action",
    breakContact: "Break Contact — Reaction; no resource cost", gutShot: "Gut Shot — 1 use; no Action",
    craftShells: "Make Shells — Short Rest maintenance; creates up to PB shells", loadShells: "Load Shells — Bonus Action; move shells from inventory",
    bothBarrels: "Both Barrels — 1 Long Rest use + front chambered shell; Action"
  };
  const details = await foundry.applications.api.DialogV2.wait({
    window: { title: names[cmd] ?? `Use ${cmd}` }, position: { width: 560 }, rejectClose: false,
    content: `<div class="ak5e-play-use"><p>Target: ${esc(data.targetName ?? "none selected")}.</p>
      <p>Confirm before using. Attack, damage and save dice remain under their owner's control. Manual procedures appear on the public card.</p>
      <label>Weapon for manual resolution <select name="weaponUuid"><option value="">Choose manually from your sheet</option>${weapons.map(item => `<option value="${esc(item.uuid)}">${esc(item.name)}</option>`).join("")}</select></label>
      ${["chooseMartialDC", "versatileApproach"].includes(cmd) ? `<label>Martial DC ability <select name="martialDcAbility"><option value="">${esc(martialDC(actor) == null ? "Choose STR or DEX" : `Current DC ${martialDC(actor)}`)}</option><option value="str">Strength</option><option value="dex">Dexterity</option></select></label>` : ""}
      <label><input type="checkbox" name="triggerConfirmed"> I confirm the source trigger, weapon, timing and range.</label>
      ${cmd === "weightOfFire" ? '<label><input type="checkbox" name="advantagedRangedAttack"> This is an advantaged ranged roll in my Attack Action.</label>' : ""}
      ${cmd === "versatileApproach" ? '<label><input type="checkbox" name="conditionsConfirmed"> No other Option was used on this Attack; this Option’s conditions are met.</label>' : ""}
      ${data.option === "shootToKill" ? '<label>Damage instances since my last Turn (exclude this Option) <input name="damageInstances" type="number" min="0" step="1" required></label>' : ""}
      ${cmd === "secondaryDetonation" ? '<label>Original damage (leave blank to resolve the repeated Attack/Trap manually) <input name="originalDamage" type="number" min="0" step="1"></label>' : ""}
      ${cmd === "detonateMunition" ? '<label><input name="automatic" type="checkbox"> Ten-minute automatic detonation (no Reaction)</label>' : ""}
      <label style="display:block"><span style="display:block">Resolution notes (point/height, immunity nominations, original blast, hit or movement facts)</span><textarea name="resolutionNotes" rows="3" style="width:100%"></textarea></label></div>`,
    buttons: [
      { action: "use", label: "Use", callback: (_event, btn) => {
        const fields = btn.form.elements, result = {};
        for (const name of ["weaponUuid", "martialDcAbility", "resolutionNotes"]) if (fields[name]?.value) result[name] = fields[name].value;
        for (const name of ["triggerConfirmed", "advantagedRangedAttack", "conditionsConfirmed", "automatic"]) result[name] = fields[name]?.checked === true;
        for (const name of ["damageInstances", "originalDamage"]) if (fields[name]?.value !== undefined && fields[name].value !== "") result[name] = Number(fields[name].value);
        return result;
      } }, { action: "cancel", label: "Cancel", default: true, callback: () => null }
    ]
  });
  if (!details) return null;
  const id = foundry.utils.randomID();
  return confirmPlayUse(names[cmd] ?? cmd, extra => marksmanUses.command(actor, cmd, { ...data, ...details, confirmed: true, ...extra }, id));
}

export async function openMarksmanControls(actor) {
  if (!actor?.isOwner || !isMarksman(actor)) throw new Error("Choose an owned Marksman Actor.");
  const profile = marksmanProfile(actor);
  const level = profile.level ?? 1;
  const branch = profile.branch;
  const state = marksmanState(actor);
  const mDC = martialDC(actor) ?? "choose STR/DEX";
  const lock = targetLockPool(actor);
  const unerr = unerringPool(actor);
  const rain = steelRainPool(actor);

  const sections = [];

  // Summary section
  const vaPool = getPool(actor, "versatileApproach");
  const apPool = getPool(actor, "flingerArtsPoints");
  const boundWeapons = isFlinger(actor) ? boundWeaponsList(actor) : [];
  const maxBound = isFlinger(actor) ? flingerMaxBoundWeapons(actor) : 0;
  const savagePool = getPool(actor, "savageShots");
  const heartPool = getPool(actor, "heartseeker");
  const hunterPool = getPool(actor, "hunterCharges");
  const railgunPool = getPool(actor, "railgun");
  const lightPool = getPool(actor, "letTheLightIn");
  const gutPool = getPool(actor, "gutShot");
  const barrelsPool = getPool(actor, "bothBarrels");
  const loadedShells = isSpreadshot(actor) ? getLoadedShells(actor) : [];

  sections.push(`
    <div class="ak5e-marksman-status">
      <h4>${esc(actor.name)} — Marksman Level ${level}${branch ? ` (${branch.toUpperCase()})` : ""}</h4>
      <p>
        <strong>Martial DC:</strong> ${mDC}
        ${branch === "artilleryman" ? ` · <strong>Splash DC (manual):</strong> ${artillerymanSplashDC(actor) ?? "choose STR/DEX"}` : ""}
        ${branch === "flinger" ? ` · <strong>Spell DC:</strong> ${flingerSpellDC(actor)}` : ""}
      </p>
      <div class="ak5e-marksman-pools-summary">
        ${lock ? `<span class="ak5e-pool-badge">Target Lock: ${lock.value} / ${lock.max}</span>` : ""}
        ${isTargetLockActive(actor) ? `<span class="ak5e-pool-badge" style="background:#8b0000;color:#fff;">Locked: ${esc(state.targetLock.targetName)} (+${state.targetLock.bonus})</span>` : ""}
        ${inSiegeMode(actor) ? `<span class="ak5e-pool-badge" style="background:#b8860b;color:#fff;">SIEGE MODE ACTIVE</span>` : ""}
        ${inDeadshot(actor) ? `<span class="ak5e-pool-badge" style="background:#4b0082;color:#fff;">DEADSHOT ACTIVE</span>` : ""}
        ${lastOptionActive(actor) ? `<span class="ak5e-pool-badge" style="background:#b22222;color:#fff;">THE LAST OPTION ACTIVE</span>` : ""}
        ${flag(actor, "marksman")?.whirlingDeathActive ? `<span class="ak5e-pool-badge" style="background:#800000;color:#fff;">WHIRLING DEATH ACTIVE</span>` : ""}
        ${inLetTheLightIn(actor) ? `<span class="ak5e-pool-badge" style="background:#ffd700;color:#000;">LET THE LIGHT IN ACTIVE</span>` : ""}
        ${vaPool ? `<span class="ak5e-pool-badge">Versatile Approach: ${vaPool.value} / ${vaPool.max}</span>` : ""}
        ${apPool ? `<span class="ak5e-pool-badge">Arts Points: ${apPool.value} / ${apPool.max}</span>` : ""}
        ${isFlinger(actor) ? `<span class="ak5e-pool-badge">Bound Weapons: ${boundWeapons.length} / ${maxBound}</span>` : ""}
        ${savagePool ? `<span class="ak5e-pool-badge">Savage Shots: ${savagePool.value} / ${savagePool.max}</span>` : ""}
        ${heartPool ? `<span class="ak5e-pool-badge">Heartseeker: ${heartPool.value} / ${heartPool.max}</span>` : ""}
        ${hunterPool ? `<span class="ak5e-pool-badge">Hunter Charges: ${hunterPool.value} / ${hunterPool.max}</span>` : ""}
        ${railgunPool ? `<span class="ak5e-pool-badge">Railgun: ${railgunPool.value} / ${railgunPool.max}</span>` : ""}
        ${lightPool ? `<span class="ak5e-pool-badge">Let the Light In: ${lightPool.value} / ${lightPool.max}</span>` : ""}
        ${gutPool ? `<span class="ak5e-pool-badge">Gut Shot: ${gutPool.value} / ${gutPool.max}</span>` : ""}
        ${barrelsPool ? `<span class="ak5e-pool-badge">Both Barrels: ${barrelsPool.value} / ${barrelsPool.max}</span>` : ""}
        ${loadedShells.length > 0 ? `<span class="ak5e-pool-badge" style="background:#2e8b57;color:#fff;">Shells: [${loadedShells.join(", ")}]</span>` : ""}
        ${level >= 17 && unerr ? `<span class="ak5e-pool-badge">Unerring: ${unerr.value} / ${unerr.max}</span>` : ""}
        ${level >= 20 && rain ? `<span class="ak5e-pool-badge">Steel Rain: ${rain.value} / ${rain.max}</span>` : ""}
      </div>
    </div>
  `);

  if (!marksmanEnabled(actor)) {
    sections.push(`
      <div class="ak5e-marksman-unconfigured">
        <p>This character is not yet configured with Marksman class features.</p>
        <button type="button" data-marksman-act="__setup">Grant Core Marksman Features</button>
      </div>
    `);
  } else {
    // Core Marksman Actions
    sections.push(`
      <div class="ak5e-marksman-action-group">
        <h5>Target Lock & Class Features</h5>
        <div class="ak5e-button-row">
          <button type="button" data-marksman-cmd="targetLock">Target Lock (1 min, +${targetLockBonus(actor)})</button>
          ${state.targetLock?.active ? `<button type="button" data-marksman-cmd="clearTargetLock">Clear Target Lock</button>` : ""}
        </div>
        ${level >= 17 ? `
          <div class="ak5e-button-row">
            <button type="button" data-marksman-cmd="unerring">Unerring (Turn Miss into Hit)</button>
          </div>
        ` : ""}
        ${level >= 20 ? `
          <div class="ak5e-button-row">
            <button type="button" data-marksman-cmd="steelRain">Steel Rain (Attack Action as Bonus Action)</button>
          </div>
        ` : ""}
      </div>
    `);

    // Subclass: Artilleryman
    if (branch === "artilleryman") {
      const secDet = getPool(actor, "secondaryDetonation");
      const delDet = getPool(actor, "delayedDetonation");
      const scatter = getPool(actor, "scatterThem");
      sections.push(`
        <div class="ak5e-marksman-action-group">
          <h5>Artilleryman Features</h5>
          <p>Manual benefits: Controlled Demolition adds the active Target Lock bonus to that Target’s trap/Splash DC (retain a trap’s existing base DC). At 10+, add 2 to Splash DC and optionally double Splash(X) during your Attack Action. At 15+, double only Thunder damage against each Vehicle/Structure. At 18+, ignore Loading for wielded Grenade/Rocket Launchers; apply Thunder Resistance and immunity to your own Thunder damage, including delayed/secondary blasts. Native rolls and defenses do not apply these benefits automatically.</p>
          <div class="ak5e-marksman-pools-summary">
            ${delDet ? `<span class="ak5e-pool-badge">Delayed Munition: ${delDet.value} / ${delDet.max}</span>` : ""}
            ${secDet ? `<span class="ak5e-pool-badge">Secondary Detonation: ${secDet.value} / ${secDet.max}</span>` : ""}
            ${scatter ? `<span class="ak5e-pool-badge">Scatter Them: ${scatter.value} / ${scatter.max}</span>` : ""}
          </div>
          <div class="ak5e-button-row">
            <button type="button" data-marksman-cmd="delayedDetonation">Deploy Delayed Munition</button>
            <button type="button" data-marksman-cmd="detonateMunition">Detonate Munition (Reaction)</button>
            <button type="button" data-marksman-cmd="disarmMunition">Disarm Munition (Action, 5 ft)</button>
          </div>
          ${level >= 4 ? `
            <div class="ak5e-button-row">
              <button type="button" data-marksman-cmd="secondaryDetonation">Secondary Detonation (Halved Thunder)</button>
            </div>
          ` : ""}
          ${level >= 15 ? `
            <div class="ak5e-button-row">
              <button type="button" data-marksman-cmd="scatterThem">Scatter Them (30 ft fling, 4d8 collision)</button>
            </div>
          ` : ""}
        </div>
      `);
    }

    // Subclass: Besieger
    if (branch === "besieger") {
      const bolt = getPool(actor, "siegeBolt");
      const bane = getPool(actor, "goliathsBane");
      sections.push(`
        <div class="ak5e-marksman-action-group">
          <h5>Besieger Features</h5>
          <div class="ak5e-marksman-pools-summary">
            ${bolt ? `<span class="ak5e-pool-badge">Siege Bolt: ${bolt.value} / ${bolt.max}</span>` : ""}
            ${bane ? `<span class="ak5e-pool-badge">Goliath's Bane: ${bane.value} / ${bane.max}</span>` : ""}
          </div>
          <div class="ak5e-button-row">
            ${!inSiegeMode(actor) ? `
              <button type="button" data-marksman-cmd="siegeMode">Enter Siege Mode (Speed 0, +1d8, Crush)</button>
            ` : `
              <button type="button" data-marksman-cmd="endSiegeMode">End Siege Mode</button>
            `}
          </div>
          ${level >= 4 ? `
            <div class="ak5e-button-row">
              <button type="button" data-marksman-cmd="deliberateEfficient">Deliberate, Efficient (1 Attack, Bypass DR)</button>
            </div>
          ` : ""}
          ${level >= 10 ? `
            <div class="ak5e-button-row">
              <button type="button" data-marksman-cmd="siegeBolt">Siege Bolt (5d8 Piercing DOT, Bypass DR)</button>
            </div>
          ` : ""}
          ${level >= 15 ? `
            <div class="ak5e-button-row">
              <button type="button" data-marksman-cmd="goliathsBane">Goliath's Bane (Con Save or Stunned)</button>
            </div>
          ` : ""}
        </div>
      `);
    }

    // Subclass: Anti-Air
    if (branch === "antiAir") {
      const va = getPool(actor, "versatileApproach");
      const lo = getPool(actor, "theLastOption");
      sections.push(`
        <div class="ak5e-marksman-action-group">
          <h5>Anti-Air Features</h5>
          <div class="ak5e-marksman-pools-summary">
            ${va ? `<span class="ak5e-pool-badge">Versatile Approach: ${va.value} / ${va.max}</span>` : ""}
            ${lo ? `<span class="ak5e-pool-badge">The Last Option: ${lo.value} / ${lo.max}</span>` : ""}
          </div>
          <div class="ak5e-button-row">
            <button type="button" data-marksman-cmd="weightOfFire">Weight of Fire (Forgo Adv for Repeat)</button>
            <button type="button" data-marksman-cmd="shiftingFocus">Shifting Focus (BA Retarget at 0 HP)</button>
          </div>
          ${level >= 4 ? `
            <div class="ak5e-button-row">
              <button type="button" data-marksman-cmd="versatileApproach" data-option="areaDenial">Area Denial (10-ft Rain, Dex Save)</button>
              <button type="button" data-marksman-cmd="versatileApproach" data-option="crowdControl">Crowd Control (Repeat vs Nearby)</button>
            </div>
            <div class="ak5e-button-row">
              <button type="button" data-marksman-cmd="versatileApproach" data-option="stopApproach">Stop their Approach (-20 ft Speed)</button>
              <button type="button" data-marksman-cmd="versatileApproach" data-option="shootToKill">Shoot to Kill (+1d4/1d6 Escalation)</button>
            </div>
          ` : ""}
          ${level >= 10 ? `
            <div class="ak5e-button-row">
              <button type="button" data-marksman-cmd="unapproachable">Unapproachable (Reaction Attack + Half Move)</button>
            </div>
          ` : ""}
          ${level >= 18 ? `
            <div class="ak5e-button-row">
              <button type="button" data-marksman-cmd="theLastOption">The Last Option (1 Min: Free Option + Attack)</button>
              <button type="button" data-marksman-cmd="endLastOption">End The Last Option (manual timing)</button>
            </div>
          ` : ""}
        </div>
      `);
    }

    // Subclass: Deadeye
    if (branch === "deadeye") {
      sections.push(`
        <div class="ak5e-marksman-action-group">
          <h5>Deadeye Features</h5>
          <div class="ak5e-button-row">
            ${!inDeadshot(actor) ? `
              <button type="button" data-marksman-cmd="deadshot">Enter Deadshot (BA: 2x PB, Min 3 Dice)</button>
            ` : `
              <button type="button" data-marksman-cmd="endDeadshot">End Deadshot State</button>
            `}
            <button type="button" data-marksman-cmd="targetOfOpportunity">Target of Opportunity (SR Mark)</button>
          </div>
          ${level >= 4 ? `
            <div class="ak5e-button-row">
              <button type="button" data-marksman-cmd="vitalStrike">Vital Strike (Action in Deadshot: +${deadeyeVitalStrikeDice(actor)})</button>
            </div>
          ` : ""}
          ${level >= 15 ? `
            <div class="ak5e-button-row">
              <button type="button" data-marksman-cmd="deathblow">Deathblow (Execute below ${level} HP)</button>
            </div>
          ` : ""}
        </div>
      `);
    }

    // Subclass: Flinger
    if (branch === "flinger") {
      const ap = getPool(actor, "flingerArtsPoints");
      const ks = getPool(actor, "kineticStrike");
      const wd = getPool(actor, "whirlingDeath");
      const bound = boundWeaponsList(actor);
      const maxB = flingerMaxBoundWeapons(actor);

      sections.push(`
        <div class="ak5e-marksman-action-group">
          <h5>Flinger Features</h5>
          <div class="ak5e-marksman-pools-summary">
            ${ap ? `<span class="ak5e-pool-badge">Arts Points: ${ap.value} / ${ap.max}</span>` : ""}
            <span class="ak5e-pool-badge">Bound Weapons: ${bound.length} / ${maxB}</span>
            ${ks ? `<span class="ak5e-pool-badge">Kinetic Strike: ${ks.value} / ${ks.max}</span>` : ""}
            ${wd ? `<span class="ak5e-pool-badge">Whirling Death: ${wd.value} / ${wd.max}</span>` : ""}
          </div>
          <div class="ak5e-button-row">
            <button type="button" data-marksman-cmd="commandBoundWeapons">Command Bound Weapons (30 ft Move & Strike)</button>
            <button type="button" data-marksman-cmd="recallBoundWeapons">Recall Bound Weapons (100 ft)</button>
          </div>
          <div class="ak5e-button-row">
            <button type="button" data-marksman-cmd="bindWeapon">Bind Melee Weapon (${bound.length}/${maxB})</button>
            ${bound.length > 0 ? `<button type="button" data-marksman-cmd="unbindWeapon">Unbind Weapon</button>` : ""}
            <button type="button" data-marksman-cmd="spendArtsPoints">Cast Art / Spend AP</button>
          </div>
          ${level >= 10 ? `
            <div class="ak5e-button-row">
              <button type="button" data-marksman-cmd="kineticStrike">Kinetic Strike (DC ${flingerSpellDC(actor)}, ${bound.length * 4}d8)</button>
            </div>
          ` : ""}
          ${level >= 18 ? `
            <div class="ak5e-button-row">
              ${!flag(actor, "marksman")?.whirlingDeathActive ? `
                <button type="button" data-marksman-cmd="whirlingDeath">Whirling Death (50 ft Sphere, 8d8)</button>
              ` : `
                <button type="button" data-marksman-cmd="endWhirlingDeath">End Whirling Death</button>
              `}
            </div>
          ` : ""}
        </div>
      `);
    }

    // Subclass: Heavyshot
    if (branch === "heavyshot") {
      const savage = getPool(actor, "savageShots");
      const heart = getPool(actor, "heartseeker");
      sections.push(`
        <div class="ak5e-marksman-action-group">
          <h5>Heavyshot Features</h5>
          <div class="ak5e-marksman-pools-summary">
            ${savage ? `<span class="ak5e-pool-badge">Savage Shots: ${savage.value} / ${savage.max}</span>` : ""}
            ${heart ? `<span class="ak5e-pool-badge">Heartseeker: ${heart.value} / ${heart.max}</span>` : ""}
          </div>
          <div class="ak5e-button-row">
            <button type="button" data-marksman-cmd="tuneWeapon">Modify Heavy Ranged Weapon (Custom Job)</button>
            <button type="button" data-marksman-cmd="devastatorCleave">Devastator (Pass-through Cleave on 0 HP)</button>
          </div>
          ${level >= 4 ? `
            <div class="ak5e-button-row">
              <button type="button" data-marksman-cmd="savageShots">Savage Shots (BA: Reroll Damage Dice vs Target)</button>
            </div>
          ` : ""}
          ${level >= 18 ? `
            <div class="ak5e-button-row">
              <button type="button" data-marksman-cmd="heartseeker">Heartseeker (Maximize All Damage Dice)</button>
            </div>
          ` : ""}
        </div>
      `);
    }

    // Subclass: Hunter
    if (branch === "hunter") {
      const charges = getPool(actor, "hunterCharges");
      const rail = getPool(actor, "railgun");
      const light = getPool(actor, "letTheLightIn");
      const isLight = inLetTheLightIn(actor);
      sections.push(`
        <div class="ak5e-marksman-action-group">
          <h5>Hunter Features</h5>
          <div class="ak5e-marksman-pools-summary">
            ${charges ? `<span class="ak5e-pool-badge">Hunter Charges: ${charges.value} / ${charges.max}</span>` : ""}
            ${rail ? `<span class="ak5e-pool-badge">Railgun: ${rail.value} / ${rail.max}</span>` : ""}
            ${light ? `<span class="ak5e-pool-badge">Let the Light In: ${light.value} / ${light.max}</span>` : ""}
          </div>
          <div class="ak5e-button-row">
            <button type="button" data-marksman-cmd="regainCharges">Regain Charges (${isLight ? "Bonus Action" : "Action"})</button>
            <button type="button" data-marksman-cmd="empoweredShot" data-option="piercing">Piercing Shot (${level >= 15 ? "+2d8 Force" : "+1d8 Piercing"})</button>
          </div>
          ${level >= 4 ? `
            <div class="ak5e-button-row">
              <button type="button" data-marksman-cmd="empoweredShot" data-option="concussive">Concussive Shot (Str Save, 10 ft Knockback)</button>
              <button type="button" data-marksman-cmd="empoweredShot" data-option="dazing">Dazing Shot (Con Save, Dazed)</button>
            </div>
            <div class="ak5e-button-row">
              <button type="button" data-marksman-cmd="empoweredShot" data-option="fragmentation">Fragmentation Shot (${level >= 15 ? "1d12 Thunder" : "1d8 Thunder"})</button>
              <button type="button" data-marksman-cmd="empoweredShot" data-option="seeking">Seeking Shot (${level >= 15 ? "+2d4 Attack" : "+1d6 Attack"})</button>
            </div>
          ` : ""}
          ${level >= 10 ? `
            <div class="ak5e-button-row">
              <button type="button" data-marksman-cmd="railgun">Railgun (100 ft Line, 2d6 Force per Charge)</button>
            </div>
          ` : ""}
          ${level >= 18 ? `
            <div class="ak5e-button-row">
              <button type="button" data-marksman-cmd="letTheLightIn">Let the Light In (Refill Charges, 1-min Stance)</button>
            </div>
          ` : ""}
        </div>
      `);
    }

    // Subclass: Spreadshot
    if (branch === "spreadshot") {
      const gut = getPool(actor, "gutShot");
      const barrels = getPool(actor, "bothBarrels");
      const loaded = getLoadedShells(actor);
      const inv = getShellInventory(actor);
      sections.push(`
        <div class="ak5e-marksman-action-group">
          <h5>Spreadshot Features</h5>
          <div class="ak5e-marksman-pools-summary">
            ${gut ? `<span class="ak5e-pool-badge">Gut Shot: ${gut.value} / ${gut.max}</span>` : ""}
            ${barrels ? `<span class="ak5e-pool-badge">Both Barrels: ${barrels.value} / ${barrels.max}</span>` : ""}
            <span class="ak5e-pool-badge">Chambered: [${loaded.join(", ") || "Empty"}]</span>
            <span class="ak5e-pool-badge">Inv: D:${inv.dragonsBreath} F:${inv.flechette} S:${inv.slug} B:${inv.beanbag}</span>
          </div>
          <div class="ak5e-button-row">
            <button type="button" data-marksman-cmd="breakContact">Break Contact (Reaction, Half Damage Ranged Attack)</button>
          </div>
          ${level >= 4 ? `
            <div class="ak5e-button-row">
              <button type="button" data-marksman-cmd="gutShot">Gut Shot (+PB Damage & 10 ft Knockback)</button>
            </div>
          ` : ""}
          ${level >= 10 ? `
            <div class="ak5e-button-row">
              <button type="button" data-marksman-cmd="craftShells">Make Shells (Short Rest, PB created)</button>
              <button type="button" data-marksman-cmd="loadShells">Load Shells (Bonus Action, up to 5)</button>
            </div>
          ` : ""}
          ${level >= 18 ? `
            <div class="ak5e-button-row">
              <button type="button" data-marksman-cmd="bothBarrels">Both Barrels (50 ft Cone / 60 ft Single, consume shell)</button>
            </div>
          ` : ""}
        </div>
      `);
    }

    // Progression and Utility
    sections.push(`
      <div class="ak5e-marksman-action-group">
        <h5>Character Setup & Undo</h5>
        <div class="ak5e-button-row">
          <button type="button" data-marksman-act="__setup">Refresh Marksman Features</button>
          <button type="button" data-marksman-act="__undo">Undo a Recent Use</button>
          <button type="button" data-marksman-cmd="chooseMartialDC">Choose Martial DC Ability</button>
        </div>
      </div>
    `);
  }

  const instructions = inspectMarksmanFields(actor).manualInstructions ?? [];
  const content = `<div class="ak5e-marksman-panel" style="max-height:65vh;overflow-y:auto;scrollbar-width:auto"><p>Manual rules: attack/save owners roll their own dice; tokens, blast geometry and lingering conditions are resolved by the table. Outside combat, track each Turn for first-attack/once-per-Turn features.</p>${sections.join("")}<h5>Progression manual procedures</h5>${instructions.map(text => `<p>${esc(text)}</p>`).join("")}</div>`;

  const d = new Dialog({
    title: `Marksman Controls — ${actor.name}`,
    content,
    buttons: {
      close: { label: "Close" }
    },
    render: html => {
      html.find("[data-marksman-act='__setup']").on("click", () => safe(async () => {
        const accepted = await foundry.applications.api.DialogV2.confirm({ window: { title: "Refresh Marksman features" }, content: "<p>Add missing source feature Items and repair generated placeholders? Authored Items are preserved.</p>" });
        if (!accepted) return;
        d.close();
        await applyMarksmanSetup(actor, { confirmed: true });
        ui.notifications.info(`Marksman features refreshed for ${actor.name}.`);
      }));

      html.find("[data-marksman-act='__undo']").on("click", () => {
        d.close();
        safe(() => openPlayUndoList(marksmanUses, actor));
      });

      html.find("[data-marksman-cmd]").on("click", event => safe(async () => {
        const cmd = event.currentTarget.dataset.marksmanCmd;
        const option = event.currentTarget.dataset.option;
        d.close();

        let data = {};
        if (option) {
          data.option = option;
        }

        const target = game.user.targets.first();
        if (target) {
          data.targetUuid = target.document.uuid;
          data.targetName = target.name;
          data.currentHp = target.actor?.system?.attributes?.hp?.value;
          data.targetActorUuid = target.actor?.uuid;
          data.targetHostile = target.document?.disposition === -1;
          data.targetVisible = target.visible !== false;
        }
        const previous = state.targetLock?.targetUuid ? await fromUuid(state.targetLock.targetUuid) : null;
        data.previousTargetHp = (previous?.actor ?? previous)?.system?.attributes?.hp?.value;
        data.targetUuids = Array.from(game.user.targets ?? []).map(token => token.actor?.uuid).filter(Boolean);

        await confirmMarksmanCommand(actor, cmd, data);
      }));
    }
  });

  d.render(true);
  return d;
}

export function registerMarksmanSheetHooks() {
  if (installed) return;
  installed = true;

  Hooks.on("getActorSheetHeaderButtons", (sheet, buttons) => {
    const actor = actorFor(sheet);
    if (!actor?.isOwner || !isMarksman(actor)) return;

    buttons.unshift({
      label: "Marksman",
      class: "ak5e-marksman-header-button",
      icon: "fas fa-crosshairs",
      onclick: () => safe(() => openMarksmanControls(actor))
    });
  });
  Hooks.on("getHeaderControlsApplicationV2", (app, controls) => {
    const actor = actorFor(app);
    if (!actor?.isOwner || !isMarksman(actor)) return;
    controls.push({ label: "Marksman", icon: "fas fa-crosshairs", action: "ak5eMarksman", visible: true,
      onClick: () => safe(() => openMarksmanControls(actor)) });
  });
  Hooks.on("renderChatMessageHTML", (message, html) => {
    renderPlayUseCard(marksmanUses, message, html);
    renderMarksmanResolution(message, html);
  });
}

/** Owners start native attacks/saves explicitly; no dice are started while rendering a card. */
export function renderMarksmanResolution(message, html) {
  const use = flag(message, marksmanUses.cardFlag);
  if (!use || html.querySelector(".ak5e-marksman-resolution")) return;
  const actor = fromUuidSync(use.actorUuid), receipt = actor && marksmanUses.receipt(actor, use.useId);
  if (!receipt || receipt.status === "undone") return;
  const box = node("div", null, "ak5e-marksman-resolution");
  // Splash resolves with saves, never an Attack Roll (C4:197–198). Preserve its
  // weapon provenance on the receipt without offering a native attack activity.
  const splashOnly = ["detonateMunition", "secondaryDetonation"].includes(receipt.command);
  if (actor.isOwner && receipt.weaponUuid && !splashOnly) box.append(button("Open weapon use / repeat attack", async () => {
    const weapon = await fromUuid(receipt.weaponUuid);
    if (weapon?.parent?.uuid !== actor.uuid || weapon.type !== "weapon") throw new Error("Choose an owned weapon from your sheet.");
    await weapon.use({}, { configure: true });
  }));
  if (receipt.saveAbility && receipt.saveTargetUuid) {
    const target = fromUuidSync(receipt.saveTargetUuid);
    if (target?.isOwner) box.append(button(`Roll ${receipt.saveAbility.toUpperCase()} save`, () => target.rollSavingThrow({ ability: receipt.saveAbility, target: receipt.result?.dc })));
  }
  if (box.childElementCount) html.querySelector(".message-content")?.append(box);
}

