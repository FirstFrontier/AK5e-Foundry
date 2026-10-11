/** SI-1 operation kernel: player request -> elected-GM commit -> operation receipts
 * -> per-Actor serial queue -> reconcile. Extracted without behaviour change from the
 * Standard Bearer helpers. Branch rules, flag names and wording are supplied by the
 * consumer's configuration; nothing here knows about a particular class. */
import { applyFeatureTag } from "./feature-tags.mjs";

export const flag = (doc, key) => doc?.getFlag?.("ak5e", key) ?? doc?.flags?.ak5e?.[key];
export const values = collection => Array.from(collection?.values?.() ?? collection ?? []);
export const need = (condition, message) => { if (!condition) throw new Error(message); };
export const uuid = () => foundry.utils.randomID();
export const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const gmActive = () => game.user.isGM && game.users.activeGM?.id === game.user.id;
export const own = (actor, user) => user.isGM || actor?.testUserPermission?.(user, "OWNER");

// Flag state is JSON data. Object key order is immaterial; array order is not.
function sameState(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && sameState(a[key], b[key]));
}

/** Opaque IDs keep hidden recipients out of a shared state document. */
export function opaqueKey(text) {
  let a = 2166136261, b = 2246822507;
  for (const c of String(text)) { a = Math.imul(a ^ c.charCodeAt(0), 16777619); b = Math.imul(b ^ c.charCodeAt(0), 3266489909); }
  return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}

/** One promise chain per Actor UUID; a failed task never blocks the next one. */
export function keyedSerial() {
  const queues = new Map();
  return (actor, task) => {
    const previous = queues.get(actor.uuid) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(task); queues.set(actor.uuid, next);
    return next.finally(() => { if (queues.get(actor.uuid) === next) queues.delete(actor.uuid); });
  };
}

/** The built-in GM recovery step for an interrupted (prepared) operation. */
function reconcile(state, data, user, label) {
  need(user.isGM, `Only the GM may reconcile interrupted ${label} state.`);
  const previous = state.operations.find(o => o.id === data.operationId && o.status === "prepared");
  need(previous && typeof data.reason === "string" && data.reason.trim().length >= 10 && data.facts?.qualifying,
    "Choose an interrupted operation and confirm that its target receipts, resources and map state have been manually reconciled, with a reason.");
  previous.status = "reconciled"; previous.reason = data.reason.trim();
  return state;
}

/**
 * config:
 *   label            display name used in messages and logs ("Standard Bearer")
 *   stateFlag        Actor flag holding { operations: [...], ...branch state }
 *   requestFlag / responseFlag   ChatMessage flags for the player-request transport
 *   receiptFlag      recipient flag holding per-application receipts
 *   benefitFlag      effect flag that tags a granted benefit (see tagged())
 *   rollFlag         ChatMessage flag marking a persisted confirmed roll
 *   tagPreset        feature-tag preset used by tagged()
 *   getState(actor)  normalised state copy
 *   isMember(actor)  whether the Actor carries the branch
 *   ownerExempt      commands that do not require owning the operating Actor
 *   gate(actor, command)         throws when a command is unavailable
 *   beforeRun(actor, state)      optional; mutates state before a request runs
 *   perform(actor, command, data, op, state, user) -> state
 *   afterPerform(actor, state)   optional; e.g. map synchronisation
 */
