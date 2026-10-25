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

function crescendoEffectData(amount, expiring = false) {
  const value = String(amount);
  return {
    name: "Rising Crescendo", img: CRESCENDO_ICON, disabled: false, transfer: false,
    changes: [
      { key: "system.bonuses.spell.dc", mode: 2, value, priority: 20 },
      { key: "system.bonuses.msak.attack", mode: 2, value, priority: 20 },
      { key: "system.bonuses.rsak.attack", mode: 2, value, priority: 20 }
    ],
    flags: { ak5e: { bardCrescendo: { amount, expiring: expiring === true } } }
  };
}

/** The Rising Crescendo effect on the Bard, found by its flag (Foundry keeps the id only with keepId, so the flag is the key). */
const findCrescendoEffect = actor => values(actor.effects).find(effect => effect.id === CRESCENDO_EFFECT_ID
  || flag(effect, "bardCrescendo") !== undefined) ?? null;

/**
 * The expiring Rising Crescendo effect kept alive for the last Art's own native cast (C3 L7118: the last Art gets its bonus).
 * Returns its amount, or 0 when there is no expiring effect.
 */
const expiringCrescendoAmount = actor => {
  const info = flag(findCrescendoEffect(actor), "bardCrescendo");
  return info?.expiring === true ? Number(info.amount) || 0 : 0;
};

/** Sets the Rising Crescendo effect to `amount`; 0 (or null) removes it. Never creates a second effect. */
async function setCrescendoEffect(actor, amount, expiring = false) {
  const existing = findCrescendoEffect(actor);
  if (!amount) {
    if (existing) await actor.deleteEmbeddedDocuments("ActiveEffect", [existing.id]);
    return null;
  }
  const data = crescendoEffectData(amount, expiring);
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
      await setCrescendoEffect(target, entry.amount, entry.expiring === true);
      return { amount: entry.amount };
    },
    async revert(_source, _useId, entry, target) {
      await setCrescendoEffect(target, entry.before, entry.beforeExpiring === true);
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
      // A Performance that ended on its last Art may leave its expiring crescendo effect: a new start removes it (undoable).
      const expiring = expiringCrescendoAmount(actor);
      if (expiring > 0) {
        receipt.targets = [{ kind: "bardCrescendo", uuid: actor.uuid, name: actor.name, ready: true, amount: 0, before: expiring,
          beforeExpiring: true, label: "Rising Crescendo (expiring)" }];
      }
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
        // The end of the Performance, in this same use (L7108): active is cleared and the Casting Unit restored. The last
        // Art still gets its own Rising Crescendo bonus (C3 L7118), so the effect stays, flagged expiring, for its native
        // cast; clearExpiringCrescendo removes it after the cast, and turnEnd/startPerformance remove it otherwise.
        updates = { "flags.ak5e.bard.active": null };
        if (active.castingUnitChanged) updates["flags.ak5e.casting.castingUnit"] = active.castingUnitBefore ?? "";
        if (crescendo !== before || crescendo > 0) {
          receipt.targets = [{ kind: "bardCrescendo", uuid: actor.uuid, name: actor.name, ready: true, amount: crescendo, before,
            expiring: true, beforeExpiring: expiringCrescendoAmount(actor) > 0, label: `Rising Crescendo +${crescendo}` }];
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
        ignoreConcentration, crescendo, lastArt, keepArt: lastArt ? keepArt : null, expiringCrescendo: lastArt && crescendo > 0 };
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
          // A normal Aid Die once granted: "Once within the next ten minutes" (C3:6635), so a 600 s time expiry.
          label: `Aid Die (${die})`, trigger: "time", seconds: 600, expiryActor: "source",
          data: { supporterUuid: actor.uuid, dieSize: die, supporterLevel: level, supporterPB: pb,
            advancedAid: level >= 5, willIntoBeing: level >= 20, font: true }
        },
        meta: { aidDie: true, dieSize: die, font: true }
      }];
      return { "flags.ak5e.bard.fontDie": false };
    }
  };
};
/** The only tag keys a Font of Inspiration Aid Die may carry (no changes, conditions or benefits are relayed). */
const FONT_TAG_KEYS = Object.freeze(["label", "trigger", "seconds", "expiryActor", "data", "instructions"]);
/** Relay check (H2): the Aid Die tag must be the Bard's real Font die, with no extra content. */
fontProvideAid.validateTarget = (source, receipt, entry, target) => {
  if (entry.kind !== "effect" || entry.meta?.aidDie !== true || target?.uuid !== entry.uuid) return false;
  const tag = entry.tag ?? {};
  if (Object.keys(tag).some(key => !FONT_TAG_KEYS.includes(key))) return false;
  if (entry.standardBenefit) return false;
  const die = aidDieSize(levelOf(source));
  return tag.data?.dieSize === die && receipt.result?.dieSize === die && tag.data?.supporterUuid === source.uuid;
};

