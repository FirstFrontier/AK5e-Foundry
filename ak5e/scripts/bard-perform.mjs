/**
 * Bard Performing (Ch. 3 L7106-7122 Performing and Rising Crescendo, L7146-7147 Font of Inspiration, L7149-7150 Time
 * Signature Change, L7161-7164 Fortissimo). Owns the Performance state in `flags.ak5e.bard`:
 *   { performances: [...] (composed by bard-compose), active: null | { performanceId, index, crescendo, castsThisTurn,
 *     concentration, castingUnitChanged, castingUnitBefore }, fontDie: boolean, museTHP }
 * - Every state change is a Supporter play-use (supporter-uses.mjs), so it is confirmed, warned (never blocked) and undoable.
 * - An Art cast during a Performance costs 0 AP through the Arts quote registry (arts-casting.registerArtQuoteOptions);
 *   the Arts engine still posts the card, the roll buttons and the consumption receipt.
 * - Rising Crescendo is an Active Effect on the Bard for the Spell Save DC and Spell Attack Bonus (dnd5e 5.3.3 keys
 *   `system.bonuses.spell.dc`, `system.bonuses.msak.attack`, `system.bonuses.rsak.attack`). Healing, Temporary HP and extra
 *   Shield or Mage Armour targets are read from `crescendoBonuses()` and stated on the card.
 * - Dice are never rolled here. Arts roll only from the native card.
 */
import { isBard, supporterLevel, flag, aidDieSize, pbForLevel } from "./supporter-rules.mjs";
import { findAidDieEffect, actorFromUuid } from "./supporter-features.mjs";
import { supporterUses } from "./supporter-uses.mjs";
import { onAk5eEvent } from "./trigger-events.mjs";
import { need, values, esc } from "./operation-kernel.mjs";
import { warn } from "./play-uses.mjs";
import { confirmPlayUse } from "./play-uses-sheet.mjs";
import { registerArtQuoteOptions } from "./arts-casting.mjs";

export const FONT_LEVEL = 4;
export const TIME_SIGNATURE_LEVEL = 10;
export const FORTISSIMO_LEVEL = 17;
/** The chapterThreeId of the Font of Inspiration feature (used as the featureId of its Aid Die effect). */
export const FONT_FEATURE_ID = "subclass-feature-supporter-bard-4th-level-font-of-inspiration-3945";
/** A fixed 16-character Active Effect id, so the Rising Crescendo effect is found and updated, never duplicated. */
export const CRESCENDO_EFFECT_ID = "ak5eBardCres0000";
const CRESCENDO_ICON = "icons/svg/aura.svg";
const INSTRUMENT_PATTERN = /\b(instrument|lute|lyre|harp|viol|fiddle|flute|pipe|horn|trumpet|drum|bell|bagpipes?|dulcimer|ocarina|bugle|shawm|tabor|zither|tuba)\b/i;
const COMMANDS = Object.freeze(["bardStartPerformance", "bardCastNextArt", "bardEndPerformance", "bardFontAid"]);

const randomId = () => foundry.utils.randomID();
const bardState = actor => flag(actor, "bard") ?? {};
const performancesOf = actor => (Array.isArray(bardState(actor).performances) ? bardState(actor).performances : []);
const activeOf = actor => bardState(actor).active ?? null;
const fontDieOf = actor => bardState(actor).fontDie === true;
const levelOf = actor => supporterLevel(actor) ?? 1;
/** Fortissimo (L7161-7164): each Art after the first counts as two Arts for Rising Crescendo. */
const crescendoMultiplier = actor => (levelOf(actor) >= FORTISSIMO_LEVEL ? 2 : 1);
/** Time Signature Change (L7149-7150): a second Art per Turn from 10th Level. */
const castLimit = actor => (levelOf(actor) >= TIME_SIGNATURE_LEVEL ? 2 : 1);
const findPerformance = (actor, id) => performancesOf(actor).find(entry => entry.id === id) ?? null;
const artItem = (actor, name) => values(actor.items).find(item => item.type === "spell" && item.name === name) ?? null;
const activityOf = item => { const all = values(item?.system?.activities); return all.find(a => a.activation?.type === "action") ?? all[0] ?? null; };
const requiresConcentration = item => item?.requiresConcentration === true || item?.system?.properties?.has?.("concentration") === true
  || values(item?.system?.activities).some(activity => activity?.duration?.concentration === true);
