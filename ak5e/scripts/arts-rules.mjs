/** AK5e Chapter 1 / Chapter 5 casting rules. Pure calculations, no Foundry writes. */
import { worldRulesEnabled } from "./world-rule-state.mjs";
export const ARTS_METHOD = "ak5e";
export const ARTS_VERSION = 1;

export class ArtsRuleError extends Error {
  constructor(key, message, data = {}) { super(message); this.key = key; this.data = data; }
}

export function integer(value, label, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (value === "" || value === null || typeof value === "boolean") throw new Error(`${label} must be an integer from ${min} to ${max}.`);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) throw new Error(`${label} must be an integer from ${min} to ${max}.`);
  return number;
}

export function artsState(actor) {
  const stored = actor?.getFlag("ak5e", "artsPoints") ?? {};
  const config = actor?.getFlag("ak5e", "casting") ?? {};
  const maximum = integer(stored.maximum ?? 0, "Maximum Arts Points");
  const value = integer(stored.value ?? 0, "Arts Points");
  return {
    enabled: worldRulesEnabled() || config.enabled === true,
    configured: Boolean(actor?.getFlag("ak5e", "artsPoints")),
    version: config.version ?? 0,
    maximum,
    // Explicit over-cap recovery is supported; ordinary recovery remains capped.
    value,
    maximumArtLevel: integer(stored.maximumArtLevel ?? 0, "Maximum Art level", 0, 9),
    ninthLevelCast: stored.ninthLevelCast === true,
    ability: config.ability ?? actor?.system?.attributes?.spellcasting ?? "",
    recovery: config.recovery ?? "long",
    castingUnit: config.castingUnit ?? "",
    controller: config.controller ?? ""
  };
}

export function castingConfig(change, previous = {}) {
  const ability = change.ability ?? previous.ability ?? "";
  if (!["int", "wis", "cha"].includes(ability)) throw new Error("Choose Intelligence, Wisdom or Charisma as the casting ability.");
  const recovery = change.recovery ?? previous.recovery ?? "long";
  if (!["long", "short", "manual"].includes(recovery)) throw new Error("Choose long-rest, short-rest or manual recovery.");
  return {
    ...previous, version: ARTS_VERSION, enabled: change.enabled ?? previous.enabled ?? true,
    ability, recovery, castingUnit: String(change.castingUnit ?? previous.castingUnit ?? ""),
    controller: String(change.controller ?? previous.controller ?? "")
  };
}

export function recoveryValue(state, amount, { overflow = false } = {}) {
  if (amount === "max") return state.maximum;
  const addition = integer(amount, "Arts Points adjustment", -Number.MAX_SAFE_INTEGER);
  const next = Math.max(0, state.value + addition);
  // Spending an existing temporary excess must not discard the remaining excess.
  return overflow || addition <= 0 ? next : Math.min(Math.max(state.maximum, state.value), next);
}

