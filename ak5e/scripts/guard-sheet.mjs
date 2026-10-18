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
import { isArtsblade, ARTS_POOLS, maxArtLevel, bladeArtFormula } from "./artsblade-features.mjs";
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

/* ---------------------------------------------------------------- confirm step (WORKFLOW.md §3.2 rules 3-4) */

/**
 * What the confirm step says each core, Artsblade, Brawler and Centurion command costs (Ch.3 L1740-2200, L2202-2417,
 * L2423-2546, L2549-2632). `targets` marks commands that affect other Creatures: the sheet lists the user's selected
 * targets, warns (never blocks) when there are none, and sends them as `data.targets` ([{ uuid, name }]).
 * Other subclasses fall back to the cost written on their button label.
 */
const COMMAND_INFO = {
  forestall: { cost: "1-3 Aggression (you choose) and your Reaction", pools: ["aggression"] },
  smite: { cost: "1-3 Aggression (you choose); no Action", pools: ["aggression"] },
  strikeTrue: { cost: "1-3 Aggression (you choose); no Action", pools: ["aggression"] },
  unrelenting: { cost: "1 use of Unrelenting and your Reaction (when another Creature ends their Turn)", pools: ["unrelenting"] },
  pursuitUnrelenting: { cost: "2 uses of Unrelenting (replaces the Attack with an Action or Bonus Action) and your Reaction", pools: ["unrelenting"] },
  unrelentingAggression: { cost: "2 Aggression and your Reaction (when you miss a Creature with a Melee Attack)", pools: ["aggression"] },
  bladeArt: { cost: "No Spellsword Point (Cantrip, cast as part of a Melee Weapon Attack)", targets: true },
  castSpellswordArt: { cost: "1 Spellsword Point (cast as part of a Melee Weapon Attack, once per Turn)", pools: ["spellswordPoints"] },
  augmentedAssault: { cost: "2 Aggression (no Action)", pools: ["aggression"] },
  cutThroughChaos: { cost: "1 use of Cut Through Chaos (Proficiency Bonus per Long Rest) and your Reaction", pools: ["cutThroughChaos"] },
  ultimateBladeArt: { cost: "1 use per Long Rest (no Action)", pools: ["ultimateBladeArt"] },
  bodyCheck: { cost: "1 Aggression (no Action)", pools: ["aggression"], targets: true },
  crossCounter: { cost: "1 Aggression and your Reaction", pools: ["aggression"] },
  feint: { cost: "1 Aggression and a Bonus Action", pools: ["aggression"], targets: true },
  followUp: { cost: "1 Aggression (no Action, once per Turn)", pools: ["aggression"], targets: true },
  footwork: { cost: "1 Aggression (no Action)", pools: ["aggression"] },
  guardUp: { cost: "1 Aggression and a Bonus Action", pools: ["aggression"] },
  slipOff: { cost: "2 Aggression and your Reaction", pools: ["aggression"] },
  tagIn: { cost: "2 Aggression (once per Turn)", pools: ["aggression"], targets: true },
  chokehold: { cost: "2 Aggression and an Action", pools: ["aggression"], targets: true },
  cqc: { cost: "2 Aggression (no Action)", pools: ["aggression"], targets: true },
  disarm: { cost: "3 Aggression and an Action", pools: ["aggression"], targets: true },
  humanShield: { cost: "2 Aggression and an Action", pools: ["aggression"], targets: true },
  menace: { cost: "2 Aggression and an Action", pools: ["aggression"], targets: true },
  skullshaker: { cost: "2 Aggression and an Action", pools: ["aggression"], targets: true },
  weighIn: { cost: "2 Aggression", pools: ["aggression"], targets: true },
  mountainbreaker: { cost: "1 use per Long Rest and an Action", pools: ["mountainbreaker"], targets: true },
  cycloneStrike: { cost: "No resource cost (once until the start of your next Turn; once on each Turn from 14th Level)", targets: true },
  brutalExecution: { cost: "2 Aggression and a Bonus Action or Reaction (immediately after you kill a Creature)", pools: ["aggression"], targets: true },
  ferociousFling: { cost: "1 use per Short Rest (no Action); refunded if you used Brutal Execution on the Creature you threw", pools: ["ferociousFling"], targets: true },
  guillotine: { cost: "1 use per Long Rest and an Action", pools: ["guillotine"], targets: true },
  shredder: { cost: "No resource cost", targets: true },
  stormOfBlood: { cost: "1 use per Long Rest and an Action", pools: ["stormOfBlood"], targets: true }
};
const POOL_NAMES = { aggression: "Aggression", unrelenting: "Unrelenting", spellswordPoints: "Spellsword Points", cutThroughChaos: "Cut Through Chaos uses", ultimateBladeArt: "Ultimate Blade Art uses", mountainbreaker: "Mountainbreaker uses", ferociousFling: "Ferocious Fling uses", guillotine: "Guillotine uses", stormOfBlood: "Storm of Blood uses" };

const labelCost = label => /\(([^()]*)\)\s*$/.exec(String(label ?? ""))?.[1] ?? null;
const commandInfo = (cmd, label = "") => {
  const known = COMMAND_INFO[cmd] ?? {};
  const fromLabel = labelCost(label);
  return {
    cost: known.cost ?? (fromLabel ? `${fromLabel} (as shown on the button; see the feature text)` : "none is listed on the button (see the feature text)"),
    pools: known.pools ?? [], targets: Boolean(known.targets)
  };
};
const poolText = (actor, ids = []) => ids.map(id => {
  try { const pool = getPool(actor, id); return `${POOL_NAMES[id] ?? id}: ${pool.value} / ${pool.max} now`; } catch { return null; }
}).filter(Boolean).join("; ");

