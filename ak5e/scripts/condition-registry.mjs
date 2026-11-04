/**
 * Shared Condition registry (WP conditions-01, SPEC-conditions §3.2–§3.4).
 *
 * - Exact IDs only: `conditionDefinition(keyOrId)` accepts the declared key, the exact statusId, and the single
 *   declared alias `offBalance`. No names are guessed from prose, and prototype members never resolve.
 * - A contribution Active Effect (`flags.ak5e.conditionInstance`) is the evidence of one source's application;
 *   derived projection effects (`flags.ak5e.conditionProjection`) are output and never evidence.
 * - Expiry is an explicit tagged union. Bare Chapter 1 conditions default to `{kind:"manual"}`: no invented timer.
 */
const deepFreeze = value => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
};

const RECORDS = [
  // Ten Chapter 1 conditions (C1:21,24,226–254). Status IDs are never shortened or renamed.
  { key: "frightened", statusId: "frightened", name: "Frightened", img: "icons/svg/terror.svg", scope: "chapterOne", source: "C1:21",
    manual: "Choose Move, Action or Bonus Action for the frightened creature at the table.",
    mechanics: "Stock D&D5e status ID; the Chapter 1 choice remains a visible manual step." },
  { key: "surprised", statusId: "surprised", name: "Surprised", img: "icons/svg/clockwork.svg", scope: "chapterOne", source: "C1:24",
    manual: "Choose Move, Action or Bonus Action for the surprised creature at the table.",
    mechanics: "Stock D&D5e status ID; initiative handling is unchanged." },
  { key: "bleeding", statusId: "ak5e-bleeding", name: "Bleeding", img: "icons/svg/blood.svg", scope: "chapterOne", source: "C1:226",
    manual: "Remove when healing restores actual Hit Points or Medicine succeeds; the damage is an owner-clicked roll.",
    mechanics: "Turn-start 2d6 HP loss is a reviewed owner roll; no automatic damage." },
  { key: "burning", statusId: "ak5e-burning", name: "Burning", img: "icons/svg/fire.svg", scope: "chapterOne", source: "C1:230",
    manual: "Remove with Extinguish (Action while Prone) or at the table when its source says so.",
    mechanics: "Turn-start 2d8 Fire damage is a reviewed owner roll; no automatic damage." },
  { key: "corroded", statusId: "ak5e-corroded", name: "Corroded", img: "icons/svg/acid.svg", scope: "chapterOne", source: "C1:234",
    manual: "Remove when the corroding source ends; DR and AC are table-visible.",
    mechanics: "One derived -2 AC projection per target; contributions carry no stat changes." },
  { key: "dazed", statusId: "ak5e-dazed", name: "Dazed", img: "icons/svg/daze.svg", scope: "chapterOne", source: "C1:238",
    manual: "Remove when the dazing source ends.",
    mechanics: "-1d4 on relevant owner-started rolls, once per target." },
  { key: "frozen", statusId: "ak5e-frozen", name: "Frozen", img: "icons/svg/frozen.svg", scope: "chapterOne", source: "C1:242",
    manual: "Remove when the freezing source ends; movement and DEX saves are table-visible.",
    mechanics: "Movement decrease and DEX save disadvantage are derived, never contribution changes." },
  { key: "necrotised", statusId: "ak5e-necrotised", name: "Necrotised", img: "icons/svg/skull.svg", scope: "chapterOne", source: "C1:246",
    manual: "Remove when the necrotising source ends; caused-save DCs are table-visible.",
    mechanics: "Damage and save DC modifiers are derived; custom DCs stay manual." },
  { key: "nervous-impairment", statusId: "ak5e-nervous-impairment", name: "Nervous Impairment", img: "icons/svg/terror.svg", scope: "chapterOne", source: "C1:250",
    manual: "Choose Move or Action at the table; base Hit Point loss is a confirmed owner step.",
    mechanics: "Base 3 HP loss is an explicit reviewed step; no automatic damage." },
  { key: "silenced", statusId: "ak5e-silenced", name: "Silenced", img: "icons/svg/silenced.svg", scope: "chapterOne", source: "C1:254",
    manual: "Table adjudicates spoken activities; the module warns instead of blocking.",
    mechanics: "Read by casting and Firearm checks as a warning, never a hard block." },
  // Local definitions (C3:1639,1653,5715–5717; C5:1288–1296).
  { key: "berserk", statusId: "ak5e-berserk", name: "Berserk", img: "icons/svg/explosion.svg", scope: "local", source: "C3:5715",
    manual: "Track the nearest valid target and weapon/ingestion at the table.",
    mechanics: "Local Neurological Inhibitor reminder only." },
  { key: "taunted", statusId: "ak5e-taunted", name: "Taunted", img: "icons/svg/aura.svg", scope: "local", source: "C3:1639",
    manual: "Taunt compliance is a table decision; no movement or attack is enforced.",
    mechanics: "Local Protector source-relative reminder only." },
  { key: "off-balance", statusId: "ak5e-off-balance", name: "Off Balance", img: "icons/svg/downgrade.svg", scope: "local", source: "C3:1653",
    manual: "Attack advantage is applied by the table's own roll.",
    mechanics: "Local Protector attack-advantage reminder only." },
  { key: "doomed", statusId: "ak5e-doomed", name: "Doomed", img: "icons/svg/degen.svg", scope: "local", source: "C5:1296",
    manual: "Requires the chosen ability and damage type; the save disadvantage is table-visible.",
    mechanics: "Requires ability and damageType parameters; chosen vulnerability only." },
  // Native delegates: stock IDs unchanged, no general replacement.
  { key: "poisoned", statusId: "poisoned", name: "Poisoned", img: "icons/svg/poison.svg", scope: "native", source: "C3:5763",
    manual: "Native D&D5e Poisoned semantics are unchanged.", mechanics: "Native delegate." },
  { key: "invisible", statusId: "invisible", name: "Invisible", img: "icons/svg/invisible.svg", scope: "native", source: "C3:5894",
    manual: "Native D&D5e Invisible semantics are unchanged.", mechanics: "Native delegate." },
  { key: "prone", statusId: "prone", name: "Prone", img: "icons/svg/falling.svg", scope: "native", source: "C1:230",
    manual: "Native D&D5e Prone semantics are unchanged.", mechanics: "Native delegate." },
  { key: "grappled", statusId: "grappled", name: "Grappled", img: "icons/svg/net.svg", scope: "native", source: "C3:5638",
    manual: "Native D&D5e Grappled semantics are unchanged.", mechanics: "Native delegate." }
];

