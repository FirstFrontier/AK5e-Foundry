/** Pioneer branch contributions to the Vanguard progression and Operator Skill views. */
import { registerVanguardExtension, registerVanguardTipGrantSource } from "./vanguard-extensions.mjs";
import { CHAPTER_FOUR_EQUIPMENT } from "./chapter-four-content.mjs";
import { CHAPTER_THREE_CLASSES } from "./chapter-three-content.mjs";
import { vanguardUses } from "./vanguard-uses.mjs";
import { vanguardProfile, vanguardState } from "./vanguard-rules.mjs";
import { warn } from "./play-uses.mjs";
import { onAk5eEvent } from "./trigger-events.mjs";
import { need, opaqueKey, esc } from "./operation-kernel.mjs";
import { openPioneerAura, openPioneerThreshold, openPioneerRecipients, openPioneerCycleManual, openPioneerOffer, registerPioneerRecipientHooks,
  openPioneerApply, openPioneerLive, openPioneerDamage, openPioneerTip, runPioneerRest } from "./pioneer-sheet.mjs";
import { tokenPoint, withinFeet } from "./standard-bearer-rules.mjs";

const BRANCH = "subclass-vanguard-pioneer";
const heavyWeapons = CHAPTER_FOUR_EQUIPMENT.filter(entry => entry.kind === "weapon" && entry.tableData?.category === "Heavy Melee Weapons");
const elite = CHAPTER_THREE_CLASSES.filter(entry => entry.operatorSkill?.tier === "Elite" &&
  ["Guard", "Defender", "Marksman", "Specialist", "Vanguard"].includes(entry.parentClass));
const hooked = new WeakSet(), restIds = new WeakMap();
let killHandlerInstalled = false;
const options = entries => entries.map(entry => ({ value: entry.id, label: entry.name }));
const startingAuras = ["Clarity", "Liberation", "Protection", "Punishment", "Purity", "Infirmity", "Violence"];
const allAuras = level => [...startingAuras, ...(level >= 10 ? ["Pressure", "Shadows", "Vigilance"] : [])];
const auraRules = {
  Clarity: { recipients: "selfAllies", text: "Immune to Charmed and Frightened; suspend those Conditions while in the Aura." },
  Liberation: { recipients: "selfAllies", text: "Unaffected by Difficult Terrain; Speed cannot be reduced except by Conditions." },
  Protection: { recipients: "allies", text: "Saving Throws gain the bearer's Proficiency Bonus." },
  Punishment: { recipients: "hostile", text: "When hit by an Attack, take 1d4 Psychic Damage." },
  Purity: { recipients: "selfAllies", text: "Resistance to Poison and Necrotic Damage; Advantage on saves to resist or end Poisoned." },
  Infirmity: { recipients: "hostile", text: "Saving Throws suffer a penalty equal to the bearer's Proficiency Bonus." },
  Violence: { recipients: "selfAllies", text: "May add the bearer's Proficiency Bonus to the first Attack Roll each Turn." },
  Pressure: { recipients: "hostile", text: "On starting a Turn in the Aura, take 5 (1d8) Force Damage." },
  Shadows: { recipients: "hostile", text: "Attacks against the bearer by creatures in the Aura have Disadvantage." },
  Vigilance: { recipients: "selfAllies", text: "Initiative Rolls gain the bearer's Proficiency Bonus." }
};
/** Source: "Overlapping Auras": beneficial effects are chosen by the creature, negative effects use the worse one. */
const BENEFICIAL_AURAS = new Set(["Clarity", "Liberation", "Protection", "Purity", "Violence", "Vigilance"]);
const TIP_GRANT_THRESHOLD = "pioneer-threshold", TIP_GRANT_BURST = "pioneer-tactical-burst";
export const PIONEER_TIP_GRANT_KINDS = Object.freeze({ threshold: TIP_GRANT_THRESHOLD, tacticalBurst: TIP_GRANT_BURST });
const THRESHOLD_READING = "pioneerThresholdCounter", PRESSURE_READING = "pioneerPressureDamage";
const thresholdOptions = [
  { value: "carry", label: "Carry the Skill Points already counted toward the next 20 across the Long Rest" },
  { value: "reset", label: "The Long Rest resets the count toward the next 20 to zero" }
];
const pressureOptions = [
  { value: "fixed", label: "Pressure deals the fixed 5 Force Damage" },
  { value: "roll", label: "Pressure deals 1d8 Force Damage, rolled by the owner" }
];
const exists = uuid => !globalThis.fromUuidSync || Boolean(globalThis.fromUuidSync(uuid));
const list = collection => Array.from(collection?.values?.() ?? collection ?? []);
const auraPlain = name => String(name).replace(/^Aura of /, "");

/**
 * Static modifiers a managed Aura effect carries. Everything else (riders that depend on a Turn, an Attack, terrain or a
 * suspended Condition) stays a manual step on the use card; the effect still marks the creature as affected.
 */
function auraChanges(aura, pb) {
  const ADD = globalThis.CONST?.ACTIVE_EFFECT_MODES?.ADD ?? 2;
  const add = (key, value) => ({ key, mode: ADD, value, priority: 20 });
  switch (aura) {
    case "Protection": return [add("system.bonuses.abilities.save", `+${pb}`)];
    case "Infirmity": return [add("system.bonuses.abilities.save", `-${pb}`)];
    case "Vigilance": return [add("system.attributes.init.bonus", `+${pb}`)];
    case "Clarity": return [add("system.traits.ci.value", "charmed"), add("system.traits.ci.value", "frightened")];
    case "Purity": return [add("system.traits.dr.value", "poison"), add("system.traits.dr.value", "necrotic")];
    default: return [];
  }
}
const auraManual = {
  Clarity: "Suspend any Charmed or Frightened Condition on the creature while it stays in the Aura (the immunity is applied by the effect).",
  Liberation: "Difficult Terrain does not slow the creature and its Speed cannot be reduced except by Conditions; track this at the table.",
  Purity: "The creature has Advantage on saves to resist or end Poisoned; roll those saves with Advantage by hand (the Resistance is applied by the effect).",
  Violence: "The creature may add the bearer's Proficiency Bonus to its first Attack Roll each Turn; the owner adds it by hand.",
  Punishment: "When the creature is hit by an Attack, use the bearer's Aura damage control; the owner rolls 1d4 Psychic Damage.",
  Pressure: "When the creature starts a Turn in the Aura, use the bearer's Aura damage control for 5 (1d8) Force Damage.",
  Shadows: "Attacks against the bearer by the creature, while it is in the Aura, have Disadvantage; apply that by hand.",
  Protection: "", Infirmity: "", Vigilance: ""
};

const marker = effect => effect?.flags?.ak5e?.pioneerAuraEffect ?? effect?.getFlag?.("ak5e", "pioneerAuraEffect") ?? null;
const effectsOf = actor => list(actor?.effects);
const markedEffects = (actor, predicate = () => true) => effectsOf(actor).filter(effect => { const mark = marker(effect); return mark && predicate(mark, effect); });
const chosenSourceFor = (target, aura) => target.flags?.ak5e?.pioneerAuraChosen?.[aura] ?? target.getFlag?.("ak5e", "pioneerAuraChosen")?.[aura];

/**
 * When the same Aura reaches a creature from several Pioneers only one applies. Beneficial: the creature's recorded choice,
 * else the earliest. Negative: the worst (largest Proficiency Bonus), else the earliest. Only managed effects are touched;
 * a suspended effect is re-enabled when it becomes the winner.
 */
