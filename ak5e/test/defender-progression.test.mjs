import test from "node:test";
import assert from "node:assert/strict";
import { openDefenderSetup } from "../scripts/defender-progression-sheet.mjs";
import { CHAPTER_THREE_CLASSES } from "../scripts/chapter-three-content.mjs";
import { CHAPTER_FOUR_EQUIPMENT } from "../scripts/chapter-four-content.mjs";
import { applyDefenderProgression, defenderChoices, previewDefenderProgression } from "../scripts/defender-progression.mjs";

const flag = (doc, key) => doc?.flags?.ak5e?.[key];
function setPath(object, path, value) {
  const keys = path.split("."), leaf = keys.pop(); let target = object;
  for (const key of keys) target = target[key] ??= {};
  target[leaf] = structuredClone(value);
}
function doc(entry, type = entry.itemType) {
  const flags = { ak5e: { ...(entry.kind === "subclass" ? { chapterThreeId: entry.id } : { chapterThreeId: entry.id }), classContentKind: entry.kind } };
  if (entry.kind === "class-option") flags.ak5e.classOption = entry.classOption;
  return { id: entry.id, name: entry.name, type, system: { ...(entry.systemData ?? {}), ...(type === "class" ? { levels: 1 } : {}), description: { value: entry.content ?? "" } }, flags,
    getFlag(scope, key) { return this.flags?.[scope]?.[key]; }, toObject() { return structuredClone({ _id: this.id, name: this.name, type: this.type, system: this.system, flags: this.flags }); },
    async update(changes) { for (const [path, value] of Object.entries(changes)) setPath(this, path, value); return this; } };
}
function fixture({ level = 3, branch = "dreadnought", strength = 18, hp = 30 } = {}) {
  const classSource = CHAPTER_THREE_CLASSES.find(entry => entry.id === "class-defender");
  const classItem = doc(classSource, "class"); classItem.system.levels = level;
  const actor = { id: "pc", uuid: "Actor.pc", documentName: "Actor", type: "character", isOwner: true, pack: null,
    _source: { system: { abilities: Object.fromEntries([["str", strength], ["dex", 12], ["con", 16], ["int", 10], ["wis", 10], ["cha", 10]].map(([key, value]) => [key, { value, proficient: 0 }])),
      attributes: { hp: { max: hp, value: 19, temp: 4 }, prof: 2 }, skills: {}, tools: {}, traits: { armorProf: { custom: "Old Armor" }, weaponProf: { custom: "Old Weapons" } }, currency: { cp: 9 } } },
    system: null, flags: { ak5e: {} }, items: new Map([[classItem.id, classItem]]), writes: [], effects: new Map(), createCount: 0,
    getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
    async update(changes) { this.writes.push(structuredClone(changes)); for (const [path, value] of Object.entries(changes)) { if (path.startsWith("flags.")) setPath(this, path, value); else { setPath(this._source, path, value); setPath(this, path, value); } } return this; },
    async createEmbeddedDocuments(type, values) { const docs = values.map((value, index) => { const item = { ...structuredClone(value), id: `item-${++this.createCount}`, type: value.type ?? type,
      getFlag(scope, key) { return this.flags?.[scope]?.[key]; }, toObject() { return structuredClone(this); }, async update(changes) { for (const [path, value] of Object.entries(changes)) setPath(this, path, value); return this; } }; this.items.set(item.id, item); return item; }); return docs; } };
  if (branch) { const branchItem = doc(CHAPTER_THREE_CLASSES.find(entry => entry.id === `subclass-defender-${branch}`), "subclass"); actor.items.set(branchItem.id, branchItem); }
  actor.system = structuredClone(actor._source.system);
  const sourceDocs = [...CHAPTER_THREE_CLASSES, ...CHAPTER_FOUR_EQUIPMENT].map(entry => doc(entry));
  globalThis.game = { user: { id: "gm", isGM: true }, users: { activeGM: { id: "gm" }, get: id => ({ id, isGM: id === "gm" }) }, items: new Map(sourceDocs.map(item => [item.id, item])) };
  globalThis.CONFIG = { DND5E: { armorProficiencies: { lgt: "Light", med: "Medium", hvy: "Heavy", shl: "Shields" }, weaponProficiencies: { sim: "Simple", mar: "Martial" }, tools: { ak5eengineeringkit: { ability: "int" } } } };
  globalThis.foundry = { utils: { randomID: () => "op-1" } };
  return actor;
}
function choices(actor, extras = {}) {
  return {
    branch: actor.items.get("subclass-defender-dreadnought") ? "subclass-defender-dreadnought" : "subclass-defender-artshield",
    saves: ["str"], skills: ["ath", "ak5elore", "ak5etech"], tool: "Engineering Kit",
    startingEquipment: { mode: "items", weaponOrShield: "weapon-sword-6", heavyWeaponOrShield: "weapon-greatsword-9", armour: "equipment-defender-armour-9", toolkit: "tool-engineering-kit-3" },
    talents: {}, asi: {}, hp: {}, ...extras
  };
}

