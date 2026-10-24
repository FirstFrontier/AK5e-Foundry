/**
 * Hexer Arts (Ch.3 L7223-7330): the Hexer wrappers over supporter-arts.mjs. The Hexer knows every Art of 5th Level or
 * less from its chosen Standard Arts Pool(s) plus their Cantrips, always Prepared (L7281); its AP and maximum Art level
 * come from the Hexer Arts Casting table (L7254-7279).
 * - hexerArtsPlans: one play-uses plan, configureHexerArts. The engine confirms, warns ("Use anyway") and records the undo receipt.
 * - runHexerArtsCommand: the Configure Hexer Arts dialog; returns undefined for any other command so the caller can route it.
 * - hexerArtsPanel: the sheet fragment (button data-supporter-cmd="configureHexerArts").
 * - registerHexerArtsHooks: keeps the AP maximum and maximum Art level in step with the Supporter class level.
 * AP refill on a Long Rest is already handled by arts-casting (completeArtsRest, dnd5e.preRestCompleted) for any actor with
 * flags.ak5e.casting.enabled, so no refill hook is added here.
 */
import { isHexer, supporterLevel, flag, SUPPORTER_CLASS_ID } from "./supporter-rules.mjs";
import { supporterUses } from "./supporter-uses.mjs";
import { confirmPlayUse } from "./play-uses-sheet.mjs";
import { standardPools } from "./caster-rules.mjs";
import { need, esc } from "./operation-kernel.mjs";
import {
  SUPPORTER_ARTS_ABILITIES, SECOND_POOL_LEVEL, previewSupporterArts, supporterArtsRow, supporterArtsSyncPlan,
  applySupporterArts, syncSupporterArts, supporterSpellSaveDC, registerSupporterArtsKind
} from "./supporter-arts.mjs";

export const HEXER_BRANCH = "hexer";
const ABILITY_LABEL = Object.freeze({ int: "Intelligence", wis: "Wisdom", cha: "Charisma" });
const POOL_NAME = new Map(standardPools.map(pool => [pool.id, pool.name]));
const poolName = id => POOL_NAME.get(id) ?? id;

/** Play-uses plans for the Supporter engine. Synchronous checks only; the apply step resolves the Arts. */
export const hexerArtsPlans = Object.freeze({
  configureHexerArts(actor, _state, data = {}) {
    need(isHexer(actor), "Configure Hexer Arts is a Hexer Supporter feature.");
    const sync = supporterArtsSyncPlan(actor, { branch: HEXER_BRANCH, ability: data.ability, poolIds: data.poolIds ?? [] });
    need(sync.ability, "Choose Intelligence, Wisdom or Charisma as your spellcasting ability.");
    need(sync.poolIds.length, "Choose a Standard Arts Pool.");
    return {
      title: "Configure Hexer Arts",
      warnings: sync.warnings,
      async apply(_next, receipt) {
        registerSupporterArtsKind();
        const plan = await previewSupporterArts(actor, { branch: HEXER_BRANCH, ability: sync.ability, poolIds: sync.poolIds });
        need(!plan.pending.length, "Choose a Standard Arts Pool.");
        // The Item writes are a target entry, so the engine records them with the flag changes and undo restores both.
        receipt.targets = [{
          kind: "supporterArts", uuid: actor.uuid, name: actor.name, ready: true,
          creates: plan.creates, removeIds: plan.removeItems.map(item => item.id), snapshots: plan.removeItems.map(item => item.toObject())
        }];
        const pools = sync.poolIds.map(poolName).join(" and ");
        const removedText = plan.removeItems.length ? ` Removed from the previous pool: ${plan.removeItems.map(item => item.name).join(", ")}.` : "";
        const missingText = plan.missing.length ? ` Not granted (no AK5e record or GM mapping): ${plan.missing.map(entry => entry.name).join(", ")}.` : "";
        receipt.summary = `${actor.name} sets up Hexer Arts from ${pools}: ${plan.granted.length} Art${plan.granted.length === 1 ? "" : "s"} granted; `
          + `AP maximum ${plan.row.artsPoints}, maximum Art level ${plan.row.maxArtLevel}.${removedText}${missingText}`;
        receipt.result = { granted: plan.granted, removed: plan.removeItems.map(item => item.name), missing: plan.missing.map(entry => entry.name),
          maximum: plan.row.artsPoints, maximumArtLevel: plan.row.maxArtLevel };
        return plan.actor;
      }
    };
  }
});