/** Instrument names recorded by Soul of the Bard setup (flags.ak5e.bardSetup.instruments, bard-compose), lower-cased. */
const recordedInstruments = actor => (Array.isArray(flag(actor, "bardSetup")?.instruments) ? flag(actor, "bardSetup").instruments : [])
  .map(name => String(name ?? "").trim().toLowerCase()).filter(Boolean);

/**
 * The equipped Instrument the Bard is Proficient with (C3 L7106). `instrument` is the item to use as the Casting Unit
 * (null when none is equipped); `status` is the warning text, or null when proficiency is shown. Proficiency comes from
 * the tool item's system.proficient, the Soul of the Bard record, the toolProf traits or the actor's tool entry.
 */
function instrumentCheck(actor) {
  const recorded = recordedInstruments(actor);
  const tools = values(actor.items).filter(item => item.type === "tool" && item.system?.equipped === true
    && (INSTRUMENT_PATTERN.test(item.name ?? "") || recorded.includes(String(item.name ?? "").trim().toLowerCase())));
  if (!tools.length) {
    return { instrument: null, status: "No equipped Instrument was found. Put on a Performance needs an Instrument you are Proficient with equipped (it is your Casting Unit)." };
  }
  const toolProf = String(actor.system?.traits?.toolProf?.custom ?? "").toLowerCase();
  const proficientBy = item => {
    const name = String(item.name ?? "").trim().toLowerCase();
    const level = Number(item.system?.proficient);
    const toolEntry = Number(actor.system?.tools?.[name.replace(/\s+/g, "")]?.value);
    return (Number.isFinite(level) && level >= 1) || recorded.includes(name) || toolProf.includes(name) || toolEntry >= 1;
  };
  const proficient = tools.find(proficientBy);
  if (proficient) return { instrument: proficient, status: null };
  const knownNotProficient = tools.some(item => Number(item.system?.proficient) === 0);
  return {
    instrument: tools[0],
    status: knownNotProficient
      ? `${tools[0].name} is equipped but you are not Proficient with it. Performing needs an Instrument you are Proficient with (C3 L7106).`
      : `Proficiency with ${tools[0].name} could not be determined. Confirm you are Proficient with the Instrument you use (C3 L7106).`
  };
}
const inCombatTurnOf = actor => !(game.combat?.started && game.combat.combatant?.actor && game.combat.combatant.actor.uuid !== actor.uuid);

/** The Art cast in progress for each Bard: its 0-AP discount applies to that one Art only (see bardArtQuoteOptions). */
const performingCast = new Map();

/** Arts registry hook: an Art cast as part of a Performance costs no Arts Points (L7108: "do not cost Arts Points"). */
export function bardArtQuoteOptions(actor, item) {
  const pending = performingCast.get(actor?.uuid);
  if (!pending || pending.itemId !== item?.id) return {};
  return { discount: 99, discountSource: "Performance (no Arts Points)" };
}

/* ---------------------------------------------------------------- Rising Crescendo effect */

function crescendoEffectData(amount) {
  const value = String(amount);
  return {
    name: "Rising Crescendo", img: CRESCENDO_ICON, disabled: false, transfer: false,
    changes: [
      { key: "system.bonuses.spell.dc", mode: 2, value, priority: 20 },
      { key: "system.bonuses.msak.attack", mode: 2, value, priority: 20 },
      { key: "system.bonuses.rsak.attack", mode: 2, value, priority: 20 }
    ],
    flags: { ak5e: { bardCrescendo: { amount } } }
  };
}

/** The Rising Crescendo effect on the Bard, found by its flag (Foundry keeps the id only with keepId, so the flag is the key). */
const findCrescendoEffect = actor => values(actor.effects).find(effect => effect.id === CRESCENDO_EFFECT_ID
  || flag(effect, "bardCrescendo") !== undefined) ?? null;

/** Sets the Rising Crescendo effect to `amount`; 0 (or null) removes it. Never creates a second effect. */
async function setCrescendoEffect(actor, amount) {
  const existing = findCrescendoEffect(actor);
  if (!amount) {
    if (existing) await actor.deleteEmbeddedDocuments("ActiveEffect", [existing.id]);
    return null;
  }
  const data = crescendoEffectData(amount);
  if (existing) {
    await existing.update({ changes: data.changes, flags: data.flags });
    return existing;
  }
  const [created] = await actor.createEmbeddedDocuments("ActiveEffect", [{ _id: CRESCENDO_EFFECT_ID, ...data }], { keepId: true });
  return created ?? null;
}

