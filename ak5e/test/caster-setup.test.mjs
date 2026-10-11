import test from "node:test";
import assert from "node:assert/strict";
import { CHAPTER_THREE_CLASSES } from "../scripts/chapter-three-content.mjs";
import { CHAPTER_FOUR_EQUIPMENT } from "../scripts/chapter-four-content.mjs";
import { casterBranch, casterFeatures, casterLevel, casterProfile, casterState, casterTable, standardPools } from "../scripts/caster-rules.mjs";
import { applyCasterSetup, configureCasterMapping, getCasterSetupChoices, previewCasterSetup, sourceEntryData, casterScalarRecords } from "../scripts/caster-setup.mjs";
import { casterCommand, casterRest, recordCasterRuling } from "../scripts/caster-features.mjs";
import { casterGrant } from "../scripts/caster-casting.mjs";

const CLASS_ID = "class-caster";
const BRANCH_ID = "subclass-caster-mystic";
const CORE_ID = "subclass-caster-core";
const storage = {};
test("recovery scalars use path values and recognize legacy Foundry-expanded flags",()=>{
  const flat={"system.attributes.hp.max":{before:10,after:17}};
  const expanded={system:{attributes:{hp:{max:{before:10,after:17}}}}};
  const expected=[{path:"system.attributes.hp.max",before:10,after:17}];
  assert.deepEqual(casterScalarRecords(flat),expected);
  assert.deepEqual(casterScalarRecords(expanded),expected);
  assert.deepEqual(casterScalarRecords(expected),expected);
  assert.ok(expected.every(record=>Object.keys(record).every(key=>!key.includes("."))));
});
function setPath(object, path, value) {
  const parts = path.split(".");
  const last = parts.pop();
  let target = object;
  for (const part of parts) target = target[part] ??= {};
  target[last] = structuredClone(value);
}
function fixture(level = 1) {
  const actor = {
    id: "caster", uuid: "Actor.caster", documentName: "Actor", type: "character", isOwner: true,
    flags: { ak5e: {} }, system: {
      abilities: { int: { value: 14, mod: 2 }, wis: { value: 12, mod: 1 }, cha: { value: 10, mod: 0 }, con: { value: 12, mod: 1 } },
      attributes: { hp: { value: 8, max: 8 }, spellcasting: "wis" }, currency: { cp: 0 },
      skills: {}, tools: {}, traits: { weaponProf: { custom: "Authored proficiency" }, armorProf: { custom: "" } }
    }, items: new Map(), effects: new Map(), writes: [], created: [],
    getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
    async update(changes) {
      this.writes.push(structuredClone(changes));
      for (const [path, value] of Object.entries(changes)) setPath(this, path, value);
      return this;
    },
    async createEmbeddedDocuments(type, data) {
      const created = data.map((entry, index) => ({ ...structuredClone(entry), id: `created-${this.created.length + index}`, parent: this,
        getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
        async update(changes) { for (const [path, value] of Object.entries(changes)) setPath(this, path, value); } }));
      this.created.push(...created);
      for (const item of created) (type === "ActiveEffect" ? this.effects : this.items).set(item.id, item);
      return created;
    }
  };
  const add = (id, type, flags, system = {}) => actor.items.set(id, { id, type, system, flags: { ak5e: flags }, parent: actor, getFlag(scope, key) { return this.flags?.[scope]?.[key]; } });
  add("caster-class", "class", { chapterThreeId: CLASS_ID }, { levels: level, hd: { denomination: "d6" } });
  add("caster-branch", "subclass", { chapterThreeId: BRANCH_ID });
  add("wand", "weapon", { tableData: { properties: "Casting Unit" } });
  return actor;
}
function configureWorld(arts = []) {
  globalThis.game = {
    user: { id: "gm", isGM: true },
    settings: { get: (_module, key) => storage[key] ?? {}, async set(_module, key, value) { storage[key] = structuredClone(value); } }
  };
  const docs = new Map(arts.map(name => {
    const knownLevel = standardPools.flatMap(pool => pool.members).find(member => member.name === name)?.level ?? ({ "Detect Magic": 1, Counterspell: 3, "Dispel Magic": 3, "Fire Bolt": 0 }[name] ?? 1);
    return [`Item.${name}`, { id: name, uuid: `Item.${name}`, type: "spell", name, system: { level: knownLevel, method: "spell", prepared: 0, properties: [], materials: {} }, toObject() { return structuredClone({ _id: this.id, type: this.type, name: this.name, system: this.system, flags: {} }); } }];
  }));
  globalThis.fromUuid = async uuid => docs.get(uuid) ?? null;
  storage.casterArtMappings = {};
  return docs;
}
function approvePoolMappings(pool) {
  storage.casterArtMappings = Object.fromEntries(pool.members.filter(member => !member.sourceId).map(member => [
    member.name.toLowerCase().replace(/[^a-z0-9]/g, ""),
    { requestedName: member.name, uuid: `Item.${member.name}`, source: "test reviewed mapping", mappedName: member.name }
  ]));
  storage.casterArtMappings.detectmagic = { requestedName: "Detect Magic", uuid: "Item.Detect Magic", source: "test reviewed mapping", mappedName: "Detect Magic" };
}

function coreChoices(actor, pools) {
  const choices = completeChoices(actor, pools.map(pool => pool.id), CORE_ID);
  choices.branch = CORE_ID;
  const pending = getCasterSetupChoices(actor).pending;
  choices.talents.basic = pending.find(choice => choice.key === "talents.basic")?.options[0]?.value;
  choices.talents.basicAt8 = { mode: "upgrade", sourceId: choices.talents.basic };
  choices.talents.advanced = pending.find(choice => choice.key === "talents.advanced")?.options[0]?.value;
  const names = [...new Set([...pools.flatMap(pool => pool.members.filter(member => !member.sourceId).map(member => member.name)), "Detect Magic", "Counterspell", "Dispel Magic"] )];
  const docs = configureWorld(names);
  storage.casterArtMappings = Object.fromEntries(names.map(name => [name.toLowerCase().replace(/[^a-z0-9]/g, ""), {
    requestedName: name, uuid: `Item.${name}`, source: "test reviewed mapping", mappedName: name
  }]));
  return { choices, docs };
}

test("Caster progression table is exact at every level and rejects invalid levels", () => {
  const ap = [3, 4, 6, 7, 10, 11, 12, 15, 16, 17, 20, 21, 22, 25, 26, 27, 30, 31, 32, 35];
  const arts = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 9, 9];
  for (let level = 1; level <= 20; level++) assert.deepEqual(casterTable(level), { maximum: ap[level - 1], maximumArtLevel: arts[level - 1] });
  for (const level of [0, 21, 1.5, "x"]) assert.throws(() => casterTable(level), RangeError);
});

