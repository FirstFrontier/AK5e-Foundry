/**
 * Guard sheet UI: header control and Features-tab panel that open guided dialogs.
 * Opening the panel or dialogs never writes to Actor state (WORKFLOW.md §3.2: confirm before use).
 */
import { guardProfile, guardLevel, guardBranch, guardState, martialDC, centurionDC, flag } from "./guard-rules.mjs";
import { getGuardView } from "./guard-features.mjs";
import { previewGuardSetup, applyGuardSetup } from "./guard-setup.mjs";
import { previewGuardProgression, applyGuardProgression, inspectGuardFields } from "./guard-progression.mjs";
import { guardUses } from "./guard-uses.mjs";
import { confirmPlayUse, openPlayUndoList, retryPlayUse, renderPlayUseCard } from "./play-uses-sheet.mjs";
import { isCenturion } from "./centurion-features.mjs";
import { isCrusher } from "./crusher-features.mjs";
import { isInstructor, INSTRUCTIONS } from "./instructor-features.mjs";
import { isArtsblade, ARTS_POOLS, getArtsbladePoolChoices, maxArtLevel } from "./artsblade-features.mjs";
import { isBrawler, bobAndWeaveAC, isUnarmoredOrLight } from "./brawler-features.mjs";
import { isDuellist } from "./duellist-features.mjs";
import { isLiberator, guideTheMassesBonus } from "./liberator-features.mjs";
import { isLord, hasAuthority, manifestationDamageType, forceOfWillCategory } from "./lord-features.mjs";
import { isMusha, getNotYetDC, getNothingToLoseAttacks, livingOnTheEdgeBonus } from "./musha-features.mjs";
import { isReaper, getRuin, getReaperTableEntry, getReapCritThreshold, getCurtainfallCritThreshold } from "./reaper-features.mjs";
import { isWeaponmaster, MARTIAL_MASTERY_TABLE, WEAPONMASTER_FIGHTING_STYLES } from "./weaponmaster-features.mjs";
import { getPool } from "./resource-pools.mjs";

let installed = false;
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const actorFor = app => app?.document?.documentName === "Actor" ? app.document : app?.actor?.documentName === "Actor" ? app.actor : null;
const safe = fn => Promise.resolve().then(fn).catch(error => { console.error("AK5e | Guard UI", error); ui.notifications.error(error?.message ?? String(error)); });
const node = (tag, content, cls) => { const el = document.createElement(tag); if (content != null) el.textContent = String(content); if (cls) el.className = cls; return el; };
const button = (label, handler, cls = "") => {
  const el = node("button", label, cls); el.type = "button";
  el.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); el.disabled = true; safe(handler).finally(() => { el.disabled = false; }); });
  return el;
};
const operationId = () => foundry.utils.randomID();

