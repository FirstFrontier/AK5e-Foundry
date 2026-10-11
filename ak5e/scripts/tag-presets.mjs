import { CHAPTER_TWO_ORIGINS as ORIGINS } from "./chapter-two-content.mjs";
import { CHAPTER_THREE_CLASSES as CLASSES } from "./chapter-three-content.mjs";
import { CHAPTER_FOUR_EQUIPMENT as EQUIPMENT } from "./chapter-four-content.mjs";
import { CHAPTER_FIVE_ARTS as ARTS } from "./chapter-five-content.mjs";

const flag = (doc, key) => doc?.getFlag?.("ak5e", key) ?? doc?.flags?.ak5e?.[key];
const change = (key, value, mode = 2) => ({ key, mode, value: String(value), priority: 20 });
const time = seconds => ({ trigger: "time", seconds });
const nextEnd = (expiryActor = "target") => ({ trigger: "nextTurnEnd", expiryActor });
const presets = [];
function add(chapter, heading, id, label, options = {}) {
  presets.push({ chapter, heading, id, label, target: "actor", trigger: "manual", sourceDeletion: "retain", ...options });
}
const replace = (family, scope = "target") => ({ family, scope });
const condition = id => ({ condition: id });
const dazed = condition("ak5e-dazed");
const frozen = condition("ak5e-frozen");
const necrotised = condition("ak5e-necrotised");
const nervous = condition("ak5e-nervous-impairment");

// These profiles are deliberately explicit. Instantaneous Art headers do not
// describe the lifetime of their lasting consequences. Saves, actions, damage,
// range, rolls and costs are confirmed by the player/GM, never inferred from HP.
add(5, "Burden", "burden", "Burden: reduced Speed", { ...nextEnd(), speed: -10 });
add(5, "Galvanise", "galvanise", "Galvanise", { ...time(600), concentration: true, speed: 10,
  changes: [change("system.bonuses.mwak.damage", "1d6[lightning]")] });
add(5, "Inflict Doom", "doom", "Doomed", { ...time(60), concentration: true, parameter: "doom" });
add(5, "Lacerate", "lacerate", "Lacerate: Bleeding", { ...time(60), ...condition("ak5e-bleeding"), actions: ["save", "medicine"],
  instructions: "Bleeding cannot be removed by restoring HP. Resolve the Constitution save at turn start and Bleeding HP loss manually, including upcasting. Medicine removal follows the Bleeding condition." });
add(5, "Wither", "wither", "Withered", { ...time(60), concentration: true, actions: ["save"],
  instructions: "Resolve 2d8 Necrotic Damage at turn start and the Constitution save at turn end. Retargeting after 0 HP requires the caster's Bonus Action; apply the new tag only after resolving it." });
add(5, "Power Word Silence", "silence", "Power Word Silence: Silenced", { ...condition("ak5e-silenced"), hpMaximum: 60, actions: ["save"] });
add(5, "Power Word Silence", "silence-dazed", "Power Word Silence: Dazed (above 60 HP)", { ...nextEnd(), ...dazed, hpMinimum: 61 });
add(5, "Power Word Stop", "stop", "Power Word Stop: frozen in time", { ...time(3600), concentration: true, hpMaximum: 100,
  ...condition("incapacitated"), speedZero: true, actions: ["save"],
  instructions: "Resolve immobility, prevention of Actions/Bonus Actions/Reactions and immunity to all Damage manually; this is not the Frozen condition." });
add(5, "Power Word Stop", "stop-speed", "Power Word Stop: Speed 0 (above 100 HP)", { ...nextEnd(), speedZero: true, hpMinimum: 101 });
add(5, "Power Word Stupefy", "stupefy", "Power Word Stupefy", { ...time(60), concentration: true, hpMaximum: 60,
  changes: [change("system.attributes.ac.bonus", -2)], instructions: "No Reactions and Disadvantage on all Attack Rolls. Resolve these restrictions manually." });
add(5, "Power Word Despair", "despair", "Power Word Despair: next mental save", { actions: ["used"],
  instructions: "Disadvantage on the next Intelligence, Wisdom or Charisma Saving Throw only. Confirm Used after that roll; there is no stated time limit." });