test("pool catalogue parses source rows with and without trailing pipes and links generated Arts", () => {
  assert.equal(standardPools.length, 11);
  const corrosion = standardPools.find(pool => pool.name === "Corrosion Arts");
  for (let index = 0; index < standardPools.length; index++) assert.ok(standardPools[index].members.length > 0, `pool ${index}`);
  assert.ok(corrosion.members.some(member => member.name === "Acid Splash" && member.level === 0));
  assert.ok(corrosion.members.some(member => member.name === "Acid Surge" && member.level === 0 && member.sourceId));
  assert.ok(corrosion.members.every(member => Number.isInteger(member.level) && (member.sourceId || member.name)));
});

test("stable IDs, eligibility, default state and feature gates are read-only", () => {
  const actor = fixture(5);
  assert.equal(casterLevel(actor), 5);
  assert.equal(casterBranch(actor), "mystic");
  assert.deepEqual(casterState({}), { version: 1, enabled: false, choices: {}, pools: [], operations: [], casts: [], spends: [], rulings: {}, uses: {}, turn: {}, drones: [] });
  assert.equal(casterProfile(actor).configured, false);
  assert.deepEqual(casterFeatures(actor), []);
  actor.flags.ak5e.caster = { enabled: true };
  const features = casterFeatures(actor);
  assert.ok(features.some(entry => entry.parentBranch == null && entry.level <= 5));
  assert.ok(features.some(entry => entry.parentBranch === "Mystic" && entry.level <= 5));
  assert.ok(features.every(entry => entry.level <= 5));
  const multiclass = { ...actor, items: new Map([...actor.items, ["other-class", { type: "class", system: { levels: 1 } }]]) };
  assert.ok(casterProfile(multiclass).blocked.includes("MultipleClasses"));
  assert.deepEqual(casterFeatures(multiclass), []);
});

test("source documents retain stable IDs and exact authored descriptions", () => {
  const entry = CHAPTER_THREE_CLASSES.find(item => item.id === CLASS_ID);
  const data = sourceEntryData(entry);
  assert.equal(data.flags.ak5e.chapterThreeId, CLASS_ID);
  assert.equal(data.system.description.value, entry.content);
  assert.equal(data.name, entry.name);
  const casterClass = sourceEntryData(CHAPTER_THREE_CLASSES.find(item => item.id === CLASS_ID));
  assert.equal(casterClass.system.hd.denomination, "d6");
  assert.equal(casterClass.system.hd.spent, 0, "source Hit Die fields are retained");
});

test("mapping is GM-only, source-listed, level-matched, and permits reviewed aliases", async () => {
  configureWorld(["Fire Bolt", "Counterspell", "Dispel Magic"]);
  globalThis.game.user.isGM = false;
  await assert.rejects(configureCasterMapping("Acid Splash", "Item.Fire Bolt", "PHB reviewed"), /Only a GM/);
  globalThis.game.user.isGM = true;
  await assert.rejects(configureCasterMapping("Invented Art", "Item.Fire Bolt", "review"), /Only a named/);
  await assert.rejects(configureCasterMapping("Acid Splash", "Item.Absent", "review"), /must resolve/);
  const docs = globalThis.fromUuid;
  globalThis.fromUuid = async uuid => {
    if (uuid === "Item.Wrong Level") return { type: "spell", name: "Wrong Level", system: { level: 1 } };
    return docs(uuid);
  };
  await assert.rejects(configureCasterMapping("Acid Splash", "Item.Wrong Level", "review"), /must match the source Art level 0/);
  globalThis.fromUuid = async uuid => {
    if (uuid === "Item.Wrong Counterspell") return { type: "spell", name: "Wrong Counterspell", system: { level: 1 } };
    return docs(uuid);
  };
  await assert.rejects(configureCasterMapping("Counterspell", "Item.Wrong Counterspell", "review"), /must match the source Art level 3/);
  await configureCasterMapping("Counterspell", "Item.Counterspell", "GM verified 3rd-level Art mapping");
  const mapping = await configureCasterMapping("Acid Splash", "Item.Fire Bolt", "GM reviewed same-level alias");
  assert.equal(mapping.mappedName, "Fire Bolt");
  assert.equal(storage.casterArtMappings.acidsplash.source, "GM reviewed same-level alias");
});

test("mapped Detect Magic is free from level 2 and preserves prior unlimited-use state", async () => {
  const pool = standardPools.find(entry => entry.name === "Corrosion Arts");
  const names = [...pool.members.filter(member => !member.sourceId).map(member => member.name), "Detect Magic"];
  configureWorld(names);
  approvePoolMappings(pool);
  const actor = fixture(2);
  const choices = completeChoices(actor, [pool.id]);
  const preview = await previewCasterSetup(actor, { choices });
  const detect = preview.createItems.find(item => item.name === "Detect Magic");
  assert.ok(detect);
  assert.deepEqual(detect.flags.ak5e.art.free, { level: 1, maximum: null, spent: 0 });

  const existing = { id: "known-detect-magic", type: "spell", name: "Detect Magic", system: { level: 1 },
    flags: { ak5e: { art: { enabled: false, free: { level: 1, maximum: null, spent: 2 } },
      casterArtGrants: [{ sourceKey: "mapped:detectmagic", sourceName: "Detect Magic", kind: "dnd5e" }] } },
    async update(changes) { for (const [path, value] of Object.entries(changes)) setPath(this, path, value); } };
  actor.items.set(existing.id, existing);
  const updatedPreview = await previewCasterSetup(actor, { choices });
  const update = updatedPreview.updateItems.find(entry => entry.item === existing);
  assert.ok(update);
  assert.deepEqual(update.changes["flags.ak5e.art"].free, { level: 1, maximum: null, spent: 2 });
  assert.equal(update.changes["flags.ak5e.art"].enabled, true);
});

test("a stale GM mapping with a conflicting Art level remains visible and is not imported", async () => {
  const pool = standardPools.find(entry => entry.name === "Corrosion Arts");
  const names = [...pool.members.filter(member => !member.sourceId).map(member => member.name), "Detect Magic", "Fire Bolt"];
  const docs = configureWorld(names);
  approvePoolMappings(pool);
  docs.get("Item.Fire Bolt").system.level = 1;
  storage.casterArtMappings.acidsplash = { requestedName: "Acid Splash", uuid: "Item.Fire Bolt", source: "old reviewed mapping", mappedName: "Fire Bolt" };
  const actor = fixture(2);
  const preview = await previewCasterSetup(actor, { choices: completeChoices(actor, [pool.id]) });
  assert.ok(preview.missing.some(entry => entry.name === "Acid Splash" && entry.reason === "MappedArtLevelMismatch" && entry.expectedLevel === 0 && entry.actualLevel === 1));
  assert.ok(preview.warnings.some(warning => /different level/.test(warning)));
  assert.ok(!preview.createItems.some(item => item.name === "Acid Splash"));
});

