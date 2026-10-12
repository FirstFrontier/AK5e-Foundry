/** Arts Master ownership, source statistics and explicit commands. C3:554–650. */
import { CHAPTER_THREE_CLASSES } from "./chapter-three-content.mjs";
import { casterLevel, casterBranch, casterState } from "./caster-rules.mjs";
import { casterEnabled } from "./caster-casting.mjs";
import { artsState } from "./arts-rules.mjs";
import { flag, values, need, keyedSerial, esc } from "./operation-kernel.mjs";
import { distanceFeet, tokenPoint } from "./standard-bearer-rules.mjs";
import { requireOverrides } from "./play-undo.mjs";
import { mechReading, droneRequestWarnings } from "./caster-mech.mjs";
const serial = keyedSerial(), overriddenAttempts = new WeakMap();
export const DRONE_SOURCE_ID = "class-summon-caster-mech-accord-arts-master-drone";
/** Source statistics from the creator. The Technology Modifier is a GM ruling, otherwise the player's reading for this use. */
export function droneStatistics(actor, technologyModifier) {
  const policy = technologyModifier ?? mechReading(actor, "technologyModifier").value;
  need(["techTotal", "intMod"].includes(policy), "Choose how the Technology Modifier is read for Arts Master HP.");
  const tech = policy === "techTotal" ? Number(actor.system.skills?.ak5etech?.total) : Number(actor.system.abilities?.int?.mod);
  const ability = artsState(actor).ability, modifier = Number(actor.system.abilities?.[ability]?.mod), pb = Number(actor.system.attributes?.prof);
  const attack = Number(actor.system.attributes?.spell?.attack ?? actor.system.abilities?.[ability]?.mod + pb)
    + Number(actor.system.bonuses?.rsak?.attack || 0);
  need([tech, modifier, pb, attack].every(Number.isFinite), "Review creator Technology, spell attack and ability values before synchronizing the drone.");
  need(25 + tech > 0, "The reviewed Technology Modifier must produce positive drone HP.");
  return { hp: 25 + tech, modifier, pb, attack };
}
export function sparkData(stats) {
  const entry = CHAPTER_THREE_CLASSES.find(e => e.id === DRONE_SOURCE_ID);
  return { name: "Originium Spark", type: "feat", img: "icons/svg/lightning.svg",
    system: { description: { value: entry?.content ?? "", chat: "" }, activities: { ak5eSparkAttack1: {
      _id: "ak5eSparkAttack1", type: "attack", name: "Originium Spark", activation: { type: "action", value: 1 },
      attack: { ability: "none", flat: true, bonus: String(stats.attack), type: { value: "ranged", classification: "weapon" } },
      range: { override: true, value: 30, long: 100, units: "ft" }, target: { affects: { type: "creature", count: "1" } },
      damage: { parts: [{ number: 2, denomination: 4, bonus: String(stats.modifier), types: ["force"] }] }, consumption: { targets: [] }
    } } }, flags: { ak5e: { artsMasterSpark: true, sourceHeading: "Originium Spark", sourceFile: "03_chapter_3_character_classes.txt" } } };
}
export function droneData(actor, operationId, technologyModifier) {
  const stats = droneStatistics(actor, technologyModifier), entry = CHAPTER_THREE_CLASSES.find(e => e.id === DRONE_SOURCE_ID);
  return { name: `${actor.name} — Arts Master`, type: "npc", img: "icons/svg/wing.svg", ownership: { ...actor.ownership },
    prototypeToken: { actorLink: true, name: "Arts Master", width: 1, height: 1 },
    system: { abilities: Object.fromEntries([ ["str",10], ["dex",14], ["con",14], ["int",1], ["wis",4], ["cha",1] ].map(([k,value]) => [k,{value}])),
      attributes: { ac: { flat: 17, calc: "flat" }, hp: { value: stats.hp, max: stats.hp }, movement: { fly: 30, hover: true }, senses: { ranges: { darkvision: 60 } } },
      details: { type: { value: "construct", subtype: "Drone" }, alignment: "Neutral", cr: 0, biography: { value: entry.content, public: entry.content } },
      // The source explicitly prints passive Perception 6. Its Wisdom score 4
      // derives -3 natively, while the printed modifier is -4 (see decisions).
      skills: { prc: { ability: "wis", value: 0, bonuses: { passive: "-1" } } },
      traits: { size: "sm", di: { value: ["poison","necrotic"] }, ci: { value: ["charmed","frightened","poisoned","ak5e-necrotised","ak5e-nervous-impairment"] } } },
    items: [sparkData(stats), { name: "Wolfpack Doctrine", type: "feat", img: "icons/svg/lightning.svg", system: { description: { value: "When the creator casts an Art, use the creator's Mech-Accord controls to confirm this drone's Reaction and make one Originium Spark against a Creature it can see. The drone acts during its creator's Turn; command action economy and Arts-Linked vision are manual.", chat: "" } }, flags: { ak5e: { artsMasterReaction: true } } }],
    effects: [{ name: "Creator proficiency", changes: [{ key: "system.attributes.prof", mode: 5, value: String(stats.pb) }], flags: { ak5e: { artsMasterStats: true } } }],
    flags: { ak5e: { artsMaster: { creatorUuid: actor.uuid, operationId, stats, destroyed: false, reactionTurn: null }, sourceFile: "03_chapter_3_character_classes.txt", sourceHeading: "Arts Master Drone", rawSource: entry.rawSource } } };
}
function member(actor) { need(actor.isOwner && casterState(actor).enabled && casterBranch(actor) === "mech-accord", "Choose an owned, configured Mech-Accord Caster."); }
/**
 * GM-client creation of a World Actor (and token). Owners request it with `requestCasterDrone` (caster-mech.mjs), which
 * relays to the active GM. The source cap is a warning the owner may override (WORKFLOW.md §3.2).
 */