/**
 * Post-cast step after the last Art's native cast: removes the expiring Rising Crescendo effect (undoable). It removes
 * nothing that is not expiring, so an ordinary crescendo of a running Performance is never touched.
 */
const clearExpiringCrescendo = actor => {
  need(isBard(actor), "Rising Crescendo is a Bard Supporter feature.");
  const amount = expiringCrescendoAmount(actor);
  return {
    title: "Rising Crescendo ends",
    warnings: [],
    apply(_state2, receipt) {
      if (amount) {
        receipt.targets = [{ kind: "bardCrescendo", uuid: actor.uuid, name: actor.name, ready: true, amount: 0, before: amount,
          beforeExpiring: true, label: "Rising Crescendo (expiring)" }];
      }
      receipt.summary = amount ? `${actor.name}: the last Art's Rising Crescendo +${amount} ends.` : `${actor.name}: no expiring Rising Crescendo to end.`;
      receipt.result = { cleared: amount };
      return {};
    }
  };
};

/** Ch.3 Bard plans for the Supporter use engine. Register with registerSupporterPlans({ plans: bardPerformPlans }). */
export const bardPerformPlans = Object.freeze({ startPerformance, castNextArt, endPerformance, fontProvideAid, clearExpiringCrescendo });

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
  // The expiring crescendo of a Performance's last Art is removed at turn end, even if the post-cast step never ran.
  const expiringEffect = expiringCrescendoAmount(actor) > 0 ? findCrescendoEffect(actor) : null;
  if (expiringEffect) await actor.deleteEmbeddedDocuments("ActiveEffect", [expiringEffect.id]);
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
  // Continue returns the choice; Cancel and X return false/null, which both mean no Performance is chosen.
  const picked = await foundry.applications.api.DialogV2.wait({
    window: { title: `Put on a Performance — ${actor.name}` }, rejectClose: false,
    content: `<label>Performance <select name="performanceId">${options}</select></label>`,
    buttons: [
      { action: "continue", label: "Continue", default: true,
        callback: (_event, button) => ({ performanceId: button?.form?.elements?.performanceId?.value || "" }) },
      { action: "cancel", label: "Cancel", callback: () => false }
    ]
  });
  return picked?.performanceId || null;
}

/**
 * Confirm step with Cancel (WORKFLOW 3.2: confirm before every use; Cancel changes nothing). Resolves true only on the
 * confirm button. Cancel returns false, and closing the window (X) resolves null, which also means "not confirmed".
 */
async function confirmSummary({ title, lines, confirmLabel }) {
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title }, rejectClose: false,
    content: `<div class="ak5e-supporter-confirm">${lines.map(line => `<p>${esc(line)}</p>`).join("")}</div>`,
    buttons: [
      { action: "confirm", label: confirmLabel, default: true, callback: () => true },
      { action: "cancel", label: "Cancel", callback: () => false }
    ]
  });
  return result === true;
}

/**
 * Keep-Concentration prompt: one "Keep: <Art>" button per Art that requires Concentration, "Keep none", and Cancel.
 * It is also the confirm step where it appears. Returns { keepArt } (the Art or null), or null on Cancel and on X.
 */