/** Plays and undo of the crescendo effect: `amount` on apply, `before` on revert (the exact prior value). */
const BARD_TARGET_KINDS = Object.freeze({
  bardCrescendo: {
    local: true,
    documentName: "Actor",
    async apply(_source, _useId, entry, target) {
      await setCrescendoEffect(target, entry.amount);
      return { amount: entry.amount };
    },
    async revert(_source, _useId, entry, target) {
      await setCrescendoEffect(target, entry.before);
      return { restored: entry.before ?? 0 };
    },
    preview(_source, _receipt, entry) {
      return `${entry.label ?? "Rising Crescendo"}: Rising Crescendo returns to +${entry.before ?? 0}.`;
    }
  }
});
supporterUses.register({ targetKinds: BARD_TARGET_KINDS });

/** Crescendo bonuses while Performing (0 otherwise). Healing/THP and extra targets are stated on the card. */
export function crescendoBonuses(actor) {
  const active = activeOf(actor);
  const crescendo = active ? Number(active.crescendo) || 0 : 0;
  return { healing: crescendo, extraTargets: crescendo, saveDC: crescendo, spellAttack: crescendo };
}

/** Rising Crescendo after `artsBefore` Arts were cast: each Art after the first adds 1 (2 at Fortissimo). */
export function crescendoFor(actor, artsBefore) {
  return Math.max(0, Number(artsBefore) || 0) * crescendoMultiplier(actor);
}

export const isPerforming = actor => Boolean(activeOf(actor));

/* ---------------------------------------------------------------- use plans */

/** Keep-Concentration choices: the Performance's Arts cast so far that require Concentration (Ch.3 L7108-7112). */
function keepArtChoices(actor, { includeCurrent = false } = {}) {
  const active = activeOf(actor), performance = active ? findPerformance(actor, active.performanceId) : null;
  if (!performance) return [];
  const names = performance.arts.slice(0, active.index + (includeCurrent ? 1 : 0))
    .filter(art => !art.manual && requiresConcentration(artItem(actor, art.name)))
    .map(art => art.name);
  return [...new Set(names)];
}

const startPerformance = (actor, _state, data = {}) => {
  need(isBard(actor), "Putting on a Performance is a Bard Supporter feature.");
  const performance = findPerformance(actor, data.performanceId);
  need(performance, "Choose a composed Performance.");
  need(!activeOf(actor), "This Bard is already Performing; end that Performance first.");
  const warnings = [];
  const level = levelOf(actor);
  const { instrument, status: instrumentStatus } = instrumentCheck(actor);
  if (instrumentStatus) warn(warnings, "instrument", instrumentStatus);
  if (performance.performed) {
    warn(warnings, "noEncore", `${performance.id} has already been performed. No Encore (Ch.3 L7114): it must be composed again.`);
  }
  // Performing is a 1st-level feature (L7106): below 4th level no Font die is gained, which is not a warning here.
  const casting = flag(actor, "casting") ?? {};
  if (casting.enabled === true && casting.ability && casting.ability !== "cha") {
    warn(warnings, "castingAbility", "Performance Arts use Charisma (Ch.3 L7112); this Bard's Arts casting ability is not Charisma.");
  }
  if (!inCombatTurnOf(actor)) {
    warn(warnings, "outOfTurn", "Putting on a Performance is an Action during your Turn; it is not your Turn.");
  }
  const arts = performance.arts.map(art => art.name);
  return {
    title: `Put on a Performance: ${performance.id}`,
    warnings,
    apply(_next, receipt) {
      const castingUnit = String(casting.castingUnit ?? "");
      const changeUnit = Boolean(instrument) && castingUnit !== instrument.id;
      // Foundry's flag update does not address array elements by a dotted index (the key replaces the array), so the
      // performed flag is written as the whole array, rebuilt from the state read at apply time (no stale copy is kept).
      const performances = performancesOf(actor).map(entry => entry.id === performance.id ? { ...entry, performed: true } : entry);
      const updates = {
        "flags.ak5e.bard.active": {
          performanceId: performance.id, index: 0, crescendo: 0, castsThisTurn: 0, concentration: null,
          castingUnitChanged: changeUnit, castingUnitBefore: changeUnit ? castingUnit : null
        },
        "flags.ak5e.bard.performances": performances,
        "flags.ak5e.bard.fontDie": level >= FONT_LEVEL
      };
      // The Instrument is the Casting Unit while Performing; the Arts engine reads the configured unit (restored at the end).
      if (changeUnit) updates["flags.ak5e.casting.castingUnit"] = instrument.id;
      receipt.summary = `${actor.name} put on the Performance (${arts.join(", ")}). `
        + (level >= FONT_LEVEL ? "A Font of Inspiration die is gained (Provide Aid only)." : "")
        + (instrument ? ` Instrument: ${instrument.name}.` : "");
      receipt.result = { performanceId: performance.id, arts, instrument: instrument?.name ?? null, artCount: arts.length };
      return updates;
    }
  };
};