export async function settleAuraOverlap(target, aura) {
  const found = markedEffects(target, mark => mark.aura === aura).map((effect, index) => ({ effect, index, mark: marker(effect) }));
  if (found.length < 2 && !found.some(item => item.mark.suspended)) return;
  const earliest = (a, b) => (a.mark.appliedAt ?? 0) - (b.mark.appliedAt ?? 0) || a.index - b.index;
  const sorted = [...found].sort(earliest);
  const chosen = chosenSourceFor(target, aura);
  const winner = BENEFICIAL_AURAS.has(aura) ? sorted.find(item => item.mark.sourceUuid === chosen) ?? sorted[0]
    : [...sorted].sort((a, b) => (b.mark.pb ?? 0) - (a.mark.pb ?? 0) || earliest(a, b))[0];
  for (const item of found) {
    if (item === winner && item.mark.suspended) await item.effect.update({ disabled: false, "flags.ak5e.pioneerAuraEffect.suspended": false });
    else if (item !== winner && !item.mark.suspended) await item.effect.update({ disabled: true, "flags.ak5e.pioneerAuraEffect.suspended": true });
  }
}

function auraEffectData(source, aura, pb, useId) {
  return { name: `Aura of ${aura}`, img: "icons/svg/aura.svg", origin: source.uuid, disabled: false, transfer: false,
    description: `<p>${esc(auraRules[aura].text)}</p><p>Source: ${esc(source.name ?? "Pioneer")}.</p>`, changes: auraChanges(aura, pb),
    flags: { ak5e: { pioneerAuraEffect: { aura, sourceUuid: source.uuid, useId, pb, appliedAt: Date.now(), suspended: false } } } };
}
/** Create (idempotently) one managed Aura effect on a recipient. The payload comes from the Aura table, never from a receipt. */
async function ensureAuraEffect(source, useId, entry, target) {
  need(allAuras(20).includes(entry.aura) && Number.isInteger(entry.pb) && entry.pb >= 1 && entry.pb <= 9, "That is not a Pioneer Aura effect.");
  if (!markedEffects(target, mark => mark.sourceUuid === source.uuid && mark.useId === useId && mark.aura === entry.aura).length)
    await target.createEmbeddedDocuments("ActiveEffect", [auraEffectData(source, entry.aura, entry.pb, useId)]);
  await settleAuraOverlap(target, entry.aura);
  return { aura: entry.aura };
}
async function removeAuraEffect(source, useId, entry, target) {
  const ids = markedEffects(target, mark => mark.sourceUuid === source.uuid && mark.useId === useId && mark.aura === entry.aura).map(effect => effect.id);
  if (ids.length) await target.deleteEmbeddedDocuments("ActiveEffect", ids);
  await settleAuraOverlap(target, entry.aura);
  return { removed: ids.length };
}
/** The apply receipt (not undone) that created the effect a release entry names. */
function releaseOrigin(source, entry) {
  const receipt = vanguardUses.state(source).undo.find(item => item.id === entry.originUseId && item.status !== "undone");
  return receipt?.targets?.some(target => target.kind === "pioneerAuraEffect" && target.uuid === entry.uuid && target.aura === entry.aura &&
    target.pb === entry.pb && `${receipt.id}_${opaqueKey(String(target.key))}` === entry.effectUseId) === true;
}
const targetKinds = {
  pioneerAuraEffect: {
    apply: ensureAuraEffect,
    revert: removeAuraEffect,
    preview: (_source, _receipt, entry) => `${entry.name}: removes the managed Aura of ${entry.aura} effect.`
  },
  pioneerAuraRelease: {
    apply: (source, _useId, entry, target) => removeAuraEffect(source, entry.effectUseId, entry, target),
    async revert(source, _useId, entry, target) {
      if (!releaseOrigin(source, entry)) return { skipped: true };   // the use that created it was undone; nothing to bring back
      return ensureAuraEffect(source, entry.effectUseId, entry, target);
    },
    preview: (_source, _receipt, entry) => `${entry.name}: restores the managed Aura of ${entry.aura} effect that this release ended.`
  }
};
/** Re-checked on the GM client before another player's Creature is changed, and before it is reversed. */
function validatePioneerTarget(source, receipt, entry, target) {
  const profile = vanguardProfile(source);
  if (profile.branchId !== BRANCH || entry.uuid !== target.uuid) return false;
  if (entry.kind === "pioneerAuraRelease") return releaseOrigin(source, entry);
  if (entry.kind !== "pioneerAuraEffect") return false;
  const prof = Number(source.system?.attributes?.prof);
  return entry.key === `${entry.aura}:${entry.uuid}` && entry.pb === prof && chosenAuras(source, profile.level).includes(entry.aura) &&
    receipt.data?.recipients?.some?.(recipient => globalThis.fromUuidSync?.(recipient.tokenUuid)?.actor?.uuid === target.uuid) === true;
}
function validatePioneerRevert(source, _receipt, entry, target) {
  if (vanguardProfile(source).branchId !== BRANCH || entry.uuid !== target.uuid) return false;
  return entry.kind === "pioneerAuraRelease" ? releaseOrigin(source, entry) : entry.kind === "pioneerAuraEffect" && allAuras(20).includes(entry.aura);
}

/** The Auras a Pioneer currently has chosen (choices whose threshold vanished are ignored). */
export const pioneerChosenAuras = actor => chosenAuras(actor, vanguardProfile(actor).level ?? 1);
export const isBeneficialAura = aura => BENEFICIAL_AURAS.has(aura);
const getFlag = (actor, key) => actor.getFlag?.("ak5e", key) ?? actor.flags?.ak5e?.[key];
const lastActivationEventId = actor => (getFlag(actor, "operatorSkills")?.operatorEvents ?? []).filter(event => event.kind === "activation" && event.committed === true && event.id && event.activationId).at(-1)?.id ?? null;

/** Choices whose threshold no longer exists (for example after its activation was undone) are not live choices. */
function validChoices(actor, choices = {}) {
  const ids = new Set(["base", ...pioneerThresholds(actor).grants.map(grant => grant.id)]);
  return Object.fromEntries(Object.entries(choices ?? {}).filter(([id, aura]) => ids.has(id) && typeof aura === "string"));
}
/** Foundry merges flag updates, so a dropped choice is written as `null` rather than left out. */
const withNulls = (raw, keep = {}) => ({ ...Object.fromEntries(Object.keys(raw ?? {}).map(id => [id, null])), ...keep });
const chosenAuras = (actor, level, state = vanguardUses.state(actor)) =>
  [...new Set(Object.values(validChoices(actor, state.data.pioneerAura?.choices)))].filter(name => allAuras(level).includes(name));
const orphanChoiceIds = (actor, state = vanguardUses.state(actor)) =>
  Object.entries(state.data.pioneerAura?.choices ?? {}).filter(([id, aura]) => typeof aura === "string" && !Object.hasOwn(validChoices(actor, state.data.pioneerAura.choices), id)).map(([id]) => id);
const isIncapacitated = actor => Boolean(actor?.statuses?.has?.("incapacitated")) || effectsOf(actor).some(effect => !effect.disabled && effect.statuses?.has?.("incapacitated"));

/**
 * Read current token geometry and status; no Actor, roll, or effect is changed.
 * `lenient` keeps the answer usable when the Aura is off, the bearer is Incapacitated or distance cannot be verified
 * (those become warnings the owner may override) instead of returning no effects.
 */
