/**
 * Bard Supporter composing (Ch. 3 L7096-7211): A Magical Performance (compose), No Encore, Soul of the Bard
 * (instrument and Performance proficiency, Speak to the Soul) and Emergency Improv (L13, L7152-7159).
 *
 * Table play (WORKFLOW.md §3.2): every rule violation warns with "Use anyway"; nothing blocks. Each use is confirmed
 * before it is recorded. Dice are never rolled by a plan: the card's roll button (`useRoll`) rolls, and the Muse
 * (or the Performance check) is committed only after that click. Undo restores the Aid Dice, the Performances and
 * the Temporary HP that the use changed.
 *
 * Data contract shared with bard-perform.mjs (U8):
 *   flags.ak5e.bard = { performances: [{ id, arts: [{ name, muse, manual }], performed, composedAt }],
 *                       active: null | { performanceId, index, crescendo, castsThisTurn }, museTHP }
 * This module creates Performances and writes `performances` and `museTHP` only. It never touches `active`.
 */
import { definePool, getPool, getPoolDefinition } from "./resource-pools.mjs";
import { supporterUses } from "./supporter-uses.mjs";
import { isBard, supporterLevel, flag, aidDieSize } from "./supporter-rules.mjs";
import { spendAidDice } from "./supporter-features.mjs";
import { spendResource, warn } from "./play-uses.mjs";
import { applyTempHP } from "./damage-pipeline.mjs";
import { need, esc } from "./operation-kernel.mjs";
import { confirmPlayUse } from "./play-uses-sheet.mjs";

/** C3:7168-7211, transcribed in source order. `inChapterFive` and `manual` are checked against Ch.5 data by the test suite (R7). */
export const BARD_PERFORMANCE_ARTS = Object.freeze([
  Object.freeze({ name: "Bane", muse: 1, inChapterFive: true, manual: false }),
  Object.freeze({ name: "Bless", muse: 1, inChapterFive: false, manual: true }),
  Object.freeze({ name: "Mage Armour", muse: 1, inChapterFive: true, manual: false }),
  Object.freeze({ name: "Pyrotechnics", muse: 1, inChapterFive: false, manual: true }),
  Object.freeze({ name: "Aid", muse: 2, inChapterFive: true, manual: false }),
  Object.freeze({ name: "Cause Fear", muse: 2, inChapterFive: false, manual: true }),
  Object.freeze({ name: "Colour Spray", muse: 2, inChapterFive: false, manual: true }),
  Object.freeze({ name: "Dissonant Whispers", muse: 2, inChapterFive: true, manual: false }),
  Object.freeze({ name: "Expeditious Retreat", muse: 2, inChapterFive: true, manual: false }),
  Object.freeze({ name: "Healing Word", muse: 2, inChapterFive: true, manual: false }),
  Object.freeze({ name: "Heroism", muse: 2, inChapterFive: true, manual: false }),
  Object.freeze({ name: "Ray of Enfeeblement", muse: 2, inChapterFive: false, manual: true }),
  Object.freeze({ name: "Shield of Faith", muse: 2, inChapterFive: false, manual: true }),
  Object.freeze({ name: "Sleep", muse: 2, inChapterFive: true, manual: false }),
  Object.freeze({ name: "Bolster", muse: 3, inChapterFive: true, manual: false }),
  Object.freeze({ name: "Chromatic Orb (Thunder only)", muse: 3, inChapterFive: false, manual: true }),
  Object.freeze({ name: "Protection from Energy", muse: 3, inChapterFive: true, manual: false }),
  Object.freeze({ name: "Warding Bond", muse: 3, inChapterFive: true, manual: false }),
  Object.freeze({ name: "Aura of Vitality", muse: 4, inChapterFive: true, manual: false }),
  Object.freeze({ name: "Beacon of Hope", muse: 4, inChapterFive: true, manual: false }),
  Object.freeze({ name: "Crusader's Mantle", muse: 4, inChapterFive: false, manual: true }),
  Object.freeze({ name: "Haste", muse: 4, inChapterFive: false, manual: true }),
  Object.freeze({ name: "Mass Healing Word", muse: 4, inChapterFive: true, manual: false }),
  Object.freeze({ name: "Mind Spike", muse: 4, inChapterFive: true, manual: false }),
  Object.freeze({ name: "Slow", muse: 4, inChapterFive: true, manual: false }),
  Object.freeze({ name: "Tasha's Mind Whip", muse: 4, inChapterFive: false, manual: true }),
  Object.freeze({ name: "Thunderwave", muse: 4, inChapterFive: true, manual: false }),
  Object.freeze({ name: "Aura of Life", muse: 5, inChapterFive: false, manual: true }),
  Object.freeze({ name: "Fire Shield", muse: 5, inChapterFive: true, manual: false }),
  Object.freeze({ name: "Freedom of Movement", muse: 5, inChapterFive: true, manual: false }),
  Object.freeze({ name: "Shatter (2nd Level)", muse: 5, inChapterFive: true, manual: false }),
  Object.freeze({ name: "Circle of Power", muse: 6, inChapterFive: true, manual: false }),
  Object.freeze({ name: "Shatter (5th Level)", muse: 8, inChapterFive: true, manual: false }),
  Object.freeze({ name: "Synaptic Static", muse: 8, inChapterFive: true, manual: false })
]);

