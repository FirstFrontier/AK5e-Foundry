/** Optional Fighting Style actions; dice start only from the owner's card controls. */
import { marksmanUses } from "./marksman-uses.mjs";
import { hasFightingStyle, marksmanState } from "./marksman-rules.mjs";
import { hasWeaponProperty } from "./weapon-properties.mjs";
import { warn } from "./play-uses.mjs";
import { getReactions } from "./trigger-events.mjs";
import { need, values } from "./operation-kernel.mjs";

const cycle = actor => game.combat?.started ? `${game.combat.id}:${game.combat.round}:${game.combat.turn}` : `manual:${marksmanState(actor).manualTurn ?? 0}`;
const targetUuids = data => data.targetUuids ?? (data.targetUuid ? [data.targetUuid] : []);
function weapon(actor, data, warnings, property) {
  const item = data.weaponUuid && globalThis.fromUuidSync?.(data.weaponUuid);
  need(item?.parent?.uuid === actor.uuid && item.type === "weapon", "Choose an owned weapon for this Fighting Style.");
  if (property && !hasWeaponProperty(item, property)) warn(warnings, "property", `This Fighting Style requires the ${property} weapon property.`);
  return item;
}
function style(actor, name, warnings) {
  if (!hasFightingStyle(actor, name)) warn(warnings, "style", "This Fighting Style is not recorded on the character.");
}
export const MARKSMAN_STYLE_PLANS = {
  bracedForAction(actor, _state, data) {
    const warnings = []; style(actor, "bracedForAction", warnings); weapon(actor, data, warnings, "brace");
    const message = globalThis.fromUuidSync?.(data.originMessageUuid);
    need(message?.rolls?.length, "Choose the originating weapon Damage roll.");
    const roll = message.rolls[Number(data.rollIndex ?? 0)], die = roll?.dice?.[Number(data.dieIndex ?? 0)];
    need(die && Number.isSafeInteger(die.faces), "Choose a damage die on the recorded roll.");
    const result = die.results?.[Number(data.resultIndex ?? 0)];
    need(result?.active !== false && Number.isFinite(result?.result), "Choose an active result to reroll.");
    const total = Number(roll.total), type = data.damageType ?? roll.options?.type ?? Array.from(roll.options?.types ?? [])[0];
    need(Number.isFinite(total) && typeof type === "string", "Choose the recorded Damage type.");
    if (marksmanState(actor).bracedForActionTurn === cycle(actor)) warn(warnings, "repeat", "Braced for Action was already used this Turn.");
    return { warnings, title: "Braced for Action", apply(_next, receipt) {
      receipt.summary = `${actor.name} rerolls one recorded ${die.faces}-sided Brace damage die. The new result replaces ${result.result}; use this card's revised Damage instead of applying the original roll twice.`;
      receipt.originMessageUuid = message.uuid;
      receipt.resolution = { version: 1, steps: [{ id: "brace-reroll", kind: "damage", label: "Revised weapon Damage", targetUuids: targetUuids(data),
        damageParts: [{ formula: `1d${die.faces} + ${total - result.result}`, type }],
        consumeUpdates: { "flags.ak5e.marksman.bracedForActionTurn": cycle(actor) } }] };
      receipt.result = { originalTotal: total, replaced: result.result }; return {};
    } };
  },
  coneOfFire(actor, _state, data) {
    const warnings = []; style(actor, "coneOfFire", warnings);
    const item = weapon(actor, data, warnings, "spread");
    if (!data.missConfirmed) warn(warnings, "miss", "Confirm an Attack using Spread missed; choose a different Creature within 5 feet of its original target and inside normal range.");
    const ability = data.attackAbility ?? values(item.system?.activities).find(activity => activity.type === "attack")?.ability ?? "dex";
    const amount = Number(actor.system?.abilities?.[ability]?.mod ?? 0);
    return { warnings, title: "Cone of Fire", apply(_next, receipt) {
      receipt.summary = `${actor.name} applies Spread's additional Piercing Damage after a missed Attack. Confirm the secondary Creature and geometry manually.`;
      receipt.resolution = { version: 1, steps: [{ id: "spread", kind: "damage", label: "Spread additional Damage", targetUuids: targetUuids(data), damageParts: [{ amount: Math.max(0, amount), type: "piercing" }] }] };
      receipt.result = { amount }; return {};
    } };
  },
  defensiveStyle(actor, _state, data) {
    const warnings = []; style(actor, "defensive", warnings);
    const equipped = values(actor.items).some(item => item.system?.equipped && (item.type === "weapon" && /melee/i.test(item.system?.type?.value ?? item.system?.weaponType ?? "") || item.system?.armor?.type === "shield"));
    if (!equipped) warn(warnings, "equipment", "Defensive requires an equipped Melee Weapon or Shield.");
    if (!data.hitConfirmed) warn(warnings, "hit", "Confirm the originating Attack hit you. The AC bonus lasts only for that Attack.");
    if (getReactions(actor).available < 1) warn(warnings, "reaction", "No Reaction remains; the shortfall will be public.");
    return { warnings, title: "Defensive Fighting Style", apply(_next, receipt) {
      receipt.reaction = { requested: true, triggerId: `${receipt.id}-defensive` };
      receipt.originMessageUuid = data.originMessageUuid;
      receipt.summary = `${actor.name} spends a Reaction. Roll 1d4, then Apply the AC bonus and review the triggering Attack. End the AC bonus from its application card after that Attack; ending it does not refund this Reaction.`;
      receipt.resolution = { version: 1, steps: [{ id: "defensive-ac", kind: "effect", label: "AC bonus for the triggering Attack", targetUuids: [actor.uuid], rollFormula: "1d4",
        effectsFromRoll: "defensiveAC", originMessageUuid: data.originMessageUuid }] };
      receipt.result = { reaction: true }; return {};
    } };
  },
  twoWeaponAttack(actor, _state, data) {
    const warnings = []; style(actor, "twoWeaponFighting", warnings); weapon(actor, data, warnings);
    if (!data.triggerConfirmed) warn(warnings, "trigger", "Confirm this is the additional Attack from Two-Weapon Fighting. You may draw or stow two one-handed weapons together.");
    return { warnings, title: "Two-Weapon Fighting", apply(_next, receipt) {
      receipt.summary = `${actor.name} makes the additional Two-Weapon Fighting Attack with its Ability Modifier included in Damage. Draw/stow two one-handed weapons together when permitted.`;
      receipt.weaponUuid = data.weaponUuid;
      receipt.resolution = { version: 1, steps: [{ id: "offhand", kind: "attack", label: "Additional Two-Weapon Attack", targetUuids: targetUuids(data), weaponUuid: data.weaponUuid, activityId: data.activityId, twoWeaponFighting: true }] };
      receipt.result = {}; return {};
    } };
  }
};
marksmanUses.register({ plans: MARKSMAN_STYLE_PLANS });