/** The user's selected target tokens as [{ uuid, name }] (token.actor.uuid, token.name). Tokens without an Actor are skipped. */
export function selectedTargets() {
  return Array.from(globalThis.game?.user?.targets ?? [])
    .map(token => ({ uuid: token?.actor?.uuid, name: token?.name ?? token?.document?.name ?? token?.actor?.name ?? "Target" }))
    .filter(target => target.uuid);
}
const soleTarget = targets => targets.length === 1 ? targets[0] : null;

/** Title, cost, selected targets and notes shown above every Guard command's inputs. */
function summaryHtml(actor, title, info, targets, notes = []) {
  const rows = [`<p class="ak5e-guard-confirm-title"><strong>${esc(title)}</strong></p>`, `<p><strong>Cost:</strong> ${esc(info.cost)}</p>`];
  const pools = poolText(actor, info.pools);
  if (pools) rows.push(`<p><strong>Resources:</strong> ${esc(pools)}.</p>`);
  if (targets.length) rows.push(`<p><strong>${info.targets ? "Targets (selected tokens, recorded with this use)" : "Selected tokens"}:</strong></p><ul>${targets.map(target => `<li>${esc(target.name)}</li>`).join("")}</ul>`);
  else if (info.targets) rows.push("<p><strong>Targets:</strong> none selected. Select the affected tokens first, or continue and settle who is affected at the table. This is a warning only.</p>");
  for (const note of notes) rows.push(`<p class="ak5e-guard-confirm-note">${esc(note)}</p>`);
  rows.push("<p>Range, prerequisites, timing and resource shortfalls are checked next and listed with Use anyway. Dice are never rolled for you: use the Roll button on the chat card. Cancel changes nothing.</p>");
  return rows.join("");
}

/**
 * The one confirm step for every Guard command (WORKFLOW.md §3.2 rule 4, B-129). The command's own inputs, if any, are
 * part of this dialog, which always shows the cost, the selected targets and notes and has an explicit Cancel.
 * Resolves to the Confirm callback's value (which can be false or 0), or null when cancelled or closed.
 */
async function guardPrompt(actor, { window: win = {}, content = "", ok = {}, info, targets = [], notes = [] }) {
  const title = win.title ?? "Guard";
  const answer = await foundry.applications.api.DialogV2.wait({
    window: { title }, position: { width: 560 }, rejectClose: false,
    content: `<div class="ak5e-play-use ak5e-guard-confirm">${summaryHtml(actor, title, info, targets, notes)}${content}</div>`,
    buttons: [
      { action: "confirm", label: ok.label ?? "Confirm", default: true, callback: async (event, button, dialog) => ({ confirmed: true, value: ok.callback ? await ok.callback(event, button, dialog) : {} }) },
      { action: "cancel", label: "Cancel", callback: () => null }
    ]
  });
  return answer?.confirmed === true ? answer.value : null;
}

/** Warnings and readings (confirmPlayUse) come after the confirm step; one operation ID covers any "Use anyway" retry. */
function runGuardUse(actor, cmd, data, title) {
  const id = operationId();
  return confirmPlayUse(title, extra => guardUses.command(actor, cmd, { ...data, confirmed: true, ...extra }, id));
}

/**
 * Guard setup (B-131): preview what will be added, then apply with the preview's contextKey. Cancel changes nothing.
 * Resolves to the apply result, or null when cancelled.
 */
