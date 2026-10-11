import { worldRulesEnabled } from "./world-rule-state.mjs";

const pending = new WeakSet();
const pendingActors = new Set();
const completed = new Map();
const patchedRolls = new WeakSet();
const patchedConfigs = new WeakSet();

export function cantripTurnKey(actor) {
  const combat = game.combat;
  if (!combat || combat.combatant?.actor?.uuid !== actor?.uuid) return null;
  return `${combat.id}:${combat.round}:${combat.turn}:${actor.uuid}`;
}

export function cantripBonus(actor, activity) {
  if (!worldRulesEnabled() || activity?.item?.type !== "spell" || Number(activity.item.system.level) !== 0) return null;
  const key = cantripTurnKey(actor);
  if (!key || completed.get(actor.uuid) === key || actor.getFlag?.("ak5e", "cantripDamageTurn") === key || pendingActors.has(actor.uuid)) return null;
  const ability = actor.getFlag?.("ak5e", "casting")?.ability ?? actor.system.attributes?.spellcasting;
  const modifier = Number(actor.system.abilities?.[ability]?.mod);
  return Number.isFinite(modifier) ? { key, modifier } : null;
}

export function patchCantripDamage() {
  const types = Object.values(CONFIG.DND5E?.activityTypes ?? {});
  for (const type of types) {
    for (let prototype = type.documentClass?.prototype; prototype; prototype = Object.getPrototypeOf(prototype)) {
      if (Object.hasOwn(prototype, "getDamageConfig") && Object.hasOwn(prototype, "_processDamagePart") && !patchedConfigs.has(prototype)) {
        const original = prototype.getDamageConfig;
        prototype.getDamageConfig = function(...args) {
          const config = original.apply(this, args);
          if (pending.has(this) && config.rolls?.[0]?.parts?.length) {
            const ability = this.actor.getFlag?.("ak5e", "casting")?.ability ?? this.actor.system.attributes?.spellcasting;
            const modifier = Number(this.actor.system.abilities?.[ability]?.mod);
            if (Number.isFinite(modifier) && modifier !== 0) config.rolls[0].parts.push(String(modifier));
          }
          return config;
        };
        patchedConfigs.add(prototype);
      }
      if (Object.hasOwn(prototype, "rollDamage") && !patchedRolls.has(prototype)) {
        const original = prototype.rollDamage;
        prototype.rollDamage = async function(...args) {
          const bonus = cantripBonus(this.actor, this);
          if (!bonus) return original.apply(this, args);
          pending.add(this); pendingActors.add(this.actor.uuid);
          try {
            const rolls = await original.apply(this, args);
            if (rolls?.length) {
              completed.set(this.actor.uuid, bonus.key);
              try { await this.actor.setFlag("ak5e", "cantripDamageTurn", bonus.key); }
              catch (error) { console.error("AK5e | Could not persist cantrip damage turn", error); }
            }
            return rolls;
          } finally { pending.delete(this); pendingActors.delete(this.actor.uuid); }
        };
        patchedRolls.add(prototype);
      }
    }
  }
}
