/** Source: Chapter 1, Operator Skills. This module has no Foundry dependencies. */
export const CHARGING_METHODS = Object.freeze(["automatic", "offensive", "defensive"]);
export const SP_EVENT_TYPES = Object.freeze(["automatic", "offensiveDamage", "offensiveHealing", "offensiveTemp", "defensiveAttack", "defensiveDamage"]);

export function spInteger(value, label = "SP", minimum = 0) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum) throw new Error(`${label} must be a whole number of at least ${minimum}.`);
  return number;
}

const bound = (value, maximum) => Math.min(maximum, Math.max(0, Number(value) || 0));

export function skillDefinition(data = {}) {
  const cost = spInteger(data.cost, "SP Cost");
  const start = spInteger(data.start ?? 0, "Start SP");
  if (!Array.isArray(data.methods) || data.methods.some(method => !CHARGING_METHODS.includes(method))) throw new Error("Select valid charging methods.");
  const duration = String(data.duration ?? "").trim();
  if (!/^(Instant|\d+ Rounds?|Until Long Rest|1 Attack|Manual)$/.test(duration)) throw new Error("Choose an Instant, round, Until Long Rest, one-Attack, or Manual duration.");
  if (/^0+ Rounds?$/.test(duration)) throw new Error("A timed Skill needs at least one round.");
  if (!/^(Action|Bonus Action|Reaction|No Action Required)$/.test(data.activation ?? "")) throw new Error("Choose an activation cost.");
  return { ...data, cost, start, methods: [...new Set(data.methods)], duration, enabled: data.enabled !== false };
}

export function learnedSkills(items = []) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const metadata = item.getFlag?.("ak5e", "operatorSkill") ?? item.flags?.ak5e?.operatorSkill;
    if (!metadata || metadata.enabled === false) continue;
    const key = metadata.sourceId ?? item.getFlag?.("ak5e", "chapterThreeId") ?? item.flags?.ak5e?.chapterThreeId ?? item.id;
    if (seen.has(key)) continue;
    const definition = skillDefinition(metadata);
    seen.add(key);
    result.push({ ...definition, itemId: item.id, uuid: item.uuid, name: item.name, sourceId: key });
  }
  return result;
}

export function operatorState(stored = {}, skills = []) {
  const enabled = stored.enabled === true;
  const maximum = enabled ? Math.max(0, ...skills.map(skill => skill.cost)) : Math.max(0, Number(stored.maximum) || 0);
  const start = enabled ? Math.max(0, ...skills.map(skill => skill.start)) : Number(stored.start) || 0;
  const counts = Object.fromEntries(CHARGING_METHODS.map(method => [method, skills.filter(skill => skill.methods.includes(method)).length]));
  return { ...stored, enabled, maximum, start: bound(start, maximum), points: bound(stored.points, maximum), active: stored.active ?? null,
    counts, rates: { automatic: counts.automatic * 2, offensive: counts.offensive, defensive: counts.defensive * 2 },
    receipts: stored.receipts ?? [], operations: stored.operations ?? [], pendingEvents: stored.pendingEvents ?? [] };
}

export function eventIdentity(event) {
  if (!SP_EVENT_TYPES.includes(event.type) || !event.id) throw new Error("An SP event needs a type and stable ID.");
  if (event.type === "offensiveDamage" && event.attackId && event.positive !== false && event.hostile !== false) return `offensiveAttack:${event.attackId}`;
  if (event.type === "defensiveAttack" && event.attackId) return `defensiveAttack:${event.attackId}`;
  return `${event.type}:${event.id}`;
}