export const EMERGENCY_IMPROV_DC = 17;
export const EMERGENCY_IMPROV_LEVEL = 13;
const MINIMUM_ARTS = 3;
const REMINDER_MS = 60_000;

/* ---------------------------------------------------------------- helpers */

const artKey = name => String(name ?? "").normalize("NFKD").replace(/[’‘]/g, "'").toLowerCase().replace(/\s+/g, " ").trim();
const ART_BY_KEY = new Map(BARD_PERFORMANCE_ARTS.map(row => [artKey(row.name), row]));
/** The Performance Art row for an exact name (case and spacing tolerant), or null. */
export const lookupBardArt = name => ART_BY_KEY.get(artKey(name)) ?? null;
const clone = value => structuredClone(value);
const newId = () => globalThis.foundry?.utils?.randomID?.(12) ?? `perf-${Math.random().toString(36).slice(2, 12)}`;
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const aidDiceText = n => (n === 1 ? "1 Aid Die" : `${n} Aid Dice`);

/** Normalised Bard flag: performances always an array, museTHP a number, active passed through untouched. */
function bardFlag(actor) {
  const stored = flag(actor, "bard") ?? {};
  return {
    ...clone(stored),
    performances: Array.isArray(stored.performances) ? clone(stored.performances) : [],
    active: stored.active ?? null,
    museTHP: Number(stored.museTHP ?? 0) || 0
  };
}

const restFlag = actor => flag(actor, "bardRest") ?? {};
/** A Short or Long Rest has finished and no composition has used it yet (R10 timing). */
const restWindowOpen = actor => restFlag(actor).open === true;

/** R10: at most max(1, Charisma modifier) Performances per composition. */
export function performanceLimit(actor) {
  const mod = Number(actor?.system?.abilities?.cha?.mod ?? 0);
  return Math.max(1, Math.trunc(Number.isFinite(mod) ? mod : 0));
}

const aidAvailable = actor => Number(getPool(actor, "aidDie")?.value ?? 0);
const levelOf = actor => supporterLevel(actor) ?? 1;

/** Muse cost of a list of Art names; unknown names contribute nothing (they are warned separately). */
export function museCost(names) {
  return names.reduce((sum, name) => sum + (lookupBardArt(name)?.muse ?? 0), 0);
}

/** Accepts [["Bane", "Aid", "Bless"], ...]; a string per Performance is split on commas. */
export function normalizePerformances(input) {
  if (input === undefined || input === null) return [];
  need(Array.isArray(input), "Performances must be a list of Art-name lists.");
  return input.map(entry => {
    const names = Array.isArray(entry) ? entry : String(entry ?? "").split(",");
    return names.map(name => String(name ?? "").trim()).filter(Boolean);
  });
}

/** Rule warnings for one Performance: at least three Arts, no Art twice in a row, names that exist in the table. */
function artWarnings(warnings, names, label) {
  for (const name of names) {
    // An Art with no row has no Muse cost and nothing to cast: a hard error, not an overridable warning.
    need(lookupBardArt(name), `${label}: "${name}" is not a Performance Art (C3:7168-7211), so it has no Muse cost and cannot be composed.`);
  }
  if (names.length < MINIMUM_ARTS) {
    warn(warnings, "minArts", `${label} has ${plural(names.length, "Art")}; a Performance needs at least three.`);
  }
  names.forEach((name, index) => {
    if (index > 0 && artKey(name) === artKey(names[index - 1])) {
      warn(warnings, "consecutive", `${label}: ${name} follows itself; the same Art cannot be cast twice in a row.`);
    }
  });
}

/** Every composition rule that does not need the Muse total (R10 cap, Art count, repeats, unknown names). */
export function validateComposition(actor, performances) {
  const warnings = [];
  const cap = performanceLimit(actor);
  if (performances.length > cap) {
    warn(warnings, "performanceLimit", `At most ${plural(cap, "Performance")} may be composed (Charisma modifier, minimum 1); this composes ${performances.length}.`);
  }
  performances.forEach((names, index) => artWarnings(warnings, names, `Performance ${index + 1}`));
  return warnings;
}