/** No resource pool is defined: Hexer AP are the flags.ak5e.artsPoints the Arts engine already uses. */
export function defineHexerArtsPools() {
  return null;
}

let hooksInstalled = false;
/** Idempotent. Syncs the Hexer's AP maximum and maximum Art level when its Supporter class level changes (owner or GM client only). */
export function registerHexerArtsHooks() {
  registerSupporterArtsKind();
  if (hooksInstalled) return;
  hooksInstalled = true;
  Hooks.on("updateItem", (item, changed, _options, userId) => {
    if (userId !== game.user?.id) return;
    if (item?.type !== "class" || flag(item, "chapterThreeId") !== SUPPORTER_CLASS_ID) return;
    if (changed?.system?.levels === undefined) return;
    const actor = item.actor;
    if (!actor?.isOwner || !isHexer(actor)) return;
    syncSupporterArts(actor, HEXER_BRANCH).catch(error => console.error("AK5e | Hexer Arts sync", error));
  });
}

/** Panel fragment for the Supporter sheet (the branch sheetPanel). Opening it changes nothing. */
export function hexerArtsPanel(actor) {
  const casting = flag(actor, "casting") ?? {}, ap = flag(actor, "artsPoints") ?? null, setup = flag(actor, "supporterArtsSetup") ?? {};
  const level = supporterLevel(actor) ?? 1;
  const row = supporterArtsRow(HEXER_BRANCH, level);
  const ability = SUPPORTER_ARTS_ABILITIES.includes(casting.ability) ? ABILITY_LABEL[casting.ability] : "not chosen";
  const dc = supporterSpellSaveDC(actor);
  const pools = (setup.pools ?? []).map(poolName);
  const apText = ap ? `${esc(ap.value ?? 0)} / ${esc(ap.maximum ?? row.artsPoints)}` : `not set up (maximum ${row.artsPoints})`;
  const maxArt = ap ? esc(ap.maximumArtLevel ?? row.maxArtLevel) : esc(row.maxArtLevel);
  return `<section class="ak5e-hexer-arts-panel">`
    + `<h5>Hexer Arts</h5>`
    + `<p><strong>Casting ability:</strong> ${esc(ability)}${dc === null ? "" : ` · <strong>Spell Save DC:</strong> ${esc(dc)}`}</p>`
    + `<p><strong>Standard Arts Pool${pools.length === 1 ? "" : "s"}:</strong> ${pools.length ? esc(pools.join(", ")) : "none chosen"}`
    + `${level >= SECOND_POOL_LEVEL && pools.length < 2 ? ` (a second pool may be chosen at ${SECOND_POOL_LEVEL}th Level)` : ""}</p>`
    + `<p><strong>Arts Points:</strong> ${apText} · <strong>Maximum Art level:</strong> ${maxArt}</p>`
    + `<div class="ak5e-supporter-button-row"><button type="button" data-supporter-cmd="configureHexerArts">Configure Hexer Arts</button></div>`
    + `</section>`;
}

/**
 * Command handler for the sheet's data-supporter-cmd buttons. Returns undefined for any other command, so the Supporter
 * dispatcher can route it onward. Asks for the ability and pool(s), confirms, then runs the engine (warnings: "Use anyway").
 */