const ALIASES = Object.freeze({ offBalance: "off-balance" });
const BY_KEY = Object.create(null);
const BY_STATUS = Object.create(null);
for (const record of RECORDS) {
  const frozen = deepFreeze({ ...record });
  BY_KEY[record.key] = frozen;
  BY_STATUS[record.statusId] = frozen;
}

/** Deeply frozen own-key map of the §3.2 records, keyed by canonical condition key. */
export const CONDITION_DEFINITIONS = deepFreeze(Object.fromEntries(RECORDS.map(record => [record.key, BY_KEY[record.key]])));

const isNonEmptyString = value => typeof value === "string" && value.trim().length > 0;
const isPlainObject = value => value !== null && typeof value === "object" && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const DANGEROUS = new Set(["__proto__", "constructor", "prototype"]);

/** Resolve an exact key, exact statusId or the single declared alias; anything else resolves null. */
export function conditionDefinition(keyOrId) {
  if (typeof keyOrId !== "string" || !keyOrId) return null;
  if (Object.hasOwn(ALIASES, keyOrId)) return BY_KEY[ALIASES[keyOrId]] ?? null;
  if (Object.hasOwn(BY_KEY, keyOrId)) return BY_KEY[keyOrId];
  if (Object.hasOwn(BY_STATUS, keyOrId)) return BY_STATUS[keyOrId];
  return null;
}