export function pioneerAuraRecipients(sourceToken, recipientToken, { lenient = false } = {}) {
  const source = sourceToken?.actor, recipient = recipientToken?.actor;
  const profile = vanguardProfile(source);
  if (!source || !recipient || profile.branchId !== BRANCH) return { eligible: false, effects: [], warnings: ["Choose Pioneer and recipient tokens."] };
  const state = vanguardUses.state(source).data.pioneerAura ?? {};
  const incapacitated = isIncapacitated(source);
  const warnings = [], disabled = !state.enabled || incapacitated ? (incapacitated ? "The Aura is disabled while Incapacitated." : "The Aura is disabled.") : null;
  if (disabled && !lenient) return { eligible: false, effects: [], warnings: [disabled], disabled };
  if (disabled) warnings.push(disabled);
  const scene = sourceToken.parent, radius = profile.level >= 13 ? 30 : 15;
  let inRange = null;
  if (!scene?.grid || recipientToken.parent?.id !== scene.id) {
    if (!lenient) return { eligible: false, effects: [], warnings: ["Token distance cannot be verified in a shared scene."] };
    warnings.push("Token distance cannot be verified in a shared scene.");
  } else {
    inRange = withinFeet(scene, tokenPoint(sourceToken), recipientToken, radius);
    if (!inRange) warnings.push(`Recipient is outside the ${radius}-foot Aura; confirm any table exception.`);
  }
  const self = source.uuid === recipient.uuid;
  const a = sourceToken.disposition, b = recipientToken.disposition;
  const relation = self ? "self" : Number.isFinite(a) && Number.isFinite(b) && a !== 0 && b !== 0
    ? (a === b ? "allied" : "hostile") : "unknown";
  if (relation === "unknown") warnings.push("Confirm whether this creature is allied or hostile.");
  const effects = chosenAuras(source, profile.level, { data: { pioneerAura: state } }).flatMap(name => {
    const rule = auraRules[name];
    if (relation !== "unknown" && !(rule.recipients === "selfAllies" && ["self", "allied"].includes(relation) ||
      rule.recipients === "allies" && relation === "allied" || rule.recipients === "hostile" && relation === "hostile")) return [];
    return [{ name: `Aura of ${name}`, ...rule, proficiencyBonus: Number(source.system?.attributes?.prof ?? 0) }];
  });
  if (effects.length) warnings.push("When Auras overlap, resolve the source's recipient choice or worse negative effect at the table.");
  return { eligible: true, radius, relation, effects, warnings, inRange, disabled };
}

/**
 * Reconstruct thresholds from committed activation receipts, never inferred costs. A Long Rest the owner read as
 * resetting the count (`counterResets`) restarts the remainder after the activation it names.
 */
export function pioneerThresholds(actor, { resets } = {}) {
  const events = getFlag(actor, "operatorSkills")?.operatorEvents ?? [];
  const resetAfter = new Set((resets ?? vanguardUses.state(actor).data.pioneerAura?.counterResets ?? []).map(reset => reset.afterEventId));
  const grants = [], seen = new Set();
  let remainder = 0, sources = [];
  for (const event of events) {
    if (event.kind !== "activation" || event.committed !== true || !event.id || !event.activationId || seen.has(event.id)) continue;
    seen.add(event.id);
    let amount = Number.isFinite(Number(event.spSpent)) ? Math.max(0, Math.trunc(Number(event.spSpent))) : 0, crossing = 0;
    while (amount > 0) {
      const spent = Math.min(amount, 20 - remainder);
      sources.push({ actorUuid: actor.uuid, activationId: event.activationId, eventId: event.id, spent });
      remainder += spent; amount -= spent;
      if (remainder === 20) {
        grants.push({ id: opaqueKey(`pioneer-threshold:${event.id}:${++crossing}`), label: "Choose an Aura of your choice and use Tip of the Spear", sources });
        remainder = 0; sources = [];
      }
    }
    if (resetAfter.has(event.id)) { remainder = 0; sources = []; }
  }
  return { grants, remainder, pendingSources: sources };
}

/* ------------------------------------------------------------ Tip of the Spear grants */
const activationEvent = (actor, activationId) => (getFlag(actor, "operatorSkills")?.operatorEvents ?? []).find(event =>
  event.kind === "activation" && event.committed === true && event.activationId === activationId && event.id === `${activationId}:activation`);
/** Tactical Burst: one Tip per activation plus one per full 10 Skill Points actually spent. */
export const tacticalBurstCount = spent => 1 + (Number.isFinite(Number(spent)) ? Math.floor(Math.max(0, Math.trunc(Number(spent))) / 10) : 0);
function registerTipGrantSources() {
  registerVanguardTipGrantSource(TIP_GRANT_THRESHOLD, (actor, grantId, grantIndex) => {
    const profile = vanguardProfile(actor);
    if (profile.branchId !== BRANCH) return { ok: false, reason: "Auramancy thresholds belong to a Pioneer." };
    return grantIndex === 1 && pioneerThresholds(actor).grants.some(grant => grant.id === grantId)
      || { ok: false, reason: "That Auramancy threshold was not reached by committed Operator Skill activations." };
  });
  registerVanguardTipGrantSource(TIP_GRANT_BURST, (actor, activationId, grantIndex) => {
    const profile = vanguardProfile(actor), event = activationEvent(actor, activationId);
    if (profile.branchId !== BRANCH || profile.level < 4) return { ok: false, reason: "Tactical Burst requires Pioneer level 4." };
    return Boolean(event) && Number.isInteger(grantIndex) && grantIndex >= 1 && grantIndex <= tacticalBurstCount(event.spSpent)
      || { ok: false, reason: "Tactical Burst grants one Tip per committed activation plus one per 10 Skill Points spent on it." };
  });
}
registerTipGrantSources();
const tipUsed = (actor, grantKind, sourceEventId, grantIndex) => vanguardUses.uses(actor).some(use => use.command === "tipOfTheSpear" && use.status !== "undone" &&
  use.data?.grantKind === grantKind && use.data?.sourceEventId === sourceEventId && use.data?.grantIndex === grantIndex);
function tipControls(actor, level) {
  const controls = [];
  for (const grant of pioneerThresholds(actor).grants) {
    if (tipUsed(actor, TIP_GRANT_THRESHOLD, grant.id, 1)) continue;
    controls.push({ id: `${BRANCH}:tip:${grant.id}`, kind: "dialog", label: "Auramancy threshold: use Tip of the Spear",
      hint: "One Tip of the Spear for each 20 Skill Points spent; confirm to use it. Undo the use to release the grant.",
      open: args => openPioneerTip({ ...args, grantKind: TIP_GRANT_THRESHOLD, sourceEventId: grant.id, grantIndex: 1 }) });
  }
  if (level >= 4) for (const event of (getFlag(actor, "operatorSkills")?.operatorEvents ?? []).filter(item => item.kind === "activation" && item.committed === true && item.activationId).slice(-3)) {
    const count = tacticalBurstCount(event.spSpent);
    for (let index = 1; index <= count; index++) {
      if (tipUsed(actor, TIP_GRANT_BURST, event.activationId, index)) continue;
      controls.push({ id: `${BRANCH}:burst:${opaqueKey(event.activationId)}:${index}`, kind: "dialog",
        label: `Tactical Burst: Tip of the Spear ${index} of ${count} (${event.name ?? "Operator Skill"})`,
        hint: `${count} Tip of the Spear uses from this activation (1 + one per 10 Skill Points spent); no Action required.`,
        open: args => openPioneerTip({ ...args, grantKind: TIP_GRANT_BURST, sourceEventId: event.activationId, grantIndex: index }) });
    }
  }
  return controls;
}