/** An Art inserted at `index` into `names` (Emergency Improv): the consecutive rule is checked against its neighbours. */
function insertWarnings(warnings, names, name, index) {
  need(lookupBardArt(name), `"${name}" is not a Performance Art (C3:7168-7211), so it has no Muse cost and cannot be inserted.`);
  const left = names[index - 1], right = names[index];
  if ((left && artKey(left) === artKey(name)) || (right && artKey(right) === artKey(name))) {
    warn(warnings, "consecutive", `Inserting ${name} here repeats it next to itself; the same Art cannot be cast twice in a row.`);
  }
}

function draftPerformance(names) {
  return {
    id: newId(),
    arts: names.map(name => {
      const row = lookupBardArt(name);
      return row ? { name: row.name, muse: row.muse, manual: row.manual } : { name, muse: null, manual: false };
    }),
    performed: false,
    composedAt: null
  };
}

const artRecord = name => {
  const row = lookupBardArt(name);
  return row ? { name: row.name, muse: row.muse, manual: row.manual } : { name, muse: null, manual: false };
};

const artList = arts => arts.map(art => esc(art.name)).join(", ");
const manualNote = names => {
  const manual = names.map(lookupBardArt).filter(row => row?.manual).map(row => row.name);
  return manual.length ? ` Manual Art${manual.length === 1 ? "" : "s"} (cast from the manual card, see the "Bard missing Arts / variants" ruling): ${manual.map(esc).join(", ")}.` : "";
};

/** Post-roll outcome of a Muse commit. Muse short of the Arts' cost is recorded (the use is not blocked). */
function prepareMuseEntry(entry, total) {
  entry.muse = total;
  entry.cost = Number(entry.cost ?? 0);
  entry.overMuse = Math.max(0, entry.cost - total);
  entry.leftover = entry.mode === "insert" ? 0 : Math.max(0, total - entry.cost);
}

/* ---------------------------------------------------------------- target kinds (receipt targets) */

/**
 * Commits Performances or one inserted Art to the Bard's own flags, and the leftover Muse as Temporary HP. Local: it only
 * ever changes the owner's Actor, so it never goes through the GM relay. `applied` keeps what undo must reverse.
 */
const BARD_COMPOSE_KIND = {
  local: true,
  documentName: "Actor",
  async apply(source, useId, entry, target) {
    const bard = bardFlag(target);
    const performances = clone(bard.performances);
    const hp = target.system.attributes.hp;
    const tempBefore = Number(hp.temp ?? 0) || 0;
    const record = { ids: [], insertedInto: null, beforeArts: null, tempBefore, temp: tempBefore, museBefore: bard.museTHP };
    if (entry.mode === "insert") {
      const performance = performances.find(item => item.id === entry.performanceId);
      need(performance, "The Performance to insert into is no longer composed.");
      record.insertedInto = performance.id;
      record.beforeArts = clone(performance.arts);
      performance.arts.splice(entry.index, 0, artRecord(entry.art));
      await target.update({ "flags.ak5e.bard": { ...bard, performances, museTHP: bard.museTHP } });
      return record;
    }
    const composedAt = new Date().toISOString();
    const added = entry.performances.map(draft => ({ ...clone(draft), composedAt }));
    performances.push(...added);
    const leftover = Number(entry.leftover ?? 0);
    const temp = leftover > 0 ? applyTempHP(tempBefore, leftover, "replace") : tempBefore;
    record.ids = added.map(item => item.id);
    record.temp = temp;
    record.composedAt = composedAt;
    await target.update({
      "flags.ak5e.bard": { ...bard, performances, museTHP: leftover },
      "system.attributes.hp.temp": temp
    });
    if (entry.reminder) scheduleReminder(target, record.ids[0], composedAt);
    return record;
  },
  async revert(source, useId, entry, target) {
    const record = entry.applied;
    if (!record || typeof record !== "object") return { removed: 0 };
    const bard = bardFlag(target);
    let performances = clone(bard.performances);
    if (record.insertedInto) {
      performances = performances.map(item => item.id === record.insertedInto ? { ...item, arts: clone(record.beforeArts) } : item);
    } else {
      performances = performances.filter(item => !record.ids.includes(item.id));
    }
    const hp = target.system.attributes.hp;
    const current = Number(hp.temp ?? 0) || 0;
    const temp = current === record.temp ? record.tempBefore : Math.max(0, current - (record.temp - record.tempBefore));
    await target.update({
      "flags.ak5e.bard": { ...bard, performances, museTHP: record.museBefore },
      "system.attributes.hp.temp": temp
    });
    return { removed: record.ids.length || (record.insertedInto ? 1 : 0) };
  },
  rolled(entry, total) { prepareMuseEntry(entry, total); },
  rollText(entry) {
    if (entry.muse === undefined) return `${entry.name}: no Muse was rolled.`;
    const over = entry.overMuse ? ` Muse ${entry.muse} is ${entry.overMuse} short of the Arts' cost; it was used anyway.` : "";
    if (entry.mode === "insert") return `Muse ${entry.muse}: inserted ${entry.art} (cost ${entry.cost}).${over}`;
    const names = entry.performances.map((draft, index) => `Performance ${index + 1}: ${draft.arts.map(a => a.name).join(", ")}`).join("; ");
    return `Muse ${entry.muse}: composed ${plural(entry.performances.length, "Performance")} (${names}). Temporary HP +${entry.leftover}.${over}`;
  },
  preview(_source, _receipt, entry) {
    if (!entry.applied) return `${entry.name}: nothing was composed yet.`;
    return entry.mode === "insert"
      ? `${entry.name}: removes the inserted Art and restores the Performance's Arts.`
      : `${entry.name}: removes the composed Performance(s) and the Temporary HP they gave.`;
  }
};