export async function runHexerArtsCommand(actor, cmd) {
  if (cmd !== "configureHexerArts") return undefined;
  need(actor?.isOwner && isHexer(actor), "Configure Hexer Arts is a Hexer Supporter feature.");
  const level = supporterLevel(actor) ?? 1, setup = flag(actor, "supporterArtsSetup") ?? {}, casting = flag(actor, "casting") ?? {};
  const current = SUPPORTER_ARTS_ABILITIES.includes(casting.ability) ? casting.ability : "";
  const abilityOptions = `<option value="">— choose —</option>` + SUPPORTER_ARTS_ABILITIES.map(key =>
    `<option value="${key}"${key === current ? " selected" : ""}>${ABILITY_LABEL[key]}</option>`).join("");
  const poolOptions = selected => `<option value="">— none —</option>` + standardPools.map(pool =>
    `<option value="${esc(pool.id)}"${pool.id === selected ? " selected" : ""}>${esc(pool.name)}</option>`).join("");
  const chosen = setup.pools ?? [];
  const content = `<div class="ak5e-hexer-arts-form">
    <label>Spellcasting ability <select name="ability">${abilityOptions}</select></label>
    <label>Standard Arts Pool <select name="pool1">${poolOptions(chosen[0])}</select></label>
    ${level >= SECOND_POOL_LEVEL ? `<label>Second Standard Arts Pool (optional now) <select name="pool2">${poolOptions(chosen[1])}</select></label>` : ""}
    </div>`;
  const picked = await foundry.applications.api.DialogV2.prompt({
    window: { title: "Configure Hexer Arts" }, rejectClose: false, content,
    ok: { label: "Continue", callback: (_event, button) => ({
      ability: button.form.elements.ability?.value ?? "",
      poolIds: [button.form.elements.pool1?.value, button.form.elements.pool2?.value].filter(Boolean)
    }) }
  });
  if (!picked) return null;
  if (!picked.ability) { ui.notifications.warn("Choose Intelligence, Wisdom or Charisma as your spellcasting ability."); return null; }
  if (!picked.poolIds.length) { ui.notifications.warn("Choose a Standard Arts Pool."); return null; }
  if (new Set(picked.poolIds).size !== picked.poolIds.length) { ui.notifications.warn("Choose two different Standard Arts Pools."); return null; }
  const summary = `${actor.name} sets up Hexer Arts: casting ability ${ABILITY_LABEL[picked.ability] ?? "not chosen"}; `
    + `pool${picked.poolIds.length === 1 ? "" : "s"} ${picked.poolIds.map(poolName).join(" and ") || "none"}.`;
  const confirmed = await foundry.applications.api.DialogV2.wait({
    window: { title: "Configure Hexer Arts" }, rejectClose: false,
    content: `<div class="ak5e-supporter-confirm"><p>${esc(summary)}</p><p>Arts of 5th Level or less from the chosen pool(s) are granted as Prepared Arts. Nothing is rolled.</p></div>`,
    buttons: [
      { action: "confirm", label: "Confirm", default: true, callback: () => true },
      { action: "cancel", label: "Cancel", callback: () => false }
    ]
  });
  if (confirmed !== true) return null;
  const opId = foundry.utils.randomID();
  return confirmPlayUse("Configure Hexer Arts", extra => supporterUses.command(actor, "configureHexerArts",
    { confirmed: true, ability: picked.ability, poolIds: picked.poolIds, ...extra }, opId));
}

/** Frozen API for the Hexer branch. Apply is direct (no undo receipt); the sheet uses the play-uses plan instead. */
export const hexerArtsApi = Object.freeze({
  preview: async (actor, options = {}) => { need(isHexer(actor), "Hexer Arts preview is a Hexer feature."); return previewSupporterArts(actor, { ...options, branch: HEXER_BRANCH }); },
  apply: async (actor, options = {}) => { need(isHexer(actor), "Hexer Arts apply is a Hexer feature."); return applySupporterArts(actor, { ...options, branch: HEXER_BRANCH }); },
  sync: actor => syncSupporterArts(actor, HEXER_BRANCH),
  row: level => supporterArtsRow(HEXER_BRANCH, level),
  spellSaveDC: actor => supporterSpellSaveDC(actor)
});