/** Unknown facts produce a review request, never a speculative award. */
export function chargeOperatorState(state, event) {
  const id = eventIdentity(event);
  if (state.receipts.some(receipt => receipt.id === id)) return { state, gained: 0, reason: "duplicate" };
  if (!state.enabled) return { state, gained: 0, reason: "disabled" };
  let reason = "charged";
  let amount = 0;
  const offensive = event.type.startsWith("offensive");
  const defensive = event.type.startsWith("defensive");
  if (state.active || event.activeAtEvent) reason = "active";
  else if (event.skillOrigin) reason = "skillOrigin";
  else if ((offensive || event.type === "automatic") && !event.ownTurn) reason = "offTurn";
  else if (offensive && ["offensiveHealing", "offensiveTemp"].includes(event.type) && event.self) reason = "self";
  else if (event.type === "defensiveDamage" && event.attack === true) reason = "attackDamage";
  else if (["offensiveDamage", "offensiveHealing", "offensiveTemp", "defensiveDamage"].includes(event.type) && event.positive === false) reason = "noChange";
  else if (event.type === "offensiveTemp" && event.art === false) reason = "notArt";
  else if (((defensive || event.type === "offensiveDamage") && event.hostile == null)
    || (event.type === "offensiveDamage" && (event.attack == null || event.attack && !event.attackId))
    || (event.type === "defensiveDamage" && event.attack == null)
    || (event.type === "offensiveTemp" && event.art == null)
    || (["offensiveDamage", "offensiveHealing", "offensiveTemp", "defensiveDamage"].includes(event.type) && event.positive == null)
    || event.provenanceUnknown) reason = "confirmation";
  else if ((defensive || event.type === "offensiveDamage") && !event.hostile) reason = "notHostile";
  else amount = state.rates[offensive ? "offensive" : defensive ? "defensive" : "automatic"];
  if (reason === "confirmation") return { state, gained: 0, reason };
  const points = bound(state.points + amount, state.maximum);
  const gained = points - state.points;
  if (reason === "charged" && !gained) reason = amount ? "capped" : "noMethod";
  const receipt = { id, reason, before: state.points, after: points, gained };
  return { state: { ...state, points, receipts: [...state.receipts, receipt], lastEvent: receipt }, gained, reason };
}

export function skillDeadline(duration, context = {}) {
  const rounds = Number(duration.match(/^(\d+) Rounds?$/)?.[1]);
  if (!rounds) return { kind: duration === "Until Long Rest" ? "longRest" : "manual" };
  const seconds = rounds * (Number(context.roundTime) || 6);
  return { kind: "rounds", rounds, expiresAt: Number(context.worldTime ?? 0) + seconds,
    ...(context.combat?.started ? { combatUuid: context.combat.uuid, startRound: context.combat.round,
      startTurn: context.combat.turn ?? 0, combatantId: context.combat.combatant?.id } : {}) };
}

export function skillExpired(active, context = {}) {
  const expiry = active?.expiry;
  if (!expiry) return false;
  if (expiry.kind === "longRest") return context.longRest === true;
  if (expiry.kind !== "rounds") return false;
  const combat = context.combats?.find(combat => combat.uuid === expiry.combatUuid && combat.started);
  if (combat) {
    const index = combat.turns?.findIndex(combatant => combatant.id === expiry.combatantId);
    const turn = index >= 0 ? index : expiry.startTurn;
    return combat.round > expiry.startRound + expiry.rounds || combat.round === expiry.startRound + expiry.rounds && combat.turn >= turn;
  }
  return Number(context.worldTime ?? 0) >= expiry.expiresAt;
}

export function activateSkillState(state, skill, context = {}) {
  if (state.active) throw new Error("Only one Operator Skill may be active.");
  const cost = spInteger(skill.cost, "SP Cost");
  if (state.points < cost) throw new Error("Not enough Skill Points.");
  const activation = { id: skill.sourceId ?? skill.id, itemId: skill.itemId, name: skill.name, uuid: skill.uuid,
    activationId: context.id, duration: skill.duration, expiry: skillDeadline(skill.duration ?? "Manual", context) };
  return { ...state, points: state.points - cost, active: skill.duration === "Instant" ? null : activation, lastSkill: activation };
}

export function recoverOperatorState(state, context = {}) {
  return { ...state, active: skillExpired(state.active, { ...context, longRest: true }) ? null : state.active,
    points: Math.max(state.points, state.start) };
}