test("starting Toolkit must match the chosen proficiency unless Mech-Accord exchange is confirmed", async () => {
  configureWorld();
  const actor = fixture(1);
  const choices = completeChoices(actor);
  choices.tool = "Engineering Kit";
  choices.startingEquipment = { mode: "items", weaponOrShield: "weapon-knife-4", wandOrStaff: "weapon-arts-wand-1", toolkit: "tool-art-kit-0" };
  choices.castingUnit = "weapon-arts-wand-1";
  const mismatch = await previewCasterSetup(actor, { choices });
  assert.ok(mismatch.pending.some(choice => choice.key === "choices.validation" && /starting Toolkit must match/.test(choice.label)));

  actor.items.get("caster-branch").flags.ak5e.chapterThreeId = "subclass-caster-mech-accord";
  choices.branch = "subclass-caster-mech-accord";
  choices.mechExchange = { proficiency: "none", startingToolkit: true };
  const exchanged = await previewCasterSetup(actor, { choices });
  assert.ok(!exchanged.pending.some(choice => choice.key === "choices.validation"), JSON.stringify(exchanged.pending));
  assert.ok(CHAPTER_FOUR_EQUIPMENT.some(entry => entry.id === choices.startingEquipment.toolkit && entry.name === "Art Kit"));
});

test("Mech starting-toolkit exchange changes the item only; Technology grant stays idempotent", async () => {
  const pool = standardPools.find(entry => entry.name === "Corrosion Arts");
  configureWorld([...pool.members.filter(member => !member.sourceId).map(member => member.name), "Detect Magic"]);
  approvePoolMappings(pool);
  const actor = fixture(1);
  actor.items.get("caster-branch").flags.ak5e.chapterThreeId = "subclass-caster-mech-accord";
  actor.system.tools.ak5eartkit = { value: 1 };
  const choices = completeChoices(actor, [pool.id], "subclass-caster-mech-accord");
  choices.skills = ["Arts", "Insight", "Perception"];
  choices.tool = "Art Kit";
  choices.mechExchange = { proficiency: "none", startingToolkit: true };
  choices.startingEquipment = { mode: "items", weaponOrShield: "weapon-knife-4", wandOrStaff: "weapon-arts-wand-1", toolkit: "tool-art-kit-0" };
  choices.castingUnit = "weapon-arts-wand-1";
  let preview = await previewCasterSetup(actor, { choices });
  assert.equal(preview.actorUpdate["system.skills.ak5etech.value"], 1);
  assert.equal(preview.actorUpdate["system.tools.ak5eartkit.value"], 1, "starting-item exchange does not remove the original Toolkit proficiency");
  assert.equal(preview.actorUpdate["system.tools.ak5eengineeringkit.value"], undefined, "item exchange does not grant Engineering Kit proficiency");
  const engineeringKit = preview.createItems.find(item => item.name === "Engineering Kit");
  assert.ok(engineeringKit, "the explicitly chosen exchange can use the canonical Chapter 4 equipment record without a World copy");
  assert.ok(engineeringKit.flags.ak5e.chapterFourId);
  assert.ok(!preview.missing.some(entry => entry.sourceId === engineeringKit.flags.ak5e.chapterFourId));
  await applyCasterSetup(actor, { choices, contextKey: preview.contextKey, confirmed: true, operationId: "mech-toolkit-item-only" });
  const focus = actor.items.get(actor.flags.ak5e.casting.castingUnit);
  assert.ok(focus, "casting focus resolves to the granted embedded Item, not its source ID");
  assert.equal(focus.flags.ak5e.chapterFourId, choices.castingUnit);
  preview = await previewCasterSetup(actor, { choices });
  assert.equal(preview.actorUpdate["system.skills.ak5etech.value"], 1, "reapplication does not promote the setup's own proficiency to expertise");
});

test("an authored non-d6 class Hit Die is preserved and surfaced for review", async () => {
  configureWorld();
  const actor = fixture(1);
  actor.items.get("caster-class").system.hd = { denomination: "d8", spent: 1, authoredField: "keep" };
  const preview = await previewCasterSetup(actor, { choices: completeChoices(actor) });
  assert.ok(preview.warnings.some(warning => /does not expose a d6 Hit Die/.test(warning)));
  assert.deepEqual(actor.items.get("caster-class").system.hd, { denomination: "d8", spent: 1, authoredField: "keep" });
  assert.equal(Object.keys(preview.actorUpdate).some(path => path.includes("hd.denomination")), false);
});

function completeChoices(actor, pools = [standardPools[0].id], branchId = BRANCH_ID) {
  const plan = getCasterSetupChoices(actor);
  const choice = {
    branch: branchId, ability: "int", pools, saves: ["int", "wis"], skills: ["Arts", "Tech", "Insight"], tool: "Engineering Kit",
    castingUnit: "wand", startingEquipment: { mode: "cash" }, talents: {}, hp: { 1: { mode: "fixed", roll: 6 } }, asi: {}
  };
  for (const pending of plan.pending) {
    if (pending.key.startsWith("talents.")) continue;
    if (pending.key === "hp.1") continue;
    if (pending.key.startsWith("hp.")) choice.hp[pending.key.slice(3)] = { mode: "fixed", roll: 4 };
    if (pending.key.startsWith("asi.")) {
      const abilities = ["str", "dex", "con"];
      choice.asi[pending.key.slice(4)] = { increases: [{ ability: abilities[Object.keys(choice.asi).length % abilities.length], amount: 2 }] };
    }
  }
  return choice;
}