add(5, "Power Word Bleed", "bleed", "Power Word Bleed: Bleeding", { ...condition("ak5e-bleeding"), actions: ["healed", "medicine"] });
add(5, "Power Word Kneel", "kneel", "Power Word Kneel: Prone", { ...nextEnd(), ...condition("prone"), parameter: "castLevel",
  instructions: "Apply only to creatures within the cone with HP at or below 20 + 10 per casting level above 2." });
add(5, "Power Word Push", "push", "Power Word Push: reduced Speed", { ...nextEnd(), speed: -10 });
for (const [heading, type] of [["Protect from Cold", "cold"], ["Protect from Heat", "fire"]]) {
  add(5, heading, `protect-${type}`, heading, { ...time(3600), concentration: true,
    changes: [change("system.traits.dr.value", type)], actions: ["damage"],
    instructions: `After this creature takes an instance of ${type} Damage, confirm Matching damage to end its protection. Other recipients remain protected.` });
}
add(5, "Missile Barrier", "motes", "Missile Barrier: motes", { ...time(600), parameter: "castLevel", counter: "motes",
  instructions: "After being hit by a visible Attack, expend the chosen number of motes and resolve the Reaction and Damage reduction: 1d4+1 per mote." });
add(5, "Produce Acid", "acid-ready", "Produce Acid: held acid", { ...time(600), replacement: replace("produce-acid", "source"), actions: ["used"],
  instructions: "Confirm Used after attacking or melting an object; Remove also dismisses it. Recasting replaces the old held acid." });
add(5, "Acid Douse", "acid-douse", "Acid Douse", { ...time(60), replacement: replace("acid-douse"),
  instructions: "Resolve the extra 1d8 Acid Damage and Disadvantage on saves against acid-dealing effects manually." });
add(5, "Snap Freeze", "snap-freeze", "Snap Freeze: Frozen", { ...frozen, actions: ["action"] });
add(5, "Corrode", "corrode", "Corrode: Corroded", { ...condition("ak5e-corroded"), actions: ["save"] });
add(5, "Rust", "rust", "Rust: weapon degradation", { target: "weapon", changes: [change("system.damage.base.bonus", -1), change("system.damage.versatile.bonus", -1)], actions: ["repaired"],
  instructions: "Each application reduces weapon Damage by 1. Five Rust reductions break the weapon until repaired. Remove ALL Rust tags after repair; enforce the broken weapon restriction manually." });
add(5, "Bloodline", "bloodline", "Bloodline", { ...time(600), concentration: true,
  instructions: "Resolve voluntary HP transfers, Bonus Actions, Blood Amber and the limits on current HP manually." });
add(5, "Unstable Plasma", "plasma", "Unstable Plasma", { ...time(60), concentration: true,
  instructions: "Once per Turn, a melee hit can deal 1d10 extra Damage. Record and resolve the resulting 1d10 HP loss at THAT turn's end even if the Art ends first; Blood Amber may prevent it." });
add(5, "Tug the Heartstrings", "heartstrings", "Tug the Heartstrings: controlled", { ...time(600), concentration: true, actions: ["save"],
  instructions: "Control is manual: no Arts and Disadvantage on Attack Rolls. Repeat the save at turn end or immediately before an immediately harmful action." });
add(5, "Tug the Heartstrings", "heartstrings-dazed", "Tug the Heartstrings: initial save succeeded", { ...nextEnd(), ...dazed });

add(4, "Alcohol", "alcohol", "Alcohol", { ...time(3600), changes: [
  change("system.abilities.dex.bonuses.check", -1), change("system.abilities.dex.bonuses.save", -1),
  change("system.abilities.cha.bonuses.check", 1), change("system.abilities.wis.bonuses.save", 1)],
  instructions: "Apply the Dexterity and Charisma modifiers to checks using those abilities, including skills and tools; review the selected ability when making the roll." });
add(4, "Painkillers", "painkillers", "Painkillers", { ...time(3600), hpMissing: true,
  changes: [change("system.attributes.death.bonuses.save", 2)], instructions: "Apply 2 DR against all Damage manually. Consumption requires missing HP." });