/** The Emergency Improv Performance check (DC 17): success is read from the rolled total; nothing is written to the Actor. */
const BARD_CHECK_KIND = {
  local: true,
  documentName: "Actor",
  async apply(_source, _useId, entry) {
    return { total: entry.total, success: entry.success, dc: entry.dc };
  },
  async revert() { return { removed: 0 }; },
  rolled(entry, total) {
    entry.total = total;
    entry.success = total >= entry.dc;
  },
  rollText(entry) {
    return entry.total === undefined ? `${entry.name}: not rolled.`
      : `${entry.name}: ${entry.total} against DC ${entry.dc}: ${entry.success ? "success" : "failure"}.`;
  },
  preview(_source, _receipt, entry) {
    return `${entry.name}: the check is a roll and changes nothing to undo.`;
  }
};

let kindsRegistered = false;
/** Idempotent: the Bard target kinds are registered with the Supporter engine before any use runs. */
function registerBardKinds() {
  if (kindsRegistered) return;
  kindsRegistered = true;
  supporterUses.register({ targetKinds: { bardCompose: BARD_COMPOSE_KIND, bardCheck: BARD_CHECK_KIND } });
}

/** One-minute reminder (L7152): a Performance composed on the spot is lost if it is not begun within a minute. */
function scheduleReminder(target, performanceId, composedAt) {
  const timer = globalThis.setTimeout?.(() => {
    const current = bardFlag(target).performances.find(item => item.id === performanceId);
    if (!current || current.performed) return;
    globalThis.ChatMessage?.implementation?.create?.({
      speaker: globalThis.ChatMessage.implementation.getSpeaker({ actor: target }),
      content: `<p>Reminder: a Performance composed at ${esc(composedAt)} has not begun within a minute. It is lost unless it is begun now (Emergency Improv).</p>`
    });
  }, REMINDER_MS);
  timer?.unref?.();
}

/* ---------------------------------------------------------------- plans */

/**
 * A Magical Performance (L7099-7104). Expends `aidDice` Aid Dice (clamped, R10: they stay spent until the Long Rest), posts
 * one roll button, and composes the Performances only after the roll. Structural warnings are raised before anything is spent.
 */
function composePerformances(actor, state, data = {}) {
  need(isBard(actor), "Composing Performances is a Bard Supporter feature.");
  registerBardKinds();
  const aidDice = Number(data.aidDice);
  need(Number.isInteger(aidDice) && aidDice >= 1, "Expend at least one Aid Die to compose Performances.");
  const performances = normalizePerformances(data.performances);
  const available = aidAvailable(actor);
  const dice = Math.min(aidDice, available);
  const warnings = [];
  if (aidDice > available) {
    warn(warnings, "shortfall", `The Aid Dice pool holds ${available}; the other ${aidDice - available} of ${aidDice} expended is short and clamps at 0.`);
  }
  if (!restWindowOpen(actor)) {
    warn(warnings, "timing", "Performances are composed when a Short or Long Rest finishes, and no finished rest is recorded since your last composition.");
  }
  warnings.push(...validateComposition(actor, performances));
  const drafts = performances.map(draftPerformance);
  const cost = museCost(performances.flat());
  const names = performances.flat();

  return {
    title: `Compose Performances (${aidDiceText(aidDice)}; ${plural(performances.length, "Performance")})`,
    warnings,
    apply(next, receipt) {
      const spend = spendAidDice(actor, aidDice, receipt);
      const size = aidDieSize(levelOf(actor));
      const restUpdate = { "flags.ak5e.bardRest": { ...restFlag(actor), open: false } };
      const entry = { kind: "bardCompose", uuid: actor.uuid, name: actor.name, ready: dice === 0, mode: "compose",
        performances: drafts, cost, reminder: false };
      if (dice === 0) prepareMuseEntry(entry, 0);
      receipt.targets = [entry];
      receipt.html = true;
      if (dice > 0) {
        const formula = `${dice}${size}`;
        receipt.formula = formula;
        receipt.rollLabel = `Muse (${aidDiceText(dice)})`;
        receipt.summary = `${esc(actor.name)} expends ${aidDiceText(dice)} to gain Muse; then composes ${plural(performances.length, "Performance")}.`
          + manualNote(names);
      } else {
        receipt.summary = `${esc(actor.name)} has no Aid Die left; the Muse gained is 0 and the Performances cannot be paid for.`;
      }
      receipt.result = { aidDice: dice, performanceIds: drafts.map(draft => draft.id), cost };
      return { ...spend, ...restUpdate };
    }
  };
}