export async function openGuardControls(actor) {
  const view = getGuardView(actor);
  const profile = view.profile;
  const level = profile.level ?? 1;
  const branch = profile.branch;
  const state = guardState(actor);
  const mDC = martialDC(actor);

  const sections = [];

  // Summary section
  sections.push(`
    <div class="ak5e-guard-status">
      <h4>${esc(actor.name)} — Guard Level ${level}${branch ? ` (${branch.toUpperCase()})` : ""}</h4>
      <p><strong>Martial DC:</strong> ${mDC}${branch === "centurion" ? ` · <strong>Centurion DC:</strong> ${centurionDC(actor)}` : ""}</p>
      <div class="ak5e-guard-pools-summary">
        ${view.aggression ? `<span class="ak5e-pool-badge">Aggression: ${view.aggression.value} / ${view.aggression.max}</span>` : ""}
        ${view.unrelenting ? `<span class="ak5e-pool-badge">Unrelenting: ${view.unrelenting.value} / ${view.unrelenting.max}</span>` : ""}
        ${isArtsblade(actor) ? `<span class="ak5e-pool-badge">SP: ${getPool(actor, "spellswordPoints")?.value ?? 1} / ${getPool(actor, "spellswordPoints")?.max ?? 1} (Max Art Lvl: ${maxArtLevel(level)})</span>` : ""}
        ${isBrawler(actor) ? `<span class="ak5e-pool-badge">Bob &amp; Weave AC: ${bobAndWeaveAC(actor)}</span>` : ""}
        ${isDuellist(actor) ? `<span class="ak5e-pool-badge">Points: ${getPool(actor, "duellistPoints")?.value ?? 0}/10${flag(actor, "guard")?.duellist?.opponent?.name ? ` (Opponent: ${esc(flag(actor, "guard").duellist.opponent.name)})` : ""}</span>` : ""}
        ${isLiberator(actor) ? `<span class="ak5e-pool-badge">Liberty: ${getPool(actor, "liberty")?.value ?? 0}/6</span>` : ""}
        ${isLord(actor) ? `<span class="ak5e-pool-badge">Authority: ${hasAuthority(actor) ? "Active" : "Inactive"}</span> · <span class="ak5e-pool-badge">Manifestation: ${getPool(actor, "manifestation")?.value ?? 0}/${getPool(actor, "manifestation")?.max ?? 2}</span>` : ""}
        ${isMusha(actor) ? `<span class="ak5e-pool-badge">Musha: ${getNothingToLoseAttacks(actor)} Bonus Attack(s)${livingOnTheEdgeBonus(actor) ? ` · Edge AC/Save: +${livingOnTheEdgeBonus(actor)}` : ""} · Not Yet DC: ${getNotYetDC(actor)}</span>` : ""}
        ${isReaper(actor) ? `<span class="ak5e-pool-badge">Ruin: ${getRuin(actor)}/10 (Reap Crit: ${getReapCritThreshold(actor)}+, Curtainfall Crit: ${getCurtainfallCritThreshold(actor)}+)</span>` : ""}
        ${isWeaponmaster(actor) ? `<span class="ak5e-pool-badge">Signature: ${flag(actor, "weaponmaster")?.signatureWeaponName ?? "None"}</span>` : ""}
      </div>
    </div>
  `);

  if (!profile.configured) {
    sections.push(`
      <div class="ak5e-guard-unconfigured">
        <p>This character is not yet configured with Guard class features.</p>
        <button type="button" data-guard-act="__setup">Grant Core Guard Features</button>
      </div>
    `);
  } else {
    // Core Guard Actions
    sections.push(`
      <div class="ak5e-guard-action-group">
        <h5>Press the Attack & Guard Features</h5>
        <div class="ak5e-button-row">
          <button type="button" data-guard-cmd="forestall">Forestall (1-3 Aggression, Reaction)</button>
          <button type="button" data-guard-cmd="smite">Smite (1-3 Aggression)</button>
          <button type="button" data-guard-cmd="strikeTrue">Strike True (1-3 Aggression)</button>
        </div>
        ${level >= 3 ? `
          <div class="ak5e-button-row">
            <button type="button" data-guard-cmd="unrelenting">Unrelenting (1 Use)</button>
            <button type="button" data-guard-cmd="pursuitUnrelenting">Pursuit Unrelenting (2 Uses)</button>
          </div>
        ` : ""}
        ${level >= 15 ? `
          <div class="ak5e-button-row">
            <button type="button" data-guard-cmd="unrelentingAggression">Unrelenting Aggression (2 Aggression)</button>
          </div>
        ` : ""}
      </div>
    `);

    // Subclass: Centurion
    if (isCenturion(actor)) {
      sections.push(`
        <div class="ak5e-guard-action-group">
          <h5>Centurion Features</h5>
          <div class="ak5e-button-row">
            <button type="button" data-guard-cmd="cycloneStrike">Cyclone Strike</button>
            <button type="button" data-guard-cmd="brutalExecution">Brutal Execution (2 Aggression)</button>
            ${level >= 4 ? `<button type="button" data-guard-cmd="ferociousFling">Ferocious Fling</button>` : ""}
          </div>
          ${level >= 10 ? `
            <div class="ak5e-button-row">
              <button type="button" data-guard-cmd="guillotine">Guillotine</button>
              ${level >= 13 ? `<button type="button" data-guard-cmd="shredder">Shredder</button>` : ""}
              ${level >= 17 ? `<button type="button" data-guard-cmd="stormOfBlood">Storm of Blood</button>` : ""}
            </div>
          ` : ""}
        </div>
      `);
    }

    // Subclass: Crusher
    if (isCrusher(actor)) {
      sections.push(`
        <div class="ak5e-guard-action-group">
          <h5>Crusher Features</h5>
          <div class="ak5e-button-row">
            <button type="button" data-guard-cmd="deathPassing">Death's Passing (half Thunder on miss)</button>
            ${level >= 4 ? `
              <button type="button" data-guard-cmd="foecrusher">Foecrusher (1 Use)</button>
              <button type="button" data-guard-cmd="overbear">Overbear (2 Aggression)</button>
            ` : ""}
          </div>
          ${level >= 10 ? `
            <div class="ak5e-button-row">
              <button type="button" data-guard-cmd="hordeBreaker">Horde Breaker</button>
              ${level >= 13 ? `<button type="button" data-guard-cmd="heroicBlow">Heroic Blow (1 Foecrusher)</button>` : ""}
              ${level >= 17 ? `<button type="button" data-guard-cmd="heroicKillingBlow">Heroic Killing Blow</button>` : ""}
            </div>
          ` : ""}
        </div>
      `);
    }

    // Subclass: Instructor
    if (isInstructor(actor)) {
      sections.push(`
        <div class="ak5e-guard-action-group">
          <h5>Instructor Features</h5>
          <div class="ak5e-button-row">
            <button type="button" data-guard-cmd="instruction">Issue Instruction (1 Die)</button>
            ${level >= 4 ? `<button type="button" data-guard-cmd="teachFromExperience">Teach from Experience (Self, Free)</button>` : ""}
            ${level >= 17 ? `<button type="button" data-guard-cmd="onceMoreUntoTheBreach">Once More Unto The Breach (1/LR)</button>` : ""}
          </div>
        </div>
      `);
    }

    // Subclass: Artsblade
    if (isArtsblade(actor)) {
      sections.push(`
        <div class="ak5e-guard-action-group">
          <h5>Artsblade Features</h5>
          <div class="ak5e-button-row">
            <button type="button" data-guard-cmd="bladeArt">Blade Art (Cantrip)</button>
            <button type="button" data-guard-cmd="castSpellswordArt">Cast Spellsword Art (1 SP)</button>
            <button type="button" data-guard-cmd="augmentedAssault">Augmented Assault (2 Aggression)</button>
          </div>
          ${level >= 4 ? `
            <div class="ak5e-button-row">
              <button type="button" data-guard-cmd="cutThroughChaos">Cut Through Chaos (Reaction)</button>
              ${level >= 17 ? `<button type="button" data-guard-cmd="ultimateBladeArt">Ultimate Blade Art (1/LR)</button>` : ""}
            </div>
          ` : ""}
        </div>
      `);
    }

    // Subclass: Brawler
    if (isBrawler(actor)) {
      sections.push(`
        <div class="ak5e-guard-action-group">
          <h5>Brawler Features</h5>
          <div class="ak5e-button-row">
            <button type="button" data-guard-cmd="bodyCheck">Body Check (1 Agg)</button>
            <button type="button" data-guard-cmd="crossCounter">Cross Counter (1 Agg, Reaction)</button>
            <button type="button" data-guard-cmd="feint">Feint (1 Agg, Bonus Action)</button>
            <button type="button" data-guard-cmd="followUp">Follow Up (1 Agg)</button>
          </div>
          <div class="ak5e-button-row">
            <button type="button" data-guard-cmd="footwork">Footwork (1 Agg)</button>
            <button type="button" data-guard-cmd="guardUp">Guard Up (1 Agg, Bonus Action)</button>
            <button type="button" data-guard-cmd="slipOff">Slip Off (2 Agg, Reaction)</button>
            <button type="button" data-guard-cmd="tagIn">Tag In (2 Agg)</button>
          </div>
          ${level >= 10 ? `
            <div class="ak5e-button-row">
              <button type="button" data-guard-cmd="chokehold">Chokehold (2 Agg)</button>
              <button type="button" data-guard-cmd="cqc">CQC (2 Agg)</button>
              <button type="button" data-guard-cmd="disarm">Disarm (3 Agg)</button>
              <button type="button" data-guard-cmd="humanShield">Human Shield (2 Agg)</button>
            </div>
            <div class="ak5e-button-row">
              <button type="button" data-guard-cmd="menace">Menace (2 Agg)</button>
              <button type="button" data-guard-cmd="skullshaker">Skullshaker (2 Agg)</button>
              <button type="button" data-guard-cmd="weighIn">Weigh In (2 Agg)</button>
              ${level >= 17 ? `<button type="button" data-guard-cmd="mountainbreaker">Mountainbreaker (1/LR)</button>` : ""}
            </div>
          ` : ""}
        </div>
      `);
    }

    // Subclass: Duellist
    if (isDuellist(actor)) {
      sections.push(`
        <div class="ak5e-guard-action-group">
          <h5>Duellist Features</h5>
          <div class="ak5e-button-row">
            <button type="button" data-guard-cmd="declareOpponent">Declare Opponent</button>
            <button type="button" data-guard-cmd="duelTurnStart">Turn Start Points</button>
            <button type="button" data-guard-cmd="riposte">Riposte (1 Agg, Reaction)</button>
            <button type="button" data-guard-cmd="openEngagement">Engagements</button>
          </div>
          <div class="ak5e-button-row">
            <button type="button" data-guard-cmd="lightningReflexes">Lightning Reflexes (1 Agg, Reaction)</button>
            <button type="button" data-guard-cmd="punishOpening">Punish Opening (1 Agg)</button>
            <button type="button" data-guard-cmd="grandChallenge">Grand Challenge (1/LR)</button>
            <button type="button" data-guard-cmd="coupDeGrace">Coup de Grâce (10 Pts)</button>
          </div>
        </div>
      `);
    }

    // Subclass: Liberator
    if (isLiberator(actor)) {
      sections.push(`
        <div class="ak5e-guard-action-group">
          <h5>Liberator Features</h5>
          <div class="ak5e-button-row">
            <button type="button" data-guard-cmd="guideTheMasses">Guide the Masses</button>
            <button type="button" data-guard-cmd="flashOfAnger">Flash of Anger</button>
            <button type="button" data-guard-cmd="theRightMoment">The Right Moment</button>
          </div>
          <div class="ak5e-button-row">
            <button type="button" data-guard-cmd="faceMe">Face Me (2 Agg, Bonus Action)</button>
            <button type="button" data-guard-cmd="libertyInaction">Inaction Liberty</button>
            <button type="button" data-guard-cmd="revolution">Révolution (1/LR Action)</button>
          </div>
        </div>
      `);
    }

    // Subclass: Lord
    if (isLord(actor)) {
      sections.push(`
        <div class="ak5e-guard-action-group">
          <h5>Lord Features</h5>
          <div class="ak5e-button-row">
            <button type="button" data-guard-cmd="toggleAuthority">Toggle Authority</button>
            <button type="button" data-guard-cmd="manifestDestiny">Manifest Destiny (3 Agg)</button>
            <button type="button" data-guard-cmd="manifestWill">Manifest Will (1 Use)</button>
            <button type="button" data-guard-cmd="willAttunement">Will Attunement (Ritual)</button>
          </div>
          <div class="ak5e-button-row">
            <button type="button" data-guard-cmd="makeItSo">Make It So (1 Use)</button>
            <button type="button" data-guard-cmd="aLeaderLeads">A Leader Leads (1+ Agg)</button>
            <button type="button" data-guard-cmd="forceOfWill">Force of Will (1 Use)</button>
          </div>
        </div>
      `);
    }

    // Subclass: Musha
    if (isMusha(actor)) {
      sections.push(`
        <div class="ak5e-guard-action-group">
          <h5>Musha Features</h5>
          <div class="ak5e-button-row">
            <button type="button" data-guard-cmd="mushaSoloblade">Soloblade (Heal on Hit)</button>
            <button type="button" data-guard-cmd="mushaNotYet">Not Yet (Wisdom Save)</button>
            <button type="button" data-guard-cmd="mushaResetNotYet">Reset Not Yet DC</button>
            ${level >= 4 ? `<button type="button" data-guard-cmd="mushaBloodPrice">Blood Price</button>` : ""}
          </div>
          ${level >= 10 ? `
            <div class="ak5e-button-row">
              <button type="button" data-guard-cmd="mushaGoForth">Go Forth (Reaction)</button>
              <button type="button" data-guard-cmd="mushaRetaliator">Retaliator (2 Agg)</button>
            </div>
          ` : ""}
        </div>
      `);
    }

    // Subclass: Reaper
    if (isReaper(actor)) {
      sections.push(`
        <div class="ak5e-guard-action-group">
          <h5>Reaper Features</h5>
          <div class="ak5e-button-row">
            <button type="button" data-guard-cmd="reaperGainRuin">Gain Ruin (+1)</button>
            <button type="button" data-guard-cmd="reaperDecayRuin">Ruin Decay (-1)</button>
            <button type="button" data-guard-cmd="reaperLingeringViolence">Lingering Violence (1 Agg)</button>
          </div>
          <div class="ak5e-button-row">
            <button type="button" data-guard-cmd="reaperReap">Reap</button>
            <button type="button" data-guard-cmd="reaperCurtainfall">Curtainfall (Spend Ruin)</button>
            ${level >= 10 ? `<button type="button" data-guard-cmd="reaperFearTheReaper">Fear the Reaper (1/LR)</button>` : ""}
            ${level >= 17 ? `<button type="button" data-guard-cmd="reaperMementoMori">Memento Mori</button>` : ""}
          </div>
        </div>
      `);
    }

    // Subclass: Weaponmaster
    if (isWeaponmaster(actor)) {
      sections.push(`
        <div class="ak5e-guard-action-group">
          <h5>Weaponmaster Features</h5>
          <div class="ak5e-button-row">
            <button type="button" data-guard-cmd="weaponmasterSteelwind">Steelwind (Dualstrike)</button>
            <button type="button" data-guard-cmd="weaponmasterSwapFightingStyle">Exchange Fighting Style (LR)</button>
          </div>
          <div class="ak5e-button-row">
            ${level >= 4 ? `<button type="button" data-guard-cmd="weaponmasterJudgementCut">Judgement Cut (Mark)</button>` : ""}
            ${level >= 4 ? `<button type="button" data-guard-cmd="weaponmasterDetonateJudgementCut">Detonate Judgement Cut</button>` : ""}
          </div>
          ${level >= 10 ? `
            <div class="ak5e-button-row">
              <button type="button" data-guard-cmd="weaponmasterSetSignatureWeapon">Designate Signature Weapon</button>
              <button type="button" data-guard-cmd="weaponmasterEveryPartOfTheWeapon">Every Part of the Weapon (BA)</button>
            </div>
          ` : ""}
          ${level >= 13 ? `
            <div class="ak5e-button-row">
              <button type="button" data-guard-cmd="weaponmasterUntouchable">Untouchable (Reaction, 2/LR)</button>
              ${level >= 17 ? `<button type="button" data-guard-cmd="weaponmasterSongOfSteel">Song of Steel (1/LR BA)</button>` : ""}
            </div>
          ` : ""}
        </div>
      `);
    }

    // Undo & Management
    sections.push(`
      <div class="ak5e-guard-management">
        <button type="button" data-guard-act="__undo">Undo Recent Use</button>
      </div>
    `);
  }

  const content = `<div class="ak5e-guard-dialog">${sections.join("")}</div>`;

  await foundry.applications.api.DialogV2.wait({
    window: { title: `Guard Controls — ${actor.name}` },
    position: { width: 620 },
    rejectClose: false,
    content,
    buttons: [{ action: "close", label: "Close" }],
    render: (_event, app) => {
      for (const el of app.element.querySelectorAll("[data-guard-act]")) {
        el.addEventListener("click", event => {
          event.preventDefault();
          const act = el.dataset.guardAct;
          safe(async () => {
            if (act === "__setup") {
              const setup = await previewGuardSetup(actor);
              const accepted = await foundry.applications.api.DialogV2.confirm({
                window: { title: `Grant Guard features — ${actor.name}` },
                content: `<p>Grant ${setup.creates.length} Guard feature${setup.creates.length === 1 ? "" : "s"} for Guard level ${setup.level}?</p>`,
                rejectClose: false
              });
              if (!accepted) return;
              await applyGuardSetup(actor, { confirmed: true, contextKey: setup.contextKey });
              ui.notifications.info("Guard core features granted.");
              app.close();
            } else if (act === "__undo") {
              await openPlayUndoList(guardUses, actor);
            }
          });
        });
      }
      for (const el of app.element.querySelectorAll("[data-guard-cmd]")) {
        el.addEventListener("click", event => {
          event.preventDefault();
          const cmd = el.dataset.guardCmd;
          safe(() => executeGuardDialog(actor, cmd));
        });
      }
    }
  });
}