/** Plain, JSON-cloneable parameters: primitives, arrays and plain objects only, bounded in depth. */
function normalizeParameters(value, depth = 0) {
  if (value === undefined) return [];
  if (depth > 4) throw new Error("Condition parameters are nested too deeply.");
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Condition parameters must be finite numbers.");
    return value;
  }
  if (Array.isArray(value)) return value.map(item => normalizeParameters(item, depth + 1));
  if (isPlainObject(value)) {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (DANGEROUS.has(key)) throw new Error("Condition parameters cannot use prototype keys.");
      out[key] = normalizeParameters(item, depth + 1);
    }
    return out;
  }
  throw new Error("Condition parameters must be plain data.");
}

function normalizeOverlay(value) {
  if (value === undefined || value === null) return null;
  if (!isPlainObject(value)) throw new Error("The overlay must be a typed source-scoped record.");
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (DANGEROUS.has(key)) throw new Error("The overlay cannot use prototype keys.");
    out[key] = normalizeParameters(item);
  }
  if (!isNonEmptyString(out.kind)) throw new Error("The overlay needs a kind.");
  return out;
}

/**
 * Normalize one expiry specification (§3.3). `context` is informative only; no wall clock is ever consulted.
 * An absent or empty specification is the manual boundary, never a fabricated deadline.
 */
export function conditionExpiry(spec, _context = {}) {
  if (spec === undefined || spec === null) return Object.freeze({ kind: "manual" });
  if (!isPlainObject(spec)) throw new Error("The expiry must be an expiry record.");
  const kind = spec.kind;
  if (kind === undefined || kind === "manual") return Object.freeze({ kind: "manual" });
  if (kind === "time") {
    if (!Number.isFinite(spec.worldTime)) throw new Error("A timed expiry needs a finite world time.");
    return Object.freeze({ kind: "time", worldTime: spec.worldTime });
  }
  if (kind === "turn") {
    if (!isNonEmptyString(spec.combatUuid) || !isNonEmptyString(spec.combatantId) || !isNonEmptyString(spec.actorUuid)) {
      throw new Error("A turn expiry needs a combat, combatant and actor identity.");
    }
    if (!Number.isInteger(spec.round) || spec.round < 0) throw new Error("A turn expiry needs a whole round number.");
    if (spec.phase !== "start" && spec.phase !== "end") throw new Error("A turn expiry phase is start or end.");
    return Object.freeze({ kind: "turn", combatUuid: spec.combatUuid, combatantId: spec.combatantId, actorUuid: spec.actorUuid,
      round: spec.round, phase: spec.phase });
  }
  if (kind === "concentration") {
    if (!isNonEmptyString(spec.effectUuid)) throw new Error("A concentration expiry needs its effect identity.");
    return Object.freeze({ kind: "concentration", effectUuid: spec.effectUuid });
  }
  if (kind === "any") {
    if (!Array.isArray(spec.entries) || !spec.entries.length) throw new Error("An any() expiry needs at least one entry.");
    return Object.freeze({ kind: "any", entries: Object.freeze(spec.entries.map(entry => conditionExpiry(entry, _context))) });
  }
  throw new Error(`Unknown expiry kind: ${String(kind)}`);
}

const phaseRank = phase => phase === "end" ? 1 : 0;

/** Pure expiry test against an explicit table event (§3.3). Manual never expires. */
export function conditionExpired(expiry, event = {}) {
  if (!expiry || expiry.kind === "manual") return false;
  if (expiry.kind === "time") return Number(event?.worldTime) >= expiry.worldTime;
  if (expiry.kind === "concentration") {
    return (event?.kind === "concentration" || event?.kind === "concentrationEnd")
      && event?.effectUuid === expiry.effectUuid;
  }
  if (expiry.kind === "turn") {
    // Fail closed: only the whole recorded deadline identity may expire this condition. A turn boundary for
    // another combatant/actor in the same round is not this deadline, and a partial event never expires it.
    if (event?.combatUuid !== expiry.combatUuid) return false;
    if (!isNonEmptyString(event?.combatantId) || event.combatantId !== expiry.combatantId) return false;
    if (!isNonEmptyString(event?.actorUuid) || event.actorUuid !== expiry.actorUuid) return false;
    if (event.phase !== "start" && event.phase !== "end") return false;
    const round = Number(event?.round);
    if (!Number.isInteger(round) || round < 0) return false;
    if (round > expiry.round) return true;
    if (round < expiry.round) return false;
    return phaseRank(event.phase) >= phaseRank(expiry.phase);
  }
  if (expiry.kind === "any") return expiry.entries.some(entry => conditionExpired(entry, event));
  return false;
}