const castNextArt = (actor, _state, data = {}) => {
  need(isBard(actor), "Performing Arts is a Bard Supporter feature.");
  const active = activeOf(actor);
  need(active, "This Bard is not Performing.");
  need(data.performanceId === undefined || active.performanceId === data.performanceId, "This Performance is not active.");
  need(data.index === undefined || Number(active.index) === Number(data.index), "The Performance has moved on; refresh the panel and try again.");
  const performance = findPerformance(actor, active.performanceId);
  need(performance, "The Performance no longer exists.");
  need(active.index < performance.arts.length, "All Arts of this Performance have been cast; end the Performance.");
  const art = performance.arts[active.index];
  const warnings = [];
  const limit = castLimit(actor);
  if (active.castsThisTurn >= limit) {
    warn(warnings, "turnLimit", limit === 1
      ? `One Art per Turn while Performing. Time Signature Change (10th Level, L7149) allows a second; this Bard is level ${levelOf(actor)}.`
      : "Two Arts per Turn while Performing (Time Signature Change).");
  }
  if (!inCombatTurnOf(actor)) warn(warnings, "outOfTurn", "Arts of a Performance are cast on your Turn; it is not your Turn.");
  const item = art.manual ? null : artItem(actor, art.name);
  if (!art.manual && !item) warn(warnings, "artMissing", `${art.name} is not on this Bard's sheet; a manual card is posted instead.`);
  const ignoreConcentration = Boolean(item && requiresConcentration(item) && !active.concentration);
  const before = Number(active.crescendo) || 0;
  const crescendo = crescendoFor(actor, active.index);
  const lastArt = active.index + 1 >= performance.arts.length;
  // The last Art ends the Performance (C3 L7108). Its keep-Concentration choice may name any Art cast so far, this one included.
  const keepChoices = lastArt ? keepArtChoices(actor, { includeCurrent: true }) : [];
  const keepArt = data.keepArt ?? null;
  if (keepArt !== null) need(keepChoices.includes(keepArt), "Keep Concentration on an Art of this Performance that requires Concentration, or on none.");
  const manual = !item;
  const next = {
    ...active, index: active.index + 1, castsThisTurn: active.castsThisTurn + 1, crescendo,
    concentration: ignoreConcentration ? { artName: art.name, index: active.index } : active.concentration ?? null
  };
  return {
    title: lastArt ? `Cast ${art.name} (last Art: the Performance ends)` : `Cast ${art.name} (Performance)`,
    warnings,
    apply(_state2, receipt) {
      const cresText = crescendo ? ` Rising Crescendo +${crescendo}: Spell Save DC and Spell Attack Bonus, Art healing and Temporary HP, and one extra Shield of Faith or Mage Armour target.` : "";
      const concText = ignoreConcentration ? ` Concentration is held by the Performance; ${art.name}'s own Concentration is ignored.` : "";
      const manualText = manual ? ` This Art has no Chapter 5 record: its effect is not automated and no mechanics are applied (see ak5e/DECISIONS.md, "Bard missing Arts / variants").` : "";
      let updates;
      if (lastArt) {
        // The end of the Performance, in this same use (L7108): the endPerformance state changes, crescendo included.
        updates = { "flags.ak5e.bard.active": null };
        if (active.castingUnitChanged) updates["flags.ak5e.casting.castingUnit"] = active.castingUnitBefore ?? "";
        if (before) {
          receipt.targets = [{ kind: "bardCrescendo", uuid: actor.uuid, name: actor.name, ready: true, amount: 0, before,
            label: "Rising Crescendo" }];
        }
      } else {
        updates = { "flags.ak5e.bard.active": next };
        if (crescendo !== before) {
          receipt.targets = [{ kind: "bardCrescendo", uuid: actor.uuid, name: actor.name, ready: true, amount: crescendo, before,
            label: `Rising Crescendo +${crescendo}` }];
        }
      }
      const endText = lastArt
        ? ` The Performance ends after its last Art and cannot be performed again (No Encore, L7114).`
          + (keepChoices.length ? (keepArt ? ` Concentration is kept on ${keepArt}; end the other Concentration Arts yourself.` : " No Art is kept: end any Concentration Arts yourself.") : "")
        : "";
      receipt.summary = `${actor.name} cast ${art.name} as Art ${active.index + 1} of ${performance.arts.length} of the Performance; no Arts Points are spent.`
        + `${manualText}${cresText}${concText}${endText}`;
      receipt.result = { performanceId: performance.id, index: active.index, artName: art.name, manual, artFound: Boolean(item),
        ignoreConcentration, crescendo, lastArt, keepArt: lastArt ? keepArt : null };
      return updates;
    }
  };
};