test("every Caster level applies its exact table, pools and progression without healing or regranting", async () => {
  for (let level = 1; level <= 20; level++) {
    const actor = fixture(level);
    actor.items.get("caster-branch").flags.ak5e.chapterThreeId = CORE_ID;
    const pools = standardPools.slice(0, level >= 11 ? 3 : 2);
    const { choices } = coreChoices(actor, pools);
    if (level < 3) delete choices.talents.basic;
    if (level < 8) delete choices.talents.basicAt8;
    if (level < 9) delete choices.talents.advanced;
    if (level >= 13) choices.talents.advancedAt13 = { mode:"upgrade", sourceId:choices.talents.advanced };
    let preview = await previewCasterSetup(actor, {choices});
    assert.deepEqual(preview.pending, [], `level ${level} choices`);
    assert.deepEqual(preview.missing, [], `level ${level} mappings`);
    await applyCasterSetup(actor, {choices, contextKey:preview.contextKey, confirmed:true, operationId:`level-${level}`});
    assert.equal(actor.flags.ak5e.artsPoints.maximum, casterTable(level).maximum);
    assert.equal(actor.flags.ak5e.artsPoints.maximumArtLevel, casterTable(level).maximumArtLevel);
    assert.equal(actor.flags.ak5e.artsPoints.value, casterTable(level).maximum);
    assert.equal(actor.flags.ak5e.caster.pools.length, level >= 11 ? 3 : 2);
    assert.equal(actor.system.attributes.hp.value, 8, "setup does not heal current HP");
    const ids = [...actor.items.keys()];
    actor.flags.ak5e.artsPoints.value = 1;
    actor.flags.ak5e.artsPoints.ninthLevelSpent = true;
    preview = await previewCasterSetup(actor, {choices});
    await applyCasterSetup(actor, {choices, contextKey:preview.contextKey, confirmed:true, operationId:`update-${level}`});
    assert.deepEqual([...actor.items.keys()], ids, "reapplication preserves IDs without duplicate grants");
    assert.equal(actor.flags.ak5e.artsPoints.value, 1);
    assert.equal(actor.flags.ak5e.artsPoints.ninthLevelSpent, true);
  }
});

test("mapped Rabbit identity survives rest and later permanent learning without duplicate Items", async () => {
  const actor=fixture(1); actor.items.get("caster-branch").flags.ak5e.chapterThreeId=CORE_ID;
  const pools=[standardPools.find(p=>p.name==="Corrosion Arts"),standardPools.find(p=>p.name==="Flame Arts")];
  const {choices,docs}=coreChoices(actor,pools);
  choices.talents={};
  const crude=standardPools.find(p=>p.name==="Crude Arts");
  const source={id:"missile",uuid:"Item.Magic Missile",type:"spell",name:"Magic Missile",system:{level:1,activities:{}},toObject(){return {_id:this.id,type:this.type,name:this.name,system:this.system,flags:{}};}};
  docs.set(source.uuid,source);
  await configureCasterMapping("Magic Missile",source.uuid,"Reviewed test spell source.");
  let preview=await previewCasterSetup(actor,{choices});
  await applyCasterSetup(actor,{choices,contextKey:preview.contextKey,confirmed:true,operationId:"rabbit-initial"});
  const request={confirmed:true,poolArtName:"Magic Missile"};
  const first=await casterCommand(actor,"rabbit",request,"rabbit-first");
  const borrowed=actor.items.get(first.itemId);
  assert.equal(borrowed.flags.ak5e.casterArtGrant.sourceKey,"mapped:magicmissile");
  await casterRest(actor,"long");
  assert.match(casterGrant(actor,borrowed,{}).blocked,/expired/);
  const second=await casterCommand(actor,"rabbit",request,"rabbit-second");
  assert.equal(second.itemId,first.itemId);
  await casterRest(actor,"long");
  source.system.level=9;
  actor.items.delete(first.itemId);
  await assert.rejects(casterCommand(actor,"rabbit",request,"rabbit-stale"),/review a spell mapping/);
  actor.items.set(borrowed.id,borrowed);source.system.level=1;
  actor.items.get("caster-class").system.levels=11;
  const update=coreChoices(actor,[...pools,crude]).choices;
  preview=await previewCasterSetup(actor,{choices:update});
  await applyCasterSetup(actor,{choices:update,contextKey:preview.contextKey,confirmed:true,operationId:"learn-borrowed"});
  assert.equal([...actor.items.values()].filter(item=>item.name==="Magic Missile").length,1);
  assert.equal(casterGrant(actor,borrowed,{}).blocked,undefined,"permanent pool provenance survives Rabbit expiry");
});

test("setup previews have no side effects, expose pending choices and require explicit confirmation", async () => {
  configureWorld();
  const actor = fixture();
  actor.items.delete("caster-branch");
  const preview = await previewCasterSetup(actor);
  assert.equal(actor.writes.length, 0);
  assert.equal(actor.created.length, 0);
  assert.ok(preview.pending.some(choice => choice.key === "branch"));
  assert.ok(getCasterSetupChoices(actor).pending.some(choice => choice.key === "hp.1"));
  await assert.rejects(applyCasterSetup(actor, { choices: completeChoices(actor) }), /Confirm/);
  assert.equal(actor.writes.length, 0);
  actor.isOwner = false;
  await assert.rejects(previewCasterSetup(actor), /that you own/);
});

test("ASI validation aggregates all unapplied choices before applying level gains", async () => {
  configureWorld();
  const actor = fixture(6);
  actor.system.abilities.con.value = 18;
  const choices = completeChoices(actor);
  choices.talents.basic = getCasterSetupChoices(actor).pending.find(choice => choice.key === "talents.basic").options[0].value;
  choices.asi = {
    4: { increases: [{ ability: "con", amount: 2 }] },
    6: { increases: [{ ability: "con", amount: 2 }] }
  };
  const preview = await previewCasterSetup(actor, { choices });
  assert.ok(preview.pending.some(choice => choice.key === "choices.validation" && /raise CON above 20/.test(choice.label)), JSON.stringify(preview.pending));
  await assert.rejects(applyCasterSetup(actor, { choices, contextKey: preview.contextKey, confirmed: true }), /choices\.validation/);
  assert.equal(actor.writes.length, 0);
  assert.equal(actor.created.length, 0);
});