for (const heading of ["Cytotoxin", "Haemotoxin", "Necrotoxin", "Neurotoxin"]) {
  add(4, heading, `${heading.toLowerCase()}-coating`, `${heading}: weapon coating`, { ...time(600), target: "weapon", replacement: replace("toxin-coating"),
    instructions: heading === "Cytotoxin" ? "The weapon deals an additional 1d6 Poison Damage on hit. Add this Damage manually." :
      "Resolve the first hit each Turn, Constitution save and Damage manually. Apply the separate target-effect profile only when the rules grant a condition." });
}
add(4, "Cytotoxin", "cytotoxin-ingested", "Cytotoxin: ingested, failed save", { ...condition("paralyzed"), actions: ["save", "antidote"],
  instructions: "DC18 Constitution: resolve 2d6 Poison Damage at turn start; repeat the save at turn end. An initially successful save deals immediate Damage only: do not apply this tag." });
for (const [heading, status] of [["Necrotoxin", necrotised], ["Neurotoxin", nervous]]) {
  add(4, heading, `${heading.toLowerCase()}-hit`, `${heading}: weapon hit, failed save`, { ...nextEnd(), ...status, actions: ["antidote"] });
  add(4, heading, `${heading.toLowerCase()}-ingested-fail`, `${heading}: ingested, failed save`, { trigger: "longRest", ...status, actions: ["antidote"] });
  add(4, heading, `${heading.toLowerCase()}-ingested-success`, `${heading}: ingested, successful save`, { ...time(600), ...status, actions: ["antidote"] });
}
add(4, "Banshee's Kiss", "jealousy", "Banshee's Kiss: Jealousy", { trigger: "turnEnd", ...condition("charmed"),
  instructions: "The aggressor is charmed by the necklace until the end of their Turn. Resolve 4d8 Psychic Damage separately." });
add(4, "The Black Lock and The White Key", "chronology", "Key of Chronology: failed save", { ...nextEnd(), halfSpeed: true });
add(4, "The Black Lock and The White Key", "shattered-time", "Lock of Shattered Time", { ...condition("stunned"), actions: ["save"],
  instructions: "Cannot take Damage, gain temporary HP or regain HP. Repeat the Charisma save at turn end. There is no stated maximum duration; enforce HP restrictions manually." });
add(4, "The Black Lock and The White Key", "acceleration", "Subjective Time Acceleration", { ...nextEnd(), speed: 10,
  instructions: "Grant 1d4 Skill Points separately and resolve the staff's shared charge cost manually." });
add(4, "Fearless Blade", "oath", "Oath of Moment", { actions: ["moved"],
  instructions: "End only after willingly moving over 10 feet from the oath's location. Resolve the extra melee weapon die and PB DR against Damage originating over 10 feet away manually. Forced movement is not this expiry trigger." });
add(4, "Blacksteel", "thunder-recovery", "Stroke of Thunder: next-turn restriction", { ...nextEnd("source"),
  instructions: "You cannot attack using Blacksteel during your next Turn. This tag records that restriction; the six Attacks and Short Rest use recovery are separate." });
add(4, "Maintenance Kit", "maintained-attack", "Maintain Weapon: Attack +1", { target: "weapon", changes: [change("activities[attack].attack.bonus", 1)], replacement: replace("maintain-weapon"), actions: ["fightEnd"],
  instructions: "Remove at the end of a fight in which this weapon made an Attack. Other combats do not remove this benefit." });
add(4, "Maintenance Kit", "maintained-damage", "Maintain Weapon: Damage +1", { target: "weapon", changes: [change("system.damage.base.bonus", 1), change("system.damage.versatile.bonus", 1)], replacement: replace("maintain-weapon"), actions: ["fightEnd"] });
add(4, "Maintenance Kit", "maintained-range", "Maintain Weapon: Range +50%", { target: "weapon", replacement: replace("maintain-weapon"), actions: ["fightEnd"],
  instructions: "Increase the weapon's Range Property by 50% manually in the native effect editor; remove at the end of a fight in which it made an Attack." });