/**
 * One plain ActiveEffectData for a source-attributed contribution (§3.2). No native stat changes live here:
 * a later package's single projection effect owns those.
 */
export function conditionEffectData({ key, sourceActorUuid, sourceItemUuid = null, operationId, instanceId, expiry, parameters, overlay } = {}) {
  const record = conditionDefinition(key);
  if (!record) return null;
  if (!isNonEmptyString(sourceActorUuid) || !isNonEmptyString(operationId) || !isNonEmptyString(instanceId)) return null;
  let normalizedExpiry;
  try { normalizedExpiry = conditionExpiry(expiry, {}); }
  catch { return null; }
  let normalizedParameters, normalizedOverlay;
  try {
    normalizedParameters = normalizeParameters(parameters);
    normalizedOverlay = normalizeOverlay(overlay);
  } catch { return null; }
  return {
    name: record.name,
    img: record.img,
    disabled: false,
    transfer: false,
    statuses: [record.statusId],
    changes: [],
    flags: {
      ak5e: {
        conditionInstance: {
          version: 1,
          key: record.key,
          instanceId,
          operationId,
          sourceActorUuid,
          sourceItemUuid: typeof sourceItemUuid === "string" && sourceItemUuid ? sourceItemUuid : null,
          sourceRule: record.source,
          expiry: normalizedExpiry,
          parameters: normalizedParameters,
          overlay: normalizedOverlay
        }
      }
    }
  };
}

const effectsOf = actor => Array.from(actor?.effects?.values?.() ?? []);

/**
 * Read-only view of an Actor's conditions (§3.2). Contributions and explicit legacy markers are evidence;
 * derived projection effects, transient status sets and display names are not.
 */
export function conditionFacts(actor) {
  const active = new Set();
  const instances = [];
  const overlays = [];
  for (const effect of effectsOf(actor)) {
    const flags = effect?.flags?.ak5e ?? effect?.getFlag?.("ak5e") ?? {};
    if (flags.conditionProjection) continue;                 // derived output, never a source
    if (effect?.disabled === true || effect?.suppressed === true) continue;
    const instance = flags.conditionInstance;
    if (instance && typeof instance === "object") {
      const record = conditionDefinition(instance.key);
      if (!record) continue;
      active.add(record.key);
      instances.push({
        key: record.key,
        instanceId: instance.instanceId,
        operationId: instance.operationId,
        sourceActorUuid: instance.sourceActorUuid,
        sourceItemUuid: instance.sourceItemUuid ?? null,
        expiry: instance.expiry ?? { kind: "manual" },
        overlay: instance.overlay ?? null,
        effectId: effect.id,
        effectUuid: effect.uuid ?? null,
        instance: { ...instance, key: record.key }
      });
      if (instance.overlay && typeof instance.overlay === "object") {
        overlays.push({ key: record.key, instanceId: instance.instanceId, ...instance.overlay });
      }
      continue;
    }
    // Explicit legacy AK5e metadata stays readable; it is never migrated here.
    const legacy = typeof flags.statusId === "string" ? conditionDefinition(flags.statusId) : null;
    if (legacy) active.add(legacy.key);
    for (const statusId of Array.isArray(effect?.statuses) ? effect.statuses : []) {
      const record = conditionDefinition(statusId);
      if (record) active.add(record.key);
    }
  }
  return { active, instances, overlays };
}