/**
 * Soul of the Bard (L7137-7139): proficiency in three Instruments (custom tool text), then Performance proficiency, or
 * Expertise if already proficient. Idempotent through flags.ak5e.bardSetup; undo cannot revert the system proficiencies.
 */
function bardSetup(actor, state, data = {}) {
  need(isBard(actor), "Soul of the Bard is a Bard Supporter feature.");
  registerBardKinds();
  const instruments = [...new Set((Array.isArray(data.instruments) ? data.instruments : []).map(item => String(item ?? "").trim()).filter(Boolean))];
  need(instruments.length === 3, "Choose three different Instruments for Soul of the Bard.");
  const done = flag(actor, "bardSetup")?.done === true;
  const warnings = [];
  if (done) warn(warnings, "alreadySetUp", "Soul of the Bard is already set up; this changes nothing.");
  const current = Number(actor.system?.skills?.prf?.value ?? 0) || 0;
  const nextValue = current >= 1 ? 2 : 1;
  const existing = String(actor.system?.traits?.toolProf?.custom ?? "").split(";").map(item => item.trim()).filter(Boolean);
  const custom = [...new Set([...existing, ...instruments])].join("; ");
  const plan = {
    title: "Soul of the Bard: Instruments and Performance",
    warnings,
    apply(next, receipt) {
      receipt.html = false;
      if (done) {
        receipt.summary = `${esc(actor.name)}: Soul of the Bard is already set up; nothing changed.`;
        receipt.result = { alreadySetUp: true };
        return {};
      }
      receipt.summary = `${esc(actor.name)} gains proficiency in ${instruments.join(", ")}; Performance ${nextValue === 2 ? "Expertise" : "proficiency"}.`;
      receipt.result = { instruments, performance: nextValue === 2 ? "expertise" : "proficient" };
      return {
        "system.traits.toolProf.custom": custom,
        "system.skills.prf.value": nextValue,
        "flags.ak5e.bardSetup": { done: true, instruments, performance: receipt.result.performance }
      };
    }
  };
  return plan;
}
bardSetup.undoNotes = () => ["Undo does not revert the Instrument or Performance proficiencies: remove them on the sheet if needed."];

/** Speak to the Soul (L7139): once per Short or Long Rest, replace an Aid Die roll with the Performance Modifier. Changes nothing itself. */
function speakToTheSoul(actor, state, data = {}) {
  need(isBard(actor), "Speak to the Soul is a Bard Supporter feature.");
  defineBardComposePools();
  const warnings = [];
  if (getPool(actor, "bardSpeakToTheSoul").value < 1) {
    warn(warnings, "used", "Speak to the Soul has already been used since your last Short or Long Rest.");
  }
  const modifier = Number(actor.system?.skills?.prf?.total ?? 0) || 0;
  return {
    title: "Speak to the Soul",
    warnings,
    apply(next, receipt) {
      const update = spendResource(actor, receipt, { pool: "bardSpeakToTheSoul", amount: 1, label: "Speak to the Soul" });
      receipt.summary = `${esc(actor.name)} uses Speak to the Soul: an Aid Die roll (yours or a Creature that can hear you) may be replaced by `
        + `the Performance Modifier, ${modifier}. Nothing is changed automatically.`;
      receipt.result = { replacement: modifier };
      return update;
    }
  };
}

/**
 * Emergency Improv, step 1 (L7152-7159): the DC 17 Performance check. The use is consumed when attempted; a
 * successful check is followed by `emergencyImprovAid`.
 */
function emergencyImprov(actor, state, data = {}) {
  need(isBard(actor), "Emergency Improv is a Bard Supporter feature.");
  defineBardComposePools();
  const warnings = [];
  const level = levelOf(actor);
  if (level < EMERGENCY_IMPROV_LEVEL) {
    warn(warnings, "level", `Emergency Improv is a Supporter level ${EMERGENCY_IMPROV_LEVEL} feature; this character is level ${level}.`);
  }
  if (!(flag(actor, "bardSetup")?.instruments?.length)) {
    warn(warnings, "instrument", "No proficient Instrument is noted; Emergency Improv needs an Instrument you are Proficient with equipped.");
  }
  if (getPool(actor, "bardEmergencyImprov").value < 1) {
    warn(warnings, "used", "Emergency Improv has already been used since your last Long Rest.");
  }
  const prf = Number(actor.system?.skills?.prf?.total ?? 0) || 0;
  const formula = `1d20${prf >= 0 ? ` + ${prf}` : ` - ${-prf}`}`;
  return {
    title: `Emergency Improv: Performance check (DC ${EMERGENCY_IMPROV_DC})`,
    warnings,
    apply(next, receipt) {
      const update = spendResource(actor, receipt, { pool: "bardEmergencyImprov", amount: 1, label: "Emergency Improv" });
      receipt.targets = [{ kind: "bardCheck", uuid: actor.uuid, name: actor.name, ready: false, dc: EMERGENCY_IMPROV_DC }];
      receipt.formula = formula;
      receipt.rollLabel = `Performance check (DC ${EMERGENCY_IMPROV_DC})`;
      receipt.html = true;
      receipt.summary = `${esc(actor.name)} attempts Emergency Improv: a Performance check against DC ${EMERGENCY_IMPROV_DC}.`;
      receipt.result = { dc: EMERGENCY_IMPROV_DC, formula };
      return update;
    }
  };
}