add(2, "Birds of a Feather", "flock", "Flock membership", { replacement: replace("flock"), counter: "flock", sourceDeletion: "remove",
  instructions: "A feather gift on finishing a Long Rest grants membership. Birds of Prey and Nestmakers each recover on Short Rest. Resolve benefit rolls and healing manually." });
add(2, "Xue Wu Zhi Jing", "treatise", "Studied Treatise", { target: "self", parameter: "treatise", replacement: replace("studied-treatise", "source"), sourceDeletion: "remove",
  instructions: "Study a Treatise you have written as a Long Rest Activity. The selected feature includes its negative effects. Resolve prerequisites, writing cost, native effects and longer-lasting benefits only while this Treatise is studied." });
add(2, "Cognitovore", "probe", "Cognitovore: deep probe", { ...time(60), replacement: replace("cognitovore-probe", "source"), actions: ["save"],
  instructions: "Confirm eligibility, failed Intelligence save and surface-thought prerequisites. Repeat the save at turn end. Apply only one probe; source eligibility and thought reading are manual." });
add(2, "Cognitovore", "probe-gentle", "Cognitovore: gentle probe", { ...time(60), replacement: replace("cognitovore-probe", "source"), actions: ["save"],
  instructions: "The recipient receives Heroism while probed; use the native Heroism rules to resolve its benefits. A successful repeated save ends both probing and Heroism." });
add(2, "Cognitovore", "probe-rough", "Cognitovore: rough probe", { ...time(60), ...dazed, replacement: replace("cognitovore-probe", "source"), actions: ["save"] });

/** Resolve provenance, never opt in a stock item just because its name matches. */
export function tagSourceRecord(item) {
  for (const [chapter, records, key] of [[2, ORIGINS, "chapterTwoId"], [3, CLASSES, "chapterThreeId"], [4, EQUIPMENT, "chapterFourId"], [5, ARTS, "chapterFiveId"]]) {
    const record = records.find(record => record.id === flag(item, key));
    if (record) return { chapter, record };
  }
  const borrowed = flag(item, "borrowedFeatureId");
  if (borrowed && flag(item, "temporaryTag")?.preset === "treatise") {
    const record = ORIGINS.find(record => record.id === borrowed);
    if (record) return { chapter: 2, record };
  }
  const grant = flag(item, "originGrant");
  if (grant) {
    const parent = ORIGINS.find(record => record.id === grant.originId);
    const record = parent?.kind === "species" ? ORIGINS.find(record => record.kind === "species-feature" &&
      [parent.name, parent.parent].includes(record.parent) &&
      (record.name === item.name || record.sourceHeading === flag(item, "sourceHeading"))) : null;
    if (record) return { chapter: 2, record };
  }
  return null;
}

export function sourceTagPresets(item) {
  if (!item.flags?.ak5e || flag(item, "temporaryTag") && flag(item, "temporaryTag").preset !== "treatise") return [];
  const source = tagSourceRecord(item);
  if (!source) return [];
  return presets.filter(preset => preset.chapter === source.chapter &&
    [source.record.name, source.record.sourceHeading, source.record.name?.replace(/^(Gear|Toolkit) Rule: /, "")].includes(preset.heading));
}

export function tagRulesHtml(item) {
  const source = tagSourceRecord(item);
  if (source?.chapter === 4 && ["loot", "tool"].includes(source.record.kind)) {
    const rule = EQUIPMENT.find(record => record.kind === (source.record.kind === "loot" ? "gear-rule" : "tool-rule") &&
      record.sourceHeading === source.record.name);
    if (rule) return rule.content;
  }
  return source?.record.content ?? item.system?.description?.value ?? "";
}

export function treatiseFeatures() {
  // The exporter preserves species order but has no rarity field. Abyssal
  // Hunter is the first heading after the source's Rare Species section.
  const common = new Map(ORIGINS.slice(0, ORIGINS.findIndex(record => record.id === "species-abyssal-hunter"))
    .filter(record => ["species", "subspecies"].includes(record.kind)).map(record => [record.name, record]));
  return ORIGINS.filter(record => record.kind === "species-feature" && common.has(record.parent) &&
    record.sourceHeading !== "Ancient Versatility" && !/Cling to the World/.test(common.get(record.parent).rawSource));
}