test("choices expose all 42 talents and default prior HP and ASIs to already included", () => {
  const actor = fixture({ level: 13 });
  const result = defenderChoices(actor, { choices: choices(actor) });
  assert.equal(result.applicable, true);
  assert.equal(result.fields.find(field => field.key === "talents.basic").options.length, 21);
  assert.equal(result.fields.find(field => field.key === "talents.advanced").options.length, 21);
  assert.deepEqual(result.choices.hp[1], { mode: "existing" });
  assert.deepEqual(result.choices.asi[4], { mode: "existing" });
});

test("preview performs no writes and reports the selected progression", () => {
  const actor = fixture({ level: 3 });
  const selected = choices(actor, { talents: { basic: "class-option-defender-talent-basic-power-plant" } });
  const plan = previewDefenderProgression(actor, { choices: selected });
  assert.equal(actor.writes.length, 0);
  assert.equal(actor.createCount, 0);
  assert.equal(plan.pending.length, 0);
  assert.ok(plan.createItems.some(item => item.flags.ak5e.chapterThreeId === "class-feature-defender-1st-level-shelter-4476"));
  assert.deepEqual(plan.progression.talentSelections, [{ sourceId: selected.talents.basic, tier: "basic", moduleActive: false }]);
});

test("apply preserves authored resources, existing scores and adds selected feature/equipment Items once", async () => {
  const actor = fixture({ level: 3 });
  const selected = choices(actor, { talents: { basic: "class-option-defender-talent-basic-power-plant" }, hp: { 1: { mode: "fixed", roll: 12 }, 2: { mode: "fixed", roll: 7 }, 3: { mode: "existing" } } });
  const preview = previewDefenderProgression(actor, { choices: selected });
  await applyDefenderProgression(actor, { confirmed: true, contextKey: preview.contextKey, choices: selected, operationId: "apply-once" });
  assert.equal(actor.system.attributes.hp.max, 55); // 12+3, then 7+3; L1 and L2 each add CON.
  assert.equal(actor.system.attributes.hp.value, 19);
  assert.equal(actor.system.attributes.hp.temp, 4);
  assert.equal(actor.system.currency.cp, 9);
  assert.equal(actor.system.traits.armorProf.custom, "Old Armor; All Armour; All Shields");
  assert.equal(actor.system.traits.weaponProf.custom, "Old Weapons; All Melee Weapons");
  assert.deepEqual(actor.system.traits.armorProf.value, ["lgt", "med", "hvy", "shl"]);
  assert.deepEqual(actor.system.traits.weaponProf.value ?? [], []); // D&D5e groups would incorrectly grant ranged proficiency too.
  assert.equal(actor.items.size, 2 + preview.createItems.length);
  const count = actor.items.size, writes = actor.writes.length;
  await applyDefenderProgression(actor, { confirmed: true, contextKey: preview.contextKey, choices: selected, operationId: "apply-once" });
  assert.equal(actor.items.size, count);
  assert.equal(actor.writes.length, writes);
});

test("a missing branch World Item is reconstructed from the exact source record", () => {
  const actor = fixture({ level: 3, branch: null });
  game.items.delete("subclass-defender-artshield");
  const selected = choices(actor, { branch: "subclass-defender-artshield", talents: { basic: "class-option-defender-talent-basic-power-plant" } });
  const plan = previewDefenderProgression(actor, { choices: selected });
  assert.deepEqual(plan.missing, []);
  const branch = plan.createItems.find(item => item.flags?.ak5e?.chapterThreeId === "subclass-defender-artshield");
  assert.equal(branch.name, "Defender: Artshield");
  assert.equal(branch.flags.ak5e.defenderProgressionGrant.kind, "branch");
});