const endPerformance = (actor, _state, data = {}) => {
  need(isBard(actor), "Ending a Performance is a Bard Supporter feature.");
  const active = activeOf(actor);
  need(active, "This Bard is not Performing.");
  const keepArt = data.keepArt ?? null;
  if (keepArt !== null) need(keepArtChoices(actor).includes(keepArt), "Keep Concentration on an Art of this Performance that requires Concentration, or on none.");
  const reason = data.reason === "turnEnd" ? "turnEnd" : "manual";
  const crescendo = Number(active.crescendo) || 0;
  return {
    title: reason === "turnEnd" ? "Performance ends: no Art cast this Turn" : "End Performance",
    warnings: [],
    apply(_state2, receipt) {
      const updates = { "flags.ak5e.bard.active": null };
      if (active.castingUnitChanged) updates["flags.ak5e.casting.castingUnit"] = active.castingUnitBefore ?? "";
      if (crescendo) {
        receipt.targets = [{ kind: "bardCrescendo", uuid: actor.uuid, name: actor.name, ready: true, amount: 0, before: crescendo,
          label: "Rising Crescendo" }];
      }
      const reasonText = reason === "turnEnd" ? "The Performance ends: no Art was cast this Turn (L7112)." : "The Performance ends.";
      const concentrationArts = keepArtChoices(actor);
      const keepText = !concentrationArts.length ? ""
        : keepArt ? ` Concentration is kept on ${keepArt}; end the other Concentration Arts of this Performance yourself.`
          : " No Art is kept: end any Concentration Arts of this Performance yourself.";
      receipt.summary = `${actor.name}: ${reasonText}${keepText} It cannot be performed again (No Encore, L7114).`;
      receipt.result = { performanceId: active.performanceId, keepArt, reason };
      return updates;
    }
  };
};

const fontProvideAid = (actor, _state, data = {}) => {
  need(isBard(actor), "Font of Inspiration is a Bard Supporter feature.");
  const targetUuid = data.targetUuid ?? data.target?.uuid ?? null;
  need(targetUuid, "Choose a creature to give the Font of Inspiration Aid Die to.");
  const warnings = [];
  const level = levelOf(actor), die = aidDieSize(level), pb = pbForLevel(level);
  const targetName = data.targetName ?? data.target?.name ?? "target creature";
  const target = data.target ?? actorFromUuid(targetUuid);
  if (!fontDieOf(actor)) {
    warn(warnings, "noFontDie", "No Font of Inspiration die is held. It is gained when you begin Performing and at the start of each of your Turns while Performing.");
  }
  if (level < FONT_LEVEL) warn(warnings, "fontLevel", `Font of Inspiration is a 4th level feature; this Bard is level ${level}.`);
  if (Number(data.distance ?? 0) > 60) warn(warnings, "range", `${targetName} is beyond 60 feet (Provide Aid range).`);
  if (targetUuid === actor.uuid || target?.uuid === actor.uuid) {
    warn(warnings, "selfTarget", "Provide Aid is for another Creature; the Font die cannot be given to yourself.");
  }
  if (findAidDieEffect(target) || data.targetHasAidDie) {
    warn(warnings, "targetHasAidDie", `${targetName} already has an Aid Die; a creature can only have one Aid Die at a time.`);
  }
  return {
    title: `Font of Inspiration Aid (${die}) -> ${targetName}`,
    warnings,
    apply(_state2, receipt) {
      receipt.summary = `${actor.name} granted a ${die} Font of Inspiration Aid Die to ${targetName} for 10 minutes. No Aid Die pool is spent.`;
      receipt.result = { dieSize: die, targetUuid, targetName, durationSeconds: 600, font: true };
      receipt.targets = [{
        uuid: targetUuid, name: targetName, kind: "effect", featureId: FONT_FEATURE_ID, ready: true,
        tag: {
          label: `Aid Die (${die})`, trigger: "turnStart", expiryActor: "source", duration: 600,
          data: { supporterUuid: actor.uuid, dieSize: die, supporterLevel: level, supporterPB: pb,
            advancedAid: level >= 5, willIntoBeing: level >= 20, font: true }
        },
        meta: { aidDie: true, dieSize: die, font: true }
      }];
      return { "flags.ak5e.bard.fontDie": false };
    }
  };
};
fontProvideAid.validateTarget = (_source, receipt, entry, target) => entry.kind === "effect" && entry.meta?.aidDie === true
  && target?.uuid === entry.uuid && receipt.result?.dieSize === entry.tag?.data?.dieSize;