/** Emergency Improv, step 2: after a successful check, expend an Aid Die and roll Muse to compose a Performance or insert an Art. */
function emergencyImprovAid(actor, state, data = {}) {
  need(isBard(actor), "Emergency Improv is a Bard Supporter feature.");
  registerBardKinds();
  const mode = data.mode ?? "compose";
  need(mode === "compose" || mode === "insert", "Emergency Improv composes a Performance or inserts an Art.");
  const check = findCheck(state, data.checkUseId);
  need(check, "No Performance check is waiting for its Aid Die. Roll Emergency Improv first.");
  const checkEntry = check.targets.find(item => item.kind === "bardCheck");
  const warnings = [];
  if (!checkEntry.success) {
    warn(warnings, "checkFailed", `The Performance check did not reach DC ${EMERGENCY_IMPROV_DC}; Emergency Improv gives nothing on a failure.`);
  }
  const level = levelOf(actor);
  if (level < EMERGENCY_IMPROV_LEVEL) {
    warn(warnings, "level", `Emergency Improv is a Supporter level ${EMERGENCY_IMPROV_LEVEL} feature; this character is level ${level}.`);
  }
  const dice = aidAvailable(actor) >= 1 ? 1 : 0;
  const size = aidDieSize(level);
  const bard = bardFlag(actor);
  let entry;
  if (mode === "compose") {
    const names = normalizePerformances([data.arts ?? []])[0] ?? [];
    need(names.length > 0, "Name the Arts of the new Performance.");
    warnings.push(...validateComposition(actor, [names]));
    const draft = draftPerformance(names);
    entry = { kind: "bardCompose", uuid: actor.uuid, name: actor.name, ready: dice === 0, mode: "compose",
      performances: [draft], cost: museCost(names), reminder: true };
  } else {
    const performanceId = data.performanceId ?? bard.active?.performanceId ?? null;
    const performance = bard.performances.find(item => item.id === performanceId);
    need(performance, "Insert the Art into a composed Performance: none is current.");
    const name = String(data.art ?? "").trim();
    need(name, "Name the Art to insert.");
    const index = data.index === undefined || data.index === "" ? performance.arts.length : Number(data.index);
    need(Number.isInteger(index) && index >= 0 && index <= performance.arts.length, "Choose a place in the Performance to insert the Art.");
    insertWarnings(warnings, performance.arts.map(art => art.name), name, index);
    entry = { kind: "bardCompose", uuid: actor.uuid, name: actor.name, ready: dice === 0, mode: "insert",
      performanceId: performance.id, index, art: name, cost: lookupBardArt(name)?.muse ?? 0 };
  }
  return {
    title: `Emergency Improv: ${mode === "compose" ? "compose a Performance" : "insert an Art"}`,
    warnings,
    apply(next, receipt) {
      const update = spendAidDice(actor, 1, receipt);
      receipt.targets = [entry];
      receipt.html = true;
      if (dice === 0) prepareMuseEntry(entry, 0);
      if (dice > 0) {
        const formula = `1${size}`;
        receipt.formula = formula;
        receipt.rollLabel = "Muse (1 Aid Die)";
        receipt.summary = `${esc(actor.name)} expends an Aid Die (${size}) for Muse after a successful Emergency Improv check.`
          + (mode === "compose" ? " The new Performance is lost unless begun within a minute." : "");
      } else {
        receipt.summary = `${esc(actor.name)} has no Aid Die left; Emergency Improv gains no Muse.`;
      }
      receipt.result = { mode, checkUseId: check.id };
      return update;
    }
  };
}

/** The most recent (or the named) Emergency Improv check that has been rolled and not undone. */
function findCheck(state, checkUseId) {
  const usable = receipt => receipt.command === "emergencyImprov" && receipt.status !== "undone"
    && receipt.targets?.some(item => item.kind === "bardCheck" && item.success !== undefined)
    && !state.undo.some(other => other.command === "emergencyImprovAid" && other.status !== "undone" && other.data?.checkUseId === receipt.id);
  const candidates = state.undo.filter(usable);
  if (checkUseId) return candidates.find(receipt => receipt.id === checkUseId) ?? null;
  return candidates.at(-1) ?? null;
}