test("stale preview is rejected and a partially interrupted operation resumes by receipts", async () => {
  const actor = fixture({ level: 2 });
  const selected = choices(actor, { startingEquipment: { mode: "cash" }, hp: { 1: { mode: "fixed", roll: 12 }, 2: { mode: "fixed", roll: 7 } } });
  const preview = previewDefenderProgression(actor, { choices: selected });
  actor._source.system.attributes.hp.value = 18;
  await assert.rejects(applyDefenderProgression(actor, { confirmed: true, contextKey: preview.contextKey, choices: selected, operationId: "stale" }), /changed after the preview/);
  const fresh = previewDefenderProgression(actor, { choices: selected });
  const create = actor.createEmbeddedDocuments.bind(actor); let calls = 0;
  actor.createEmbeddedDocuments = async (...args) => { calls += 1; if (calls === 2) throw new Error("simulated interruption"); return create(...args); };
  await assert.rejects(applyDefenderProgression(actor, { confirmed: true, contextKey: fresh.contextKey, choices: selected, operationId: "resume" }), /simulated interruption/);
  assert.equal(actor.system.currency.cp, 1309);
  assert.equal(actor.system.attributes.hp.max, 55);
  actor.createEmbeddedDocuments = create;
  await applyDefenderProgression(actor, { confirmed: true, contextKey: fresh.contextKey, choices: selected, operationId: "resume" });
  assert.equal(actor.system.currency.cp, 1309);
  assert.equal(actor.system.attributes.hp.max, 55);
  assert.equal(actor.getFlag("ak5e", "defenderProgression").hpLevels.length, 2);
});

test("module selection retains the first talent and records exact module state", async () => {
  const actor = fixture({ level: 8 });
  const selected = choices(actor, { talents: { basic: "class-option-defender-talent-basic-power-plant", basicAt8: { mode: "new", sourceId: "class-option-defender-talent-basic-refreshment" } } });
  const plan = previewDefenderProgression(actor, { choices: selected });
  assert.deepEqual(plan.progression.talentSelections, [
    { sourceId: "class-option-defender-talent-basic-power-plant", tier: "basic", moduleActive: false },
    { sourceId: "class-option-defender-talent-basic-refreshment", tier: "basic", moduleActive: false }
  ]);
  await applyDefenderProgression(actor, { confirmed: true, contextKey: plan.contextKey, choices: selected, operationId: "talents" });
  const talentItems = [...actor.items.values()].filter(item => flag(item, "defenderTalent"));
  assert.equal(talentItems.length, 2);
  assert.deepEqual(talentItems.map(item => flag(item, "defenderTalent").sourceId).sort(), ["class-option-defender-talent-basic-power-plant", "class-option-defender-talent-basic-refreshment"].sort());
});

test("ASI uses the base ability score and respects the native cap", () => {
  const actor = fixture({ level: 4, strength: 18 });
  actor.system.abilities.str.value = 24; // A derived Legendary Might score is deliberately not the source score.
  const selected = choices(actor, { talents: { basic: "class-option-defender-talent-basic-power-plant" }, asi: { 4: { increases: [{ ability: "str", amount: 2 }] } } });
  const plan = previewDefenderProgression(actor, { choices: selected });
  assert.ok(plan.writes.some(write => write.path === "system.abilities.str.value" && write.before === 18 && write.after === 20));
  assert.doesNotThrow(() => previewDefenderProgression(actor, { choices: choices(actor, {
    talents: { basic: "class-option-defender-talent-basic-power-plant" }, asi: { 4: { increases: [{ ability: "str", amount: 2 }] } }
  }) }));
});