/* ------------------------------------------------------------ Skill Haste */
function skillHasteState(actor) {
  const operator = getFlag(actor, "operatorSkills") ?? {}, combat = globalThis.game?.combat;
  const latest = Object.values(getFlag(actor, "vanguard")?.pioneerActivations ?? {}).at(-1);
  const turn = Boolean(latest?.combatUuid && latest.combatUuid === combat?.uuid && latest.round === combat.round && latest.turn === combat.turn);
  return { active: Boolean(operator.active), turn, latest };
}

export function registerPioneerVanguardExtension() {
  registerTipGrantSources();
  registerVanguardExtension(BRANCH, {
    progressionContribution(context) {
      if (context.branchId !== BRANCH) return null;
      const selection = context.branchChoices?.heavyDuty ?? {};
      const fields = [
        { key: `branches.${BRANCH}.heavyDuty.slot`, label: "Heavy Duty: exchange one starting Light Melee Weapon or Light Shield", options: [
          { value: "none", label: "No exchange" }, { value: "weapon1", label: "First Light Melee Weapon" },
          { value: "weapon2", label: "Second Light Melee Weapon or Light Shield" }
        ], count: 1, selected: selection.slot ?? "none", requiredAt: 1 },
        { key: `branches.${BRANCH}.heavyDuty.sourceId`, label: "Heavy Duty: replacement Heavy Melee Weapon", options: options(heavyWeapons),
          count: 1, selected: selection.sourceId ?? null, requiredAt: 1 }
      ];
      const result = { fields, proficiencies: { armor: ["med"], weaponCategories: ["Heavy Melee Weapons"] },
        hpBonuses: [{ key: "hardenedScars", sourceId: "class-feature-vanguard-pioneer-heavy-duty", total: 2 * context.level }],
        auraRadius: "Auramancy: 15 feet; Maximum Aura at level 13: 30 feet" };
      if (["weapon1", "weapon2"].includes(selection.slot)) {
        if (heavyWeapons.some(entry => entry.id === selection.sourceId)) result.equipmentExchange = { slot: selection.slot, sourceId: selection.sourceId };
        else result.pending = [`branches.${BRANCH}.heavyDuty.sourceId`];
      }
      return result;
    },
    async onOperatorCommit(notification) {
      const { actor, branchId, event } = notification;
      if (branchId !== BRANCH || !actor?.isOwner || event?.committed !== true) return;
      if (event.kind === "end" && notification.state === "present" && vanguardProfile(actor).level >= 10) {
        const kill = vanguardUses.state(actor).data.pioneerCycle?.kills?.[opaqueKey(event.activationId)];
        if (kill) await vanguardUses.command(actor, "pioneerCycleRefund", { activationId: event.activationId, confirmed: true },
          opaqueKey(`pioneer-cycle-refund:${event.activationId}`));
        return;
      }
      if (event.kind !== "activation") return;
      const next = pioneerThresholds(actor), vanguard = getFlag(actor, "vanguard") ?? {};
      const updates = {};
      if (JSON.stringify(vanguard.pioneerThresholds) !== JSON.stringify(next)) updates["flags.ak5e.vanguard.pioneerThresholds"] = next;
      if (vanguardProfile(actor).level >= 4) {
        const snapshots = { ...(vanguard.pioneerActivations ?? {}) }, combat = globalThis.game?.combat;
        if (notification.state === "present" && !snapshots[event.id]) snapshots[event.id] = {
          activationId: event.activationId, spent: Math.max(0, Number(event.spSpent) || 0),
          combatUuid: combat?.started ? combat.uuid : null, round: combat?.started ? combat.round : null,
          turn: combat?.started ? combat.turn : null
        };
        if (notification.state === "removed") delete snapshots[event.id];
        if (JSON.stringify(vanguard.pioneerActivations ?? {}) !== JSON.stringify(snapshots)) updates["flags.ak5e.vanguard.pioneerActivations"] = snapshots;
      }
      if (Object.keys(updates).length) await actor.update(updates);
      // An undone activation removes its threshold; an Aura chosen for it is no longer a live choice.
      if (notification.state === "removed" && orphanChoiceIds(actor).length)
        await vanguardUses.command(actor, "pioneerAuraPrune", { confirmed: true }, opaqueKey(`pioneer-prune:${event.id}`));
    },
    attackActionBonus(context) {
      if (context.branchId !== BRANCH || context.level < 4) return 0;
      const haste = skillHasteState(context.actor);
      return haste.active || haste.turn ? 1 : 0;
    },
    ownerControls(context) {
      if (context.branchId !== BRANCH) return [];
      const auras = allAuras(context.level);
      const state = vanguardUses.state(context.actor), auraState = state.data.pioneerAura ?? {};
      const retired = new Set(auraState.retired ?? []);
      const grants = pioneerThresholds(context.actor).grants.filter(grant => !retired.has(grant.id));
      const chosen = chosenAuras(context.actor, context.level, state);
      const haste = skillHasteState(context.actor), latest = haste.latest;
      const operator = getFlag(context.actor, "operatorSkills") ?? {};
      const burst = latest ? tacticalBurstCount(latest.spent) : 0;
      const pendingCycles = Object.values(state.data.pioneerCycle?.kills ?? {}).filter(kill =>
        (operator.operatorEvents ?? []).some(event => event.kind === "end" && event.committed && event.activationId === kill.activationId) &&
        !state.undo.some(receipt => receipt.command === "pioneerCycleRefund" && receipt.status !== "undone" && receipt.activationId === kill.activationId));
      const live = pioneerLiveEntries({ pioneerAura: auraState }).length;
      return [{ id: `${BRANCH}:auramancy`, kind: "dialog", label: "Auramancy", open: openPioneerAura,
        hint: `Aura options: ${auras.map(name => `Aura of ${name}`).join(", ")}. Radius ${context.level >= 13 ? 30 : 15} feet. Static Aura modifiers are applied as managed, undoable effects; the rest is listed as manual steps.` },
        { id: `${BRANCH}:apply`, kind: "dialog", label: "Apply Aura effects to creatures", open: openPioneerApply,
          hint: chosen.length ? `Chosen: ${chosen.map(name => `Aura of ${name}`).join(", ")}. Warns about range, allegiance and overlap; never blocks.` : "Choose an Aura first." },
        { id: `${BRANCH}:live`, kind: "dialog", label: `Review or release active Aura effects (${live})`, open: openPioneerLive,
          hint: "Shows range for each creature and ends effects you pick; the release is undoable." },
        ...(chosen.some(name => ["Punishment", "Pressure"].includes(name)) ? [{ id: `${BRANCH}:aura-damage`, kind: "dialog", label: "Aura damage (Punishment or Pressure)",
          open: openPioneerDamage, hint: "Punishment: 1d4 Psychic. Pressure: 5 (1d8) Force. Nothing is rolled until you click Roll on the card." }] : []),
        { id: `${BRANCH}:rest-reset`, kind: "dialog", label: "Apply Long Rest Aura reset", open: ({ actor }) => runPioneerRest(actor, foundry.utils.randomID()),
          hint: "Use only if the Long Rest prompt was dismissed: ends Aura choices and effects, and asks how the 20-SP count carries over." },
        ...(context.level >= 10 && (operator.operatorEvents ?? []).some(event => event.kind === "end" && event.committed) ? [{
          id: `${BRANCH}:cycle-manual`, kind: "dialog", label: "Cycle of Violence: Skill damage after ending",
          hint: "Confirm a qualifying reduction to 0 HP caused by the ended Skill's damage.", open: openPioneerCycleManual }] : []),
        ...pendingCycles.map(kill => ({ id: `${BRANCH}:cycle:${opaqueKey(kill.activationId)}`, kind: "use", command: "pioneerCycleRefund",
          label: "Cycle of Violence: confirm Skill Point refund", hint: "A source-attributed kill was recorded during this Skill; confirm the refund.",
          prepare: () => ({ activationId: kill.activationId }) })),
        ...(context.level >= 4 ? [{ id: `${BRANCH}:moment`, kind: "dialog", label: "Moment of Power",
          hint: `Skill Haste: ${haste.active || haste.turn ? "available" : "check activation Turn or active Skill"}; one additional Attack with the Attack Action (added to the Vanguard Attack Action automatically). ${latest ? `${burst} Tip of the Spear uses from the latest activation.` : "No recorded activation."}`,
          open: async () => foundry.applications.api.DialogV2.wait({ window: { title: "Moment of Power" }, rejectClose: false,
            content: `<p>Skill Haste grants one additional Attack when you take the Attack Action during the Turn you activate an Operator Skill and while you have an Active Operator Skill.</p><p>${latest ? `${burst} Tip of the Spear uses from the latest activation.` : "No recorded activation."} Use them from the Tactical Burst controls.</p>`, buttons: [{ action: "close", label: "Close" }] }) }] : []),
        ...tipControls(context.actor, context.level),
        ...(auraState.baseAvailable ? [{ id: `${BRANCH}:base`, kind: "dialog", label: "Choose Aura after Long Rest",
          open: args => openPioneerThreshold({ ...args, grantId: "base" }) }] : []),
        { id: `${BRANCH}:offer`, kind: "dialog", label: "Offer Aura to a creature", open: openPioneerOffer,
          hint: "Send the creature owner an Aura review and selection control; unowned targets use the GM relay." },
        { id: `${BRANCH}:recipients`, kind: "dialog", label: "Review Aura recipients", open: openPioneerRecipients,
          hint: "Review current distance, allegiance, and effects; overlapping Auras require a public table choice." },
        ...grants.map(grant => ({ id: `${BRANCH}:${grant.id}`, kind: "dialog", label: `Auramancy ${grant.id}: Aura and Tip of the Spear`,
          hint: "Choose an additional Aura; the granted Tip use requires separate confirmation.",
          open: args => openPioneerThreshold({ ...args, grantId: grant.id }) }))];
    },
    skillSlots(context) {
      if (context.branchId !== BRANCH || context.level < 17) return [];
      const restKey = vanguardUses.state(context.actor).data.pioneerAura?.breakthroughRestKey;
      return [{ key: `${BRANCH}:breakthrough`, label: "Breakthrough Skill — ignore its Charging Method; exchange on Long Rest",
        tier: "Elite", level: 17, ignoreCharging: true, optionSourceIds: elite.map(entry => entry.id),
        ...(restKey ? { replacementKey: `pioneer-breakthrough:${restKey}` } : {}) }];
    }
  });
}