test("Core Elemental Being grants table-derived resistances without overwriting authored traits", async () => {
  const actor = fixture(10);
  actor.items.delete("caster-branch");
  actor.system.traits.dr = { value: ["fire"] };
  const pools = ["Earth Arts", "Fluid Arts"].map(name => standardPools.find(pool => pool.name === name));
  const { choices } = coreChoices(actor, pools);
  const preview = await previewCasterSetup(actor, { choices });
  assert.deepEqual(preview.pending, []);
  assert.deepEqual(preview.missing, []);
  assert.equal(preview.createEffects.length, 1);
  const planned = preview.createEffects[0];
  assert.deepEqual(planned.changes.map(change => [change.key, change.mode, change.value]), [
    ["system.traits.dr.value", 2, "bludgeoning"],
    ["system.traits.dr.value", 2, "piercing"]
  ]);
  assert.equal(planned.flags.ak5e.casterManagedEffect.sourceId, "subclass-feature-caster-core-10th-level-master-of-the-elements-1572");
  const result = await applyCasterSetup(actor, { choices, contextKey: preview.contextKey, confirmed: true, operationId: "elemental-being" });
  assert.equal(result.created >= 1, true);
  assert.deepEqual(actor.system.traits.dr.value, ["fire"], "the helper does not write over the Actor's authored resistance Set");
  assert.equal(actor.effects.size, 1);
  const effect = actor.effects.values().next().value;
  assert.deepEqual(effect.changes.map(change => change.value).sort(), ["bludgeoning", "piercing"]);

  const branchItem = [...actor.items.values()].find(item => item.type === "subclass");
  actor.items.delete(branchItem.id);
  const branchRemoved = await previewCasterSetup(actor, { choices });
  assert.equal(branchRemoved.updateEffects[0].changes.disabled, true);
  assert.ok(branchRemoved.warnings.some(warning => /branch is not attached/.test(warning)));
  actor.items.set(branchItem.id, branchItem);

  const changedChoices = { ...choices, pools: [standardPools.find(pool => pool.name === "Corrosion Arts").id, standardPools.find(pool => pool.name === "Crude Arts").id] };
  actor.flags.ak5e.caster.rulings.poolReplacement = { value: "retainKnownArts", source: "GM-reviewed pool replacement for resistance migration", approvedBy: "gm" };
  const changed = await previewCasterSetup(actor, { choices: changedChoices });
  assert.equal(changed.createEffects.length, 0);
  assert.equal(changed.updateEffects.length, 1);
  assert.deepEqual(changed.updateEffects[0].changes.changes.map(change => change.value).sort(), ["acid", "force"]);

  effect.name = "My customized Elemental Being Effect";
  effect.changes.push({ key: "system.traits.dr.value", mode: 2, value: "cold", priority: 20 });
  const customized = await previewCasterSetup(actor, { choices: changedChoices });
  assert.equal(customized.updateEffects.length, 0, "custom changes are not replaced");
  assert.ok(customized.warnings.some(warning => /require GM review/.test(warning)));
  assert.equal(effect.name, "My customized Elemental Being Effect");

  actor.items.get("caster-class").system.levels = 9;
  const reduced = await previewCasterSetup(actor, { choices });
  assert.equal(reduced.updateEffects.length, 1);
  assert.equal(reduced.updateEffects[0].changes.disabled, true);
  assert.deepEqual(reduced.updateEffects[0].changes.changes, undefined, "disablement preserves customized effect changes");
  await applyCasterSetup(actor, { choices, contextKey: reduced.contextKey, confirmed: true, operationId: "elemental-being-level-reduction" });
  assert.equal(effect.disabled, true, "explicit setup update disables the ineligible managed effect");
  assert.ok(effect.changes.some(change => change.value === "cold"), "custom changes remain on the disabled effect for review");
});

test("setup choice inspection accepts candidate choices without writes", async () => {
  configureWorld();
  const actor = fixture(11);
  actor.items.delete("caster-branch");
  const view = getCasterSetupChoices(actor, { choices: { branch: CORE_ID } });
  assert.equal(view.branchId, CORE_ID);
  assert.equal(view.pending.find(choice => choice.key === "pools").count, 3);
  assert.equal(actor.writes.length, 0);
  assert.equal(actor.created.length, 0);
});

test("independent progression history survives more than forty completed feature operations", async () => {
  const pool = standardPools.find(entry => entry.name === "Corrosion Arts");
  configureWorld([...pool.members.filter(member => !member.sourceId).map(member => member.name), "Detect Magic"]);
  approvePoolMappings(pool);
  const actor = fixture(4);
  actor.flags.ak5e.caster = {
    enabled: true, choices: {}, pools: [pool.id],
    progression: { hpLevels: [1, 2, 3, 4], asiLevels: [4] },
    operations: Array.from({ length: 40 }, (_, index) => ({ id: `feature-${index}`, status: "complete", completedAt: index })).slice(-20)
  };
  actor.system.attributes.hp.max = 35;
  actor.system.abilities.dex = { value: 14, mod: 2 };
  actor.system.abilities.dex.value = 14;
  actor.items.get("caster-branch").flags.ak5e.chapterThreeId = CORE_ID;
  const choices = completeChoices(actor, [pool.id], CORE_ID);
  const preview = await previewCasterSetup(actor, { choices });
  assert.equal(preview.actorUpdate["system.attributes.hp.max"], undefined);
  assert.equal(preview.actorUpdate["system.abilities.dex.value"], undefined);
  assert.deepEqual(preview.progression, { hpLevels: [1, 2, 3, 4], asiLevels: [4] });
});

test("explicit existing HP and ASI history preserves authored totals and later levels add once", async () => {
  const pool = standardPools.find(entry => entry.name === "Corrosion Arts");
  const mappedNames = [...pool.members.filter(member => !member.sourceId).map(member => member.name), "Detect Magic", "Counterspell", "Dispel Magic"];
  configureWorld(mappedNames);
  approvePoolMappings(pool);
  for (const name of ["Counterspell", "Dispel Magic"]) storage.casterArtMappings[name.toLowerCase().replace(/[^a-z0-9]/g, "")] = {
    requestedName: name, uuid: `Item.${name}`, source: "test reviewed mapping", mappedName: name
  };
  const actor = fixture(4);
  actor.system.attributes.hp = { value: 70, max: 100 };
  actor.system.abilities.int = { value: 18, mod: 4 };
  const choices = completeChoices(actor, [pool.id]);
  choices.talents.basic = getCasterSetupChoices(actor).pending.find(entry => entry.key === "talents.basic").options[0].value;
  choices.hp = { 1: { mode: "existing", roll: 0 }, 2: { mode: "existing", roll: 0 }, 3: { mode: "existing", roll: 0 }, 4: { mode: "existing", roll: 0 } };
  choices.asi = { 4: { mode: "existing" } };
  const preview = await previewCasterSetup(actor, { choices });
  assert.deepEqual(preview.pending, []);
  assert.equal(preview.actorUpdate["system.attributes.hp.max"], undefined);
  assert.equal(preview.actorUpdate["system.abilities.int.value"], undefined);
  await applyCasterSetup(actor, { choices, contextKey: preview.contextKey, confirmed: true, operationId: "record-existing-progression" });
  assert.equal(actor.system.attributes.hp.max, 100);
  assert.equal(actor.system.attributes.hp.value, 70);
  assert.equal(actor.system.abilities.int.value, 18);
  assert.deepEqual(actor.flags.ak5e.caster.progression.hpLevels, [1, 2, 3, 4]);
  assert.deepEqual(actor.flags.ak5e.caster.progression.asiLevels, [4]);

  actor.items.get("caster-class").system.levels = 5;
  const levelFive = { ...choices, hp: { ...choices.hp, 5: { mode: "rolled", roll: 4 } } };
  const levelUp = await previewCasterSetup(actor, { choices: levelFive });
  assert.equal(levelUp.actorUpdate["system.attributes.hp.max"], 105, "only the newly gained level adds its d6 result plus current Constitution modifier");
  assert.equal(levelUp.actorUpdate["system.abilities.int.value"], undefined);
  await applyCasterSetup(actor, { choices: levelFive, contextKey: levelUp.contextKey, confirmed: true, operationId: "after-existing-progression" });
  assert.equal(actor.system.attributes.hp.max, 105);
  assert.equal(actor.system.attributes.hp.value, 70);
  assert.deepEqual(actor.flags.ak5e.caster.progression.hpLevels, [1, 2, 3, 4, 5]);
  assert.deepEqual(actor.flags.ak5e.caster.progression.asiLevels, [4]);
});