async function askMartialAbility(actor, feature) {
  return foundry.applications.api.DialogV2.prompt({
    window: { title: `${feature}: choose Martial DC ability` },
    rejectClose: false,
    content: `<label>Choose Strength or Dexterity for your Martial DC: <select name="ability"><option value="" selected disabled>Choose an ability</option><option value="str">Strength (${Number(actor.system?.abilities?.str?.mod ?? 0)})</option><option value="dex">Dexterity (${Number(actor.system?.abilities?.dex?.mod ?? 0)})</option></select></label>`,
    ok: { label: "Continue", callback: (_event, target) => (target.form ?? target.closest("form"))?.elements?.ability?.value || null }
  });
}

async function executeGuardDialog(actor, cmd) {
  const level = guardLevel(actor) ?? 1;

  if (cmd === "forestall" || cmd === "smite" || cmd === "strikeTrue") {
    const amount = await foundry.applications.api.DialogV2.prompt({
      window: { title: `Press the Attack: ${cmd}` },
      rejectClose: false,
      content: `<label>Aggression to spend: <input type="number" name="amount" min="1" max="3" value="1"></label>`,
      ok: { label: "Confirm", callback: (_e, target) => Number((target.form ?? target.closest("form"))?.elements?.amount?.value ?? 1) }
    });
    if (!amount) return;
    return confirmPlayUse(`Press the Attack: ${cmd}`, extra => guardUses.command(actor, cmd, { amount, confirmed: true, ...extra }, operationId()));
  }

  if (cmd === "foecrusher") {
    const rider = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Foecrusher Strike" },
      rejectClose: false,
      content: `
        <label>Select strike rider:
          <select name="rider">
            <option value="staggering">Staggering Strike (Speed halved)</option>
            <option value="dazing">Dazing Strike (Dazed condition)</option>
            <option value="renewing">Renewing Strike (Hit Die + CON healing)</option>
            <option value="smashing">Smashing Strike (Push 15 ft + advance)</option>
          </select>
        </label>`,
      ok: { label: "Confirm", callback: (_e, target) => (target.form ?? target.closest("form"))?.elements?.rider?.value }
    });
    if (!rider) return;
    return confirmPlayUse("Foecrusher", extra => guardUses.command(actor, "foecrusher", { rider, confirmed: true, ...extra }, operationId()));
  }

  if (cmd === "overbear") {
    const riders = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Press the Attack: Overbear (2 Aggression)" },
      rejectClose: false,
      content: `
        <p>Deals +1d10 damage and applies two distinct Foecrusher riders:</p>
        <label>Primary Rider:
          <select name="primaryRider">
            <option value="staggering">Staggering Strike</option>
            <option value="dazing">Dazing Strike</option>
            <option value="renewing">Renewing Strike</option>
            <option value="smashing">Smashing Strike</option>
          </select>
        </label>
        <label>Secondary Rider:
          <select name="secondaryRider">
            <option value="dazing">Dazing Strike</option>
            <option value="staggering">Staggering Strike</option>
            <option value="renewing">Renewing Strike</option>
            <option value="smashing">Smashing Strike</option>
          </select>
        </label>`,
      ok: {
        label: "Confirm",
        callback: (_e, target) => {
          const form = target.form ?? target.closest("form");
          return { primaryRider: form.elements.primaryRider.value, secondaryRider: form.elements.secondaryRider.value };
        }
      }
    });
    if (!riders) return;
    return confirmPlayUse("Overbear", extra => guardUses.command(actor, "overbear", { ...riders, confirmed: true, ...extra }, operationId()));
  }

  if (cmd === "instruction") {
    const optionsHtml = Object.entries(INSTRUCTIONS).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join("");
    const data = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Issue Instruction (1 Instruction Die)" },
      rejectClose: false,
      content: `
        <label>Instruction:
          <select name="instruction">${optionsHtml}</select>
        </label>
        <label><input type="checkbox" name="cooperativeCombat"> Cooperative Combat (1 Aggression, Instructor also benefits)</label>
        ${level >= 10 ? `<label><input type="checkbox" name="isKingmaker"> Kingmaker (Second ally, free, fixed d6)</label>` : ""}`,
      ok: {
        label: "Issue Instruction",
        callback: (_e, target) => {
          const form = target.form ?? target.closest("form");
          return {
            instruction: form.elements.instruction.value,
            cooperativeCombat: Boolean(form.elements.cooperativeCombat?.checked),
            isKingmaker: Boolean(form.elements.isKingmaker?.checked)
          };
        }
      }
    });
    if (!data) return;
    return confirmPlayUse("Instruction", extra => guardUses.command(actor, "instruction", { ...data, confirmed: true, ...extra }, operationId()));
  }

  if (cmd === "teachFromExperience") {
    const optionsHtml = Object.entries(INSTRUCTIONS).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join("");
    const instruction = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Teach from Experience (Turn Start, Self)" },
      rejectClose: false,
      content: `<label>Choose Instruction: <select name="instruction">${optionsHtml}</select></label>`,
      ok: { label: "Apply to Self", callback: (_e, target) => (target.form ?? target.closest("form"))?.elements?.instruction?.value }
    });
    if (!instruction) return;
    return confirmPlayUse("Teach from Experience", extra => guardUses.command(actor, "teachFromExperience", { instruction, confirmed: true, ...extra }, operationId()));
  }

  // Artsblade commands
  if (cmd === "bladeArt") {
    const selectedPools = getArtsbladePoolChoices(actor);
    const availablePools = selectedPools.length ? selectedPools : Object.keys(ARTS_POOLS);
    const poolsHtml = availablePools.map(k => `<option value="${k}">${ARTS_POOLS[k].name} (${ARTS_POOLS[k].damageType})</option>`).join("");
    const target = Array.from(game.user.targets ?? [])[0];
    const artPool = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Blade Art" },
      rejectClose: false,
      content: `<label>Select Arts Pool: <select name="artPool">${poolsHtml}</select></label><p>Target: ${esc(target?.name ?? "No token targeted; resolve target manually")}</p>`,
      ok: { label: "Confirm", callback: (_e, target) => (target.form ?? target.closest("form"))?.elements?.artPool?.value }
    });
    if (!artPool) return;
    const targeted = Array.from(game.user.targets ?? [])[0];
    const ability = await askMartialAbility(actor, "Blade Art");
    if (!ability) return;
    const data = { artPool, martialDcAbility: ability, targetUuid: targeted?.actor?.uuid ?? null, targetName: targeted?.name ?? null };
    const useId = operationId();
    return confirmPlayUse(`Blade Art (${ARTS_POOLS[artPool]?.name ?? artPool})`, extra => guardUses.command(actor, "bladeArt", { ...data, confirmed: true, ...extra }, useId), { preview: extra => guardUses.preview(actor, "bladeArt", { ...data, ...extra }) });
  }

  if (cmd === "castSpellswordArt") {
    const maxLvl = maxArtLevel(level);
    const target = Array.from(game.user.targets ?? [])[0];
    const knownArts = Array.from(actor.items ?? []).filter(item => item.type === "spell").map(item => item.name);
    const selectedPools = getArtsbladePoolChoices(actor);
    const poolOptions = selectedPools.map(key => `<option value="${key}">${ARTS_POOLS[key].name}</option>`).join("");
    const data = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Cast Spellsword Art (1 SP)" },
      rejectClose: false,
      content: `
        <label>Art Name: <input type="text" name="artName" value="Spellsword Art"></label>
        ${poolOptions ? `<label>Source Arts Pool: <select name="artPool">${poolOptions}</select></label>` : "<p>No Standard Arts Pool has been recorded; the source Art and its Pool must be reviewed manually.</p>"}
        <p>Cast at the maximum level for this Guard level: ${maxLvl}. This spends 1 Spellsword Point, never Arts Points.</p>
        <p>Owned Arts available for manual resolution: ${esc(knownArts.join(", ") || "none listed; enter the source Art manually")}</p>
        <p>Target: ${esc(target?.name ?? "Select a target token before the melee attack")}</p>
        ${level >= 13 ? `<label><input type="checkbox" name="unleash"> High Fantasy: Unleash (only while Augmented Assault is active)</label>` : ""}
      `,
      ok: {
        label: "Cast",
        callback: (_e, target) => {
          const form = target.form ?? target.closest("form");
          return {
            artName: form.elements.artName?.value || "Spellsword Art",
            castingLevel: maxLvl,
            artPool: form.elements.artPool?.value ?? "",
            unleash: Boolean(form.elements.unleash?.checked)
          };
        }
      }
    });
    if (!data) return;
    const targeted = Array.from(game.user.targets ?? [])[0];
    const useData = { ...data, targetUuid: targeted?.actor?.uuid ?? null, targetName: targeted?.name ?? null };
    const useId = operationId();
    const ability = await askMartialAbility(actor, "Spellsword Art");
    if (!ability) return;
    useData.martialDcAbility = ability;
    return confirmPlayUse(`Spellsword Art: ${data.artName}`, extra => guardUses.command(actor, "castSpellswordArt", { ...useData, confirmed: true, ...extra }, useId), { preview: extra => guardUses.preview(actor, "castSpellswordArt", { ...useData, ...extra }) });
  }

  if (cmd === "cutThroughChaos") {
    const data = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Cut Through Chaos (Reaction)" },
      rejectClose: false,
      content: `
        <label>Mode:
          <select name="mode">
            <option value="spellAttack">Spell Attack (Melee roll must exceed incoming total)</option>
            <option value="savingThrow">Saving Throw (Melee roll must exceed save DC)</option>
            <option value="reactionArt">Reaction Art (Free Blade Art reaction)</option>
          </select>
        </label>
        <label>Melee Attack ability: <select name="attackAbility"><option value="str">Strength</option><option value="dex">Dexterity</option></select></label>
        <label>Incoming Spell Attack total (first mode): <input type="number" name="incomingTotal"></label>
        <label>Art Save DC (second mode): <input type="number" name="incomingDC"></label>
      `,
      ok: { label: "Review use", callback: (_e, target) => { const form = target.form ?? target.closest("form"); return { mode: form.elements.mode.value, attackAbility: form.elements.attackAbility.value, incomingTotal: form.elements.incomingTotal.value === "" ? null : Number(form.elements.incomingTotal.value), incomingDC: form.elements.incomingDC.value === "" ? null : Number(form.elements.incomingDC.value) }; } }
    });
    if (!data) return;
    const targeted = Array.from(game.user.targets ?? [])[0];
    Object.assign(data, { targetUuid: targeted?.actor?.uuid ?? null, targetName: targeted?.name ?? null });
    const useId = operationId();
    return confirmPlayUse("Cut Through Chaos", extra => guardUses.command(actor, "cutThroughChaos", { ...data, confirmed: true, ...extra }, useId), { preview: extra => guardUses.preview(actor, "cutThroughChaos", { ...data, ...extra }) });
  }

  if (cmd === "augmentedAssault") {
    const unleash = level >= 13 ? await foundry.applications.api.DialogV2.prompt({
      window: { title: "Augmented Assault (2 Aggression)" },
      rejectClose: false,
      content: `
        <p>Enables two Blade Arts on your turn instead of one.</p>
        <label><input type="checkbox" name="unleash"> High Fantasy: Unleash as standard Area of Effect</label>
      `,
      ok: {
        label: "Confirm",
        callback: (_e, target) => Boolean((target.form ?? target.closest("form"))?.elements?.unleash?.checked)
      }
    }) : false;
    if (level >= 13 && unleash === null) return;
    const data = { unleash };
    const useId = operationId();
    return confirmPlayUse("Augmented Assault", extra => guardUses.command(actor, "augmentedAssault", { ...data, confirmed: true, ...extra }, useId), { preview: extra => guardUses.preview(actor, "augmentedAssault", { ...data, ...extra }) });
  }

  // Brawler commands
  if (cmd === "chokehold") {
    const ability = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Chokehold (2 Aggression)" },
      rejectClose: false,
      content: `
        <label>Contested Ability:
          <select name="ability">
            <option value="str">Strength (Athletics)</option>
            <option value="con">Constitution</option>
          </select>
        </label>
      `,
      ok: { label: "Confirm", callback: (_e, target) => (target.form ?? target.closest("form"))?.elements?.ability?.value }
    });
    if (!ability) return;
    return confirmPlayUse("Chokehold", extra => guardUses.command(actor, "chokehold", { ability, confirmed: true, ...extra }, operationId()));
  }

  if (cmd === "mountainbreaker") {
    const mode = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Mountainbreaker (1/Long Rest)" },
      rejectClose: false,
      content: `
        <label>Mode:
          <select name="mode">
            <option value="flurry">Flurry of Blows (4 Unarmed Attacks as Action)</option>
            <option value="knockout">Knockout Blow (DC Stun Save on Hit)</option>
          </select>
        </label>
      `,
      ok: { label: "Confirm", callback: (_e, target) => (target.form ?? target.closest("form"))?.elements?.mode?.value }
    });
    if (!mode) return;
    return confirmPlayUse("Mountainbreaker", extra => guardUses.command(actor, "mountainbreaker", { mode, confirmed: true, ...extra }, operationId()));
  }

  // Duellist commands
  if (cmd === "openEngagement") {
    const engagement = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Duellist Engagements" },
      rejectClose: false,
      content: `
        <label>Select Engagement:
          <select name="engagement">
            <option value="analysis">Analysis (0 Points, Action)</option>
            <option value="balestra">Balestra (2 Points, no Action)</option>
            <option value="derobement">Derobement (1 Point, no Action)</option>
            <option value="displacement">Displacement (1 Point, no Action)</option>
            <option value="enGarde">En Garde (1 Point, no Action)</option>
            <option value="feint">Feint (1 Point, Bonus Action)</option>
            <option value="fleche">Fleche (2 Points, Bonus Action)</option>
            <option value="redoublement">Redoublement (1 Point, Reaction)</option>
            <option value="score">Score (1 Point, no Action)</option>
          </select>
        </label>`,
      ok: { label: "Confirm", callback: (_e, target) => (target.form ?? target.closest("form"))?.elements?.engagement?.value }
    });
    if (!engagement) return;
    const names = {
      analysis: "Analysis",
      balestra: "Balestra",
      derobement: "Derobement",
      displacement: "Displacement",
      enGarde: "En Garde",
      feint: "Feint",
      fleche: "Fleche",
      redoublement: "Redoublement",
      score: "Score"
    };
    return confirmPlayUse(`Engagement: ${names[engagement] ?? engagement}`, extra => guardUses.command(actor, engagement, { confirmed: true, ...extra }, operationId()));
  }

  if (cmd === "declareOpponent") {
    const targetName = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Rules of Engagement: Declare Opponent" },
      rejectClose: false,
      content: `<label>Opponent Name: <input type="text" name="targetName" value="Opponent"></label>`,
      ok: { label: "Declare", callback: (_e, target) => (target.form ?? target.closest("form"))?.elements?.targetName?.value || "Opponent" }
    });
    if (!targetName) return;
    return confirmPlayUse("Declare Opponent", extra => guardUses.command(actor, "declareOpponent", { targetName, confirmed: true, ...extra }, operationId()));
  }

  // Liberator commands
  if (cmd === "guideTheMasses") {
    const pb = Number(actor?.system?.attributes?.prof ?? 2);
    const lib = Number(getPool(actor, "liberty")?.value ?? 0);
    const advBonus = typeof guideTheMassesBonus === "function" ? guideTheMassesBonus(actor, "advocate") : Math.max(2 * pb, 2 * lib);
    const empBonus = typeof guideTheMassesBonus === "function" ? guideTheMassesBonus(actor, "empower") : Math.max(pb, lib);
    const uplBonus = typeof guideTheMassesBonus === "function" ? guideTheMassesBonus(actor, "uplift") : Math.max(pb, lib);

    const data = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Guide the Masses" },
      rejectClose: false,
      content: `
        <p><strong>Bonus Calculations:</strong> (PB = ${pb}, Liberty = ${lib})</p>
        <ul>
          <li><strong>Advocate:</strong> max(2×PB, 2×Liberty) = +${advBonus} healing/THP</li>
          <li><strong>Empower:</strong> max(PB, Liberty) = +${empBonus} damage reduction</li>
          <li><strong>Uplift:</strong> max(PB, Liberty) = +${uplBonus} bonus damage</li>
        </ul>
        <label>Mode:
          <select name="mode">
            <option value="advocate">Advocate (+${advBonus})</option>
            <option value="empower">Empower (+${empBonus})</option>
            <option value="uplift">Uplift (+${uplBonus})</option>
          </select>
        </label>
        <label>Target Ally:
          <input type="text" name="targetName" value="Ally">
        </label>
        ${level >= 7 ? `
          <label>
            <input type="checkbox" name="bonusAction"> Bonus Action (requires Action used this turn on a different creature)
          </label>
        ` : ""}`,
      ok: {
        label: "Confirm",
        callback: (_e, target) => {
          const form = target.form ?? target.closest("form");
          return {
            mode: form.elements.mode?.value || "advocate",
            targetName: form.elements.targetName?.value || "Ally",
            bonusAction: Boolean(form.elements.bonusAction?.checked)
          };
        }
      }
    });
    if (!data) return;
    return confirmPlayUse(`Guide the Masses (${data.mode})`, extra => guardUses.command(actor, "guideTheMasses", { ...data, confirmed: true, ...extra }, operationId()));
  }

  if (cmd === "flashOfAnger") {
    const curLib = Number(getPool(actor, "liberty")?.value ?? 0);
    const dieSize = level >= 10 ? 10 : 6;
    const isSplash = level >= 13;

    const data = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Flash of Anger" },
      rejectClose: false,
      content: `
        <p>Current Liberty: ${curLib}. Die formula: [Amount]d${dieSize}.</p>
        <label>Liberty Amount to Expend (1 to ${Math.max(1, curLib)}):
          <input type="number" name="liberty" min="1" max="${Math.max(1, curLib)}" value="${Math.max(1, Math.min(curLib, 1))}">
        </label>
        <label><input type="checkbox" name="kill"> Target reduced to 0 HP (refunds 1 Liberty)</label>
        ${isSplash ? `
          <hr>
          <p><strong>Caught in the Crossfire (13th+ Level):</strong> 10-ft splash to secondary creature taking Force/Arts damage.</p>
          <label>Secondary Target Name:
            <input type="text" name="secondaryTargetName" value="">
          </label>
          <label>Damage Type:
            <select name="damageType">
              <option value="force">Force</option>
              <option value="fire">Fire</option>
              <option value="cold">Cold</option>
              <option value="lightning">Lightning</option>
              <option value="acid">Acid</option>
              <option value="necrotic">Necrotic</option>
              <option value="radiant">Radiant</option>
            </select>
          </label>
        ` : ""}`,
      ok: {
        label: "Confirm",
        callback: (_e, target) => {
          const form = target.form ?? target.closest("form");
          return {
            liberty: Number(form.elements.liberty?.value) || 1,
            kill: Boolean(form.elements.kill?.checked),
            secondaryTargetName: form.elements.secondaryTargetName?.value || undefined,
            damageType: form.elements.damageType?.value || undefined
          };
        }
      }
    });
    if (!data) return;
    return confirmPlayUse("Flash of Anger", extra => guardUses.command(actor, "flashOfAnger", { ...data, confirmed: true, ...extra }, operationId()));
  }

  // Lord commands
  if (cmd === "manifestWill") {
    const mode = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Manifest Will" },
      rejectClose: false,
      content: `
        <p>Manifest Will lasts 1 minute (Melee weapons gain Range 30/-, STR for ranged attack/damage, +CHA mod damage).</p>
        <label>King's Domain Mode (4th Level):
          <select name="mode">
            <option value="castle">Castle Doctrine (15-ft zone, reaction move half speed and melee attack)</option>
            <option value="pursuit">Pursuit of Power (hit grants full movement without AoO, 2x jump)</option>
          </select>
        </label>`,
      ok: { label: "Manifest Will", callback: (_e, target) => (target.form ?? target.closest("form"))?.elements?.mode?.value || "castle" }
    });
    if (!mode) return;
    return confirmPlayUse("Manifest Will", extra => guardUses.command(actor, "manifestWill", { mode, confirmed: true, ...extra }, operationId()));
  }

  if (cmd === "makeItSo") {
    const chaMod = Number(actor.system?.abilities?.cha?.mod ?? 0);
    const pb = Number(actor.system?.attributes?.prof ?? 2);
    const auth = hasAuthority(actor);
    const bonus = auth ? (chaMod + 2 * pb) : (chaMod + pb);
    const bonusText = auth
      ? `CHA (+${chaMod}) + Expertise (+${2 * pb}) = +${bonus}`
      : `CHA (+${chaMod}) + PB (+${pb}) = +${bonus}`;

    const rollType = await foundry.applications.api.DialogV2.prompt({
      window: { title: "By Lordly Decree: Make It So" },
      rejectClose: false,
      content: `
        <p>Spends 1 Manifestation use to add bonus to d20 roll.</p>
        <p><strong>Calculated Bonus:</strong> ${bonusText} (${auth ? "Authority Active: Expertise" : "Authority Inactive: Proficiency"})</p>
        <label>d20 Roll Type:
          <select name="rollType">
            <option value="check">Ability Check</option>
            <option value="attack">Attack Roll</option>
            <option value="save">Saving Throw</option>
          </select>
        </label>`,
      ok: { label: "Make It So", callback: (_e, target) => (target.form ?? target.closest("form"))?.elements?.rollType?.value || "check" }
    });
    if (!rollType) return;
    return confirmPlayUse("Make It So", extra => guardUses.command(actor, "makeItSo", { rollType, confirmed: true, ...extra }, operationId()));
  }

  if (cmd === "forceOfWill") {
    const mDC = martialDC(actor);
    const curType = manifestationDamageType(actor);
    const group = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Force of Will (13th Level)" },
      rejectClose: false,
      content: `
        <p><strong>Martial Save DC:</strong> ${mDC} · <strong>Current Attunement:</strong> ${curType}</p>
        <label>Element Group:
          <select name="group">
            <option value="group1">Group 1 (Fire, Psychic, Force, Thunder) — 10-ft burst, 3d6 DEX save (DC ${mDC})</option>
            <option value="group2">Group 2 (Bludgeoning, Piercing, Slashing, Radiant) — 50-ft line, 8d6 DEX save (DC ${mDC})</option>
            <option value="group3">Group 3 (Acid, Cold, Lightning, Necrotic, Poison) — Melee Hit rider, 6d6 CON save (DC ${mDC})</option>
          </select>
        </label>`,
      ok: { label: "Unleash Force of Will", callback: (_e, target) => (target.form ?? target.closest("form"))?.elements?.group?.value }
    });
    if (!group) return;
    const defaultTypes = { group1: "force", group2: "radiant", group3: "lightning" };
    const curCat = forceOfWillCategory(curType);
    if (`group${curCat.group}` !== group) {
      await guardUses.command(actor, "willAttunement", { damageType: defaultTypes[group], confirmed: true }, operationId());
    }
    return confirmPlayUse("Force of Will", extra => guardUses.command(actor, "forceOfWill", { confirmed: true, ...extra }, operationId()));
  }

  if (cmd === "toggleAuthority") {
    const curAuth = hasAuthority(actor);
    const data = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Authority: Gain or Loss Trigger" },
      rejectClose: false,
      content: `
        <p>Current Authority: <strong>${curAuth ? "Active" : "Inactive"}</strong></p>
        <label>Trigger / Action:
          <select name="trigger">
            <optgroup label="Gain Authority">
              <option value="gain:Elite/Leader kill damaged since last turn">Gain: Elite/Leader Kill</option>
              <option value="gain:2+ kills in a single turn">Gain: 2+ Kills in a Turn</option>
              <option value="gain:1-shot full HP kill">Gain: 1-Shot Full HP Kill</option>
              <option value="gain:Manual grant / other trigger">Gain: Other Trigger</option>
            </optgroup>
            <optgroup label="Lose Authority">
              <option value="loss:Reduced to 0 HP">Lose: Reduced to 0 HP</option>
              <option value="loss:End-of-turn save affliction">Lose: End-of-Turn Save Affliction</option>
              <option value="loss:Prone at end of turn">Lose: Prone at End of Turn</option>
              <option value="loss:Initiative roll">Lose: Initiative Rolled</option>
              <option value="loss:Manual / other trigger">Lose: Other Trigger</option>
            </optgroup>
          </select>
        </label>`,
      ok: {
        label: "Confirm",
        callback: (_e, target) => {
          const val = (target.form ?? target.closest("form"))?.elements?.trigger?.value || "gain:Manual";
          const [mode, reason] = val.split(":");
          return { active: mode === "gain", reason };
        }
      }
    });
    if (!data) return;
    return confirmPlayUse(data.active ? "Gain Authority" : "Lose Authority", extra => guardUses.command(actor, "toggleAuthority", { ...data, confirmed: true, ...extra }, operationId()));
  }

  if (cmd === "willAttunement") {
    const damageType = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Will Attunement (10-minute Ritual)" },
      rejectClose: false,
      content: `
        <label>Attuned Damage Type:
          <select name="damageType">
            <option value="force">Force</option>
            <option value="fire">Fire</option>
            <option value="cold">Cold</option>
            <option value="lightning">Lightning</option>
            <option value="acid">Acid</option>
            <option value="necrotic">Necrotic</option>
            <option value="radiant">Radiant</option>
            <option value="psychic">Psychic</option>
            <option value="thunder">Thunder</option>
            <option value="slashing">Slashing</option>
            <option value="piercing">Piercing</option>
            <option value="bludgeoning">Bludgeoning</option>
            <option value="poison">Poison</option>
          </select>
        </label>`,
      ok: { label: "Attune", callback: (_e, target) => (target.form ?? target.closest("form"))?.elements?.damageType?.value }
    });
    if (!damageType) return;
    return confirmPlayUse(`Will Attunement (${damageType})`, extra => guardUses.command(actor, "willAttunement", { damageType, confirmed: true, ...extra }, operationId()));
  }

  if (cmd === "aLeaderLeads") {
    const aggPool = getPool(actor, "aggression")?.value ?? 1;
    const data = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Press the Attack: A Leader Leads" },
      rejectClose: false,
      content: `
        <label>Aggression to Spend (1+):
          <input type="number" name="aggression" min="1" max="${Math.max(1, aggPool)}" value="1">
        </label>
        <label>Target Ally:
          <input type="text" name="targetName" value="Ally">
        </label>`,
      ok: {
        label: "Inspire",
        callback: (_e, target) => {
          const form = target.form ?? target.closest("form");
          return {
            aggression: Number(form.elements.aggression?.value) || 1,
            targetName: form.elements.targetName?.value || "Ally"
          };
        }
      }
    });
    if (!data) return;
    return confirmPlayUse("A Leader Leads", extra => guardUses.command(actor, "aLeaderLeads", { ...data, confirmed: true, ...extra }, operationId()));
  }

  // Musha: Soloblade
  if (cmd === "mushaSoloblade") {
    const targetName = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Soloblade — Strike Target" },
      rejectClose: false,
      content: `<label>Target creature struck: <input type="text" name="targetName" value="Hostile Creature"></label>`,
      ok: { label: "Confirm", callback: (_e, target) => (target.form ?? target.closest("form"))?.elements?.targetName?.value || "Creature" }
    });
    if (!targetName) return;
    return confirmPlayUse("Soloblade", extra => guardUses.command(actor, "mushaSoloblade", { targetName, confirmed: true, ...extra }, operationId()));
  }

  // Musha: Blood Price
  if (cmd === "mushaBloodPrice") {
    const data = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Blood Price (2d8 / 4d8 Unreducible HP)" },
      rejectClose: false,
      content: `
        <label>Blood Price Option:
          <select name="option">
            <option value="centerOneself">Center Oneself (End/suppress Condition)</option>
            <option value="digDeep">Dig Deep (Gain Skill Points equal to HP lost)</option>
            <option value="iai">Iai (Dash straight line + Strike with +half HP lost damage)</option>
            <option value="ichimonji">Ichimonji (Strike with +full HP lost damage + Off Balance)</option>
          </select>
        </label>
        ${level >= 13 ? `
          <div style="margin-top: 8px;">
            <label><input type="checkbox" name="greaterBloodPrice"> Greater Blood Price (Lose 4d8 HP instead)</label>
          </div>
        ` : ""}
      `,
      ok: {
        label: "Confirm",
        callback: (_e, target) => {
          const form = target.form ?? target.closest("form");
          return {
            option: form.elements.option?.value || "centerOneself",
            greaterBloodPrice: Boolean(form.elements.greaterBloodPrice?.checked)
          };
        }
      }
    });
    if (!data) return;
    return confirmPlayUse("Blood Price", extra => guardUses.command(actor, "mushaBloodPrice", { ...data, confirmed: true, ...extra }, operationId()));
  }

  // Reaper: Reap
  if (cmd === "reaperReap") {
    const data = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Death's Design: Reap" },
      rejectClose: false,
      content: `
        <label>Weapon Name: <input type="text" name="weaponName" value="Melee Weapon"></label>
        ${level >= 13 ? `
          <label style="margin-top: 8px; display: block;">Area Shape:
            <select name="areaShape">
              <option value="cone">15-foot Cleaving Cone</option>
              <option value="sphere">10-foot-radius Cleaving Sphere (Centered on Self)</option>
            </select>
          </label>
        ` : ""}
      `,
      ok: {
        label: "Confirm",
        callback: (_e, target) => {
          const form = target.form ?? target.closest("form");
          return {
            weaponName: form.elements.weaponName?.value || "Melee Weapon",
            areaSphere: form.elements.areaShape?.value === "sphere"
          };
        }
      }
    });
    if (!data) return;
    return confirmPlayUse("Reap", extra => guardUses.command(actor, "reaperReap", { ...data, confirmed: true, ...extra }, operationId()));
  }

  // Reaper: Curtainfall
  if (cmd === "reaperCurtainfall") {
    const targetName = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Death's Design: Curtainfall" },
      rejectClose: false,
      content: `<label>Target Creature: <input type="text" name="targetName" value="Hostile Creature"></label>`,
      ok: { label: "Confirm", callback: (_e, target) => (target.form ?? target.closest("form"))?.elements?.targetName?.value || "Hostile Creature" }
    });
    if (!targetName) return;
    return confirmPlayUse("Curtainfall", extra => guardUses.command(actor, "reaperCurtainfall", { targetName, confirmed: true, ...extra }, operationId()));
  }

  // Reaper: Fear the Reaper
  if (cmd === "reaperFearTheReaper") {
    const targetName = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Fear the Reaper (1/LR)" },
      rejectClose: false,
      content: `<label>Target to Mark: <input type="text" name="targetName" value="Hostile Creature"></label>`,
      ok: { label: "Confirm", callback: (_e, target) => (target.form ?? target.closest("form"))?.elements?.targetName?.value || "Hostile Creature" }
    });
    if (!targetName) return;
    return confirmPlayUse("Fear the Reaper", extra => guardUses.command(actor, "reaperFearTheReaper", { targetName, confirmed: true, ...extra }, operationId()));
  }

  // Reaper: Memento Mori
  if (cmd === "reaperMementoMori") {
    const mode = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Memento Mori (17th Level)" },
      rejectClose: false,
      content: `
        <label>Select psychic agony effect:
          <select name="mode">
            <option value="vulnerability">Vulnerability & Ignore DR to this damage</option>
            <option value="splash">10-ft Splash (1d6 Psychic to other hostiles)</option>
          </select>
        </label>`,
      ok: { label: "Confirm", callback: (_e, target) => (target.form ?? target.closest("form"))?.elements?.mode?.value || "vulnerability" }
    });
    if (!mode) return;
    return confirmPlayUse("Memento Mori", extra => guardUses.command(actor, "reaperMementoMori", { mode, confirmed: true, ...extra }, operationId()));
  }

  // Weaponmaster: Judgement Cut Mark
  if (cmd === "weaponmasterJudgementCut") {
    const targetName = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Judgement Cut: Mark Target" },
      rejectClose: false,
      content: `<label>Target struck: <input type="text" name="targetName" value="Hostile Creature"></label>`,
      ok: { label: "Confirm", callback: (_e, target) => (target.form ?? target.closest("form"))?.elements?.targetName?.value || "Creature" }
    });
    if (!targetName) return;
    return confirmPlayUse("Judgement Cut", extra => guardUses.command(actor, "weaponmasterJudgementCut", { targetName, confirmed: true, ...extra }, operationId()));
  }

  // Weaponmaster: Detonate Judgement Cut
  if (cmd === "weaponmasterDetonateJudgementCut") {
    const data = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Judgement Cut: Detonate" },
      rejectClose: false,
      content: `
        <label>Target: <input type="text" name="targetName" value="${flag(actor, "weaponmaster")?.judgementCut?.targetName ?? "Marked Creature"}"></label>
        <label style="margin-top: 8px; display: block;">Total Weapon Damage Dealt During Mark:
          <input type="number" name="totalDamage" value="${flag(actor, "weaponmaster")?.judgementCut?.accumulatedDamage ?? 20}">
        </label>
      `,
      ok: {
        label: "Confirm",
        callback: (_e, target) => {
          const form = target.form ?? target.closest("form");
          return {
            targetName: form.elements.targetName?.value || "Creature",
            totalDamage: Number(form.elements.totalDamage?.value) || 0
          };
        }
      }
    });
    if (!data) return;
    return confirmPlayUse("Detonate Judgement Cut", extra => guardUses.command(actor, "weaponmasterDetonateJudgementCut", { ...data, confirmed: true, ...extra }, operationId()));
  }

  // Weaponmaster: Designate Signature Weapon
  if (cmd === "weaponmasterSetSignatureWeapon") {
    const weapons = Array.from(actor.items.values()).filter(i => i.type === "weapon");
    const optionsHtml = weapons.map(w => `<option value="${w.id}">${esc(w.name)}</option>`).join("");
    const data = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Designate Signature Weapon" },
      rejectClose: false,
      content: `
        <label>Select Weapon in Inventory:
          <select name="weaponId">
            ${optionsHtml || `<option value="weapon-1">Primary Weapon</option>`}
          </select>
        </label>`,
      ok: {
        label: "Confirm",
        callback: (_e, target) => {
          const form = target.form ?? target.closest("form");
          const weaponId = form.elements.weaponId?.value;
          const weaponItem = actor.items.get(weaponId);
          return {
            weaponId: weaponId || "weapon-1",
            weaponName: weaponItem?.name || "Selected Weapon"
          };
        }
      }
    });
    if (!data) return;
    return confirmPlayUse("Designate Signature Weapon", extra => guardUses.command(actor, "weaponmasterSetSignatureWeapon", { ...data, confirmed: true, ...extra }, operationId()));
  }

  // Weaponmaster: Every Part of the Weapon
  if (cmd === "weaponmasterEveryPartOfTheWeapon") {
    const propertyKey = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Every Part of the Weapon" },
      rejectClose: false,
      content: `
        <label>Choose Martial Mastery Effect:
          <select name="propertyKey">
            <option value="canOpener">Can Opener (+1d6 vs Physical DR)</option>
            <option value="cornering">Cornering (-5 ft speed)</option>
            <option value="drive">Drive (Move target 10 ft)</option>
            <option value="executioner">Executioner (+2d6 vs Incapacitated/Prone)</option>
            <option value="flourish">Flourish (+1d6 on miss 1/turn)</option>
            <option value="lethality">Lethality (+1d6 vs no Physical DR)</option>
          </select>
        </label>`,
      ok: { label: "Confirm", callback: (_e, target) => (target.form ?? target.closest("form"))?.elements?.propertyKey?.value || "canOpener" }
    });
    if (!propertyKey) return;
    return confirmPlayUse("Every Part of the Weapon", extra => guardUses.command(actor, "weaponmasterEveryPartOfTheWeapon", { propertyKey, confirmed: true, ...extra }, operationId()));
  }

  // Weaponmaster: Swap Fighting Style
  if (cmd === "weaponmasterSwapFightingStyle") {
    const styleOptions = Object.entries(WEAPONMASTER_FIGHTING_STYLES).map(([k, s]) => `<option value="${k}">${esc(s.name)}: ${esc(s.description)}</option>`).join("");
    const styleKey = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Art of War: Exchange Fighting Style" },
      rejectClose: false,
      content: `<label>Choose New Fighting Style: <select name="styleKey">${styleOptions}</select></label>`,
      ok: { label: "Confirm", callback: (_e, target) => (target.form ?? target.closest("form"))?.elements?.styleKey?.value || "brawler" }
    });
    if (!styleKey) return;
    return confirmPlayUse("Swap Fighting Style", extra => guardUses.command(actor, "weaponmasterSwapFightingStyle", { styleKey, confirmed: true, ...extra }, operationId()));
  }

  // Default simple execution for other commands
  return confirmPlayUse(cmd, extra => guardUses.command(actor, cmd, { confirmed: true, ...extra }, operationId()));
}