/** Ch.3 Bard plans for the Supporter use engine. Register with registerSupporterPlans({ plans: bardPerformPlans }). */
export const bardPerformPlans = Object.freeze({ startPerformance, castNextArt, endPerformance, fontProvideAid });

/** No resource pool: the Font die and Performance state are flags. Target kinds are registered at module load. */
export function defineBardPerformPools() {
  return null;
}

/* ---------------------------------------------------------------- turn rules and hooks */

/** Turn start (L7146-7147): a Performing Bard gains its Font die and may cast one more Art this Turn (reset). */
export async function bardTurnStart(actor) {
  if (!isBard(actor)) return;
  const updates = {};
  if (activeOf(actor)) {
    updates["flags.ak5e.bard.active.castsThisTurn"] = 0;
    if (levelOf(actor) >= FONT_LEVEL) updates["flags.ak5e.bard.fontDie"] = true;
  }
  if (Object.keys(updates).length) await actor.update(updates);
}

/**
 * Turn end: the Font die is lost (L7147). A Performance with no Art cast this Turn ends (L7112), through the use engine
 * so the end is recorded, posted to chat and undoable.
 */
export async function bardTurnEnd(actor) {
  if (!isBard(actor)) return;
  if (fontDieOf(actor)) await actor.update({ "flags.ak5e.bard.fontDie": false });
  const active = activeOf(actor);
  if (active && (Number(active.castsThisTurn) || 0) === 0) {
    await supporterUses.execute(actor, "endPerformance", { performanceId: active.performanceId, keepArt: null, reason: "turnEnd", confirmed: true }, randomId());
  }
}

const turnHandler = handler => event => {
  const actor = actorFromUuid(event?.actorUuid);
  if (!actor?.isOwner || !isBard(actor)) return undefined;
  return handler(actor);
};

// The quote source is pure and idempotent (the Arts registry de-duplicates), so it is registered at load.
registerArtQuoteOptions(bardArtQuoteOptions);

let hooksInstalled = false;
/** Idempotent per module instance: the turn-start and turn-end handlers. */
export function registerBardPerformHooks() {
  if (hooksInstalled) return;
  hooksInstalled = true;
  onAk5eEvent("turnStart", turnHandler(bardTurnStart));
  onAk5eEvent("turnEnd", turnHandler(bardTurnEnd));
}

/* ---------------------------------------------------------------- panel and commands */

/** Panel fragment for the Supporter sheet. Opening it changes nothing. */
export function bardPerformPanel(actor) {
  if (!isBard(actor)) return "";
  const active = activeOf(actor);
  const cmd = (name, label) => `<button type="button" data-supporter-cmd="${esc(name)}">${esc(label)}</button>`;
  let status = "Not Performing.";
  const buttons = [];
  if (active) {
    const performance = findPerformance(actor, active.performanceId);
    const count = performance?.arts.length ?? 0;
    status = `Performing ${esc(active.performanceId)}: ${active.index} of ${count} Arts cast; Rising Crescendo +${Number(active.crescendo) || 0}`
      + ` (Spell Save DC and Spell Attack Bonus); ${active.castsThisTurn} cast this Turn.`;
    if (performance && active.index < count) buttons.push(cmd("bardCastNextArt", `Cast next Art (${performance.arts[active.index].name})`));
    buttons.push(cmd("bardEndPerformance", "End Performance"));
  } else if (performancesOf(actor).length) {
    buttons.push(cmd("bardStartPerformance", "Put on a Performance"));
  } else {
    status = "Not Performing. Compose a Performance first.";
  }
  if (fontDieOf(actor)) buttons.push(cmd("bardFontAid", "Give Font of Inspiration die (Provide Aid)"));
  return `<section class="ak5e-bard-perform"><h4>Performance</h4><p>${status}</p>`
    + `<div class="ak5e-supporter-button-row">${buttons.join(" ")}</div></section>`;
}