async function promptKeepArt(choices, { title, lines }) {
  const buttons = [
    ...choices.map((name, index) => ({ action: `keep${index}`, label: `Keep: ${name}`, callback: () => ({ keepArt: name }) })),
    { action: "none", label: "Keep none", callback: () => ({ keepArt: null }) },
    { action: "cancel", label: "Cancel", callback: () => false }
  ];
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title }, rejectClose: false,
    content: `<div class="ak5e-supporter-confirm">${lines.map(line => `<p>${esc(line)}</p>`).join("")}</div>`,
    buttons
  });
  return result && typeof result === "object" && "keepArt" in result ? result : null;
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
 * One Art of the Performance. Before any write: a confirm summary (with Cancel), or the keep-Concentration prompt on the
 * last Art (which is its confirm). Then the state change (crescendo live during the cast), then the cast. A cancelled or
 * failed cast undoes the state change. `startOpId` is set when this cast follows Put on a Performance, whose confirm
 * already named the first Art.
 */
async function castFlow(actor, { startOpId = null } = {}) {
  const active = activeOf(actor);
  need(active, "Put on a Performance first.");
  const performance = findPerformance(actor, active.performanceId);
  need(performance, "The Performance no longer exists.");
  const art = performance.arts[active.index];
  need(art, "All Arts of this Performance have been cast.");
  const lastArt = active.index + 1 >= performance.arts.length;
  const crescendo = crescendoFor(actor, active.index);
  const cresLine = crescendo
    ? `Rising Crescendo after this cast: +${crescendo} (Spell Save DC and Spell Attack Bonus; Art healing and Temporary HP; an extra Shield of Faith or Mage Armour target).`
    : "Rising Crescendo after this cast: +0 (it begins with the second Art).";
  const artLine = `Cast ${art.name} as Art ${active.index + 1} of ${performance.arts.length}: 0 Arts Points (Performance Arts cost no AP, C3 L7108).`;
  const manualLine = !art.manual ? null : `${art.name} has no Chapter 5 record: its effect is not automated; a manual card is posted and nothing is rolled.`;
  let keepArt = null;
  if (!startOpId) {
    if (lastArt) {
      const choices = keepArtChoices(actor, { includeCurrent: true });
      const lines = [artLine, cresLine, "The last Art ends the Performance (C3 L7108); its Rising Crescendo applies to its own cast.", ...(manualLine ? [manualLine] : [])];
      if (choices.length) {
        const picked = await promptKeepArt(choices, { title: `Cast ${art.name}: last Art`,
          lines: [...lines, "Choose one Art to maintain your Concentration on (Ch.3 L7112). All other Arts end."] });
        if (!picked) return null;
        keepArt = picked.keepArt;
      } else if (!(await confirmSummary({ title: `Cast ${art.name}: last Art`, lines, confirmLabel: "Cast" }))) {
        return null;
      }
    } else if (!(await confirmSummary({ title: `Cast ${art.name}`, lines: [artLine, cresLine, ...(manualLine ? [manualLine] : [])], confirmLabel: "Cast" }))) {
      return null;
    }
  }
  const opId = randomId();
  const result = await confirmPlayUse(`Cast ${art.name} (Performance)`, extra => supporterUses.execute(actor, "castNextArt",
    { performanceId: active.performanceId, index: active.index, keepArt, confirmed: true, ...extra }, opId), { confirmed: true });
  if (!result) {
    if (startOpId) await supporterUses.undo(actor, startOpId);
    return null;
  }
  let cast = false;
  try {
    if (result.manual || !result.artFound) {
      await postManualCard(actor, art, performance.id);
      cast = true;
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
  // The last Art's native cast has resolved: its expiring crescendo effect is no longer needed.
  if (result.expiringCrescendo) await supporterUses.execute(actor, "clearExpiringCrescendo", { confirmed: true }, randomId());
  return result;
}

/** Put on a Performance: a confirm naming the first Art (Cancel writes nothing), then the start and the first Art's cast. */
async function startFlow(actor, performanceId) {
  const performance = findPerformance(actor, performanceId);
  need(performance, "Choose a composed Performance.");
  const level = levelOf(actor);
  const first = performance.arts[0]?.name ?? "the first Art";
  const confirmed = await confirmSummary({ title: `Put on ${performance.id}`, confirmLabel: "Put on",
    lines: [`Performance ${performance.id}: ${performance.arts.map(art => art.name).join(", ")}.`,
      `Putting it on casts the first Art, ${first} (Art 1 of ${performance.arts.length}), at 0 Arts Points.`,
      `The Instrument you are Proficient with becomes your Casting Unit until the Performance ends.`,
      level >= FONT_LEVEL ? "A Font of Inspiration die is gained (Provide Aid only)." : "No Font of Inspiration die (level 4 feature)."] });
  if (!confirmed) return null;
  const opId = randomId();
  const started = await confirmPlayUse("Put on a Performance", extra => supporterUses.execute(actor, "startPerformance",
    { performanceId, confirmed: true, ...extra }, opId), { confirmed: true });
  if (!started) return null;
  return castFlow(actor, { startOpId: opId });
}

/** Ends the active Performance. With Concentration Arts cast so far, the keep prompt is the confirm; otherwise a confirm. */
async function endFlow(actor) {
  const active = activeOf(actor);
  need(active, "This Bard is not Performing.");
  const choices = keepArtChoices(actor);
  let keepArt = null;
  if (choices.length) {
    const picked = await promptKeepArt(choices, { title: "End Performance: keep Concentration",
      lines: ["Choose one Art to maintain your Concentration on (Ch.3 L7112). All other Arts end.",
        "The Performance cannot be performed again afterwards (No Encore, L7114)."] });
    if (!picked) return null;
    keepArt = picked.keepArt;
  } else if (!(await confirmSummary({ title: "End Performance", confirmLabel: "End Performance",
    lines: [`End ${active.performanceId} now. It cannot be performed again (No Encore, L7114).`] }))) {
    return null;
  }
  const opId = randomId();
  return confirmPlayUse("End Performance", extra => supporterUses.execute(actor, "endPerformance",
    { performanceId: active.performanceId, keepArt, reason: "manual", confirmed: true, ...extra }, opId), { confirmed: true });
}

/** Font of Inspiration Aid: a confirm naming the target and the die. Cancel spends nothing. */
async function fontAidFlow(actor) {
  const target = globalThis.game?.user?.targets?.first?.()?.actor ?? null;
  need(target, "Target the creature to give the Font of Inspiration die to.");
  const die = aidDieSize(levelOf(actor));
  const confirmed = await confirmSummary({ title: `Font of Inspiration Aid to ${target.name}`, confirmLabel: "Give the Aid Die",
    lines: [`Give ${target.name} a ${die} Font of Inspiration Aid Die for 10 minutes.`,
      "This spends your Font of Inspiration die; no Aid Die pool is used."] });
  if (!confirmed) return null;
  const opId = randomId();
  return confirmPlayUse("Font of Inspiration Aid", extra => supporterUses.execute(actor, "fontProvideAid",
    { targetUuid: target.uuid, targetName: target.name, confirmed: true, ...extra }, opId), { confirmed: true });
}

/**
 * Panel command dispatcher. Returns undefined for a command it does not own, so the branch can fall through.
 * Every step confirms first; Cancel changes nothing.
 */
export async function bardPerformCommand(actor, cmd) {
  if (!COMMANDS.includes(cmd)) return undefined;
  need(actor?.isOwner && isBard(actor), "Performance commands need the Bard branch.");
  switch (cmd) {
    case "bardStartPerformance": {
      if (!performancesOf(actor).length) { globalThis.ui?.notifications?.warn?.("Compose a Performance first."); return null; }
      const performanceId = await promptPerformance(actor);
      if (!performanceId) return null;
      return startFlow(actor, performanceId);
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