export async function confirmGuardSetup(actor) {
  const preview = await previewGuardSetup(actor);
  const names = preview.creates.map(entry => entry.name);
  const list = items => items.length ? `<ul>${items.map(name => `<li>${esc(name)}</li>`).join("")}</ul>` : "<p>None.</p>";
  const accepted = await foundry.applications.api.DialogV2.wait({
    window: { title: `Set up Guard — ${actor.name}` }, position: { width: 560 }, rejectClose: false,
    content: `<div class="ak5e-play-use ak5e-guard-confirm">
      <p>Guard level ${esc(preview.level)}. Nothing changes until you grant the features; Cancel changes nothing.</p>
      <p><strong>Will add (${names.length}):</strong></p>${list(names)}
      <p><strong>Already on the sheet (${preview.kept.length}), left as they are:</strong></p>${list(preview.kept)}
      <p>The character is also marked as a configured Guard. Running setup again keeps existing Items.</p></div>`,
    buttons: [
      { action: "grant", label: "Grant Core Guard Features", default: true, callback: () => true },
      { action: "cancel", label: "Cancel", callback: () => null }
    ]
  });
  // DialogV2 resolves a button whose callback returns null to its action id ("cancel"), which is truthy.
  if (accepted !== true) return null;
  return applyGuardSetup(actor, { confirmed: true, contextKey: preview.contextKey });
}

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
        ${isWeaponmaster(actor) ? `<span class="ak5e-pool-badge">Signature: ${esc(flag(actor, "weaponmaster")?.signatureWeaponName ?? "None")}</span>` : ""}
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
            <button type="button" data-guard-cmd="unrelenting">Unrelenting (1 Use, Reaction)</button>
            <button type="button" data-guard-cmd="pursuitUnrelenting">Pursuit Unrelenting (2 Uses)</button>
          </div>
        ` : ""}
        ${level >= 15 ? `
          <div class="ak5e-button-row">
            <button type="button" data-guard-cmd="unrelentingAggression">Unrelenting Aggression (2 Aggression, Reaction)</button>
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
            ${level >= 4 ? `<button type="button" data-guard-cmd="ferociousFling">Ferocious Fling (1/SR)</button>` : ""}
          </div>
          ${level >= 10 ? `
            <div class="ak5e-button-row">
              <button type="button" data-guard-cmd="guillotine">Guillotine (1/LR)</button>
              ${level >= 13 ? `<button type="button" data-guard-cmd="shredder">Shredder</button>` : ""}
              ${level >= 17 ? `<button type="button" data-guard-cmd="stormOfBlood">Storm of Blood (1/LR)</button>` : ""}
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
              const result = await confirmGuardSetup(actor);
              if (!result) return;
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
          safe(() => executeGuardDialog(actor, cmd, el.textContent.trim()));
        });
      }
    }
  });
}

/** First weapon dice of an equipped weapon, as a plain prefill the player can change ("" when unknown). */
function weaponDice(actor) {
  const weapon = Array.from(actor?.items ?? []).find(item => item.type === "weapon" && item.system?.equipped);
  const base = weapon?.system?.damage?.base;
  return base?.number && base?.denomination ? `${base.number}d${base.denomination}` : "";
}
const formOf = target => target.form ?? target.closest?.("form");
const withTarget = (key, targets) => soleTarget(targets) ? { [key]: soleTarget(targets).uuid } : {};

/**
 * Opens the confirm step for one Guard command and, once confirmed, runs it through confirmPlayUse. Every path ends in
 * `guardPrompt` before `guardUses.command` is called; Cancel or closing writes nothing. `label` is the button text,
 * used for the cost of subclasses this sheet has no cost table for.
 */
export async function executeGuardDialog(actor, cmd, label = "") {
  const level = guardLevel(actor) ?? 1;
  const info = commandInfo(cmd, label);
  const targets = selectedTargets();
  const prompt = options => guardPrompt(actor, { info, targets, ...options });
  const run = (title, data = {}, name = cmd) => runGuardUse(actor, name, info.targets ? { targets, ...data } : data, title);

  if (cmd === "forestall" || cmd === "smite" || cmd === "strikeTrue") {
    const name = { forestall: "Forestall", smite: "Smite", strikeTrue: "Strike True" }[cmd];
    const amount = await prompt({
      window: { title: `Press the Attack: ${name}` },
      content: `<label>Aggression to spend (1-3): <input type="number" name="amount" min="1" max="3" step="1" value="1"></label>`,
      ok: {
        label: "Confirm",
        callback: (_e, target) => {
          const spend = Number(formOf(target)?.elements?.amount?.value ?? 1);
          if (Number.isInteger(spend) && spend >= 1 && spend <= 3) return spend;
          ui.notifications?.warn("Choose how much Aggression to spend (1 to 3); nothing was used.");
          return null;
        }
      }
    });
    if (amount === null) return null;
    return run(`Press the Attack: ${name}`, { amount }, cmd);
  }

  if (cmd === "pursuitUnrelenting") {
    const actionType = await prompt({
      window: { title: "Pursuit Unrelenting (2 uses)" },
      content: `
        <p>When you would use your Unrelenting Feature, you may expend an additional use of it to take an Action or Bonus Action in place of the Attack you would normally make.</p>
        <label>Take in place of the Attack:
          <select name="actionType">
            <option value="action">Action</option>
            <option value="bonus">Bonus Action</option>
          </select>
        </label>`,
      ok: { label: "Confirm", callback: (_e, target) => formOf(target)?.elements?.actionType?.value || "action" }
    });
    if (actionType === null) return null;
    return run("Pursuit Unrelenting", { actionType }, cmd);
  }

  if (cmd === "unrelentingAggression") {
    const dice = weaponDice(actor);
    const formula = await prompt({
      window: { title: "Press the Attack: Unrelenting Aggression" },
      content: `
        <p>You can use this when you miss a Creature with a Melee Attack: roll the Damage for that Attack, but do not add your Ability Score Modifier to the result. The Creature takes Damage equal to the amount rolled.</p>
        <label>Damage dice of the missed Attack, without the Ability Modifier: <input type="text" name="formula" value="${esc(dice)}" placeholder="for example 1d8"></label>
        <p class="ak5e-guard-confirm-note">Enter your weapon's damage dice. If this is left blank the engine uses its own default dice, which may not match your weapon.</p>`,
      ok: { label: "Confirm", callback: (_e, target) => String(formOf(target)?.elements?.formula?.value ?? "").trim() }
    });
    if (formula === null) return null;
    return run("Unrelenting Aggression", formula ? { formula } : {}, cmd);
  }

  if (cmd === "foecrusher") {
    const rider = await prompt({
      window: { title: "Foecrusher Strike" },
      content: `
        <label>Select strike rider:
          <select name="rider">
            <option value="staggering">Staggering Strike (Speed halved)</option>
            <option value="dazing">Dazing Strike (Dazed condition)</option>
            <option value="renewing">Renewing Strike (Hit Die + CON healing)</option>
            <option value="smashing">Smashing Strike (Push 15 ft + advance)</option>
          </select>
        </label>`,
      ok: { label: "Confirm", callback: (_e, target) => formOf(target)?.elements?.rider?.value }
    });
    if (!rider) return;
    return run("Foecrusher", { rider }, "foecrusher");
  }

  if (cmd === "overbear") {
    const riders = await prompt({
      window: { title: "Press the Attack: Overbear (2 Aggression)" },
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
          const form = formOf(target);
          return { primaryRider: form.elements.primaryRider.value, secondaryRider: form.elements.secondaryRider.value };
        }
      }
    });
    if (!riders) return;
    return run("Overbear", { ...riders }, "overbear");
  }

  if (cmd === "instruction") {
    const optionsHtml = Object.entries(INSTRUCTIONS).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join("");
    const data = await prompt({
      window: { title: "Issue Instruction (1 Instruction Die)" },
      content: `
        <label>Instruction:
          <select name="instruction">${optionsHtml}</select>
        </label>
        <label><input type="checkbox" name="cooperativeCombat"> Cooperative Combat (1 Aggression, Instructor also benefits)</label>
        ${level >= 10 ? `<label><input type="checkbox" name="isKingmaker"> Kingmaker (Second ally, free, fixed d6)</label>` : ""}`,
      ok: {
        label: "Issue Instruction",
        callback: (_e, target) => {
          const form = formOf(target);
          return {
            instruction: form.elements.instruction.value,
            cooperativeCombat: Boolean(form.elements.cooperativeCombat?.checked),
            isKingmaker: Boolean(form.elements.isKingmaker?.checked)
          };
        }
      }
    });
    if (!data) return;
    return run("Instruction", { ...data }, "instruction");
  }

  if (cmd === "teachFromExperience") {
    const optionsHtml = Object.entries(INSTRUCTIONS).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join("");
    const instruction = await prompt({
      window: { title: "Teach from Experience (Turn Start, Self)" },
      content: `<label>Choose Instruction: <select name="instruction">${optionsHtml}</select></label>`,
      ok: { label: "Apply to Self", callback: (_e, target) => formOf(target)?.elements?.instruction?.value }
    });
    if (!instruction) return;
    return run("Teach from Experience", { instruction }, "teachFromExperience");
  }

  // Artsblade commands
  if (cmd === "bladeArt") {
    const formula = bladeArtFormula(level);
    const poolsHtml = Object.entries(ARTS_POOLS).map(([k, v]) => `<option value="${k}">${v.name} (${v.damageType})</option>`).join("");
    const artPool = await prompt({
      window: { title: "Blade Art" },
      content: `
        <p>Evocation Cantrip, Self. When it is cast, the Attack that this Art was cast as part of deals ${formula} additional Arts Damage. You choose what Damage Type this Damage is: choose one of the Arts Pools you have selected for your Spellsword Arts. The Damage Type corresponds to the chosen Arts Pool.</p>
        <label>Arts Pool: <select name="artPool">${poolsHtml}</select></label>`,
      ok: { label: "Confirm", callback: (_e, target) => formOf(target)?.elements?.artPool?.value }
    });
    if (!artPool) return null;
    // `pool` is the field older Artsblade plans read; `artPool` is the shared name.
    // The plan's once-per-Turn save window is keyed on `targetUuid`; it is only unambiguous with one selected token.
    return run(`Blade Art (${ARTS_POOLS[artPool]?.name ?? artPool})`, { artPool, pool: artPool, ...withTarget("targetUuid", targets) }, "bladeArt");
  }

  if (cmd === "castSpellswordArt") {
    const maxLvl = maxArtLevel(level);
    const data = await prompt({
      window: { title: "Cast Spellsword Art (1 Spellsword Point)" },
      content: `
        <p>When you make a Melee Weapon Attack during your Turn, you can expend 1 Spellsword Point to cast a Spellsword Art with a Casting Time of Action or Bonus Action as part of that Attack. You can only cast a Spellsword Art once per Turn.</p>
        <label>Art Name: <input type="text" name="artName" value="Spellsword Art"></label>
        <p><strong>Casting level: ${maxLvl}</strong> (the maximum level in the Artsblade table at Guard level ${level}). When you cast a Spellsword Art, you must cast it at the maximum level you can cast that Art at, so the level cannot be lowered.</p>`,
      ok: {
        label: "Cast",
        callback: (_e, target) => {
          const form = formOf(target);
          // `level` is the sheet's field; `castingLevel` is the one the Artsblade plan reads. Both are the maximum.
          return { artName: form?.elements?.artName?.value || "Spellsword Art", level: maxLvl, castingLevel: maxLvl };
        }
      }
    });
    if (!data) return null;
    return run(`Spellsword Art: ${data.artName}`, { ...data }, "castSpellswordArt");
  }

  if (cmd === "cutThroughChaos") {
    const clearPath = level >= 13 ? " Clear Path (13th Level): you take no Damage if you succeed on the Saving Throw, and only half Damage if you fail." : "";
    const mode = await prompt({
      window: { title: "Cut Through Chaos (Reaction)" },
      content: `
        <fieldset>
          <legend>Choose one of the three ways to use this Feature</legend>
          <label><input type="radio" name="mode" value="spellAttack" checked> When a Creature makes a Spell Attack Roll against you, you can make a Melee Attack as a Reaction; if the result of your Attack Roll is greater than the Spell Attack Roll, that Spell Attack misses you.</label>
          <label><input type="radio" name="mode" value="savingThrow"> When you would make a Saving Throw against an Art you can see, you can instead make a Melee Attack as a Reaction; if the result of your Attack Roll is greater than the DC of that Saving Throw, you are considered to have succeeded on that Saving Throw.${esc(clearPath)}</label>
          <label><input type="radio" name="mode" value="reactionArt"> When the conditions are met to cast a Spellsword Art you know with a Casting Time of Reaction, you may expend your Reaction to cast that Art without expending a Spellsword Point.</label>
        </fieldset>`,
      ok: { label: "Confirm", callback: (_e, target) => formOf(target)?.elements?.mode?.value || "spellAttack" }
    });
    if (!mode) return null;
    return run("Cut Through Chaos", { mode }, "cutThroughChaos");
  }

  if (cmd === "augmentedAssault") {
    const unleash = await prompt({
      window: { title: "Augmented Assault (2 Aggression)" },
      content: `
        <p>You may use this Press the Attack option during your Turn (no Action required) if you have not cast a Spellsword Art this Turn. You may cast two Spellsword Arts this Turn, but both must be Blade Art.</p>
        ${level >= 13 ? `<label><input type="checkbox" name="unleash"> High Fantasy, Unleash: a Spellsword Art with an area of a cone, cube, sphere or line affects its normal area instead of only the target; you are immune to the Damage of Arts you cast in this way.</label>` : ""}`,
      ok: { label: "Confirm", callback: (_e, target) => level >= 13 && Boolean(formOf(target)?.elements?.unleash?.checked) }
    });
    // Cancel is null (nothing is written); an unchecked box is false and goes on to the confirmed use.
    if (unleash === null) return null;
    return run("Augmented Assault", { unleash }, "augmentedAssault");
  }

  // Brawler commands
  if (cmd === "chokehold") {
    const str = Number(actor.system?.abilities?.str?.value ?? 10), dex = Number(actor.system?.abilities?.dex?.value ?? 10);
    const ability = await prompt({
      window: { title: "Chokehold (2 Aggression)" },
      content: `
        <p>When you are Grappling a Creature no more than one Size Category larger than you, you may use this Technique as an Action; that Creature loses Hit Points equal to your Strength or Dexterity Score (your choice). Cannot be used on Creatures who do not breathe.</p>
        <label>Hit Points lost equal to your:
          <select name="ability">
            <option value="str">Strength Score (${str})</option>
            <option value="dex">Dexterity Score (${dex})</option>
          </select>
        </label>`,
      ok: { label: "Confirm", callback: (_e, target) => formOf(target)?.elements?.ability?.value === "dex" ? "dex" : "str" }
    });
    if (!ability) return null;
    return run("Chokehold", { ability }, "chokehold");
  }

  if (cmd === "mountainbreaker") {
    const mode = await prompt({
      window: { title: "Mountainbreaker (1/Long Rest)" },
      content: `
        <fieldset>
          <legend>As an Action, you may either</legend>
          <label><input type="radio" name="mode" value="flurry" checked> Make an Unarmed Strike against a Creature within your Reach. If it hits, you may make another Unarmed Strike against it, and so on, until you miss or have made 10 Attacks; at which point the sequence ends. Each Attack after the first suffers a cumulative -2 to hit.</label>
          <label><input type="radio" name="mode" value="knockout"> Make an Unarmed Strike against a Creature within your Reach; if it hits, the Damage of that Attack is multiplied by five. Additionally, if the Creature is no more than one size larger than you, they are knocked 20 feet directly away from you and fall Prone.</label>
        </fieldset>
        <p>Once you use this Feature, you must complete a Long Rest before you may do so again.</p>`,
      ok: { label: "Confirm", callback: (_e, target) => formOf(target)?.elements?.mode?.value === "knockout" ? "knockout" : "flurry" }
    });
    if (!mode) return null;
    return run("Mountainbreaker", { mode }, "mountainbreaker");
  }

  // Centurion commands
  if (cmd === "ferociousFling") {
    const data = await prompt({
      window: { title: "Ferocious Fling (1/Short Rest)" },
      content: `
        <p>When you reduce a Creature to 0 Hit Points that is the same size or smaller than you and within your Reach, you may launch them as a projectile at another Creature within 30 feet of you (no Action required). This is a Ranged Weapon Attack using your Strength for the Attack and Damage Rolls; on a hit, the Attack deals Bludgeoning Damage equal to the launched Creature's Constitution Modifier.</p>
        <label>Constitution Modifier of the launched Creature: <input type="number" name="conMod" step="1" value="0"></label>
        <label><input type="checkbox" name="brutalExecution"> I used Brutal Execution on the Creature I threw (this use is refunded)</label>`,
      ok: {
        label: "Confirm",
        callback: (_e, target) => {
          const form = formOf(target);
          return { targetConMod: Number(form?.elements?.conMod?.value) || 0, brutalExecution: Boolean(form?.elements?.brutalExecution?.checked) };
        }
      }
    });
    if (!data) return null;
    return run("Ferocious Fling", { ...data, ...withTarget("targetUuid", targets) }, "ferociousFling");
  }

  if (cmd === "guillotine") {
    const eliteOrLeader = await prompt({
      window: { title: "Guillotine (1/Long Rest)" },
      content: `
        <p>As an Action, you attempt to strike a lethal blow at a Creature within your Reach using a weapon you are wielding; that Creature must make a Dexterity Saving Throw against your Martial DC. On a failed Save, they take Xd6 Damage of the same Damage Type as the weapon you are wielding, where X is equal to twice your Proficiency Bonus, and begin Bleeding. Additionally, if the Creature that failed was an Elite or Leader Creature, other hostile Creatures within 30 feet of them must succeed on a Wisdom Saving Throw against your Centurion DC or become Frightened of you until the end of your next Turn. On a successful Save, they suffer half as much Damage, and no other effects.</p>
        <label><input type="checkbox" name="eliteOrLeader"> The target is an Elite or Leader Creature</label>`,
      ok: { label: "Confirm", callback: (_e, target) => Boolean(formOf(target)?.elements?.eliteOrLeader?.checked) }
    });
    if (eliteOrLeader === null) return null;
    return run("Guillotine", { eliteOrLeader }, "guillotine");
  }

  if (cmd === "shredder") {
    const targetFrightened = await prompt({
      window: { title: "Shredder" },
      content: `
        <p>When you deal Damage to a Creature with a Melee Weapon Attack, choose a different Creature within 10 feet of the original Creature; that Creature takes Slashing Damage equal to your Strength Modifier. This Damage is doubled against Creatures who are Frightened of you.</p>
        <label><input type="checkbox" name="frightened"> The different Creature is Frightened of me (Damage doubled)</label>`,
      ok: { label: "Confirm", callback: (_e, target) => Boolean(formOf(target)?.elements?.frightened?.checked) }
    });
    if (targetFrightened === null) return null;
    return run("Shredder", { targetFrightened }, "shredder");
  }

  // Duellist commands
  if (cmd === "openEngagement") {
    const engagement = await prompt({
      window: { title: "Duellist Engagements" },
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
      ok: { label: "Confirm", callback: (_e, target) => formOf(target)?.elements?.engagement?.value }
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
    return run(`Engagement: ${names[engagement] ?? engagement}`, {}, engagement);
  }

  if (cmd === "declareOpponent") {
    const targetName = await prompt({
      window: { title: "Rules of Engagement: Declare Opponent" },
      content: `<label>Opponent Name: <input type="text" name="targetName" value="Opponent"></label>`,
      ok: { label: "Declare", callback: (_e, target) => formOf(target)?.elements?.targetName?.value || "Opponent" }
    });
    if (!targetName) return;
    return run("Declare Opponent", { targetName }, "declareOpponent");
  }

  // Liberator commands
  if (cmd === "guideTheMasses") {
    const pb = Number(actor?.system?.attributes?.prof ?? 2);
    const lib = Number(getPool(actor, "liberty")?.value ?? 0);
    const advBonus = typeof guideTheMassesBonus === "function" ? guideTheMassesBonus(actor, "advocate") : Math.max(2 * pb, 2 * lib);
    const empBonus = typeof guideTheMassesBonus === "function" ? guideTheMassesBonus(actor, "empower") : Math.max(pb, lib);
    const uplBonus = typeof guideTheMassesBonus === "function" ? guideTheMassesBonus(actor, "uplift") : Math.max(pb, lib);

    const data = await prompt({
      window: { title: "Guide the Masses" },
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
          const form = formOf(target);
          return {
            mode: form.elements.mode?.value || "advocate",
            targetName: form.elements.targetName?.value || "Ally",
            bonusAction: Boolean(form.elements.bonusAction?.checked)
          };
        }
      }
    });
    if (!data) return;
    return run(`Guide the Masses (${data.mode})`, { ...data }, "guideTheMasses");
  }

  if (cmd === "flashOfAnger") {
    const curLib = Number(getPool(actor, "liberty")?.value ?? 0);
    const dieSize = level >= 10 ? 10 : 6;
    const isSplash = level >= 13;

    const data = await prompt({
      window: { title: "Flash of Anger" },
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
          const form = formOf(target);
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
    return run("Flash of Anger", { ...data }, "flashOfAnger");
  }

  // Lord commands
  if (cmd === "manifestWill") {
    const mode = await prompt({
      window: { title: "Manifest Will" },
      content: `
        <p>Manifest Will lasts 1 minute (Melee weapons gain Range 30/-, STR for ranged attack/damage, +CHA mod damage).</p>
        <label>King's Domain Mode (4th Level):
          <select name="mode">
            <option value="castle">Castle Doctrine (15-ft zone, reaction move half speed and melee attack)</option>
            <option value="pursuit">Pursuit of Power (hit grants full movement without AoO, 2x jump)</option>
          </select>
        </label>`,
      ok: { label: "Manifest Will", callback: (_e, target) => formOf(target)?.elements?.mode?.value || "castle" }
    });
    if (!mode) return;
    return run("Manifest Will", { mode }, "manifestWill");
  }

  if (cmd === "makeItSo") {
    const chaMod = Number(actor.system?.abilities?.cha?.mod ?? 0);
    const pb = Number(actor.system?.attributes?.prof ?? 2);
    const auth = hasAuthority(actor);
    const bonus = auth ? (chaMod + 2 * pb) : (chaMod + pb);
    const bonusText = auth
      ? `CHA (+${chaMod}) + Expertise (+${2 * pb}) = +${bonus}`
      : `CHA (+${chaMod}) + PB (+${pb}) = +${bonus}`;

    const rollType = await prompt({
      window: { title: "By Lordly Decree: Make It So" },
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
      ok: { label: "Make It So", callback: (_e, target) => formOf(target)?.elements?.rollType?.value || "check" }
    });
    if (!rollType) return;
    return run("Make It So", { rollType }, "makeItSo");
  }

  if (cmd === "forceOfWill") {
    const mDC = martialDC(actor);
    const curType = manifestationDamageType(actor);
    const group = await prompt({
      window: { title: "Force of Will (13th Level)" },
      content: `
        <p><strong>Martial Save DC:</strong> ${mDC} · <strong>Current Attunement:</strong> ${curType}</p>
        <label>Element Group:
          <select name="group">
            <option value="group1">Group 1 (Fire, Psychic, Force, Thunder) — 10-ft burst, 3d6 DEX save (DC ${mDC})</option>
            <option value="group2">Group 2 (Bludgeoning, Piercing, Slashing, Radiant) — 50-ft line, 8d6 DEX save (DC ${mDC})</option>
            <option value="group3">Group 3 (Acid, Cold, Lightning, Necrotic, Poison) — Melee Hit rider, 6d6 CON save (DC ${mDC})</option>
          </select>
        </label>`,
      ok: { label: "Unleash Force of Will", callback: (_e, target) => formOf(target)?.elements?.group?.value }
    });
    if (!group) return;
    const defaultTypes = { group1: "force", group2: "radiant", group3: "lightning" };
    const curCat = forceOfWillCategory(curType);
    if (`group${curCat.group}` !== group) {
      // The attunement change is its own use: it gets the same warnings loop, and cancelling it stops Force of Will.
      const attuned = await run("Will Attunement", { damageType: defaultTypes[group] }, "willAttunement");
      if (attuned === null) return null;
    }
    return run("Force of Will", {}, "forceOfWill");
  }

  if (cmd === "toggleAuthority") {
    const curAuth = hasAuthority(actor);
    const data = await prompt({
      window: { title: "Authority: Gain or Loss Trigger" },
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
          const val = formOf(target)?.elements?.trigger?.value || "gain:Manual";
          const [mode, reason] = val.split(":");
          return { active: mode === "gain", reason };
        }
      }
    });
    if (!data) return;
    return run(data.active ? "Gain Authority" : "Lose Authority", { ...data }, "toggleAuthority");
  }

  if (cmd === "willAttunement") {
    const damageType = await prompt({
      window: { title: "Will Attunement (10-minute Ritual)" },
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
      ok: { label: "Attune", callback: (_e, target) => formOf(target)?.elements?.damageType?.value }
    });
    if (!damageType) return;
    return run(`Will Attunement (${damageType})`, { damageType }, "willAttunement");
  }

  if (cmd === "aLeaderLeads") {
    const aggPool = getPool(actor, "aggression")?.value ?? 1;
    const data = await prompt({
      window: { title: "Press the Attack: A Leader Leads" },
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
          const form = formOf(target);
          return {
            aggression: Number(form.elements.aggression?.value) || 1,
            targetName: form.elements.targetName?.value || "Ally"
          };
        }
      }
    });
    if (!data) return;
    return run("A Leader Leads", { ...data }, "aLeaderLeads");
  }

  // Musha: Soloblade
  if (cmd === "mushaSoloblade") {
    const targetName = await prompt({
      window: { title: "Soloblade — Strike Target" },
      content: `<label>Target creature struck: <input type="text" name="targetName" value="Hostile Creature"></label>`,
      ok: { label: "Confirm", callback: (_e, target) => formOf(target)?.elements?.targetName?.value || "Creature" }
    });
    if (!targetName) return;
    return run("Soloblade", { targetName }, "mushaSoloblade");
  }

  // Musha: Blood Price
  if (cmd === "mushaBloodPrice") {
    const data = await prompt({
      window: { title: "Blood Price (2d8 / 4d8 Unreducible HP)" },
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
          const form = formOf(target);
          return {
            option: form.elements.option?.value || "centerOneself",
            greaterBloodPrice: Boolean(form.elements.greaterBloodPrice?.checked)
          };
        }
      }
    });
    if (!data) return;
    return run("Blood Price", { ...data }, "mushaBloodPrice");
  }

  // Reaper: Reap
  if (cmd === "reaperReap") {
    const data = await prompt({
      window: { title: "Death's Design: Reap" },
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
          const form = formOf(target);
          return {
            weaponName: form.elements.weaponName?.value || "Melee Weapon",
            areaSphere: form.elements.areaShape?.value === "sphere"
          };
        }
      }
    });
    if (!data) return;
    return run("Reap", { ...data }, "reaperReap");
  }

  // Reaper: Curtainfall
  if (cmd === "reaperCurtainfall") {
    const targetName = await prompt({
      window: { title: "Death's Design: Curtainfall" },
      content: `<label>Target Creature: <input type="text" name="targetName" value="Hostile Creature"></label>`,
      ok: { label: "Confirm", callback: (_e, target) => formOf(target)?.elements?.targetName?.value || "Hostile Creature" }
    });
    if (!targetName) return;
    return run("Curtainfall", { targetName }, "reaperCurtainfall");
  }

  // Reaper: Fear the Reaper
  if (cmd === "reaperFearTheReaper") {
    const targetName = await prompt({
      window: { title: "Fear the Reaper (1/LR)" },
      content: `<label>Target to Mark: <input type="text" name="targetName" value="Hostile Creature"></label>`,
      ok: { label: "Confirm", callback: (_e, target) => formOf(target)?.elements?.targetName?.value || "Hostile Creature" }
    });
    if (!targetName) return;
    return run("Fear the Reaper", { targetName }, "reaperFearTheReaper");
  }

  // Reaper: Memento Mori
  if (cmd === "reaperMementoMori") {
    const mode = await prompt({
      window: { title: "Memento Mori (17th Level)" },
      content: `
        <label>Select psychic agony effect:
          <select name="mode">
            <option value="vulnerability">Vulnerability & Ignore DR to this damage</option>
            <option value="splash">10-ft Splash (1d6 Psychic to other hostiles)</option>
          </select>
        </label>`,
      ok: { label: "Confirm", callback: (_e, target) => formOf(target)?.elements?.mode?.value || "vulnerability" }
    });
    if (!mode) return;
    return run("Memento Mori", { mode }, "reaperMementoMori");
  }

  // Weaponmaster: Judgement Cut Mark
  if (cmd === "weaponmasterJudgementCut") {
    const targetName = await prompt({
      window: { title: "Judgement Cut: Mark Target" },
      content: `<label>Target struck: <input type="text" name="targetName" value="Hostile Creature"></label>`,
      ok: { label: "Confirm", callback: (_e, target) => formOf(target)?.elements?.targetName?.value || "Creature" }
    });
    if (!targetName) return;
    return run("Judgement Cut", { targetName }, "weaponmasterJudgementCut");
  }

  // Weaponmaster: Detonate Judgement Cut
  if (cmd === "weaponmasterDetonateJudgementCut") {
    const data = await prompt({
      window: { title: "Judgement Cut: Detonate" },
      content: `
        <label>Target: <input type="text" name="targetName" value="${esc(flag(actor, "weaponmaster")?.judgementCut?.targetName ?? "Marked Creature")}"></label>
        <label style="margin-top: 8px; display: block;">Total Weapon Damage Dealt During Mark:
          <input type="number" name="totalDamage" value="${flag(actor, "weaponmaster")?.judgementCut?.accumulatedDamage ?? 20}">
        </label>
      `,
      ok: {
        label: "Confirm",
        callback: (_e, target) => {
          const form = formOf(target);
          return {
            targetName: form.elements.targetName?.value || "Creature",
            totalDamage: Number(form.elements.totalDamage?.value) || 0
          };
        }
      }
    });
    if (!data) return;
    return run("Detonate Judgement Cut", { ...data }, "weaponmasterDetonateJudgementCut");
  }

  // Weaponmaster: Designate Signature Weapon
  if (cmd === "weaponmasterSetSignatureWeapon") {
    const weapons = Array.from(actor.items.values()).filter(i => i.type === "weapon");
    const optionsHtml = weapons.map(w => `<option value="${w.id}">${esc(w.name)}</option>`).join("");
    const data = await prompt({
      window: { title: "Designate Signature Weapon" },
      content: `
        <label>Select Weapon in Inventory:
          <select name="weaponId">
            ${optionsHtml || `<option value="weapon-1">Primary Weapon</option>`}
          </select>
        </label>`,
      ok: {
        label: "Confirm",
        callback: (_e, target) => {
          const form = formOf(target);
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
    return run("Designate Signature Weapon", { ...data }, "weaponmasterSetSignatureWeapon");
  }

  // Weaponmaster: Every Part of the Weapon
  if (cmd === "weaponmasterEveryPartOfTheWeapon") {
    const propertyKey = await prompt({
      window: { title: "Every Part of the Weapon" },
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
      ok: { label: "Confirm", callback: (_e, target) => formOf(target)?.elements?.propertyKey?.value || "canOpener" }
    });
    if (!propertyKey) return;
    return run("Every Part of the Weapon", { propertyKey }, "weaponmasterEveryPartOfTheWeapon");
  }

  // Weaponmaster: Swap Fighting Style
  if (cmd === "weaponmasterSwapFightingStyle") {
    const styleOptions = Object.entries(WEAPONMASTER_FIGHTING_STYLES).map(([k, s]) => `<option value="${k}">${esc(s.name)}: ${esc(s.description)}</option>`).join("");
    const styleKey = await prompt({
      window: { title: "Art of War: Exchange Fighting Style" },
      content: `<label>Choose New Fighting Style: <select name="styleKey">${styleOptions}</select></label>`,
      ok: { label: "Confirm", callback: (_e, target) => formOf(target)?.elements?.styleKey?.value || "brawler" }
    });
    if (!styleKey) return;
    return run("Swap Fighting Style", { styleKey }, "weaponmasterSwapFightingStyle");
  }

  // Every other command has no inputs: it still passes the same confirm step (cost, targets, Cancel) before it runs.
  const title = String(label || cmd).replace(/\s*\([^()]*\)\s*$/, "") || cmd;
  const confirmed = await prompt({ window: { title }, ok: { label: "Confirm", callback: () => ({}) } });
  if (confirmed === null) return null;
  const extra = cmd === "feint" ? withTarget("targetUuid", targets) : cmd === "tagIn" ? withTarget("allyUuid", targets) : {};
  return run(title, extra, cmd);
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