export function createOperationKernel(config) {
  const { label, stateFlag, requestFlag, responseFlag, receiptFlag, benefitFlag, rollFlag, tagPreset,
    getState, isMember, ownerExempt = [], gate, beforeRun, perform, afterPerform } = config;
  const serial = keyedSerial(), inFlight = new Map();

  const noteMutation = actor => { const operation = inFlight.get(actor?.uuid); if (operation) operation.changed = true; };

  async function saveState(actor, state) {
    need(gmActive(), `An active GM must commit ${label} operations.`);
    if (sameState(flag(actor, stateFlag), state)) return;
    const result = await actor.update({ [`flags.ak5e.${stateFlag}`]: state }, actor.isToken ? { diff: false } : {});
    // Foundry returns undefined for a no-op, including a write another client
    // already completed. A prevented update must still fail if state differs.
    need(result || sameState(flag(actor, stateFlag), state), `The ${label} state could not be saved.`);
  }

  /** Each acknowledged target write carries a receipt; replay never applies it twice. */
  async function targetUpdate(target, id, update, sourceActor) {
    const key = opaqueKey(id), receipts = flag(target, receiptFlag) ?? {};
    if (receipts[key]) return;
    noteMutation(sourceActor);
    const result = await target.update({ ...update, [`flags.ak5e.${receiptFlag}.${key}`]: true }, target.isToken ? { diff: false } : {});
    need(result, "A target application was prevented; retry the same operation.");
  }

  async function tagged(actor, item, target, id, options, metadata = {}) {
    const key = opaqueKey(id);
    if (flag(target, receiptFlag)?.[opaqueKey(`${id}:benefit`)]) return null;
    const existing = values(target.effects).find(e => flag(e, benefitFlag)?.id === key);
    if (existing) { await targetUpdate(target, `${id}:benefit`, {}, actor); return existing; }
    noteMutation(actor);
    const effect = await applyFeatureTag(actor, item, target, { ...options, preset: tagPreset });
    try { await effect.update({ [`flags.ak5e.${benefitFlag}`]: { id: key, bearerUuid: actor.uuid, ...metadata } }); }
    catch (error) { await effect.delete(); throw error; }
    await targetUpdate(target, `${id}:benefit`, {}, actor);
    return effect;
  }

  /** Persist the roll before any application; an interrupted operation reuses it. */
  async function rollOnce(op, key, formula, actor) {
    const opaque = opaqueKey(key);
    if (op.rolls[opaque] !== undefined) return op.rolls[opaque];
    const roll = await new Roll(formula, actor.getRollData?.() ?? {}).evaluate();
    op.rolls[opaque] = roll.total;
    const state = getState(actor), record = state.operations.find(o => o.id === op.id);
    record.rolls = structuredClone(op.rolls); await saveState(actor, state);
    await roll.toMessage({ speaker: ChatMessage.implementation.getSpeaker({ actor }), flavor: `${label} confirmed roll`,
      whisper: values(game.users).filter(u => u.isGM || own(actor, u)).map(u => u.id), flags: { ak5e: { [rollFlag]: op.id } } });
    return roll.total;
  }

  async function execute(actor, request, user = game.user) {
    need(gmActive(), "An active GM is required.");
    need(actor?.documentName === "Actor" && !actor.pack && isMember(actor), `Choose a live ${label} Actor.`);
    need(typeof request.id === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(request.id), "A stable operation ID is required.");
    need(request.data?.confirmation === true, "Confirm before applying this operation.");
    if (!ownerExempt.includes(request.command)) need(own(actor, user), `You must own the ${label}.`);
    gate?.(actor, request.command);
    return serial(actor, async () => {
      need(gmActive(), "The elected GM changed; retry with the same ID.");
      let state = getState(actor);
      await beforeRun?.(actor, state);
      const fingerprint = opaqueKey(JSON.stringify([request.command, request.data]));
      let op = state.operations.find(o => o.id === request.id);
      if (op) {
        need(op.fingerprint === fingerprint && op.userId === user.id, "An operation ID cannot be reused with different choices or a different author.");
        if (op.status === "committed") return { ok: true, replayed: true };
      } else {
        need(request.command === "reconcile" || !state.operations.some(o => o.status === "prepared"), "An interrupted operation requires the same ID/choices or GM reconciliation before another operation.");
        op = { id: request.id, userId: user.id, fingerprint, command: request.command, status: "prepared", rolls: {} };
        state.operations.push(op); await saveState(actor, state);
      }
      inFlight.set(actor.uuid, op);
      try {
        state = request.command === "reconcile" ? reconcile(state, request.data, user, label)
          : await perform(actor, request.command, request.data, op, state, user);
        await afterPerform?.(actor, state);
        op.status = "committed"; state.operations = state.operations.map(o => o.id === op.id ? op : o);
        await saveState(actor, state);
        return { ok: true, operationId: op.id };
      } catch (error) {
        if (!op.changed && !Object.keys(op.rolls).length) {
          const clean = getState(actor); clean.operations = clean.operations.filter(o => o.id !== op.id); await saveState(actor, clean);
        }
        // Target receipts/rolls may already exist. Retain a recoverable prepared
        // operation instead of spending twice or declaring rollback that did not occur.
        console.warn(`AK5e | ${label} operation failed`, op.id, error.message); throw error;
      } finally { inFlight.delete(actor.uuid); }
    });
  }

  async function handle(message, _options, userId) {
    if (!gmActive() || flag(message, responseFlag)) return;
    const request = flag(message, requestFlag); if (!request) return;
    const user = game.users.get(userId);
    try {
      need(user && message.author?.id === userId, "The request author is invalid.");
      const result = await execute(await fromUuid(request.actorUuid), request, user);
      await message.update({ [`flags.ak5e.${responseFlag}`]: { ok: true, result } });
    } catch (error) { await message.update({ [`flags.ak5e.${responseFlag}`]: { ok: false, error: error.message } }); }
  }

  async function submit(actor, command, data = {}, id = uuid()) {
    need(game.users.activeGM, "An active GM is required; nothing was applied.");
    const request = { actorUuid: actor.uuid, id, command, data };
    if (gmActive()) return execute(actor, request);
    const message = await ChatMessage.implementation.create({ content: `${label} confirmed request`, whisper: [game.users.activeGM.id, game.user.id], flags: { ak5e: { [requestFlag]: request } } });
    return new Promise((resolve, reject) => {
      const finish = response => { if (!response) return; clearTimeout(timer); Hooks.off("updateChatMessage", listener);
        response.ok ? resolve(response.result) : reject(new Error(response.error)); };
      const listener = changed => { if (changed.id === message.id) finish(flag(changed, responseFlag)); };
      const timer = setTimeout(() => { Hooks.off("updateChatMessage", listener); reject(new Error(`Request timed out. Retry with operation ID ${id}; do not create a new action.`)); }, 15000);
      Hooks.on("updateChatMessage", listener); finish(flag(message, responseFlag));
    });
  }

  return { execute, handle, submit, serial, noteMutation, saveState, targetUpdate, tagged, rollOnce };
}