async function promptPerformance(actor) {
  const options = performancesOf(actor).map(entry => `<option value="${esc(entry.id)}">${esc(entry.id)}: ${esc(entry.arts.map(art => art.name).join(", "))}${entry.performed ? " (performed; No Encore)" : ""}</option>`).join("");
  return foundry.applications.api.DialogV2.prompt({
    window: { title: `Put on a Performance — ${actor.name}` }, rejectClose: false,
    content: `<label>Performance <select name="performanceId">${options}</select></label>`,
    ok: { label: "Continue", callback: (_event, button) => button.form.elements.performanceId?.value || null }
  });
}

async function promptKeepArt(choices, { optional }) {
  const options = `<option value="">— none: all Arts end —</option>` + choices.map(name => `<option value="${esc(name)}">${esc(name)}</option>`).join("");
  const picked = await foundry.applications.api.DialogV2.prompt({
    window: { title: "End Performance: keep Concentration" }, rejectClose: false,
    content: `<p>Choose one Art to maintain your Concentration on (Ch.3 L7112). All other Arts end.</p><label>Keep <select name="keepArt">${options}</select></label>`,
    ok: { label: "Continue", callback: (_event, button) => button.form.elements.keepArt?.value ?? "" }
  });
  if (picked === null || picked === undefined) return optional ? "" : null;
  return picked;
}

async function confirmManualCard(actor, art) {
  return foundry.applications.api.DialogV2.wait({
    window: { title: `Cast ${art.name} (manual)` }, rejectClose: false,
    content: `<div class="ak5e-supporter-confirm"><p>${esc(art.name)} has no Chapter 5 record. Its effect is not automated: a manual card is posted and nothing is rolled. No Arts Points are spent.</p></div>`,
    buttons: [
      { action: "confirm", label: "Post manual card", default: true, callback: () => true },
      { action: "cancel", label: "Cancel", callback: () => false }
    ]
  });
}

async function postManualCard(actor, art, performanceId) {
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content: `<h3>${esc(art.name)} (Performance, manual)</h3><p>${esc(actor.name)} performs ${esc(art.name)}. The module has no Chapter 5 record for this Art or variant, `
      + `so nothing is automated and no mechanics are applied. Resolve it at the table. See ak5e/DECISIONS.md, "Bard missing Arts / variants".</p>`
      + `<p>No Arts Points were spent.</p>`,
    flags: { ak5e: { bardPerformManual: { performanceId, artName: art.name } } }
  });
}

/** Runs `fn` with the 0-AP Performance discount active for `item` only (the native cast, or a quote of it). */
export async function withPerformanceCast(actor, item, fn) {
  performingCast.set(actor.uuid, { itemId: item.id });
  try {
    return await fn();
  } finally {
    performingCast.delete(actor.uuid);
  }
}

/** Casts one Art of the active Performance through the native Arts flow. Returns true when a cast was committed. */
async function castArtNatively(actor, item, { ignoreConcentration }) {
  const activity = activityOf(item);
  need(activity, `${item.name} has no native activity; cast it from its Chapter 5 record.`);
  return withPerformanceCast(actor, item, async () => {
    const usage = ignoreConcentration ? { concentration: { begin: false } } : {};
    return Boolean(await activity.use(usage));
  });
}

/**
 * One Art of the Performance: the state change first (so the crescendo bonus is live during the cast), then the cast.
 * Cancelling the cast undoes the state change, so Cancel changes nothing.
 */