export function presetTagOptions(preset, source, target, parameters = {}) {
  const targetActor = target.documentName === "Item" ? target.parent : target;
  if (preset.target === "weapon" && (target.documentName !== "Item" || target.type !== "weapon")) throw new Error("Select an embedded weapon as the target.");
  if (preset.target !== "weapon" && target.documentName !== "Actor") throw new Error("Select a creature as the target.");
  if (preset.target === "self" && target.uuid !== source.uuid) throw new Error("This profile applies to the source creature.");
  const hp = targetActor.system?.attributes?.hp;
  if (preset.hpMaximum !== undefined && !(hp?.value <= preset.hpMaximum) || preset.hpMinimum !== undefined && !(hp?.value >= preset.hpMinimum) ||
      preset.hpMissing && !(hp?.value < hp?.max)) throw new Error("The target does not meet this profile's current HP requirement.");
  const options = { label: preset.label, trigger: preset.trigger, seconds: preset.seconds, expiryActor: preset.expiryActor,
    sourceDeletion: preset.sourceDeletion, condition: preset.condition, replacement: preset.replacement, preset: preset.id,
    instructions: preset.instructions ?? "Resolve the source's range, prerequisites, costs, rolls and conditional benefits manually.", actions: preset.actions ?? [], changes: structuredClone(preset.changes ?? []) };
  for (const [key, speed] of Object.entries(targetActor.system?.attributes?.movement ?? {})) {
    if (!["walk", "fly", "swim", "climb", "burrow"].includes(key) || !Number.isFinite(speed) || speed <= 0) continue;
    if (preset.speed) options.changes.push(change(`system.attributes.movement.${key}`, Math.max(-speed, preset.speed)));
    if (preset.halfSpeed) options.changes.push(change(`system.attributes.movement.${key}`, 0.5, 1));
    if (preset.speedZero) options.changes.push(change(`system.attributes.movement.${key}`, 0, 5));
  }
  if (preset.parameter === "doom") {
    if (!["str", "dex", "con", "int", "wis", "cha"].includes(parameters.ability) || !Object.hasOwn(CONFIG.DND5E.damageTypes, parameters.damageType))
      throw new Error("Choose a saving throw and damage type.");
    options.changes.push(change("system.traits.dv.value", parameters.damageType));
    options.instructions = `Disadvantage on ${parameters.ability.toUpperCase()} Saving Throws. ${options.instructions}`;
  }
  if (preset.counter === "motes") {
    const castLevel = Number(parameters.castLevel ?? 3);
    if (!Number.isInteger(castLevel) || castLevel < 3 || castLevel > 9) throw new Error("Missile Barrier casting level must be 3–9.");
    const max = 8 + 2 * (castLevel - 3);
    options.counters = { motes: { label: "Motes", max, value: max } };
  }
  if (preset.id === "kneel") {
    const castLevel = Number(parameters.castLevel ?? 2);
    if (!Number.isInteger(castLevel) || castLevel < 2 || castLevel > 9 || !(hp?.value <= 20 + 10 * (castLevel - 2)))
      throw new Error("Choose a valid casting level and a creature within Power Word Kneel's HP threshold.");
  }
  if (preset.counter === "flock") {
    options.counters = { prey: { label: "Birds of Prey", max: 1, value: 1, recovery: "sr" }, nest: { label: "Nestmakers", max: 1, value: 1, recovery: "sr" } };
  }
  if (preset.parameter === "treatise") {
    const record = treatiseFeatures().find(record => record.id === parameters.featureId);
    if (!record || !parameters.writtenConfirmed || !parameters.eligibleConfirmed) throw new Error("Select a common-species feature, confirm it grants no Arts, and confirm its Treatise has been written.");
    options.label = `Studied Treatise: ${record.name}`;
    options.benefit = { name: record.name, type: "feat", system: { ...structuredClone(record.systemData), description: { value: record.content }, advancement: [] },
      flags: { ak5e: { borrowedFeatureId: record.id, sourceHeading: record.sourceHeading, rawSource: record.rawSource } } };
  }
  return options;
}

export const TAG_PRESETS = Object.freeze(presets.map(preset => Object.freeze(preset)));