export const bardComposePlans = Object.freeze({
  composePerformances,
  bardSetup,
  speakToTheSoul,
  emergencyImprov,
  emergencyImprovAid
});

/** Pools: Speak to the Soul (once per Short or Long Rest) and Emergency Improv (once per Long Rest). Idempotent. */
export function defineBardComposePools() {
  registerBardKinds();
  if (!getPoolDefinition("bardSpeakToTheSoul")) {
    definePool({ id: "bardSpeakToTheSoul", label: "Speak to the Soul", max: 1, initial: "max", appliesTo: isBard,
      recovery: [{ on: "sr", amount: "full" }, { on: "lr", amount: "full" }] });
  }
  if (!getPoolDefinition("bardEmergencyImprov")) {
    definePool({ id: "bardEmergencyImprov", label: "Emergency Improv", max: 1, initial: "max", appliesTo: isBard,
      recovery: [{ on: "lr", amount: "full" }] });
  }
}

/* ---------------------------------------------------------------- hooks */

/** Long Rest (owner client): Performances not yet Performed are lost (No Encore, L7114). Every rest reopens composition. */
async function onBardRest(actor, type) {
  if (!actor?.isOwner || !isBard(actor)) return;
  const bard = bardFlag(actor);
  const updates = { "flags.ak5e.bardRest": { open: true, type, at: new Date().toISOString() } };
  let removed = 0;
  if (type === "long") {
    const kept = bard.performances.filter(item => item.performed === true);
    removed = bard.performances.length - kept.length;
    if (removed) updates["flags.ak5e.bard"] = { ...bard, performances: kept };
  }
  await actor.update(updates);
  if (removed) {
    await globalThis.ChatMessage?.implementation?.create?.({
      speaker: globalThis.ChatMessage.implementation.getSpeaker({ actor }),
      content: `<p>${esc(actor.name)}: ${esc(plural(removed, "unperformed Performance"))} lost at the end of the Long Rest (No Encore). Compose them again.</p>`
    });
  }
}

let hooksInstalled = false;
/** Idempotent: the rest hook (No Encore, rest window). Roll buttons are the engine's (supporter-sheet renderPlayUseCard). */
export function registerBardComposeHooks() {
  defineBardComposePools();
  if (hooksInstalled) return;
  hooksInstalled = true;
  globalThis.Hooks?.on?.("dnd5e.restCompleted", (actor, result, config = {}) => {
    const type = config.type ?? result?.type ?? (config.longRest ? "long" : "short");
    return onBardRest(actor, type).catch(error => console.error("AK5e | Bard rest", error));
  });
}

/* ---------------------------------------------------------------- sheet panel and commands */

/** Sheet fragment for the Bard branch (buttons carry data-supporter-cmd). Opening it changes nothing. */
export function bardComposePanel(actor) {
  if (!isBard(actor)) return "";
  const bard = bardFlag(actor), level = levelOf(actor);
  const list = bard.performances.length
    ? `<ul>${bard.performances.map((item, index) => `<li>Performance ${index + 1}: ${artList(item.arts)}`
      + `${item.performed ? " (performed)" : ""}${item.composedAt ? ` · composed ${esc(item.composedAt)}` : ""}</li>`).join("")}</ul>`
    : "<p>No Performances composed.</p>";
  const cmd = (name, label) => `<button type="button" data-supporter-cmd="${esc(name)}">${esc(label)}</button>`;
  return `<section class="ak5e-bard-panel"><h5>Bard: Performances</h5>${list}`
    + `<p><strong>Temporary HP from Muse:</strong> ${esc(bard.museTHP)}</p>`
    + `<div class="ak5e-supporter-button-row">${cmd("composePerformances", "Compose Performances")}`
    + `${cmd("bardSetup", "Soul of the Bard: setup")}${cmd("speakToTheSoul", "Speak to the Soul")}`
    + `${level >= EMERGENCY_IMPROV_LEVEL ? `${cmd("emergencyImprov", `Emergency Improv (DC ${EMERGENCY_IMPROV_DC})`)}${cmd("emergencyImprovAid", "Emergency Improv: Aid Die")}` : ""}`
    + `</div></section>`;
}

const OWNED_COMMANDS = Object.freeze(["composePerformances", "bardSetup", "speakToTheSoul", "emergencyImprov", "emergencyImprovAid"]);

const dialogApi = () => foundry.applications.api.DialogV2;

async function confirmBard(title, summary) {
  const confirmed = await dialogApi().wait({
    window: { title }, rejectClose: false,
    content: `<div class="ak5e-supporter-confirm"><p>${esc(summary)}</p><p>Nothing is rolled until you press the roll button on the card.</p></div>`,
    buttons: [
      { action: "confirm", label: "Confirm", default: true, callback: () => true },
      { action: "cancel", label: "Cancel", callback: () => false }
    ]
  });
  return confirmed === true;
}

