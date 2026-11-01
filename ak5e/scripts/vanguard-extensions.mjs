/** Read-only extension points for Vanguard branches. Registration is idempotent. */
const extensions = new Map();
const deliveries = new Map();
const inFlight = new Map();
const freezeData = value => {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freezeData(child);
    if (!Object.isFrozen(value)) Object.freeze(value);
  }
  return value;
};

/** Construct the shared, plain-data view without cloning the Actor document. */
export function vanguardExtensionContext(actor, { branchId = null, level = 1, profile = {}, choices = {}, purpose, ...extra } = {}) {
  const merged = freezeData(structuredClone(choices ?? {}));
  const { classItem: _classItem, branchItem: _branchItem, ...plainProfile } = profile ?? {};
  const readOnlyExtra = Object.fromEntries(Object.entries(extra).map(([key, value]) => [key, freezeData(structuredClone(value))]));
  return { actor, actorUuid: actor?.uuid, branchId, level, profile: freezeData(structuredClone(plainProfile)),
    choices: merged, branchChoices: merged.branches?.[branchId] ?? Object.freeze({}), purpose, ...readOnlyExtra };
}

export function registerVanguardExtension(branchId, hooks) {
  if (!extensions.has(branchId)) extensions.set(branchId, hooks);
}

export function vanguardProgressionContributions(context) {
  return [...extensions.values()].flatMap(hooks => {
    const contribution = hooks?.progressionContribution?.(context);
    return contribution == null ? [] : [contribution];
  });
}

export function vanguardOwnerControls(context) {
  return [...extensions.values()].flatMap(hooks => hooks?.ownerControls?.(context) ?? []);
}

export function vanguardSkillSlots(context) {
  return [...extensions.values()].flatMap(hooks => hooks?.skillSlots?.(context) ?? []);
}

/**
 * Extra individual attacks that registered extensions add to the base Attack Action (for example Skill Haste).
 * A branch supplies `attackActionBonus(context)` in its hooks; the sum of the finite, non-negative whole numbers
 * returned is added to the base count. No extension, a throwing extension or a malformed value contributes 0.
 * `context` takes the same fields as `vanguardExtensionContext` (branchId, level, profile, choices, ...).
 */
export function vanguardAttackActionBonus(actor, context = {}) {
  const shared = vanguardExtensionContext(actor, { purpose: "attackAction", ...context });
  let total = 0;
  for (const hooks of extensions.values()) {
    if (typeof hooks?.attackActionBonus !== "function") continue;
    try {
      const value = Number(hooks.attackActionBonus(shared));
      if (Number.isFinite(value) && value > 0) total += Math.floor(value);
    } catch (error) { console.error("AK5e | Vanguard attack action bonus", error); }
  }
  return total;
}

/* ------------------------------------------------------------ Tip of the Spear grant sources */
const tipGrantSources = new Map();
/**
 * Register a Tip of the Spear grant source: a branch Feature or Skill that lets its owner use Tip of the Spear
 * (for example Pioneer's threshold or Tactical Burst, Charger's Mark, Leading Lance, Devastating Blow).
 * `validator(actor, sourceEventId, grantIndex)` returns `true`, `false` or `{ ok, reason }`, synchronously. It states
 * whether that grant really exists and is still available; it never judges range or prerequisites (those only warn).
 * Registration is idempotent: the first validator registered for a kind stays in force.
 */
export function registerVanguardTipGrantSource(kind, validator) {
  if (typeof kind !== "string" || !kind.trim()) throw new Error("A Tip grant source needs a non-empty kind.");
  if (typeof validator !== "function") throw new Error("A Tip grant source needs a validator function.");
  if (!tipGrantSources.has(kind)) tipGrantSources.set(kind, validator);
  return tipGrantSources.get(kind) === validator;
}
export function getVanguardTipGrantSource(kind) {
  return typeof kind === "string" ? tipGrantSources.get(kind) ?? null : null;
}
export function vanguardTipGrantSourceKinds() {
  return [...tipGrantSources.keys()];
}
/** Run a grant validator; returns `{ ok, reason }`. A missing kind, a throw or a non-synchronous answer is not ok. */
export function checkVanguardTipGrant(kind, actor, sourceEventId, grantIndex) {
  const validator = getVanguardTipGrantSource(kind);
  if (!validator) return { ok: false, reason: `Tip of the Spear grant source "${kind}" is not registered.` };
  let result;
  try { result = validator(actor, sourceEventId, grantIndex); }
  catch (error) { return { ok: false, reason: error?.message || "The Tip grant could not be validated." }; }
  if (result === true) return { ok: true };
  if (result && typeof result === "object" && typeof result.then !== "function" && result.ok === true) return { ok: true };
  const reason = result && typeof result === "object" && typeof result.reason === "string" ? result.reason : "";
  return { ok: false, reason: reason || `That ${kind} Tip of the Spear grant is not available.` };
}

export function notifyVanguardOperatorCommit(event) {
  // Preserve the notification identity while protecting its committed receipt.
  // Producers supply a snapshot rather than the live Actor's ledger object.
  freezeData(event.event);
  const jobs = [];
  for (const [branchId, hooks] of extensions) {
    if (!hooks?.onOperatorCommit) continue;
    const key = event?.actorUuid && event?.event?.id ? `${branchId}\0${event.actorUuid}\0${event.event.id}\0${event.state}` : null;
    if (key && deliveries.has(key)) continue;
    if (key && inFlight.has(key)) { jobs.push(inFlight.get(key)); continue; }
    let resolveJob;
    const job = new Promise(resolve => { resolveJob = resolve; });
    if (key) inFlight.set(key, job);
    jobs.push(job);
    const settle = (succeeded, error) => {
      if (!succeeded) console.error("AK5e | Vanguard extension notification", error);
      else if (key) deliveries.set(key, true);
      if (key) inFlight.delete(key);
      resolveJob();
    };
    try { Promise.resolve(hooks.onOperatorCommit(event)).then(() => settle(true), error => settle(false, error)); }
    catch (error) { settle(false, error); }
  }
  return Promise.all(jobs);
}