test("a staged-write failure retries absolute HP and ASI values without losing or duplicating gains", async () => {
  const pool = standardPools.find(entry => entry.name === "Corrosion Arts");
  configureWorld([...pool.members.filter(member => !member.sourceId).map(member => member.name), "Detect Magic", "Counterspell", "Dispel Magic"]);
  approvePoolMappings(pool);
  for (const name of ["Counterspell", "Dispel Magic"]) storage.casterArtMappings[name.toLowerCase().replace(/[^a-z0-9]/g, "")] = {
    requestedName: name, uuid: `Item.${name}`, source: "test reviewed mapping", mappedName: name
  };
  const actor = fixture(8);
  actor.system.attributes.hp.max = 35;
  actor.system.attributes.hp.value = 35;
  const choices = completeChoices(actor, [pool.id]);
  const talentChoices = getCasterSetupChoices(actor).pending;
  choices.talents.basic = talentChoices.find(choice => choice.key === "talents.basic").options[0].value;
  choices.talents.basicAt8 = { mode: "upgrade", sourceId: choices.talents.basic };
  choices.hp[8] = { mode: "rolled", roll: 3 };
  const preview = await previewCasterSetup(actor, { choices, operationId: "recover-staged-scalars" });
  assert.equal(preview.actorUpdate["system.attributes.hp.max"], 76);
  assert.equal(preview.progression.scalarPlan.find(s=>s.path==="system.attributes.hp.max").before, 35);
  assert.equal(preview.progression.scalarPlan.find(s=>s.path==="system.attributes.hp.max").after, 76);

  const originalUpdate = actor.update.bind(actor);
  let failOnce = true;
  actor.update = async changes => {
    if (failOnce && Object.hasOwn(changes, "system.attributes.hp.max")) {
      failOnce = false;
      throw new Error("injected failure before staged Actor changes");
    }
    return originalUpdate(changes);
  };
  await assert.rejects(applyCasterSetup(actor, { choices, contextKey: preview.contextKey, confirmed: true, operationId: "recover-staged-scalars" }), /injected failure/);
  assert.equal(actor.system.attributes.hp.max, 35);
  const retry = await previewCasterSetup(actor, { choices, operationId: "recover-staged-scalars" });
  assert.deepEqual(retry.pending.filter(entry => entry.key === "progression.recovery"), [], JSON.stringify(retry.pending));
  assert.equal(retry.actorUpdate["system.attributes.hp.max"], 76);
  await applyCasterSetup(actor, { choices, contextKey: preview.contextKey, confirmed: true, operationId: "recover-staged-scalars" });
  assert.equal(actor.system.attributes.hp.max, 76);
  assert.equal(actor.flags.ak5e.caster.operations.find(op => op.id === "recover-staged-scalars").status, "complete");
});

test("Core and level 11 pool grants require distinct additional pools", async () => {
  configureWorld();
  const actor = fixture(11);
  actor.items.delete("caster-branch");
  const preview = await previewCasterSetup(actor, { choices: { branch: "subclass-caster-core" } });
  const pools = preview.pending.find(choice => choice.key === "pools");
  assert.equal(pools.count, 3, "base pool, Core Versatile Caster pool, and level 11 pool");
  const duplicate = await previewCasterSetup(actor, { choices: { branch: "subclass-caster-core", pools: [standardPools[0].id, standardPools[0].id, standardPools[1].id] } });
  assert.ok(duplicate.pending.some(choice => choice.key === "pools"), "duplicate pool IDs remain pending");
  assert.equal(actor.writes.length, 0);
});

test("initial setup grants above-cap pool Arts, preserves authored proficiency, and repeated updates preserve resources", async () => {
  const pool = standardPools.find(entry => entry.name === "Corrosion Arts");
  configureWorld([...pool.members.filter(member => !member.sourceId).map(member => member.name), "Detect Magic"]);
  approvePoolMappings(pool);
  const actor = fixture(1);
  const choices = completeChoices(actor, [pool.id]);
  const preview = await previewCasterSetup(actor, { choices });
  assert.deepEqual(preview.pending.map(choice => choice.key), [] , JSON.stringify(preview.warnings));
  assert.ok(preview.createItems.some(item => item.name === "Acid Surge"), "learned high-level pool Arts are not filtered by current Art cap");
  const first = await applyCasterSetup(actor, { choices, contextKey: preview.contextKey, confirmed: true, operationId: "first" });
  assert.equal(actor.flags.ak5e.artsPoints.value, 3);
  assert.equal(actor.flags.ak5e.caster.enabled, true);
  assert.equal(actor.system.currency.cp, 1300);
  assert.equal(actor.system.traits.weaponProf.custom, "Authored proficiency; Light Melee");
  assert.ok(first.created > 0);
  assert.ok(actor.items.size > 3);

  actor.flags.ak5e.artsPoints.value = 1;
  actor.flags.ak5e.artsPoints.ninthLevelCast = true;
  actor.system.attributes.hp.value = 7;
  actor.items.get("caster-class").system.levels = 2;
  actor.system.attributes.hp.max = 14;
  const updatedChoices = { ...choices, hp: { ...choices.hp, 2: { mode: "fixed", roll: 4 } } };
  const secondPreview = await previewCasterSetup(actor, { choices: updatedChoices });
  await applyCasterSetup(actor, { choices: updatedChoices, contextKey: secondPreview.contextKey, confirmed: true, operationId: "level-up" });
  assert.equal(actor.flags.ak5e.artsPoints.value, 1);
  assert.equal(actor.flags.ak5e.artsPoints.ninthLevelCast, true);
  assert.equal(actor.flags.ak5e.artsPoints.maximum, 4);
  assert.equal(actor.system.currency.cp, 1300);
  assert.equal(actor.system.attributes.hp.value, 7);
  assert.equal(actor.system.attributes.hp.max, 19);
  const before = actor.created.length;
  const duplicate = await applyCasterSetup(actor, { choices: updatedChoices, confirmed: true, operationId: "level-up" });
  assert.equal(duplicate.recovered, true);
  assert.equal(actor.created.length, before);
});