const eligible = actor => actor?.type === "character" && guardProfile(actor).applicable;

export function renderGuardControls(app, element) {
  const actor = actorFor(app);
  if (!eligible(actor) || (!actor.isOwner && !game.user?.isGM)) return;

  const roots = app.element?.contains(element) ? [app.element] : [element];
  for (const root of roots) {
    for (const old of root.querySelectorAll(".ak5e-guard-sheet-panel")) old.remove();
    const features = root.matches?.('.tab[data-tab="features"]') ? root : root.querySelector('.tab[data-tab="features"]');
    if (!features) continue;

    const view = getGuardView(actor);
    const panel = node("section", null, "ak5e-guard-sheet-panel");
    panel.append(node("h3", "Guard"));

    if (view.profile.configured && view.aggression) {
      panel.append(node("p", `Aggression: ${view.aggression.value} / ${view.aggression.max}${view.unrelenting ? ` · Unrelenting: ${view.unrelenting.value} / ${view.unrelenting.max}` : ""}`, "ak5e-guard-summary"));
    }

    if (actor.isOwner) {
      panel.append(button(view.profile.configured ? "Open Guard Controls" : "Set up Guard", () => openGuardControls(actor)));
    }

    panel.append(node("p", "Opening this panel makes no changes (confirm before use).", "ak5e-guard-note"));
    features.prepend(panel);
  }
}

export function registerGuardSheetHooks() {
  if (installed) return;
  installed = true;

  Hooks.on("getHeaderControlsApplicationV2", (app, controls) => {
    const actor = actorFor(app);
    if (!eligible(actor) || !actor.isOwner || controls.some(c => c.action === "ak5eGuard")) return;
    controls.unshift({
      action: "ak5eGuard",
      icon: "fa-solid fa-shield",
      label: "Guard",
      ownership: "OWNER",
      onClick: () => safe(() => openGuardControls(actor))
    });
  });

  Hooks.on("renderActorSheetV2", renderGuardControls);
  Hooks.on("renderChatMessageHTML", (message, html) => {
    try {
      renderPlayUseCard(guardUses, message, html);
    } catch (error) {
      console.error("AK5e | Guard use card", error);
    }
  });
}