export async function createCasterDrone(actor, data = {}) {
  if (!data.managedRequest) {
    const { requestCasterDrone } = await import("./caster-mech.mjs");
    return requestCasterDrone(actor, "create", data);
  }
  member(actor); need(game.user.isGM, "Only the GM can create or place Arts Master Actors; owners request one from the Caster panel.");
  need(game.users?.activeGM?.id === game.user.id, "Only the elected GM client may create or place Arts Master Actors.");
  need(data.confirmed === true, "Confirm the drone creation preview.");
  const id = data.operationId ?? foundry.utils.randomID();
  return serial(actor, async () => {
    const state = casterState(actor), existing = values(game.actors).find(a => flag(a, "artsMaster")?.creatorUuid === actor.uuid && flag(a, "artsMaster")?.operationId === id);
    if (!existing) requireOverrides(droneRequestWarnings(actor, "create"), data.overrides);
    if (data.sceneId) { need(game.scenes.get(data.sceneId), "Choose a Scene for placement."); need([Number(data.x),Number(data.y)].every(Number.isFinite), "Choose a finite map position."); }
    const created = !existing;
    const drone = existing ?? await Actor.implementation.create(droneData(actor, id, data.technologyModifier));
    need(drone, "The drone could not be created.");
    if (created) await data.onActorCreated?.(drone);
    if (!state.drones.includes(drone.uuid)) { state.drones.push(drone.uuid); await actor.update({ "flags.ak5e.caster.drones": state.drones }); }
    if (data.sceneId) {
      const scene = game.scenes.get(data.sceneId); need(scene, "Choose a Scene for placement.");
      const present = values(scene.tokens).find(t => t.actorId === drone.id);
      if (!present) {
        const position = { x: Number(data.x), y: Number(data.y) }; need(Object.values(position).every(Number.isFinite), "Choose a finite map position.");
        const doc = await drone.getTokenDocument(position), tokenData = doc.toObject();
        tokenData.flags = { ...tokenData.flags, ak5e: { ...tokenData.flags?.ak5e, artsMasterOperationId: id } };
        const createdTokens = await scene.createEmbeddedDocuments("Token", [tokenData]);
        for (const token of createdTokens ?? []) await data.onTokenCreated?.(token);
      }
    }
    return drone;
  });
}
export async function linkCasterDrone(actor, droneUuid, confirmed = false, options = {}) {
  const { overrides, managedRequest = false } = options;
  if (!managedRequest) {
    const { requestCasterDrone } = await import("./caster-mech.mjs");
    return requestCasterDrone(actor, "link", { confirmed, droneUuid, overrides });
  }
  member(actor); need(game.user.isGM && confirmed, "Only the GM can confirm linking an existing Arts Master; owners request it from the Caster panel.");
  need(game.users?.activeGM?.id === game.user.id, "Only the elected GM client may link an Arts Master.");
  return serial(actor, async () => {
    const state = casterState(actor), drone = await fromUuid(droneUuid);
    need(drone?.documentName === "Actor" && flag(drone, "artsMaster")?.creatorUuid === actor.uuid, "Choose an existing Arts Master belonging to this creator.");
    if (state.drones.includes(droneUuid)) return drone;
    requireOverrides(droneRequestWarnings(actor, "link", { droneUuid }), overrides);
    state.drones.push(droneUuid); await actor.update({ "flags.ak5e.caster.drones": state.drones }); return drone;
  });
}
export function linkedDrone(actor, uuid) {
  const drone = fromUuidSync(uuid), actorDoc = drone?.documentName === "Token" ? drone.actor : drone;
  need(actorDoc && casterState(actor).drones.includes(actorDoc.uuid) && flag(actorDoc, "artsMaster")?.creatorUuid === actor.uuid, "Choose this creator's linked Arts Master.");
  need(actorDoc.isOwner, "Own the Arts Master to operate its sheet.");
  return actorDoc;
}
export function droneInRange(actor, tokenUuid, feet = 100) {
  const drone = fromUuidSync(tokenUuid); need(drone?.documentName === "Token", "Choose a placed Arts Master."); linkedDrone(actor, tokenUuid);
  const sources = actor.getActiveTokens(true, true).map(t => t.document ?? t).filter(t => t.parent?.id === drone.parent?.id);
  need(sources.some(t => distanceFeet(t.parent, tokenPoint(t), tokenPoint(drone)) <= feet + 1e-6), `The Arts Master must be within ${feet} feet of its creator.`);
  return drone;
}
export async function syncCasterDrones(actor, { reading } = {}) {
  member(actor); const stats = droneStatistics(actor, mechReading(actor, "technologyModifier", reading).value), changes = [];
  for (const uuid of casterState(actor).drones) {
    const drone = linkedDrone(actor, uuid), previous = flag(drone, "artsMaster"), spark = values(drone.items).find(i => flag(i, "artsMasterSpark"));
    if (spark) {
      const activity = values(spark.system.activities).find(a => a.id === "ak5eSparkAttack1");
      // Only overwrite previously managed scalar values, never authored activity data.
      const update = {};
      if (activity?.attack.bonus === String(previous.stats.attack)) update[`system.activities.${activity.id}.attack.bonus`] = String(stats.attack);
      if (activity?.damage.parts[0]?.bonus === String(previous.stats.modifier)) {
        const parts = activity.damage.parts.map(p => p.toObject?.() ?? structuredClone(p)); parts[0].bonus = String(stats.modifier);
        update[`system.activities.${activity.id}.damage.parts`] = parts;
      }
      if (Object.keys(update).length) await spark.update(update);
    }
    const update = { "flags.ak5e.artsMaster.stats": stats };
    if (drone.system.attributes.hp.max === previous.stats.hp) update["system.attributes.hp.max"] = stats.hp;
    const effect = values(drone.effects).find(e => flag(e, "artsMasterStats"));
    if (effect && effect.changes[0]?.value === String(previous.stats.pb)) await effect.update({ changes: [{ key: "system.attributes.prof", mode: 5, value: String(stats.pb) }] });
    await drone.update(update); changes.push(uuid);
  }
  return changes;
}
/** Source problems with an Originium Spark use; each is a warning the owner may override. */
export function droneAttackProblems(drone) {
  const creator = fromUuidSync(flag(drone, "artsMaster")?.creatorUuid), problems = [];
  if (!creator || !casterEnabled(creator) || casterBranch(creator) !== "mech-accord") return ["Its creator is not a configured Mech-Accord Caster."];
  const index = casterState(creator).drones.indexOf(drone.uuid);
  if (index < 0) problems.push("It is not linked to its creator.");
  else if (index >= (casterLevel(creator) >= 10 ? 2 : 1)) problems.push("It is beyond its creator's Arts Master cap.");
  if (droneAttackLocked(creator, drone)) problems.push("Cantrip Duplication prevents its Attacks until its creator's next Turn.");
  if (flag(drone, "artsMaster")?.destroyed || drone.system.attributes.hp.value <= 0) problems.push("It is destroyed (0 Hit Points).");
  return problems;
}
function consumeOverride(activity, stage, token) {
  if (!token) return false;
  const stages = overriddenAttempts.get(activity), expected = stages?.get(stage);
  if (expected !== token) return false;
  stages.delete(stage); if (!stages.size) overriddenAttempts.delete(activity);
  return true;
}
function allowNextAttempt(activity, stage, token) {
  const stages = overriddenAttempts.get(activity) ?? new Map();
  stages.set(stage, token); overriddenAttempts.set(activity, stages);
}
/**
 * Hold the original Originium Spark activity stage while the owner reviews warnings. Continue that same stage once after
 * "Use anyway"; an attack roll resumes rollAttack with its original arguments and never starts a second activity use.
 */
