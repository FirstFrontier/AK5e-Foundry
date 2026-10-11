/**
 * Marksman sheet UI: header control and Features-tab panel that open guided dialogs.
 * Opening the panel or dialogs never writes to Actor state (WORKFLOW.md §3.2: confirm before use).
 */
import {
  marksmanProfile, marksmanLevel, marksmanBranch, marksmanState, martialDC,
  targetLockBonus, isMarksman, marksmanEnabled, flag
} from "./marksman-rules.mjs";
import { targetLockPool, unerringPool, steelRainPool } from "./marksman-features.mjs";
import { applyMarksmanSetup } from "./marksman-setup.mjs";
import { previewMarksmanProgression, applyMarksmanProgression, inspectMarksmanFields } from "./marksman-progression.mjs";
import { marksmanUses } from "./marksman-uses.mjs";
import { confirmPlayUse, openPlayUndoList, retryPlayUse, renderPlayUseCard } from "./play-uses-sheet.mjs";
import { isArtilleryman, artillerymanSplashDC } from "./artilleryman-features.mjs";
import { isBesieger, inSiegeMode } from "./besieger-features.mjs";
import { isAntiAir } from "./anti-air-features.mjs";
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

export async function openMarksmanControls(actor) {
  const profile = marksmanProfile(actor);
  const level = profile.level ?? 1;
  const branch = profile.branch;
  const state = marksmanState(actor);
  const mDC = martialDC(actor);
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
        ${branch === "artilleryman" ? ` · <strong>Splash DC:</strong> ${artillerymanSplashDC(actor)}` : ""}
        ${branch === "flinger" ? ` · <strong>Spell DC:</strong> ${flingerSpellDC(actor)}` : ""}
      </p>
      <div class="ak5e-marksman-pools-summary">
        ${lock ? `<span class="ak5e-pool-badge">Target Lock: ${lock.value} / ${lock.max}</span>` : ""}
        ${state.targetLock?.active ? `<span class="ak5e-pool-badge" style="background:#8b0000;color:#fff;">Locked: ${esc(state.targetLock.targetName)} (+${state.targetLock.bonus})</span>` : ""}
        ${inSiegeMode(actor) ? `<span class="ak5e-pool-badge" style="background:#b8860b;color:#fff;">SIEGE MODE ACTIVE</span>` : ""}
        ${inDeadshot(actor) ? `<span class="ak5e-pool-badge" style="background:#4b0082;color:#fff;">DEADSHOT ACTIVE</span>` : ""}
        ${flag(actor, "marksman")?.theLastOptionActive ? `<span class="ak5e-pool-badge" style="background:#b22222;color:#fff;">THE LAST OPTION ACTIVE</span>` : ""}
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
          <div class="ak5e-marksman-pools-summary">
            ${delDet ? `<span class="ak5e-pool-badge">Delayed Munition: ${delDet.value} / ${delDet.max}</span>` : ""}
            ${secDet ? `<span class="ak5e-pool-badge">Secondary Detonation: ${secDet.value} / ${secDet.max}</span>` : ""}
            ${scatter ? `<span class="ak5e-pool-badge">Scatter Them: ${scatter.value} / ${scatter.max}</span>` : ""}
          </div>
          <div class="ak5e-button-row">
            <button type="button" data-marksman-cmd="delayedDetonation">Deploy Delayed Munition</button>
            <button type="button" data-marksman-cmd="detonateMunition">Detonate Munition (Reaction)</button>
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
        </div>
      </div>
    `);
  }

  const content = `<div class="ak5e-marksman-panel">${sections.join("")}</div>`;

  const d = new Dialog({
    title: `Marksman Controls — ${actor.name}`,
    content,
    buttons: {
      close: { label: "Close" }
    },
    render: html => {
      html.find("[data-marksman-act='__setup']").on("click", async () => {
        d.close();
        await applyMarksmanSetup(actor, { confirmed: true });
        ui.notifications.info(`Marksman features refreshed for ${actor.name}.`);
      });

      html.find("[data-marksman-act='__undo']").on("click", () => {
        d.close();
        openPlayUndoList(actor, marksmanUses);
      });

      html.find("[data-marksman-cmd]").on("click", async event => {
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
        }

        await confirmPlayUse(actor, marksmanUses, cmd, data);
      });
    }
  });

  d.render(true);
}

export function registerMarksmanSheetHooks() {
  if (installed) return;
  installed = true;

  Hooks.on("getActorSheetHeaderButtons", (sheet, buttons) => {
    const actor = actorFor(sheet);
    if (!actor || !isMarksman(actor)) return;

    buttons.unshift({
      label: "Marksman",
      class: "ak5e-marksman-header-button",
      icon: "fas fa-crosshairs",
      onclick: () => safe(() => openMarksmanControls(actor))
    });
  });
}