/** Show a reading that was fixed by a GM ruling on the card; a player's reading is recorded by the engine itself. */
function noteReading(actor, receipt, key, value, offered) {
  if (value === undefined || value === null) return;
  const ruled = Boolean(vanguardState(actor).rulings?.[key]?.source?.trim?.());
  receipt.reading = offered.find(option => option.value === value)?.label ?? String(value);
  receipt.readingSource = ruled ? "ruling" : "player";
}
/** Release entries for the live managed effects (all, or those a predicate selects); drops entries whose creature is gone. */
/** Live managed-effect registry entries. A released entry is stored as `null`: Foundry merges flag updates, so a deleted key would persist. */
export const pioneerLiveEntries = data => Object.entries(data?.pioneerAura?.live ?? {}).filter(([, entry]) => entry && typeof entry === "object");
function takeReleases(next, predicate = () => true) {
  const live = next.data.pioneerAura?.live ?? {}, targets = [];
  for (const [id, entry] of pioneerLiveEntries(next.data)) {
    if (!predicate(entry, id)) continue;
    live[id] = null;
    if (!exists(entry.targetUuid)) continue;
    targets.push({ uuid: entry.targetUuid, name: entry.targetName, kind: "pioneerAuraRelease", key: `release:${entry.effectUseId}`, aura: entry.aura, pb: entry.pb,
      effectUseId: entry.effectUseId, originUseId: entry.originUseId, ready: true });
  }
  return targets;
}
const releaseNote = count => count ? `Ends ${count} managed Aura effect${count === 1 ? "" : "s"}; undo this use to restore them.` : "No managed Aura effects were active.";
const damageAuras = ["Punishment", "Pressure"];