async function castFlow(actor, { startOpId = null } = {}) {
  const active = activeOf(actor);
  need(active, "Put on a Performance first.");
  const performance = findPerformance(actor, active.performanceId);
  need(performance, "The Performance no longer exists.");
  const art = performance.arts[active.index];
  need(art, "All Arts of this Performance have been cast.");
  // The last Art ends the Performance inside its own use, so the keep-Concentration choice is asked before it (C3 L7108).
  let keepArt = null;
  if (active.index + 1 >= performance.arts.length) {
    const choices = keepArtChoices(actor, { includeCurrent: true });
    if (choices.length) keepArt = (await promptKeepArt(choices, { optional: true })) || null;
  }
  const opId = randomId();
  const result = await confirmPlayUse(`Cast ${art.name} (Performance)`, extra => supporterUses.execute(actor, "castNextArt",
    { performanceId: active.performanceId, index: active.index, keepArt, confirmed: true, ...extra }, opId));
  if (!result) {
    if (startOpId) await supporterUses.undo(actor, startOpId);
    return null;
  }
  let cast = false;
  try {
    if (result.manual || !result.artFound) {
      cast = (await confirmManualCard(actor, art)) === true;
      if (cast) await postManualCard(actor, art, performance.id);
    } else {
      cast = await castArtNatively(actor, artItem(actor, art.name), { ignoreConcentration: result.ignoreConcentration });
    }
  } catch (error) {
    console.error("AK5e | Bard Performance cast", error);
    globalThis.ui?.notifications?.error(error?.message ?? String(error));
    cast = false;
  }
  if (!cast) {
    await supporterUses.undo(actor, opId);
    if (startOpId) await supporterUses.undo(actor, startOpId);
    return null;
  }
  return result;
}

/** Ends the active Performance. A natural end (last Art) cannot be cancelled into staying open. */
async function endFlow(actor, { natural = false } = {}) {
  const active = activeOf(actor);
  need(active, "This Bard is not Performing.");
  const choices = keepArtChoices(actor);
  let keepArt = null;
  if (choices.length) {
    keepArt = await promptKeepArt(choices, { optional: natural });
    if (keepArt === null) return null;
  }
  const opId = randomId();
  return confirmPlayUse("End Performance", extra => supporterUses.execute(actor, "endPerformance",
    { performanceId: active.performanceId, keepArt: keepArt || null, reason: "manual", confirmed: true, ...extra }, opId));
}

async function fontAidFlow(actor) {
  const target = globalThis.game?.user?.targets?.first?.()?.actor ?? null;
  need(target, "Target the creature to give the Font of Inspiration die to.");
  const opId = randomId();
  return confirmPlayUse("Font of Inspiration Aid", extra => supporterUses.execute(actor, "fontProvideAid",
    { targetUuid: target.uuid, targetName: target.name, confirmed: true, ...extra }, opId));
}

/**
 * Panel command dispatcher. Returns undefined for a command it does not own, so the branch can fall through.
 * Every step is confirmed; cancelling changes nothing.
 */
export async function bardPerformCommand(actor, cmd) {
  if (!COMMANDS.includes(cmd)) return undefined;
  need(actor?.isOwner && isBard(actor), "Performance commands need the Bard branch.");
  switch (cmd) {
    case "bardStartPerformance": {
      if (!performancesOf(actor).length) { globalThis.ui?.notifications?.warn?.("Compose a Performance first."); return null; }
      const performanceId = await promptPerformance(actor);
      if (!performanceId) return null;
      const opId = randomId();
      const started = await confirmPlayUse("Put on a Performance", extra => supporterUses.execute(actor, "startPerformance",
        { performanceId, confirmed: true, ...extra }, opId));
      if (!started) return null;
      return castFlow(actor, { startOpId: opId });
    }
    case "bardCastNextArt": return castFlow(actor);
    case "bardEndPerformance": return endFlow(actor);
    case "bardFontAid": return fontAidFlow(actor);
    default: return undefined;
  }
}

/** Frozen API. The `castState`, `start` and `end` calls change state only: they do not cast the Art (use bardPerformCommand). */
export const bardPerformApi = Object.freeze({
  isPerforming,
  crescendoBonuses,
  crescendoFor,
  fontDieHeld: actor => fontDieOf(actor),
  start: (actor, data) => supporterUses.execute(actor, "startPerformance", { ...data, confirmed: true }, randomId()),
  castState: (actor, data) => supporterUses.execute(actor, "castNextArt", { ...data, confirmed: true }, randomId()),
  end: (actor, data) => supporterUses.execute(actor, "endPerformance", { ...data, confirmed: true }, randomId()),
  fontProvideAid: (actor, data) => supporterUses.execute(actor, "fontProvideAid", { ...data, confirmed: true }, randomId()),
  undo: (actor, useId) => supporterUses.undo(actor, useId)
});