test("early Module choices and changes to recorded Talent slots are rejected", async () => {
  const low = fixture({ level: 3 });
  assert.throws(() => previewDefenderProgression(low, { choices: choices(low, { talents: {
    basic: "class-option-defender-talent-basic-power-plant",
    basicAt8: { mode: "upgrade", sourceId: "class-option-defender-talent-basic-power-plant" }
  } }) }), /available at level 8/);
  const actor = fixture({ level: 8 });
  const selected = choices(actor, { talents: { basic: "class-option-defender-talent-basic-power-plant",
    basicAt8: { mode: "new", sourceId: "class-option-defender-talent-basic-refreshment" } } });
  const plan = previewDefenderProgression(actor, { choices: selected });
  await applyDefenderProgression(actor, { confirmed: true, choices: plan.choices, contextKey: plan.contextKey, operationId: "lock-talents" });
  assert.throws(() => previewDefenderProgression(actor, { choices: { talents: { basic: "class-option-defender-talent-basic-refreshment" } } }), /original basic Talent/);
  assert.throws(() => previewDefenderProgression(actor, { choices: { talents: { basicAt8: { mode: "upgrade", sourceId: selected.talents.basic } } } }), /already recorded/);
});

test("choosing the same Light Shield twice grants two and a retry preserves that quantity", async () => {
  const actor = fixture({ level: 2 });
  const shield = CHAPTER_FOUR_EQUIPMENT.find(entry => entry.kind === "equipment" && entry.tableData?.category === "Light Shields");
  const selected = choices(actor, { startingEquipment: { mode: "items", weaponOrShield: shield.id, heavyWeaponOrShield: shield.id,
    armour: "equipment-defender-armour-9", toolkit: "tool-engineering-kit-3" } });
  const plan = previewDefenderProgression(actor, { choices: selected });
  assert.equal(plan.createItems.find(item => item.flags?.ak5e?.defenderProgressionGrant?.equipmentKey === shield.id).system.quantity, 2);
  const original = actor.createEmbeddedDocuments.bind(actor); let count = 0;
  actor.createEmbeddedDocuments = async (...args) => { count++; if (count === plan.createItems.length) throw new Error("interrupted after shield"); return original(...args); };
  await assert.rejects(applyDefenderProgression(actor, { confirmed: true, choices: plan.choices, contextKey: plan.contextKey, operationId: "two-shields" }), /interrupted/);
  actor.createEmbeddedDocuments = original;
  await applyDefenderProgression(actor, { confirmed: true, choices: plan.choices, contextKey: plan.contextKey, operationId: "two-shields" });
  const shields = [...actor.items.values()].filter(item => flag(item, "defenderProgressionGrant")?.equipmentKey === shield.id);
  assert.equal(shields.length, 1); assert.equal(shields[0].system.quantity, 2);
});

test("ASI receipts permit the same ability at a later level and Constitution adjusts included HP once", async () => {
  const actor = fixture({ level: 4, strength: 14 });
  const selected = choices(actor, { startingEquipment: { mode: "cash" }, talents: { basic: "class-option-defender-talent-basic-power-plant" },
    asi: { 4: { increases: [{ ability: "str", amount: 2 }] } } });
  let plan = previewDefenderProgression(actor, { choices: selected });
  await applyDefenderProgression(actor, { confirmed: true, choices: plan.choices, contextKey: plan.contextKey, operationId: "asi4" });
  actor.items.get("class-defender").system.levels = 6;
  plan = previewDefenderProgression(actor, { choices: { asi: { 6: { increases: [{ ability: "str", amount: 2 }] } } } });
  await applyDefenderProgression(actor, { confirmed: true, choices: plan.choices, contextKey: plan.contextKey, operationId: "asi6" });
  assert.equal(actor.system.abilities.str.value, 18);
  const conActor = fixture({ level: 4, hp: 30 });
  const conChoices = choices(conActor, { startingEquipment: { mode: "cash" }, talents: { basic: "class-option-defender-talent-basic-power-plant" },
    hp: { 4: { mode: "fixed", roll: 7 } }, asi: { 4: { increases: [{ ability: "con", amount: 2 }] } } });
  plan = previewDefenderProgression(conActor, { choices: conChoices });
  await applyDefenderProgression(conActor, { confirmed: true, choices: plan.choices, contextKey: plan.contextKey, operationId: "con-asi" });
  assert.equal(conActor.system.attributes.hp.max, 44); // 30 + (7+4) new HP + 3 included levels' CON delta.
  assert.equal(conActor.system.attributes.hp.value, 19);
  await applyDefenderProgression(conActor, { confirmed: true, choices: plan.choices, contextKey: plan.contextKey, operationId: "con-asi" });
  assert.equal(conActor.system.attributes.hp.max, 44);
});