test("Level 8 Module choice is explicit, recorded, and attached to its selected talent", async () => {
  const pool = standardPools.find(entry => entry.name === "Corrosion Arts");
  configureWorld([...pool.members.filter(member => !member.sourceId).map(member => member.name), "Detect Magic", "Counterspell", "Dispel Magic"]);
  approvePoolMappings(pool);
  for (const name of ["counterspell", "dispelmagic"]) storage.casterArtMappings[name] = { requestedName: name, uuid: `Item.${name === "counterspell" ? "Counterspell" : "Dispel Magic"}`, source: "test reviewed mapping", mappedName: name };
  const actor = fixture(8);
  const plan = getCasterSetupChoices(actor);
  const choices = completeChoices(actor, [pool.id]);
  const basic = plan.pending.find(pending => pending.key === "talents.basic").options[0].value;
  choices.talents = { basic, basicAt8: { mode: "upgrade", sourceId: basic } };
  const preview = await previewCasterSetup(actor, { choices });
  assert.deepEqual(preview.pending, []);
  const talent = preview.createItems.find(item => item.flags.ak5e.casterTalent?.sourceId === basic);
  assert.ok(talent);
  assert.equal(talent.flags.ak5e.casterTalent.moduleActive, true);
  await applyCasterSetup(actor, { choices, contextKey: preview.contextKey, confirmed: true, operationId: "module-choice" });
  assert.deepEqual(actor.flags.ak5e.caster.choices.talents.basicAt8, { mode: "upgrade", sourceId: basic });
  assert.equal(actor.created.find(item => item.flags?.ak5e?.casterTalent?.sourceId === basic)?.flags.ak5e.casterTalent.moduleActive, true);
});

test("Level 8 new Module talent keeps the original and added talent active across reapplication", async () => {
  const pool = standardPools.find(entry => entry.name === "Corrosion Arts");
  configureWorld([...pool.members.filter(member => !member.sourceId).map(member => member.name), "Detect Magic", "Counterspell", "Dispel Magic"]);
  approvePoolMappings(pool);
  for (const name of ["Counterspell", "Dispel Magic"]) storage.casterArtMappings[name.toLowerCase().replace(/[^a-z0-9]/g, "")] = {
    requestedName: name, uuid: `Item.${name}`, source: "test reviewed mapping", mappedName: name
  };
  const actor = fixture(8);
  const choices = completeChoices(actor, [pool.id]);
  const available = getCasterSetupChoices(actor).pending.find(entry => entry.key === "talents.basic").options.map(entry => entry.value);
  choices.talents.basic = available[0];
  choices.talents.basicAt8 = { mode: "new", sourceId: available[1] };
  let preview = await previewCasterSetup(actor, { choices });
  assert.deepEqual(preview.pending, []);
  const plannedTalents = preview.createItems.filter(item => item.flags.ak5e.casterTalent);
  assert.deepEqual(plannedTalents.map(item => item.flags.ak5e.casterTalent.sourceId).sort(), [available[0], available[1]].sort());
  assert.equal(plannedTalents.find(item => item.flags.ak5e.casterTalent.sourceId === available[0]).flags.ak5e.casterTalent.active, true);
  assert.equal(plannedTalents.find(item => item.flags.ak5e.casterTalent.sourceId === available[1]).flags.ak5e.casterTalent.moduleActive, false);
  await applyCasterSetup(actor, { choices, contextKey: preview.contextKey, confirmed: true, operationId: "new-basic-module" });
  assert.equal(actor.flags.ak5e.caster.choices.talents.basic, available[0]);
  const active = [...actor.items.values()].filter(item => item.flags?.ak5e?.casterTalent?.active === true);
  assert.deepEqual(active.map(item => item.flags.ak5e.casterTalent.sourceId).sort(), [available[0], available[1]].sort());
  preview = await previewCasterSetup(actor, { choices });
  assert.equal(preview.updateItems.some(entry => entry.changes["flags.ak5e.casterTalent.active"] === false), false);
  await applyCasterSetup(actor, { choices, contextKey: preview.contextKey, confirmed: true, operationId: "new-basic-module-reapply" });
  assert.equal([...actor.items.values()].filter(item => item.flags?.ak5e?.casterTalent?.active === true).length, 2);
});

test("Level 13 new Module talent preserves the original Advanced talent", async () => {
  const pools = [standardPools[0], standardPools[1]];
  const arts = [...new Set(pools.flatMap(pool => pool.members.filter(member => !member.sourceId).map(member => member.name)))];
  const names = [...arts, "Detect Magic", "Counterspell", "Dispel Magic"];
  configureWorld(names);
  storage.casterArtMappings = Object.fromEntries(names.map(name => [name.toLowerCase().replace(/[^a-z0-9]/g, ""), {
    requestedName: name, uuid: `Item.${name}`, source: "test reviewed mapping", mappedName: name
  }]));
  const actor = fixture(13);
  const choices = completeChoices(actor, pools.map(pool => pool.id));
  const pending = getCasterSetupChoices(actor).pending;
  const basics = pending.find(entry => entry.key === "talents.basic").options.map(entry => entry.value);
  const advanced = pending.find(entry => entry.key === "talents.advanced").options.map(entry => entry.value);
  choices.talents = {
    basic: basics[0], basicAt8: { mode: "upgrade", sourceId: basics[0] },
    advanced: advanced[0], advancedAt13: { mode: "new", sourceId: advanced[1] }
  };
  let preview = await previewCasterSetup(actor, { choices });
  assert.deepEqual(preview.pending, []);
  await applyCasterSetup(actor, { choices, contextKey: preview.contextKey, confirmed: true, operationId: "new-advanced-module" });
  assert.equal(actor.flags.ak5e.caster.choices.talents.advanced, advanced[0]);
  assert.deepEqual([...actor.items.values()].filter(item => item.flags?.ak5e?.casterTalent?.active === true && item.flags.ak5e.casterTalent.tier === "advanced")
    .map(item => [item.flags.ak5e.casterTalent.sourceId, item.flags.ak5e.casterTalent.moduleActive]).sort(),
    [[advanced[0], false], [advanced[1], false]].sort());
  preview = await previewCasterSetup(actor, { choices });
  await applyCasterSetup(actor, { choices, contextKey: preview.contextKey, confirmed: true, operationId: "new-advanced-module-reapply" });
  assert.equal([...actor.items.values()].filter(item => item.flags?.ak5e?.casterTalent?.active === true && item.flags.ak5e.casterTalent.tier === "advanced").length, 2);
});