/** Register the owner-confirmed, reversible toggle. */
export function registerPioneerFeatureHooks() {
  const plans = {
    pioneerAuraOffer(actor, _state, data) {
      need(vanguardProfile(actor).branchId === BRANCH, "Auramancy requires the Pioneer branch.");
      const source = globalThis.fromUuidSync?.(data.sourceTokenUuid), target = globalThis.fromUuidSync?.(data.targetTokenUuid);
      need(source?.actor?.uuid === actor.uuid && target?.actor?.uuid === data.targetUuid, "Choose the bearer's token and a creature token.");
      const view = pioneerAuraRecipients(source, target), warnings = [];
      for (const [index, message] of view.warnings.entries()) warn(warnings, `aura-${index}`, message);
      const value = { sourceUuid: actor.uuid, sourceTokenUuid: source.uuid, targetTokenUuid: target.uuid };
      const path = `flags.ak5e.pioneerAuraOffers.${opaqueKey(actor.uuid)}`;
      return { title: "Offer Auramancy to a creature", warnings, apply(_next, receipt) {
        receipt.summary = `Offer ${target.name ?? "the creature"} an Aura review; its owner chooses the effect. Effects end when the recipient leaves the Aura, the Aura is disabled, or its effects expire.`;
        receipt.targets = [{ uuid: target.actor.uuid, name: target.name ?? "Creature", kind: "flag", path, value, ready: true }];
        return {};
      } };
    },
    pioneerCycleKill(actor, state, data) {
      const profile = vanguardProfile(actor), active = getFlag(actor, "operatorSkills")?.active;
      need(profile.branchId === BRANCH && profile.level >= 10, "Cycle of Violence requires Pioneer level 10.");
      need(active?.activationId && active.activationId === data.activationId, "The recorded Skill must still be active.");
      need(data.sourceActorUuid === actor.uuid && data.eventId && data.targetUuid, "A source-attributed kill event is required.");
      const key = opaqueKey(data.activationId), existing = state.data.pioneerCycle?.kills?.[key];
      need(!existing, "A qualifying kill was already recorded for this Skill.");
      return { title: "Cycle of Violence: record qualifying kill", warnings: [], apply(next, receipt) {
        next.data.pioneerCycle ??= {}; next.data.pioneerCycle.kills ??= {};
        next.data.pioneerCycle.kills[key] = { activationId: data.activationId, eventId: data.eventId, targetUuid: data.targetUuid };
        receipt.operatorSources = [{ actorUuid: actor.uuid, activationId: data.activationId }];
        receipt.summary = "Source-attributed kill recorded during the active Operator Skill; refund remains subject to confirmation after it ends.";
        return {};
      } };
    },
    pioneerCycleRefund(actor, state, data) {
      const profile = vanguardProfile(actor), operator = getFlag(actor, "operatorSkills") ?? {};
      need(profile.branchId === BRANCH && profile.level >= 10, "Cycle of Violence requires Pioneer level 10.");
      const kill = state.data.pioneerCycle?.kills?.[opaqueKey(data.activationId)] ??
        (data.manualProof === true && typeof data.targetName === "string" && data.targetName.trim()
          ? { activationId: data.activationId, targetName: data.targetName.trim(), manual: true } : null);
      need(kill && (operator.operatorEvents ?? []).some(event => event.kind === "end" && event.committed && event.activationId === kill.activationId), "A qualifying Skill must have ended.");
      need(!state.undo.some(receipt => receipt.command === "pioneerCycleRefund" && receipt.status !== "undone" && receipt.activationId === kill.activationId), "This Skill has already received its refund.");
      return { title: "Cycle of Violence: regain Skill Points", warnings: [], apply(_next, receipt) {
        const before = Math.max(0, Number(operator.points) || 0), maximum = Math.max(0, Number(operator.maximum) || 0);
        const after = Math.min(maximum, before + profile.level);
        receipt.activationId = kill.activationId;
        receipt.operatorSources = [{ actorUuid: actor.uuid, activationId: kill.activationId }];
        receipt.resources = [{ path: "flags.ak5e.operatorSkills.points", before, after, max: maximum, label: "Skill Points" }];
        receipt.summary = `${kill.manual ? `Owner confirms this Skill's damage reduced ${esc(kill.targetName)} to 0 HP. ` : ""}Cycle of Violence restores ${after - before} Skill Points (up to ${profile.level}, capped at the shared maximum).`;
        receipt.result = { gained: after - before };
        return { "flags.ak5e.operatorSkills.points": after };
      } };
    },
    pioneerAuraRest(actor, state) {
      need(vanguardProfile(actor).branchId === BRANCH, "Auramancy requires the Pioneer branch.");
      const counted = pioneerThresholds(actor);
      return { title: "Auramancy: Long Rest", warnings: [], ...(counted.remainder > 0 ? { reading: THRESHOLD_READING } : {}), apply(next, receipt, reading) {
        next.data.pioneerAura ??= {};
        const targets = takeReleases(next);
        next.data.pioneerAura.choices = withNulls(next.data.pioneerAura.choices);
        next.data.pioneerAura.retired = counted.grants.map(grant => grant.id);
        next.data.pioneerAura.baseAvailable = true;
        next.data.pioneerAura.breakthroughRestKey = receipt.id;
        const updates = {};
        if (counted.remainder > 0) {
          noteReading(actor, receipt, THRESHOLD_READING, reading, thresholdOptions);
          if (reading === "reset") {
            const afterEventId = lastActivationEventId(actor);
            next.data.pioneerAura.counterResets = [...(state.data.pioneerAura?.counterResets ?? []), { afterEventId, restId: receipt.id }];
            updates["flags.ak5e.vanguard.pioneerThresholds"] = pioneerThresholds(actor, { resets: next.data.pioneerAura.counterResets });
          }
        }
        receipt.targets = targets;
        receipt.summary = `Long Rest ends the Aura's existing effects. The owner may choose one new Aura effect. ${releaseNote(targets.length)}`;
        return updates;
      } };
    },
    pioneerAuraChoice(actor, state, data) {
      const profile = vanguardProfile(actor);
      need(profile.branchId === BRANCH, "Auramancy requires the Pioneer branch.");
      const auraState = state.data.pioneerAura ?? {};
      const grant = data.grantId === "base" && auraState.baseAvailable ? { id: "base", sources: [] }
        : pioneerThresholds(actor).grants.find(entry => entry.id === data.grantId && !auraState.retired?.includes(entry.id));
      need(grant, "This Aura choice is no longer available.");
      need(allAuras(profile.level).includes(data.aura), "Choose an available Aura.");
      const choices = validChoices(actor, auraState.choices);
      need(!Object.hasOwn(choices, grant.id), "This threshold already has an Aura choice.");
      need(!Object.values(choices).includes(data.aura), "Choose an Aura effect that is not already active.");
      return { title: "Auramancy: choose Aura", warnings: [], apply(next, receipt) {
        next.data.pioneerAura ??= {};
        next.data.pioneerAura.choices = withNulls(next.data.pioneerAura.choices, { ...choices, [grant.id]: data.aura });
        if (grant.id === "base") next.data.pioneerAura.baseAvailable = false;
        receipt.operatorSources = structuredClone(grant.sources);
        receipt.summary = `Choose Aura of ${data.aura}. The separate Tip of the Spear use spends no additional Skill Points.`;
        receipt.result = { grantId: grant.id, aura: data.aura };
        return {};
      } };
    },
    pioneerAuramancy(actor, state, data) {
      need(vanguardProfile(actor).branchId === BRANCH, "Auramancy requires the Pioneer branch.");
      need(data.action === "toggle" && typeof data.enabled === "boolean", "Choose whether to enable or disable Auramancy.");
      const warnings = [], combat = globalThis.game?.combat;
      if (combat?.started && combat.turns?.[combat.turn]?.actor?.uuid !== actor.uuid)
        warn(warnings, "out-of-turn", "This Action is out of turn.");
      return { title: "Auramancy", warnings, apply(next, receipt) {
        next.data.pioneerAura ??= {};
        next.data.pioneerAura.enabled = data.enabled;
        const targets = data.enabled ? [] : takeReleases(next);
        receipt.targets = targets;
        receipt.summary = `Auramancy ${data.enabled ? "enabled" : "disabled"}. ${data.enabled ? "Apply Aura effects to creatures from the Pioneer controls." : releaseNote(targets.length)} It is disabled while Incapacitated.`;
        return {};
      } };
    },
    pioneerAuraApply(actor, state, data) {
      const profile = vanguardProfile(actor);
      need(profile.branchId === BRANCH, "Auramancy requires the Pioneer branch.");
      const sourceToken = globalThis.fromUuidSync?.(data.sourceTokenUuid);
      need(sourceToken?.actor?.uuid === actor.uuid, "Choose the Pioneer's own token.");
      need(Array.isArray(data.recipients) && data.recipients.length > 0 && data.recipients.length <= 40, "Choose one or more creature tokens.");
      const chosen = chosenAuras(actor, profile.level, state), pb = Number(actor.system?.attributes?.prof);
      need(chosen.length, "Choose an Aura through Auramancy first.");
      need(Number.isInteger(pb) && pb >= 1, "The Proficiency Bonus could not be read.");
      const warnings = [], items = [], seen = new Set();
      for (const recipient of data.recipients) {
        const token = globalThis.fromUuidSync?.(recipient.tokenUuid);
        need(token?.actor, "A chosen creature token is no longer available.");
        const view = pioneerAuraRecipients(sourceToken, token, { lenient: true });
        const eligible = view.effects.map(effect => auraPlain(effect.name));
        const names = Array.isArray(recipient.auras) && recipient.auras.length ? recipient.auras : eligible;
        if (view.disabled) warn(warnings, "disabled", view.disabled);
        for (const aura of names) {
          need(chosen.includes(aura), `Aura of ${aura} is not one of your chosen Auras.`);
          const key = `${aura}:${token.actor.uuid}`, k = opaqueKey(`${token.uuid}:${aura}`);
          if (seen.has(key)) continue;
          seen.add(key); items.push({ token, aura, key });
          if (view.inRange === false) warn(warnings, `range-${k}`, `${token.name} is outside the ${view.radius}-foot Aura of ${aura}; use anyway only if the table confirms an exception.`);
          else if (view.inRange === null) warn(warnings, `range-${k}`, `${token.name}'s distance from you could not be verified; confirm it is within ${view.radius} feet.`);
          if (view.relation === "unknown") warn(warnings, `relation-${k}`, `Confirm whether ${token.name} is allied or hostile for Aura of ${aura}.`);
          else if (!eligible.includes(aura)) warn(warnings, `relation-${k}`, `${token.name} (${view.relation}) is not an eligible recipient of Aura of ${aura}: ${auraRules[aura].recipients === "hostile" ? "hostile creatures only" : auraRules[aura].recipients === "allies" ? "allies only" : "you and your allies"}.`);
          const marks = markedEffects(token.actor, mark => mark.aura === aura);
          if (marks.some(effect => marker(effect).sourceUuid === actor.uuid)) warn(warnings, `dup-${k}`, `${token.name} already has your Aura of ${aura}.`);
          else if (marks.length) warn(warnings, `overlap-${k}`, `${token.name} is already under another Pioneer's Aura of ${aura}. Only one applies: ${BENEFICIAL_AURAS.has(aura) ? "the creature chooses (they can pick from their sheet)" : "the worse one"}.`);
        }
      }
      need(items.length, "None of the chosen creatures can receive a chosen Aura.");
      return { title: "Auramancy: apply Aura effects", warnings,
        previewTargets: items.map(item => ({ uuid: item.token.actor.uuid, name: `${item.token.name}: Aura of ${item.aura}` })),
        apply(next, receipt) {
          next.data.pioneerAura ??= {}; next.data.pioneerAura.live ??= {};
          receipt.targets = items.map(({ token, aura, key }) => ({ uuid: token.actor.uuid, name: token.name ?? "Creature", kind: "pioneerAuraEffect", key, aura, pb, tokenUuid: token.uuid, ready: true }));
          for (const entry of receipt.targets) {
            const effectUseId = `${receipt.id}_${opaqueKey(entry.key)}`;
            next.data.pioneerAura.live[opaqueKey(`${receipt.id}:${entry.key}`)] = { originUseId: receipt.id, effectUseId, targetUuid: entry.uuid, targetName: entry.name,
              aura: entry.aura, pb, sourceTokenUuid: data.sourceTokenUuid, targetTokenUuid: entry.tokenUuid };
          }
          const auras = [...new Set(items.map(item => item.aura))];
          receipt.manualSteps.push(...auras.map(aura => auraManual[aura]).filter(Boolean));
          receipt.summary = `Applies ${items.map(item => `Aura of ${item.aura} on ${item.token.name}`).join("; ")} as managed effects (Proficiency Bonus ${pb} where the effect uses it). They end when you disable Auramancy, are Incapacitated, take a Long Rest, or release them; undo this use to remove them.`;
          return {};
        } };
    },
    pioneerAuraRelease(actor, state, data) {
      need(vanguardProfile(actor).branchId === BRANCH, "Auramancy requires the Pioneer branch.");
      const keys = Array.isArray(data.keys) ? new Set(data.keys.map(String)) : null;
      need(pioneerLiveEntries(state.data).some(([id]) => !keys || keys.has(id)), "No active managed Aura effects match.");
      const reasons = { manual: "released by the owner", range: "the creature left the Aura", incapacitated: "the bearer is Incapacitated" };
      const reason = reasons[data.reason] ?? reasons.manual;
      return { title: "Auramancy: end Aura effects", warnings: [], apply(next, receipt) {
        const targets = takeReleases(next, (_entry, id) => !keys || keys.has(id));
        receipt.targets = targets;
        receipt.summary = `Aura effects end: ${reason}. ${releaseNote(targets.length)}`;
        return {};
      } };
    },
    pioneerAuraPrune(actor, state) {
      need(vanguardProfile(actor).branchId === BRANCH, "Auramancy requires the Pioneer branch.");
      const orphans = orphanChoiceIds(actor, state);
      need(orphans.length, "Every Aura choice still has its threshold.");
      return { title: "Auramancy: drop Aura choices without a threshold", warnings: [], apply(next, receipt) {
        const choices = next.data.pioneerAura.choices, dropped = orphans.map(id => choices[id]);
        next.data.pioneerAura.choices = withNulls(choices, validChoices(actor, choices));
        const stillChosen = new Set(Object.values(next.data.pioneerAura.choices));
        receipt.targets = takeReleases(next, entry => dropped.includes(entry.aura) && !stillChosen.has(entry.aura));
        receipt.summary = `Aura of ${[...new Set(dropped)].join(", ")} lost its threshold because the activation was undone. ${releaseNote(receipt.targets.length)}`;
        return {};
      } };
    },
    pioneerAuraDamage(actor, state, data) {
      const profile = vanguardProfile(actor);
      need(profile.branchId === BRANCH, "Auramancy requires the Pioneer branch.");
      need(damageAuras.includes(data.aura), "Only Aura of Punishment and Aura of Pressure deal damage.");
      need(chosenAuras(actor, profile.level, state).includes(data.aura), `Aura of ${data.aura} is not one of your chosen Auras.`);
      need(typeof data.targetUuid === "string" && data.targetUuid, "Choose the creature that takes the damage.");
      const warnings = [], target = globalThis.fromUuidSync?.(data.targetUuid), name = data.targetName ?? target?.name ?? "the creature";
      if (!state.data.pioneerAura?.enabled) warn(warnings, "disabled", "Auramancy is disabled.");
      if (isIncapacitated(actor)) warn(warnings, "incapacitated", "The Aura is disabled while Incapacitated.");
      if (target && !markedEffects(target, mark => mark.aura === data.aura && mark.sourceUuid === actor.uuid).length)
        warn(warnings, "not-affected", `${name} has no managed Aura of ${data.aura} from you; confirm it is in the Aura.`);
      const combat = globalThis.game?.combat;
      if (data.aura === "Pressure" && combat?.started && combat.turns?.[combat.turn]?.actor?.uuid !== data.targetUuid)
        warn(warnings, "not-their-turn", `Aura of Pressure damages a creature as it starts a Turn in the Aura; it is not ${name}'s Turn.`);
      return { title: `Aura of ${data.aura}: damage`, warnings, ...(data.aura === "Pressure" ? { reading: PRESSURE_READING } : {}),
        previewTargets: [{ uuid: data.targetUuid, name }],
        apply(_next, receipt, reading) {
          receipt.targetUuid = data.targetUuid;
          if (data.aura === "Punishment") {
            receipt.formula = "1d4"; receipt.damageParts = [{ formula: "1d4", type: "psychic" }]; receipt.rollLabel = "Psychic damage";
            receipt.summary = `Aura of Punishment: ${name} was hit by an Attack. Click Roll on the card for 1d4 Psychic Damage; nothing is rolled automatically.`;
          } else {
            noteReading(actor, receipt, PRESSURE_READING, reading, pressureOptions);
            if (reading === "roll") {
              receipt.formula = "1d8"; receipt.damageParts = [{ formula: "1d8", type: "force" }]; receipt.rollLabel = "Force damage";
              receipt.summary = `Aura of Pressure: ${name} started a Turn in the Aura. Click Roll on the card for 1d8 Force Damage; nothing is rolled automatically.`;
            } else receipt.summary = `Aura of Pressure: ${name} started a Turn in the Aura and takes 5 Force Damage.`;
          }
          receipt.manualSteps.push(`Apply the damage to ${name} with the native damage controls (or by hand for a fixed amount); resistances and other adjustments are theirs to resolve.`);
          return {};
        } };
    }
  };
  // The relay reads `validateTarget` from the plan function itself (not from the object a plan returns).
  plans.pioneerAuraOffer.validateTarget = (sourceActor, receipt, entry, recipient) => {
    const record = receipt.data, sourceToken = globalThis.fromUuidSync?.(record.sourceTokenUuid), targetToken = globalThis.fromUuidSync?.(record.targetTokenUuid);
    return vanguardProfile(sourceActor).branchId === BRANCH && sourceToken?.actor?.uuid === sourceActor.uuid &&
      targetToken?.actor?.uuid === recipient.uuid && record.targetUuid === recipient.uuid && entry.uuid === recipient.uuid &&
      entry.kind === "flag" && entry.path === `flags.ak5e.pioneerAuraOffers.${opaqueKey(sourceActor.uuid)}` &&
      entry.value?.sourceUuid === sourceActor.uuid && entry.value?.sourceTokenUuid === record.sourceTokenUuid && entry.value?.targetTokenUuid === record.targetTokenUuid &&
      Object.keys(entry.value).length === 3;
  };
  for (const name of ["pioneerAuraApply", "pioneerAuramancy", "pioneerAuraRest", "pioneerAuraRelease", "pioneerAuraPrune"]) {
    plans[name].validateTarget = validatePioneerTarget;
    plans[name].validateRevert = validatePioneerRevert;
  }
  // Foundry merges flag updates, so a key the engine deletes while undoing a use would survive. Write explicit "empty" values instead.
  const SCALAR_DEFAULTS = { enabled: false, baseAvailable: false, retired: [], breakthroughRestKey: null, counterResets: [] };
  const cleanup = (state, receipt) => {
    if (!String(receipt.command ?? "").startsWith("pioneerAura")) return;
    const aura = state.data.pioneerAura ??= {};
    for (const change of receipt.dataChanges ?? []) {
      const [root, group, leaf] = change.keys ?? change.path.split(".");
      if (root !== "pioneerAura" || change.beforePresent) continue;
      if (!group) {
        // The whole record was new: neutralise every part of it.
        for (const [name, value] of Object.entries(change.after ?? {})) {
          if (name === "live" || name === "choices") { aura[name] ??= {}; for (const id of Object.keys(value ?? {})) aura[name][id] = null; }
          else if (Object.hasOwn(SCALAR_DEFAULTS, name)) aura[name] = structuredClone(SCALAR_DEFAULTS[name]);
        }
      } else if (group === "live" || group === "choices") {
        aura[group] ??= {};
        if (leaf) aura[group][leaf] = null;
        else for (const id of Object.keys(change.after ?? {})) aura[group][id] = null;
      } else if (Object.hasOwn(SCALAR_DEFAULTS, group) && aura[group] === undefined) aura[group] = structuredClone(SCALAR_DEFAULTS[group]);
    }
  };
  vanguardUses.register({ cleanup, targetKinds, plans, readings: {
    [THRESHOLD_READING]: { label: "Skill Points already counted toward the next 20 at a Long Rest", options: thresholdOptions },
    [PRESSURE_READING]: { label: "Aura of Pressure damage", options: pressureOptions }
  } });
  registerPioneerRecipientHooks();
  if (!killHandlerInstalled) {
    killHandlerInstalled = true;
    onAk5eEvent("kill", async event => {
      if (!event.sourceActorUuid || !event.actorUuid || !event.eventId || !Number.isFinite(event.hpAfter) || event.hpAfter > 0) return;
      const actor = await globalThis.fromUuid?.(event.sourceActorUuid), profile = vanguardProfile(actor);
      const active = getFlag(actor, "operatorSkills")?.active;
      if (!actor?.isOwner || profile.branchId !== BRANCH || profile.level < 10 || !active?.activationId) return;
      const key = opaqueKey(active.activationId);
      if (vanguardUses.state(actor).data.pioneerCycle?.kills?.[key]) return;
      await vanguardUses.command(actor, "pioneerCycleKill", { confirmed: true, activationId: active.activationId,
        sourceActorUuid: event.sourceActorUuid, eventId: event.eventId, targetUuid: event.actorUuid }, opaqueKey(`pioneer-kill:${active.activationId}`));
    });
  }
  if (globalThis.Hooks && !hooked.has(Hooks)) {
    hooked.add(Hooks);
    Hooks.on("dnd5e.restCompleted", (actor, result, config = {}) => {
      if (config.type !== "long" || !actor?.isOwner || vanguardProfile(actor).branchId !== BRANCH) return;
      let id = result && typeof result === "object" ? restIds.get(result) : null;
      if (!id) {
        id = result?.message?.uuid ? opaqueKey(`pioneer-rest:${actor.uuid}:${result.message.uuid}`) : foundry.utils.randomID();
        if (result && typeof result === "object") restIds.set(result, id);
      }
      // The owner's client asks how the 20-SP count carries over (a public per-use reading) when no GM ruling exists.
      runPioneerRest(actor, id).catch(error => {
        console.error("AK5e | Pioneer Aura Long Rest", error);
        globalThis.ui?.notifications?.error?.(error.message);
      });
    });
    // Incapacitated ends the Aura's effects. One client acts: the first active non-GM owner, else the active GM.
    Hooks.on("createActiveEffect", effect => {
      const actor = effect.parent;
      if (actor?.documentName !== "Actor" || !(effect.statuses?.has?.("incapacitated") || (effect.statuses ?? []).includes?.("incapacitated"))) return;
      if (vanguardProfile(actor).branchId !== BRANCH || !pioneerLiveEntries(vanguardUses.state(actor).data).length) return;
      const owners = list(globalThis.game?.users).filter(user => user.active && !user.isGM && actor.testUserPermission?.(user, "OWNER"));
      const acts = owners.length ? owners[0].id === globalThis.game?.user?.id : globalThis.game?.user?.isGM && globalThis.game?.users?.activeGM?.id === globalThis.game.user.id;
      if (!acts || !actor.isOwner) return;
      vanguardUses.command(actor, "pioneerAuraRelease", { reason: "incapacitated", confirmed: true }, opaqueKey(`pioneer-incap:${effect.uuid ?? effect.id}`)).catch(error => {
        console.error("AK5e | Pioneer Aura Incapacitated", error);
        globalThis.ui?.notifications?.error?.(error.message);
      });
    });
    // Moving a token never changes effects by itself; it only warns that a creature left (or re-entered) the Aura.
    Hooks.on("updateToken", (token, change) => {
      if (!["x", "y", "elevation"].some(key => key in (change ?? {}))) return;
      try { warnRangeChanges(token); } catch (error) { console.error("AK5e | Pioneer Aura range check", error); }
    });
  }
}
const rangeState = new Map();
function warnRangeChanges(moved) {
  const scene = moved.parent;
  for (const sourceToken of list(scene?.tokens)) {
    const actor = sourceToken.actor;
    if (!actor?.isOwner || vanguardProfile(actor).branchId !== BRANCH) continue;
    const profile = vanguardProfile(actor), radius = profile.level >= 13 ? 30 : 15;
    for (const [id, entry] of pioneerLiveEntries(vanguardUses.state(actor).data)) {
      if (entry.sourceTokenUuid !== moved.uuid && entry.targetTokenUuid !== moved.uuid) continue;
      const from = globalThis.fromUuidSync?.(entry.sourceTokenUuid), to = globalThis.fromUuidSync?.(entry.targetTokenUuid);
      if (!from || !to || to.parent?.id !== from.parent?.id) continue;
      const inside = withinFeet(from.parent, tokenPoint(from), to, radius), key = `${actor.uuid}:${id}`;
      if (rangeState.get(key) === inside) continue;
      rangeState.set(key, inside);
      if (!inside) globalThis.ui?.notifications?.warn?.(`${entry.targetName} left ${actor.name}'s ${radius}-foot Aura of ${entry.aura}. Release it from "Review or release active Aura effects" if it should end.`);
    }
  }
}