export function droneAttackGate(activity, { stage = "use", args = [] } = {}) {
  if (!flag(activity?.item, "artsMasterSpark")) return;
  const marker = stage === "attack" ? args[0]?.__ak5eDroneResumeToken : args[0]?.__ak5eDroneResumeToken;
  if (consumeOverride(activity, stage, marker)) {
    if (args[0] && typeof args[0] === "object") delete args[0].__ak5eDroneResumeToken;
    return;
  }
  const drone = activity.actor, problems = droneAttackProblems(drone);
  if (!problems.length) return;
  const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
  if (!DialogV2) { globalThis.ui?.notifications?.warn?.(`Arts Master: ${problems.join(" ")}`); return false; }
  Promise.resolve(DialogV2.confirm({ window: { title: `${drone.name}: check before use` },
    content: `<p>The source rules flag the following:</p><ul>${problems.map(text => `<li>${esc(text)}</li>`).join("")}</ul><p>If you use it anyway, these are listed on the public chat card.</p>`,
    yes: { label: "Use anyway" }, no: { label: "Cancel", default: true }, rejectClose: false })).then(async accepted => {
    if (!accepted) return;
    await ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ actor: drone }), content: `<h3>Originium Spark: used anyway</h3><p>${problems.map(esc).join(" ")}</p>` });
    const token = foundry.utils.randomID();
    allowNextAttempt(activity, stage, token);
    if (stage === "attack") {
      need(typeof activity.rollAttack === "function", "The held Originium Spark attack cannot be resumed by this D&D5e activity.");
      const [config, ...rest] = args;
      need(config && typeof config === "object", "The held Originium Spark attack has no roll configuration to resume.");
      // D&D5e appends attack + d20Test inside rollAttack, then buildConfigure appends its generic empty hook name
      // before preRollAttackV2. Remove only that exact native suffix so the resumed call adds it once; clone mutable
      // config/roll arrays to preserve the held arguments for retries.
      const hookNames = [...(config.hookNames ?? [])];
      if (hookNames.slice(-3).join("/") === "attack/d20Test/") hookNames.splice(-3, 3);
      const resumed = { ...config, hookNames, ...(Array.isArray(config.rolls) ? { rolls: [...config.rolls] } : {}), __ak5eDroneResumeToken: token };
      await activity.rollAttack(resumed, ...rest);
    } else {
      need(typeof activity.use === "function", "The held Originium Spark activity cannot be resumed.");
      await activity.use({ ...(args[0] ?? {}), ak5eDroneOverride: true, __ak5eDroneResumeToken: token });
    }
  }).catch(error => console.error("AK5e | Arts Master override", error));
  return false;
}
export function droneAttackLocked(creator,drone) {
  const matches=(node,path=[])=>{
    if(!node||typeof node!=="object")return false;
    if(node.castId||node.turn) {
      const uuid=node.tokenUuid??path.join(".");
      return uuid===drone.uuid||globalThis.fromUuidSync?.(uuid)?.actor?.uuid===drone.uuid;
    }
    return Object.entries(node).some(([key,value])=>matches(value,[...path,key]));
  };
  return matches(casterState(creator).attackLocks??{});
}