async function runBardCommand(actor, cmd) {
  need(actor?.isOwner && isBard(actor), "Bard Supporter composing is a Bard feature.");
  const opId = () => foundry.utils.randomID();
  if (cmd === "speakToTheSoul" || cmd === "emergencyImprov") {
    const title = cmd === "speakToTheSoul" ? "Speak to the Soul" : "Emergency Improv";
    if (!await confirmBard(title, `${actor.name} uses ${title}.`)) return null;
    return confirmPlayUse(title, extra => supporterUses.command(actor, cmd, { confirmed: true, ...extra }, opId()));
  }
  if (cmd === "composePerformances") {
    const picked = await dialogApi().prompt({
      window: { title: "Compose Performances" }, rejectClose: false,
      content: `<div class="ak5e-bard-form"><label>Aid Dice to expend <input type="number" name="aidDice" min="1" value="1"></label>`
        + `<label>Performances, one per line (Arts separated by commas)<textarea name="performances" rows="4"></textarea></label></div>`,
      ok: { label: "Continue", callback: (_event, button) => ({
        aidDice: Number(button.form.elements.aidDice.value),
        performances: button.form.elements.performances.value.split("\n").map(line => line.split(",").map(item => item.trim()).filter(Boolean)).filter(list => list.length)
      }) }
    });
    if (!picked) return null;
    if (!await confirmBard("Compose Performances", `${actor.name} expends ${picked.aidDice} Aid Di${picked.aidDice === 1 ? "e" : "ce"} to gain Muse and composes ${picked.performances.length} Performance(s).`)) return null;
    return confirmPlayUse("Compose Performances", extra => supporterUses.command(actor, "composePerformances",
      { confirmed: true, aidDice: picked.aidDice, performances: picked.performances, ...extra }, opId()));
  }
  if (cmd === "bardSetup") {
    const picked = await dialogApi().prompt({
      window: { title: "Soul of the Bard: Instruments" }, rejectClose: false,
      content: `<div class="ak5e-bard-form">${[1, 2, 3].map(n => `<label>Instrument ${n} <input type="text" name="i${n}"></label>`).join("")}</div>`,
      ok: { label: "Continue", callback: (_event, button) => [1, 2, 3].map(n => button.form.elements[`i${n}`].value.trim()) }
    });
    if (!picked) return null;
    if (!await confirmBard("Soul of the Bard", `${actor.name} gains proficiency in ${picked.join(", ")} and Performance proficiency (or Expertise).`)) return null;
    return confirmPlayUse("Soul of the Bard", extra => supporterUses.command(actor, "bardSetup",
      { confirmed: true, instruments: picked, ...extra }, opId()));
  }
  // emergencyImprovAid
  const picked = await dialogApi().prompt({
    window: { title: "Emergency Improv: Aid Die" }, rejectClose: false,
    content: `<div class="ak5e-bard-form"><label>Use <select name="mode"><option value="compose">Compose a new Performance</option>`
      + `<option value="insert">Insert an Art into the current Performance</option></select></label>`
      + `<label>Arts for the new Performance (comma-separated)<input type="text" name="arts"></label>`
      + `<label>Art to insert<input type="text" name="art"></label></div>`,
    ok: { label: "Continue", callback: (_event, button) => ({
      mode: button.form.elements.mode.value,
      arts: button.form.elements.arts.value.split(",").map(item => item.trim()).filter(Boolean),
      art: button.form.elements.art.value.trim()
    }) }
  });
  if (!picked) return null;
  if (!await confirmBard("Emergency Improv: Aid Die", `${actor.name} expends an Aid Die for Muse after the check.`)) return null;
  return confirmPlayUse("Emergency Improv: Aid Die", extra => supporterUses.command(actor, "emergencyImprovAid",
    { confirmed: true, mode: picked.mode, arts: picked.arts, art: picked.art, ...extra }, opId()));
}

/**
 * Command handler for the sheet's data-supporter-cmd buttons. Returns undefined for any command this branch does not own,
 * so the Supporter dispatcher can route it onward.
 */
export function bardComposeCommand(actor, cmd) {
  if (!OWNED_COMMANDS.includes(cmd)) return undefined;
  registerBardKinds();
  return runBardCommand(actor, cmd);
}

/** Frozen API for the Bard branch. Pure helpers only: nothing here rolls or writes. */
export const bardComposeApi = Object.freeze({
  arts: BARD_PERFORMANCE_ARTS,
  lookup: lookupBardArt,
  museCost,
  performanceLimit,
  validateComposition: (actor, performances) => validateComposition(actor, normalizePerformances(performances)),
  emergencyImprovDC: EMERGENCY_IMPROV_DC
});