/** A free use has its own level cap: it may grant casting to an actor with no AP. */
export function quoteArt(state, baseLevel, selectedLevel, grant = {}, options = {}) {
  const base = integer(baseLevel, "Art level", 0, 9);
  const level = integer(selectedLevel ?? base, "Cast level", base, 9);
  if (!state.enabled) throw new Error("Enable AK5e Arts on this actor first.");
  if (worldRulesEnabled() && !state.configured) {
    throw new ArtsRuleError("UnconfiguredAP", "The GM must set Arts Points and a maximum Art level before this creature can cast.");
  }
  if (base === 0 && level !== 0) throw new Error("Cantrips cannot be upcast.");
  const mode = options.mode ?? "ap";
  if (!["ap", "free", "ritual"].includes(mode)) throw new Error("Unknown casting mode.");
  if (grant.blocked) throw new ArtsRuleError("Blocked", grant.blocked, { reason: grant.blocked });
  let maximum = state.maximumArtLevel;
  let cost = level;
  let freeRemaining = null;
  if (mode === "free") {
    if (!grant.free) throw new Error("This Art has no configured free casting grant.");
    maximum = integer(grant.free.level, "Free cast maximum level", base, 9);
    if (grant.free.maximum !== null) {
      freeRemaining = integer(grant.free.maximum ?? 0, "Free uses") - integer(grant.free.spent ?? 0, "Spent free uses");
      if (freeRemaining < 1) throw new ArtsRuleError("FreeExhausted", "No free casts remain for this Art.");
    }
    cost = 0;
  } else if (mode === "ritual") {
    // Ritual eligibility is explicitly configured; do not infer it from a class name.
    if (!grant.ritual) throw new Error("This Art is not configured for ritual casting.");
    if (level !== base) throw new Error("Ritual casting uses the Art's base level.");
    cost = 0;
  } else {
    if (grant.onlyFree) throw new ArtsRuleError("OnlyFree", "This grant can only be used through its free casting option.");
    const reduction = integer(grant.reduction ?? 0, "Arts Point reduction", 0, 9);
    cost = Math.max(integer(grant.minimumCost ?? 0, "Minimum Arts Point cost", 0, 9), level - reduction);
    if (base === 0) cost = 0;
  }
  if (level > maximum) throw new ArtsRuleError("LevelCap", `This casting exceeds maximum Art level ${maximum}.`, { maximum });
  if (level === 9 && state.ninthLevelCast) throw new ArtsRuleError("NinthUsed", "A 9th-level Art has already been cast since the last Long Rest.");
  if (cost > state.value) throw new ArtsRuleError("InsufficientAP", `This casting costs ${cost} AP; only ${state.value} AP remain.`, { cost, value: state.value });
  return { baseLevel: base, level, cost, mode, freeRemaining, ninthLevelCast: state.ninthLevelCast || level === 9 };
}

/** One read-only quote catalogue for sheets and usage dialogs. */
export function artsChoices(state, base, grant = {}, { mode, level, blocker } = {}) {
  const modes = [...(grant.onlyFree && grant.free ? [] : ["ap"]), ...(grant.free ? ["free"] : []), ...(grant.ritual ? ["ritual"] : [])].map(value => {
    const quotes = [];
    let error = blocker;
    for (let castLevel = base; castLevel <= (base === 0 ? 0 : 9); castLevel++) {
      try {
        if (blocker) throw blocker;
        quotes.push(quoteArt(state, base, castLevel, grant, { mode: value }));
      } catch (e) { error ??= e; }
    }
    return { value, quotes, error: quotes.length ? null : error };
  });
  const preference = grant.free?.maximum === null ? ["free", "ap", "ritual"] : ["ap", "free", "ritual"];
  const selected = modes.find(m => m.value === mode)
    ?? preference.map(value => modes.find(m => m.value === value && m.quotes.length)).find(Boolean) ?? modes[0];
  const quote = selected.quotes.find(q => q.level === Number(level)) ?? selected.quotes[0];
  return { modes, mode: selected.value, quotes: selected.quotes, quote,
    level: quote?.level ?? base, error: selected.error, castable: modes.some(m => m.quotes.length) };
}

export function restArtsUpdates(actor, type) {
  const state = artsState(actor);
  if (!state.enabled || (worldRulesEnabled() && !state.configured) || !["short", "long"].includes(type)) return {};
  const updates = {};
  if (state.recovery !== "manual" && (type === "long" || state.recovery === "short")) {
    updates["flags.ak5e.artsPoints.value"] = state.maximum;
  }
  if (type === "long") {
    updates["flags.ak5e.artsPoints.ninthLevelCast"] = false;
    // Temporary AP cannot survive a Long Rest, including manual-recovery NPCs.
    if (state.value > state.maximum) updates["flags.ak5e.artsPoints.value"] = state.maximum;
  }
  return updates;
}

export function adoptedSpellData(item) {
  const source = item.toObject ? item.toObject() : item;
  if (source.type !== "spell") throw new Error("Only spell Items can be adopted as Arts.");
  const system = source.system ?? {};
  return {
    _id: item.id ?? source._id,
    "system.method": ARTS_METHOD,
    "system.prepared": 2,
    "system.properties": [...(system.properties ?? [])].filter(p => p !== "material"),
    "system.materials": { value: "", consumed: false, cost: 0, supply: 0 },
    "flags.ak5e.art": {
      ...(source.flags?.ak5e?.art ?? {}), enabled: true,
      original: source.flags?.ak5e?.art?.original ?? {
        method: system.method ?? "spell", prepared: system.prepared ?? 0,
        properties: [...(system.properties ?? [])], materials: structuredClone(system.materials ?? {})
      }
    }
  };
}