test("initial proficiency and equipment selections cannot yield extra grants on repeat setup", async () => {
  const actor = fixture({ level: 3 });
  const selected = choices(actor, { talents: { basic: "class-option-defender-talent-basic-power-plant" } });
  const plan = previewDefenderProgression(actor, { choices: selected });
  await applyDefenderProgression(actor, { confirmed: true, choices: plan.choices, contextKey: plan.contextKey, operationId: "initial-choices" });
  for (const changed of [{ skills: ["prc", "itm", "ak5ewilderness"] }, { tool: "Medical Kit" }, { saves: ["wis"] }, { startingEquipment: { mode: "cash" } }]) {
    assert.throws(() => previewDefenderProgression(actor, { choices: changed }), /original .* choice is already recorded/);
  }
});

test("Sentry: Equipment Exchange offers non-Firearm ranged weapons; a Marksman Fighting Style at 4th; ranged proficiency", async () => {
  const actor = fixture({ level: 4, branch: "sentry" });
  const style = CHAPTER_THREE_CLASSES.find(entry => entry.kind === "class-feature" && entry.parentClass === "Marksman" && entry.name === "Ranger");
  const selected = choices(actor, { branch: "subclass-defender-sentry", talents: { basic: "class-option-defender-talent-basic-power-plant" },
    startingEquipment: { ...choices(actor).startingEquipment, sentryExchange: "weapon-bow-0" }, sentryFightingStyle: style.id });
  const result = defenderChoices(actor, { choices: selected });
  const exchange = result.fields.find(field => field.key === "startingEquipment.sentryExchange");
  assert.ok(exchange.options.some(option => option.value === "weapon-greatbow-6"));
  assert.ok(!exchange.options.some(option => option.value === "weapon-handgun-3"), "Firearms cannot be chosen");
  assert.equal(result.fields.find(field => field.key === "sentryFightingStyle").options.length, 8);
  const preview = previewDefenderProgression(actor, { choices: selected });
  assert.deepEqual(preview.pending, []);
  assert.ok(preview.createItems.some(item => item.flags.ak5e.chapterThreeId === style.id));
  assert.ok(preview.createItems.some(item => item.flags.ak5e.defenderProgressionGrant?.equipmentKey === "weapon-bow-0"));
  assert.ok(!preview.createItems.some(item => item.flags.ak5e.defenderProgressionGrant?.equipmentKey === "weapon-sword-6"), "the exchanged weapon is not granted");
  await applyDefenderProgression(actor, { confirmed: true, contextKey: preview.contextKey, choices: selected, operationId: "sentry" });
  assert.match(actor.system.traits.weaponProf.custom, /Light Ranged Weapons; Heavy Ranged Weapons/);
  const early = fixture({ level: 3, branch: "sentry" });
  assert.equal(defenderChoices(early, { choices: choices(early, { branch: "subclass-defender-sentry" }) }).fields.some(field => field.key === "sentryFightingStyle"), false);
});

test("review fix: a branch proficiency added later chains from the Actor's actual value when the class write is already recorded", async () => {
  const actor = fixture({ level: 4, branch: "sentry" });
  actor._source.system.traits.weaponProf.custom = actor.system.traits.weaponProf.custom = "Old Weapons;All Melee Weapons";
  actor.flags.ak5e.defenderProgression = { version: 1, choices: {}, hpLevels: [], asiLevels: [], operations: [], plans: {},
    receipts: { "proficiency:weapons": { operationId: "old", before: "Old Weapons", after: "Old Weapons;All Melee Weapons" } } };
  const style = CHAPTER_THREE_CLASSES.find(entry => entry.kind === "class-feature" && entry.parentClass === "Marksman" && entry.name === "Ranger");
  const selected = choices(actor, { branch: "subclass-defender-sentry", talents: { basic: "class-option-defender-talent-basic-power-plant" }, sentryFightingStyle: style.id,
    startingEquipment: { ...choices(actor).startingEquipment, sentryExchange: "keep" } });
  const preview = previewDefenderProgression(actor, { choices: selected });
  await applyDefenderProgression(actor, { confirmed: true, contextKey: preview.contextKey, choices: selected, operationId: "later" });
  assert.match(actor.system.traits.weaponProf.custom, /Light Ranged Weapons; Heavy Ranged Weapons/);
});