test("existing pool Arts receive grant provenance without duplicating or overwriting authored fields", async () => {
  const pool = standardPools.find(entry => entry.name === "Corrosion Arts");
  configureWorld([...pool.members.filter(member => !member.sourceId).map(member => member.name)]);
  approvePoolMappings(pool);
  const actor = fixture();
  const existing = { id: "known-acid-surge", type: "spell", name: "Acid Surge", system: { description: { value: "My revised notes" } },
    flags: { ak5e: { chapterFiveId: "art-acid-surge-4699", customField: "keep" } },
    async update(changes) { for (const [path, value] of Object.entries(changes)) setPath(this, path, value); } };
  actor.items.set(existing.id, existing);
  const choices = completeChoices(actor, [pool.id]);
  const preview = await previewCasterSetup(actor, { choices });
  assert.ok(!preview.createItems.some(item => item.name === "Acid Surge"));
  assert.ok(preview.updateItems.some(update => update.item === existing));
  await applyCasterSetup(actor, { choices, contextKey: preview.contextKey, confirmed: true, operationId: "existing-art" });
  assert.equal(existing.flags.ak5e.customField, "keep");
  assert.equal(existing.system.description.value, "My revised notes");
  assert.equal(existing.flags.ak5e.casterArtGrants[0].sourceId, "art-acid-surge-4699");
});

test("reapplication preview excludes already-owned starting equipment and retains its IDs", async () => {
  const pool = standardPools.find(entry => entry.name === "Corrosion Arts");
  configureWorld(pool.members.filter(member => !member.sourceId).map(member => member.name));
  approvePoolMappings(pool);
  const actor = fixture(), choices = completeChoices(actor, [pool.id]);
  choices.tool = "Medical Kit";
  choices.startingEquipment = { mode: "items", weaponOrShield: "weapon-knife-4", wandOrStaff: "weapon-arts-staff-0", toolkit: "tool-medical-kit-8" };
  choices.castingUnit = "weapon-arts-staff-0";
  const preview = await previewCasterSetup(actor, { choices });
  assert.equal(preview.pending.length, 0, preview.warnings.join("; "));
  await applyCasterSetup(actor, { choices, contextKey: preview.contextKey, confirmed: true, operationId: "equipment-preview" });
  const itemIds = [...actor.items.keys()];
  const repeated = await previewCasterSetup(actor, { choices });
  assert.equal(repeated.createItems.length, 0, "preview and application agree that all grants already exist");
  await applyCasterSetup(actor, { choices, contextKey: repeated.contextKey, confirmed: true, operationId: "equipment-preview-again" });
  assert.deepEqual([...actor.items.keys()], itemIds);
});

test("recorded pools cannot be silently replaced and GM exceptions preserve existing learned Arts", async () => {
  const pool = standardPools.find(entry => entry.name === "Corrosion Arts");
  configureWorld(pool.members.filter(member => !member.sourceId).map(member => member.name));
  approvePoolMappings(pool);
  const actor = fixture();
  const choices = completeChoices(actor, [pool.id]);
  const preview = await previewCasterSetup(actor, { choices });
  await applyCasterSetup(actor, { choices, contextKey: preview.contextKey, confirmed: true, operationId: "record-pool" });
  const itemIds = [...actor.items.keys()], ap = structuredClone(actor.flags.ak5e.artsPoints);
  const replacement = { ...choices, pools: [standardPools.find(entry => entry.id !== pool.id).id] };
  let changed = await previewCasterSetup(actor, { choices: replacement });
  assert.ok(changed.pending.some(entry => /source supplies no replacement rule/.test(entry.label)));
  await assert.rejects(applyCasterSetup(actor, { choices: replacement, contextKey: changed.contextKey, confirmed: true, operationId: "replace-without-review" }), /Complete all Caster setup choices/);
  assert.deepEqual([...actor.items.keys()], itemIds);
  assert.deepEqual(actor.flags.ak5e.artsPoints, ap);
  actor.flags.ak5e.caster.rulings.poolReplacement = { value: "retainKnownArts" };
  changed = await previewCasterSetup(actor, { choices: replacement });
  assert.ok(changed.pending.length, "a bare actor flag lacks reviewed source and GM author metadata");
  game.user.isGM = false;
  await assert.rejects(recordCasterRuling(actor, "poolReplacement", "retainKnownArts", "Reviewed respec exception preserving known Arts"), /Only the GM/);
  game.user.isGM = true;
  await recordCasterRuling(actor, "poolReplacement", "retainKnownArts", "GM-reviewed respec exception preserving known Arts");
  changed = await previewCasterSetup(actor, { choices: replacement });
  assert.equal(changed.pending.length, 0, "recorded exception permits the choice but still requires any missing Art mappings");
  assert.deepEqual([...actor.items.keys()], itemIds);
});

test("failed item creation retains a retry receipt and does not repeat starting cash", async () => {
  const pool = standardPools.find(entry => entry.name === "Corrosion Arts");
  configureWorld([...pool.members.filter(member => !member.sourceId).map(member => member.name)]);
  approvePoolMappings(pool);
  const actor = fixture();
  const choices = completeChoices(actor, [pool.id]);
  const preview = await previewCasterSetup(actor, { choices });
  const createItems = actor.createEmbeddedDocuments;
  actor.createEmbeddedDocuments = async () => { throw new Error("temporary persistence failure"); };
  await assert.rejects(applyCasterSetup(actor, { choices, contextKey: preview.contextKey, confirmed: true, operationId: "retry-cash" }), /temporary persistence failure/);
  assert.equal(actor.system.currency.cp, 1300);
  assert.equal(actor.flags.ak5e.caster.enabled, false);
  assert.equal(actor.flags.ak5e.caster.operations.at(-1).status, "applying");
  await assert.rejects(applyCasterSetup(actor, { choices, contextKey: preview.contextKey, confirmed: true, operationId: "different-setup" }), /reconciliation/);
  actor.createEmbeddedDocuments = createItems;
  const changedChoices = { ...choices, ability: "cha" };
  await assert.rejects(applyCasterSetup(actor, { choices: changedChoices, contextKey: preview.contextKey, confirmed: true, operationId: "retry-cash" }), /recorded with different choices/);
  await applyCasterSetup(actor, { contextKey: preview.contextKey, confirmed: true, operationId: "retry-cash" });
  assert.equal(actor.system.currency.cp, 1300);
  assert.equal(actor.flags.ak5e.caster.enabled, true);
  actor.flags.ak5e.caster.casts = [{ id: "failed-cast", status: "failed" }];
  await assert.rejects(applyCasterSetup(actor, { choices, contextKey: preview.contextKey, confirmed: true, operationId: "after-failed-cast" }), /reconciliation/);
});

