/**
 * Table-play support shared by gameplay helpers (WORKFLOW.md §3.2, "trust the table").
 *
 * - Warnings, not blocks: a helper collects `{id, text}` warnings and throws `PlayWarnings` until the user
 *   overrides every one ("Use anyway"). Nothing is written before that.
 * - Missing GM ruling: a helper throws `PlayReading` with the possible readings; the user's pick applies to
 *   that use only and is never stored.
 * - Encounter windows: undo receipts carry the encounter epoch. The elected GM client advances the epoch when a
 *   combat starts and when a started combat ends, which locks every receipt from the previous window.
 *
 * Branch-free so the Caster-wide player-agency audit can adopt it.
 */
const MODULE_ID = "ak5e", EPOCH = "encounterEpoch";
let registered = false;

export class PlayWarnings extends Error {
  constructor(warnings) {
    super(`${warnings.map(warning => warning.text).join(" ")} Use anyway to continue.`);
    this.name = "AK5eWarnings";
    this.warnings = warnings;
  }
}
export class PlayReading extends Error {
  constructor(key, label, options) {
    super(`No GM ruling for ${key}: choose a reading for this use (${options.map(option => option.label).join(" / ")}).`);
    this.name = "AK5eReading";
    this.key = key; this.label = label; this.options = options;
  }
}
export const isPlayWarnings = error => error?.name === "AK5eWarnings" && Array.isArray(error.warnings);
export const isPlayReading = error => error?.name === "AK5eReading" && Array.isArray(error.options);

/** Throw `PlayWarnings` for every warning the user has not overridden; return the overridden ones for the public card. */
export function requireOverrides(warnings, overrides = []) {
  const accepted = new Set(Array.isArray(overrides) ? overrides : []);
  const open = warnings.filter(warning => !accepted.has(warning.id));
  if (open.length) throw new PlayWarnings(open);
  return warnings;
}
/** A recorded GM ruling wins; otherwise the user's per-use reading, which must be one of the offered options. */
export function resolveReading(ruling, reading, key, label, options) {
  if (ruling !== undefined) return { value: ruling, source: "ruling" };
  if (options.some(option => option.value === reading)) return { value: reading, source: "player" };
  throw new PlayReading(key, label, options);
}

export function currentEpoch() {
  try { return Number(game.settings.get(MODULE_ID, EPOCH)) || 0; } catch { return 0; }
}
export const isLocked = receipt => !receipt || Number(receipt.epoch ?? -1) !== currentEpoch();

const electedGM = () => game.user?.isGM && game.users?.activeGM?.id === game.user.id;
async function advanceEpoch() { await game.settings.set(MODULE_ID, EPOCH, currentEpoch() + 1); }

/** Register the hidden world setting and the combat lifecycle hooks. Call from the module's `init` hook. */
export function registerPlayUndo() {
  if (registered) return;
  registered = true;
  game.settings.register(MODULE_ID, EPOCH, { scope: "world", config: false, type: Number, default: 0 });
  const started = combat => Number(combat?.round ?? 0) >= 1;
  const markStart = async combat => {
    if (!electedGM() || !started(combat) || combat.getFlag?.(MODULE_ID, "encounterStart") !== undefined) return;
    await advanceEpoch();
    await combat.setFlag(MODULE_ID, "encounterStart", currentEpoch());
  };
  const report = promise => Promise.resolve(promise).catch(error => console.error("AK5e | encounter window", error));
  Hooks.on("combatStart", combat => report(markStart(combat)));
  Hooks.on("updateCombat", (combat, changed) => { if ("round" in changed) report(markStart(combat)); });
  Hooks.on("deleteCombat", combat => {
    if (electedGM() && combat.getFlag?.(MODULE_ID, "encounterStart") !== undefined) report(advanceEpoch());
  });
}
