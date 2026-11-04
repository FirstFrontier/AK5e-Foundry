/**
 * WP caster-c2-core — adversarial audit tests (tester draft, phase-1 tests-before-code, 2026-11-03).
 * Drafted ONLY from the spec set; no candidate code for this package exists in the lane yet.
 *
 * Spec sources (authority):
 * - AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt, Core branch C3:390–450:
 *   Versatile Caster L393–401 (Additional Arts Pool L396; Rabbit from the Hat L398),
 *   Power from Within L403–406 (amount L404, once per Long Rest L406),
 *   Empowered Arts L408–410, Master of the Elements L412–431 (Elemental Being L415,
 *   Maverick L417, pool→type table L419–430), Savant L433–443 (selection ritual L436,
 *   reroll/DR-bypass/discount bullets L438–440, one Signature at a time L443).
 * - ak5e/CASTER_IMPLEMENTATION.md Core rows (Versatile Caster, Rabbit from the Hat,
 *   Power from Within, Empowered Arts, Master of the Elements, Savant).
 * - TODO/caster.md "Core — M" (Source L390–450; open ruling: Signature Art cantrip
 *   eligibility and the selection ritual).
 * - ak5e/DECISIONS.md "Caster / Core / Mystic / Mech-Accord (0.4.0)" (cost-order ruling,
 *   Savant cantrip/reroll-repeat rulings, Rabbit expiry without deleting independent grants).
 * - WORKFLOW.md §3.2 trust-the-table (confirm before use, no auto-rolled damage, GM applies
 *   unowned-target damage, everything undoable).
 *
 * Evidence labels used in the criterion map:
 *   E = Exact source rule, quoted or computed directly from a C3 line (citation given).
 *   F = Follow-on spec-map behaviour (implementation-map row or DECISIONS representation).
 *   M = Manual boundary / ruling gate: the module must demand a recorded ruling or
 *       confirmation instead of inventing an outcome. Never asserts an unprinted ruling.
 *
 * Pinned planned exports for the package-owned module ak5e/scripts/caster-core.mjs
 * (tested modules: C2 owns caster-core.mjs and caster-core-ui.mjs; nothing else).
 * Only C0 checks these names exist; every behaviour test runs through the resolver in
 * loadCore(), which prefers the planned module and otherwise falls back to today's public
 * equivalents (caster-features casterCommand/casterRest, caster-casting
 * validateCasterContext/CORE_POOL_TYPES/coreDamageTypes, caster-setup preview/apply) —
 * so a red below is a missing behaviour, not a missing module name. These names are the
 * tester's pinned assumption; the manager may re-pin them at freeze time.
 *
 * Criterion -> test map (labels):
 *  C0 planned surface ......... "caster-core.mjs exposes the pinned Core API" (E, red until implemented)
 *  C1 Versatile Caster ........ E "setup grants Core exactly one extra distinct Standard pool, its Arts always Prepared" (L393–396)
 *                             E "duplicate pool selection stays pending and writes nothing" (L396 "not chosen previously"; map row)
 *  C2 Rabbit from the Hat ..... E "borrows a Standard-pool Art at or below Maximum Art Level, once per Long Rest" (L398)
 *                             E "an Art above Maximum Art Level is refused and the use is not spent" (L398)
 *                             F "the borrowed grant blocks with /expired/ at the Long Rest and re-arming after a Long Rest works" (L398; DECISIONS Rabbit row)
 *  C3 Power from Within ....... E "a completed Short Rest activity regains ceil(Caster level/2) AP, confirmed first" (L403–404)
 *                             E "usable once per Long Rest; recovery clamps at the AP maximum; a Long Rest re-arms it" (L406)
 *  C4 Empowered Arts .......... E "context gates: Core level 6, a current Turn, and one use per Turn" (L410)
 *                             E "the damage roll adds Proficiency Bonus, plus the casting modifier only for a Levelled Art, once" (L410)
 *                             F "a cancelled damage roll keeps the use; a completed roll consumes it" (map row)
 *  C5 Master of the Elements .. E "the pool→Damage Type table matches the printed table exactly and is frozen" (L419–430)
 *                             E "Elemental Being creates one managed resistance effect for exactly the chosen pools' types at 10+ and never overwrites authored traits" (L415; map row)
 *                             M "Maverick demands Core 10, a type of a chosen pool, and an AP-funded cast — otherwise refused, never silently applied" (L417)
 *                             F "Maverick rewrites only this cast's roll types; the underlying Art is unchanged" (map row)
 *  C6 Savant .................. E "selection: Long Rest activity required, known Art of level 5 or less, damaging confirmation, Cantrips gated behind a recorded ruling, one Signature at a time, the Art itself never edited" (L436–L443)
 *                             E "a non-damaging Signature quotes 2 fewer AP, to a minimum of 0" (L440)
 *                             M "Savant combined with Growing Power raises the cost-order reading instead of inventing an order" (DECISIONS)
 *                             M "reroll policy is ruled, dice above 3 refused, only the Signature's own cast may reroll" (L438; DECISIONS)
 *                             E "Signature damage ignores DR and resistance, keeps vulnerability, immunity still applies, and unowned targets go through the GM" (L439; WORKFLOW §3.2)
 *  C7 Trust the table ......... F "Core feature commands confirm first, write nothing on cancel, and roll no dice themselves" (WORKFLOW §3.2)
 *
 * Harness conventions follow ak5e/test/caster-setup.test.mjs (setup flow), ak5e/test/
 * caster-recovery.test.mjs (command flow) and ak5e/test/caster-casting.test.mjs (native
 * damage wrappers). All fixtures are in-memory; no Foundry server, no production file is
 * touched by this file.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { casterCommand, casterRest, recordCasterRuling } from "../scripts/caster-features.mjs";
import { CORE_POOL_TYPES, coreDamageTypes, validateCasterContext, casterGrant, casterTurn, patchCasterDamage } from "../scripts/caster-casting.mjs";
import { quoteArt, artsState } from "../scripts/arts-rules.mjs";
import { applyCasterSetup, configureCasterMapping, getCasterSetupChoices, previewCasterSetup } from "../scripts/caster-setup.mjs";
import { standardPools } from "../scripts/caster-rules.mjs";

/* ---------- planned-module resolver ---------- */
let coreProbe;
async function loadCore() {
  if (coreProbe === undefined) coreProbe = await import("../scripts/caster-core.mjs").catch(() => null);
  const mod = coreProbe;
  return {
    mod,
    CORE_POOL_TYPES: mod?.CORE_POOL_TYPES ?? CORE_POOL_TYPES,
    coreDamageTypes: mod?.coreDamageTypes ?? coreDamageTypes,
    validateCoreContext: mod?.validateCoreContext ?? validateCasterContext,
    useRabbitFromHat: mod?.useRabbitFromHat ?? ((actor, data, operationId) => casterCommand(actor, "rabbit", data, operationId)),
    powerFromWithin: mod?.powerFromWithin ?? ((actor, data, operationId) => casterCommand(actor, "powerWithin", data, operationId)),
    armEmpoweredArts: mod?.armEmpoweredArts ?? ((actor, data, operationId) => casterCommand(actor, "empower", data, operationId)),
    selectSignatureArt: mod?.selectSignatureArt ?? ((actor, data, operationId) => casterCommand(actor, "signature", data, operationId)),
    rerollSignatureDice: mod?.rerollSignatureDice ?? ((actor, data, operationId) => casterCommand(actor, "signatureDice", data, operationId)),
    coreRest: mod?.coreRest ?? casterRest
  };
}

/* ---------- shared helpers (mirroring the existing caster suites) ---------- */
function setPath(object, path, value) {
  const parts = path.split("."), last = parts.pop(); let target = object;
  for (const part of parts) target = target[part] ??= {};
  target[last] = structuredClone(value);
}
const nameKey = value => String(value ?? "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]/g, "");
const CORE_ID = "subclass-caster-core";
const CLASS_ID = "class-caster";
const ELEMENTS_ID = "subclass-feature-caster-core-10th-level-master-of-the-elements-1572";

/* command world (recovery-test conventions): owned caster in an active Turn, counted Rolls */
function commandWorld({ level = 15, ap = 10, maximum = 30, maxArtLevel = 9, prof = 4, intMod = 5, pools = ["standard-art-pool-flame-arts"] } = {}) {
  let rollCount = 0;
  globalThis.game = {
    user: { id: "owner", isGM: false, targets: new Set() },
    combat: { started: true, uuid: "Combat.core-audit", id: "core-audit", round: 2, turn: 0,
      combatant: { id: "caster-turn", actor: { uuid: "Actor.caster" } } },
    time: { worldTime: 0 }, settings: { get: () => false }, actors: new Map(), scenes: new Map()
  };
  const documents = new Map();
  globalThis.fromUuidSync = uuid => documents.get(uuid) ?? null;
  globalThis.fromUuid = async uuid => documents.get(uuid) ?? null;
  globalThis.foundry = { utils: { randomID: () => "core-audit-operation" } };
  globalThis.ui = { notifications: { warn() {}, error() {}, info() {} } };
  globalThis.ChatMessage = { implementation: { getSpeaker: () => ({}), async create(data) { (game.messages ??= []).push(data); return data; } } };
  globalThis.Roll = class {
    constructor(formula) { this.formula = formula; }
    async evaluate() { rollCount += 1; this.total = 4; return this; }
    async toMessage() {}
  };
  const actor = {
    id: "caster", uuid: "Actor.caster", documentName: "Actor", type: "character", name: "Core Caster", isOwner: true,
    flags: { ak5e: { casting: { enabled: true, ability: "int", recovery: "long" },
      artsPoints: { maximum, value: ap, maximumArtLevel: maxArtLevel },
      caster: { version: 1, enabled: true, choices: {}, pools: [...pools], operations: [], casts: [], spends: [], rulings: {}, uses: {}, turn: {}, drones: [], events: [] },
      resourcePools: {} } },
    ownership: { default: 0, player: 3 },
    system: { abilities: { int: { value: 10 + 4 * Math.trunc((intMod + 1) / 2), mod: intMod }, wis: { value: 10, mod: 0 }, cha: { value: 10, mod: 0 }, con: { value: 12, mod: 1 } },
      attributes: { prof, spell: { attack: 5, dc: 13 }, hp: { value: 10, max: 10, temp: 0 } },
      skills: {}, tools: {}, currency: { cp: 1000 }, bonuses: {} },
    items: new Map(), writes: [], tokens: [],
    getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
    getActiveTokens() { return this.tokens; },
    getRollData() { return {}; },
    async update(changes) { this.writes.push(structuredClone(changes)); for (const [path, value] of Object.entries(changes)) setPath(this, path, value); return this; },
    async createEmbeddedDocuments(_type, data) {
      return data.map((entry, i) => {
        const item = { ...structuredClone(entry), id: `grant${this.items.size + i}`, type: entry.type, name: entry.name, flags: entry.flags, system: entry.system,
          getFlag(scope, key) { return this.flags?.[scope]?.[key]; }, async update(changes) { for (const [path, value] of Object.entries(changes)) setPath(this, path, value); } };
        this.items.set(item.id, item); return item;
      });
    }
  };
  actor.items.set("class", { id: "class", type: "class", name: "Caster", system: { levels: level, hd: { denomination: "d6" } }, flags: { ak5e: { chapterThreeId: CLASS_ID } }, parent: actor, getFlag(s, k) { return this.flags?.[s]?.[k]; } });
  actor.items.set("branch", { id: "branch", type: "subclass", name: "Core", system: {}, flags: { ak5e: { chapterThreeId: CORE_ID } }, parent: actor, getFlag(s, k) { return this.flags?.[s]?.[k]; } });
  documents.set(actor.uuid, actor); game.actors.set(actor.uuid, actor);
  return { actor, documents, get rollCount() { return rollCount; } };
}
function makeArt(actor, { id = "art", level = 1, type = "fire" } = {}) {
  const activity = { id: "activity", activation: { type: "action" }, damage: { parts: [[`2d6[${type}]`]] } };
  const item = { id, type: "spell", name: `Reviewed Art ${id}`, actor,
    system: { level, activities: new Map([["activity", activity]]), duration: {} }, updates: [],
    flags: { ak5e: { enabled: true, art: { enabled: true } } },
    getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
    updateSource(changes) { this.updates.push(structuredClone(changes)); for (const [path, value] of Object.entries(changes)) setPath(this, path, value); } };
  actor.items.set(item.id, item); return item;
}
function approved(actor, key, value) {
  actor.flags.ak5e.caster.rulings[key] = { value, source: "Reviewed printed text and recorded a table ruling." };
}
function completedCast(actor, item, { id = "cast", level = item.system.level, cost = 1, activation = "action" } = {}) {
  const cast = { id, itemId: item.id, level, cost, turn: casterTurn(actor), activation, completed: true, status: "complete", targets: [] };
  actor.flags.ak5e.caster.casts.push(cast); return cast;
}
function makeTarget(documents, { id = "target", owner = false, hp = 100 } = {}) {
  const target = { id, uuid: `Actor.${id}`, documentName: "Actor", isOwner: owner,
    flags: { ak5e: {} }, system: { attributes: { hp: { value: hp, max: hp, temp: 0 } } }, updates: [],
    getFlag(s, k) { return this.flags?.[s]?.[k]; }, async update(changes) { this.updates.push(structuredClone(changes)); for (const [path, value] of Object.entries(changes)) setPath(this, path, value); return this; } };
  documents.set(target.uuid, target); return target;
}

/* setup world (caster-setup.test.mjs conventions): GM settings-backed mappings */
function setupHarness() {
  const storage = {};
  globalThis.game = {
    user: { id: "gm", isGM: true, targets: new Set() },
    settings: { get: (_module, key) => storage[key] ?? {}, async set(_module, key, value) { storage[key] = structuredClone(value); } }
  };
  globalThis.ui = { notifications: { warn() {}, error() {}, info() {} } };
  globalThis.foundry = { utils: { randomID: () => "core-audit-setup" } };
  const docs = new Map();
  globalThis.fromUuidSync = uuid => docs.get(uuid) ?? null;
  globalThis.fromUuid = async uuid => docs.get(uuid) ?? null;
  return { storage, docs };
}
function spellDoc(docs, name, level) {
  const source = { id: name, uuid: `Item.${name}`, type: "spell", name, system: { level, activities: {} },
    toObject() { return { _id: this.id, type: this.type, name: this.name, system: this.system, flags: {} }; } };
  docs.set(source.uuid, source); return source;
}
function setupActor(level = 1) {
  const actor = {
    id: "caster", uuid: "Actor.caster", documentName: "Actor", type: "character", name: "Core Caster", isOwner: true,
    flags: { ak5e: {} }, system: {
      abilities: { int: { value: 14, mod: 2 }, wis: { value: 12, mod: 1 }, cha: { value: 10, mod: 0 }, con: { value: 12, mod: 1 } },
      attributes: { hp: { value: 8, max: 8 }, spellcasting: "int" }, currency: { cp: 0 },
      skills: {}, tools: {}, traits: { weaponProf: { custom: "Authored proficiency" }, armorProf: { custom: "" }, dr: { value: [] } }
    }, items: new Map(), effects: new Map(), writes: [], created: [],
    getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
    async update(changes) { this.writes.push(structuredClone(changes)); for (const [path, value] of Object.entries(changes)) setPath(this, path, value); return this; },
    async createEmbeddedDocuments(type, data) {
      const created = data.map((entry, index) => ({ ...structuredClone(entry), id: `created-${this.created.length + index}`, type: entry.type ?? type, parent: this,
        getFlag(scope, key) { return this.flags?.[scope]?.[key]; }, async update(changes) { for (const [path, value] of Object.entries(changes)) setPath(this, path, value); } }));
      this.created.push(...created);
      for (const item of created) (type === "ActiveEffect" ? this.effects : this.items).set(item.id, item);
      return created;
    }
  };
  const add = (id, itemType, flags, system = {}) => actor.items.set(id, { id, type: itemType, system, flags: { ak5e: flags }, parent: actor, getFlag(scope, key) { return this.flags?.[scope]?.[key]; } });
  add("caster-class", "class", { chapterThreeId: CLASS_ID }, { levels: level, hd: { denomination: "d6" } });
  add("wand", "weapon", { tableData: { properties: "Casting Unit" } });
  return actor;
}
function fullSetupChoices(actor, poolIds, branchId = CORE_ID) {
  const plan = getCasterSetupChoices(actor);
  const choice = {
    branch: branchId, ability: "int", pools: poolIds, saves: ["int", "wis"], skills: ["Arts", "Tech", "Insight"], tool: "Engineering Kit",
    castingUnit: "wand", startingEquipment: { mode: "cash" }, talents: {}, hp: { 1: { mode: "fixed", roll: 6 } }, asi: {}
  };
  for (const pending of plan.pending) {
    if (pending.key.startsWith("talents.") || pending.key === "hp.1") continue;
    if (pending.key.startsWith("hp.")) choice.hp[pending.key.slice(3)] = { mode: "fixed", roll: 4 };
    if (pending.key.startsWith("asi.")) choice.asi[pending.key.slice(4)] = { increases: [{ ability: "con", amount: 2 }] };
  }
  return choice;
}
async function applyCoreSetup(actor, pools, { harness, operationId, choicesOverride } = {}) {
  const names = [...new Set([...pools.flatMap(pool => pool.members.filter(member => !member.sourceId).map(member => member.name)), "Detect Magic", "Counterspell", "Dispel Magic"])];
  const members = standardPools.flatMap(pool => pool.members);
  for (const name of names) spellDoc(harness.docs, name, members.find(member => member.name === name)?.level ?? ({ "Detect Magic": 1, Counterspell: 3, "Dispel Magic": 3 }[name] ?? 1));
  harness.storage.casterArtMappings = Object.fromEntries(names.map(name => [nameKey(name), {
    requestedName: name, uuid: `Item.${name}`, source: "test reviewed mapping", mappedName: name
  }]));
  const choices = choicesOverride ?? fullSetupChoices(actor, pools.map(pool => pool.id));
  const pending = getCasterSetupChoices(actor).pending;
  const basic = pending.find(choice => choice.key === "talents.basic")?.options?.[0]?.value;
  if (basic) { choices.talents.basic = basic; if (pending.some(choice => choice.key === "talents.basicAt8")) choices.talents.basicAt8 = { mode: "upgrade", sourceId: basic }; }
  const advanced = pending.find(choice => choice.key === "talents.advanced")?.options?.[0]?.value;
  if (advanced) choices.talents.advanced = advanced;
  const preview = await previewCasterSetup(actor, { choices });
  assert.deepEqual(preview.pending, [], `setup pending: ${JSON.stringify(preview.pending)}`);
  assert.deepEqual(preview.missing, [], `setup mappings: ${JSON.stringify(preview.missing)}`);
  await applyCasterSetup(actor, { choices, contextKey: preview.contextKey, confirmed: true, operationId });
  return { choices, preview };
}

/* ---------- C0: planned surface (pinned assumption; manager may re-pin names at freeze) ---------- */
test("caster-core.mjs exposes the pinned Core API", async () => {
  const mod = await import("../scripts/caster-core.mjs").catch(() => null);
  assert.ok(mod, "planned module ak5e/scripts/caster-core.mjs must exist for the Core branch package");
  assert.equal(typeof mod.CORE_POOL_TYPES, "object", "caster-core.mjs must export CORE_POOL_TYPES");
  for (const name of ["coreDamageTypes", "validateCoreContext", "useRabbitFromHat", "powerFromWithin", "armEmpoweredArts", "selectSignatureArt", "rerollSignatureDice", "coreRest"])
    assert.equal(typeof mod[name], "function", `caster-core.mjs must export ${name}`);
  const ui = await import("../scripts/caster-core-ui.mjs").catch(() => null);
  assert.ok(ui, "planned module ak5e/scripts/caster-core-ui.mjs must exist for the Core branch package");
});

/* ---------- C1: Versatile Caster — Additional Arts Pool (C3:393–396) ---------- */
test("setup grants Core exactly one extra distinct Standard pool, its Arts always Prepared", async () => {
  const harness = setupHarness();
  const base = standardPools[0], versatile = standardPools.find(pool => pool.name === "Flame Arts");
  const actor = setupActor(1);
  await applyCoreSetup(actor, [base, versatile], { harness, operationId: "versatile-1" });
  const poolsState = [...actor.flags.ak5e.caster.pools].sort();
  assert.deepEqual(poolsState, [base.id, versatile.id].sort(), "Versatile Caster adds one distinct second pool at 1st level (L393–396)");
  const memberNames = new Set([...base.members, ...versatile.members].map(member => member.name));
  const granted = [...actor.items.values()].filter(item => item.type === "spell" && memberNames.has(item.name));
  assert.ok(granted.length > 0, "all Arts of both pools are learned as Items");
  for (const item of granted) assert.equal(item.system.prepared, 2, `${item.name}: pool Arts are always Prepared (L396; dnd5e prepared=2)`);
});

test("duplicate pool selection stays pending and writes nothing", async () => {
  setupHarness();
  const actor = setupActor(1);
  const preview = await previewCasterSetup(actor, { choices: { branch: CORE_ID, pools: [standardPools[0].id, standardPools[0].id] } });
  assert.ok(preview.pending.some(choice => choice.key === "pools"), "a pool already chosen may not be chosen again (L396 \"not chosen previously\")");
  assert.equal(actor.writes.length, 0, "a rejected setup writes nothing");
});

/* ---------- C2: Rabbit from the Hat (C3:398) ---------- */
test("borrows a Standard-pool Art at or below Maximum Art Level, once per Long Rest", async () => {
  const harness = setupHarness();
  const pools = [standardPools[0], standardPools.find(pool => pool.name === "Flame Arts")];
  const actor = setupActor(1);
  await applyCoreSetup(actor, pools, { harness, operationId: "rabbit-init" });
  const source = spellDoc(harness.docs, "Magic Missile", 1);
  harness.storage.casterArtMappings[nameKey("Magic Missile")] = { requestedName: "Magic Missile", uuid: source.uuid, source: "test reviewed mapping", mappedName: "Magic Missile" };
  const api = await loadCore();
  assert.equal(source.system.level, 1, "fixture: 1st-level Art within a 1st-level Caster's Maximum Art Level of 1 (L398)");
  const request = { confirmed: true, poolArtName: "Magic Missile" };
  const first = await api.useRabbitFromHat(actor, request, "rabbit-1");
  const borrowed = actor.items.get(first.itemId ?? first.item?.id ?? first.id);
  assert.ok(borrowed, `Rabbit from the Hat creates a usable borrowed grant, got ${JSON.stringify(first)}`);
  const grant = casterGrant(actor, borrowed, {});
  assert.equal(grant.blocked, undefined, "until the next Long Rest the borrowed Art may be cast as if part of a known pool (L398)");
  await assert.rejects(api.useRabbitFromHat(actor, request, "rabbit-2"), /Long Rest/, "once per Long Rest (L398)");
});

test("an Art above Maximum Art Level is refused and the use is not spent", async () => {
  const harness = setupHarness();
  const pools = [standardPools[0], standardPools.find(pool => pool.name === "Flame Arts")];
  const actor = setupActor(1);
  await applyCoreSetup(actor, pools, { harness, operationId: "rabbit-cap-init" });
  const high = spellDoc(harness.docs, "Acid Arrow", 2); // Corrosion Arts printed Level 2 (catalogue above)
  harness.storage.casterArtMappings[nameKey("Acid Arrow")] = { requestedName: "Acid Arrow", uuid: high.uuid, source: "test reviewed mapping", mappedName: "Acid Arrow" };
  const api = await loadCore();
  const itemsBefore = actor.items.size;
  await assert.rejects(api.useRabbitFromHat(actor, { confirmed: true, poolArtName: "Acid Arrow" }, "rabbit-over"),
    /no higher than your maximum Art level/, "the Art must be of equal or lower Level than the Maximum Art Level (L398; a 1st-level Caster's cap is 1)");
  assert.equal(actor.items.size, itemsBefore, "a refused Rabbit creates no borrowed Item");
  assert.equal(actor.flags.ak5e.caster.uses?.rabbit, undefined, "a refused Rabbit does not spend the use");
  const ok = await api.useRabbitFromHat(actor, { confirmed: true, poolArtName: "Acid Splash" }, "rabbit-ok");
  assert.ok(ok, `within cap the borrow still works after a refusal, got ${JSON.stringify(ok)}`);
});

test("the borrowed grant blocks with /expired/ at the Long Rest and re-arming after a Long Rest works", async () => {
  const harness = setupHarness();
  const pools = [standardPools[0], standardPools.find(pool => pool.name === "Flame Arts")];
  const actor = setupActor(1);
  await applyCoreSetup(actor, pools, { harness, operationId: "rabbit-expiry-init" });
  const source = spellDoc(harness.docs, "Magic Missile", 1);
  harness.storage.casterArtMappings[nameKey("Magic Missile")] = { requestedName: "Magic Missile", uuid: source.uuid, source: "test reviewed mapping", mappedName: "Magic Missile" };
  const api = await loadCore();
  const request = { confirmed: true, poolArtName: "Magic Missile" };
  const first = await api.useRabbitFromHat(actor, request, "rabbit-x1");
  const borrowed = actor.items.get(first.itemId ?? first.item?.id ?? first.id);
  await api.coreRest(actor, "long");
  assert.match(String(casterGrant(actor, borrowed, {}).blocked), /expired/, "until you complete a Long Rest — the borrowed castability expires (L398; DECISIONS Rabbit expiry)");
  const second = await api.useRabbitFromHat(actor, request, "rabbit-x2");
  assert.ok(second, "a Long Rest re-arms the feature (L398)");
});

/* ---------- C3: Power from Within (C3:403–406) ---------- */
test("a completed Short Rest activity regains ceil(Caster level/2) AP, confirmed first", async () => {
  const api = await loadCore();
  const { actor } = commandWorld({ level: 5, ap: 10 });
  const before = actor.writes.length;
  await assert.rejects(api.powerFromWithin(actor, { confirmed: false, restCompleted: true }, "pfw-cancel"), /Confirm/, "confirmation is required before use (WORKFLOW §3.2)");
  assert.equal(actor.writes.length, before, "a cancelled Power from Within changes nothing");
  await assert.rejects(api.powerFromWithin(actor, { confirmed: true, restCompleted: false }, "pfw-no-rest"), /Short Rest/, "the meditation must be a completed Short Rest activity (L403–404)");
  const first = await api.powerFromWithin(actor, { confirmed: true, restCompleted: true }, "pfw-1");
  assert.equal(actor.flags.ak5e.artsPoints.value, 13, "ceil(5/2) = 3 expended Arts Points regained (L404)");
  assert.equal(first?.recovered, 3, "the receipt reports the regained amount");
});

test("usable once per Long Rest; recovery clamps at the AP maximum; a Long Rest re-arms it", async () => {
  const api = await loadCore();
  const { actor } = commandWorld({ level: 20, ap: 27, maximum: 35 });
  const first = await api.powerFromWithin(actor, { confirmed: true, restCompleted: true }, "pfw-cap");
  assert.equal(actor.flags.ak5e.artsPoints.value, 35, "recovery never exceeds the AP maximum (map row: capped recovery)");
  assert.ok(first?.recovered <= 8, `regains no more than the 8 expended points (L404), got ${first?.recovered}`);
  await assert.rejects(api.powerFromWithin(actor, { confirmed: true, restCompleted: true }, "pfw-again"), /Long Rest/, "once used, it cannot be used again until a Long Rest (L406)");
  await api.coreRest(actor, "short");
  await assert.rejects(api.powerFromWithin(actor, { confirmed: true, restCompleted: true, }, "pfw-after-sr"), /Long Rest/, "a Short Rest does not re-arm the feature (L406)");
  await api.coreRest(actor, "long");
  actor.flags.ak5e.artsPoints.value = 20;
  const second = await api.powerFromWithin(actor, { confirmed: true, restCompleted: true }, "pfw-armed");
  assert.equal(actor.flags.ak5e.artsPoints.value, 30, "after a Long Rest the feature works again: ceil(20/2) = 10 regained (L404/L406)");
  assert.equal(second?.recovered, 10);
});

/* ---------- C4: Empowered Arts (C3:408–410) ---------- */
test("context gates: Core level 6, a current Turn, and one use per Turn", async () => {
  const api = await loadCore();
  const under = commandWorld({ level: 5 });
  assert.throws(() => api.validateCoreContext(under.actor, makeArt(under.actor), { empowered: true }), /Core level 6/, "Empowered Arts requires Core level 6 (L408)");
  const wrongBranch = commandWorld({ level: 10 });
  wrongBranch.actor.items.get("branch").flags.ak5e.chapterThreeId = "subclass-caster-mystic";
  assert.throws(() => api.validateCoreContext(wrongBranch.actor, makeArt(wrongBranch.actor), { empowered: true }), /Core level 6/, "a non-Core branch has no Empowered Arts");
  const noTurn = commandWorld({ level: 6 });
  globalThis.game.combat = null;
  assert.throws(() => api.validateCoreContext(noTurn.actor, makeArt(noTurn.actor), { empowered: true }), /current Turn/, "the Art must have been cast this Turn (L410)");
  const used = commandWorld({ level: 6 });
  used.actor.flags.ak5e.caster.uses.empowered = casterTurn(used.actor);
  assert.throws(() => api.validateCoreContext(used.actor, makeArt(used.actor), { empowered: true }), /already been used this Turn/, "once per Turn (L410)");
  const fresh = commandWorld({ level: 6 });
  assert.doesNotThrow(() => api.validateCoreContext(fresh.actor, makeArt(fresh.actor), { empowered: true }), "Core 6+ on its own Turn with an unused feature passes the gates");
});

test("the damage roll adds Proficiency Bonus, plus the casting modifier only for a Levelled Art, once", async () => {
  const api = await loadCore();
  const env = commandWorld({ level: 10, prof: 4, intMod: 5 });
  const actor = env.actor;
  const item = makeArt(actor, { id: "levelled", level: 1 });
  item.flags.ak5e.casterCast = { castId: "emp-levelled", empowered: true };
  completedCast(actor, item, { id: "emp-levelled", level: 1, cost: 2 });
  class Activity {
    static metadata = { usage: { actions: {} } };
    constructor() { this.actor = actor; this.item = item; }
    _processDamagePart() {}
    getDamageConfig() { return { rolls: [{ parts: ["1d8"], options: {} }] }; }
    async rollDamage() { return [{ ...this.getDamageConfig().rolls[0], toJSON() { return { parts: this.parts }; } }]; }
  }
  globalThis.CONFIG = { DND5E: { activityTypes: { audit: { documentClass: Activity } } } };
  patchCasterDamage();
  const activity = new Activity();
  const parts = (await activity.rollDamage())[0].parts;
  assert.deepEqual(parts, ["1d8", "9"], `a Levelled Art adds Proficiency (4) + the Spellcasting Ability Modifier (5) once (L410), got ${JSON.stringify(parts)}`);
  assert.equal(actor.flags.ak5e.caster.uses.empowered, casterTurn(actor), "the completed damage roll consumes the use (map row)");
  const repeat = (await activity.rollDamage())[0].parts;
  assert.deepEqual(repeat, ["1d8"], "Empowered Arts is Once per Turn and does not stack on a second roll (L410)");
  const cantripActor = commandWorld({ level: 10, prof: 4, intMod: 5 }).actor;
  const cantrip = makeArt(cantripActor, { id: "cantrip", level: 0 });
  cantrip.flags.ak5e.casterCast = { castId: "emp-cantrip", empowered: true };
  completedCast(cantripActor, cantrip, { id: "emp-cantrip", level: 0, cost: 0 });
  class CantripActivity extends Activity { constructor() { super(); this.actor = cantripActor; this.item = cantrip; } }
  const cantripRoll = (await new CantripActivity().rollDamage())[0].parts;
  assert.deepEqual(cantripRoll, ["1d8", "4"], `a Cantrip gains only the Proficiency Bonus, never the casting modifier (L410: \"If it was a Levelled Art\"), got ${JSON.stringify(cantripRoll)}`);
});

test("a cancelled damage roll keeps the use; a completed roll consumes it", async () => {
  const env = commandWorld({ level: 6, prof: 3, intMod: 2 });
  const actor = env.actor;
  const item = makeArt(actor, { id: "cancelled", level: 1 });
  item.flags.ak5e.casterCast = { castId: "emp-cancel", empowered: true };
  completedCast(actor, item, { id: "emp-cancel", level: 1, cost: 1 });
  class Activity {
    static metadata = { usage: { actions: {} } };
    constructor() { this.actor = actor; this.item = item; this.cancel = true; }
    _processDamagePart() {}
    getDamageConfig() { return { rolls: [{ parts: ["1d8"], options: {} }] }; }
    async rollDamage() { return this.cancel ? [] : [{ ...this.getDamageConfig().rolls[0], toJSON() { return { parts: this.parts }; } }]; }
  }
  globalThis.CONFIG = { DND5E: { activityTypes: { auditCancel: { documentClass: Activity } } } };
  patchCasterDamage();
  const activity = new Activity();
  assert.deepEqual(await activity.rollDamage(), [], "a cancelled roll returns nothing");
  assert.equal(actor.flags.ak5e.caster.uses.empowered, undefined, "a cancelled roll does not consume the use (map row: cancelled rolls retain use)");
  activity.cancel = false;
  const rolled = (await activity.rollDamage())[0].parts;
  assert.deepEqual(rolled, ["1d8", "5"], "the completed roll applies PB (3) + casting modifier (2)");
  assert.equal(actor.flags.ak5e.caster.uses.empowered, casterTurn(actor), "and consumes the use on completion (map row)");
});

/* ---------- C5: Master of the Elements (C3:412–431) ---------- */
test("the pool→Damage Type table matches the printed table exactly and is frozen", async () => {
  const api = await loadCore();
  assert.deepEqual({ ...api.CORE_POOL_TYPES }, {
    corrosion: "acid", crude: "force", earth: "piercing", electric: "lightning", flame: "fire",
    fluid: "bludgeoning", frost: "cold", light: "radiant", psychic: "psychic", spatial: "thunder", wind: "slashing"
  }, "the eleven printed rows L421–429: Earth = piercing and Fluid = bludgeoning per the Core table (map row)");
  assert.ok(Object.isFrozen(api.CORE_POOL_TYPES), "the table is frozen");
  assert.deepEqual(api.coreDamageTypes(["standard-art-pool-earth-arts", "standard-art-pool-fluid-arts"]).sort(), ["bludgeoning", "piercing"], "types derive from the chosen pools only");
});

test("Elemental Being creates one managed resistance effect for exactly the chosen pools' types at 10+ and never overwrites authored traits", async () => {
  const harness = setupHarness();
  const pools = [standardPools.find(pool => pool.name === "Earth Arts"), standardPools.find(pool => pool.name === "Fluid Arts")];
  const actor = setupActor(10);
  actor.system.traits.dr = { value: ["fire"] };
  const { choices, preview } = await applyCoreSetup(actor, pools, { harness, operationId: "elements-10" });
  assert.equal(preview.createEffects.length, 1, "exactly one managed resistance effect (L415)");
  const planned = preview.createEffects[0];
  assert.deepEqual(planned.changes.map(change => [change.key, change.mode, change.value]).sort(),
    [["system.traits.dr.value", 2, "bludgeoning"], ["system.traits.dr.value", 2, "piercing"]], "ADD-mode changes for the table types, never Set-writes over authored traits");
  assert.equal(planned.flags.ak5e.casterManagedEffect.sourceId, ELEMENTS_ID, "the effect is managed under the Master of the Elements feature id");
  assert.deepEqual(actor.system.traits.dr.value, ["fire"], "authored resistances are not overwritten (map row)");
  const below = setupActor(9);
  const previewBelow = await previewCasterSetup(below, { choices: fullSetupChoices(below, pools.map(pool => pool.id)) });
  assert.equal((previewBelow.createEffects ?? []).filter(effect => effect.flags?.ak5e?.casterManagedEffect?.sourceId === ELEMENTS_ID).length, 0, "no Elemental Being resistance before 10th level (L412)");
});

test("Maverick demands Core 10, a type of a chosen pool, and an AP-funded cast — otherwise refused, never silently applied", async () => {
  const api = await loadCore();
  const under = commandWorld({ level: 9, pools: ["standard-art-pool-flame-arts"] });
  assert.throws(() => api.validateCoreContext(under.actor, makeArt(under.actor), { maverick: "fire", mode: "ap" }), /Core level 10/, "Maverick requires Core level 10 (L412/L417)");
  const wrongBranch = commandWorld({ level: 10, pools: ["standard-art-pool-flame-arts"] });
  wrongBranch.actor.items.get("branch").flags.ak5e.chapterThreeId = "subclass-caster-splash";
  assert.throws(() => api.validateCoreContext(wrongBranch.actor, makeArt(wrongBranch.actor), { maverick: "fire", mode: "ap" }), /Core level 10/, "a non-Core branch has no Maverick");
  const unchosen = commandWorld({ level: 10, pools: ["standard-art-pool-flame-arts"] });
  assert.throws(() => api.validateCoreContext(unchosen.actor, makeArt(unchosen.actor), { maverick: "cold", mode: "ap" }), /chosen Core pool/, "the replacement type must be associated with a chosen Standard Arts Pool (L417)");
  const freeCast = commandWorld({ level: 10, pools: ["standard-art-pool-flame-arts"] });
  assert.throws(() => api.validateCoreContext(freeCast.actor, makeArt(freeCast.actor), { maverick: "fire", mode: "free" }), /AP-funded/, "Maverick applies only when casting using Arts Points (L417)");
  const ritualCast = commandWorld({ level: 10, pools: ["standard-art-pool-flame-arts"] });
  assert.throws(() => api.validateCoreContext(ritualCast.actor, makeArt(ritualCast.actor), { maverick: "fire", mode: "ritual" }), /AP-funded/, "a ritual cast does not use Arts Points (L417)");
  const valid = commandWorld({ level: 10, pools: ["standard-art-pool-flame-arts"] });
  assert.doesNotThrow(() => api.validateCoreContext(valid.actor, makeArt(valid.actor), { maverick: "fire", mode: "ap" }), "an AP-funded cast with a chosen pool's type passes");
});

test("Maverick rewrites only this cast's roll types; the underlying Art is unchanged", async () => {
  const env = commandWorld({ level: 10, pools: ["standard-art-pool-flame-arts"] });
  const actor = env.actor;
  const item = makeArt(actor, { id: "mav-art", level: 2, type: "fire" });
  item.flags.ak5e.casterCast = { castId: "mav-cast", maverick: "psychic" };
  completedCast(actor, item, { id: "mav-cast", level: 2, cost: 2 });
  class Activity {
    static metadata = { usage: { actions: {} } };
    constructor() { this.actor = actor; this.item = item; }
    _processDamagePart() {}
    getDamageConfig() { return { rolls: [{ parts: ["2d6[fire]"], options: { type: "fire" } }] }; }
    async rollDamage() { return [this.getDamageConfig().rolls[0]]; }
  }
  globalThis.CONFIG = { DND5E: { activityTypes: { auditMav: { documentClass: Activity } } } };
  patchCasterDamage();
  const config = new Activity().getDamageConfig();
  assert.deepEqual(config.rolls.map(roll => [roll.options.type, roll.options.types]), [["psychic", ["psychic"]]], "the cast's roll damage type is replaced by the chosen pool's type (L417)");
  assert.deepEqual(item.system.activities.get("activity").damage.parts, [["2d6[fire]"]], "the underlying Art's authored damage type is untouched (map row: underlying Art unchanged)");
  assert.equal(item.updates.length, 0, "Maverick never updates the Art Item");
});

/* ---------- C6: Savant (C3:433–443) ---------- */
test("selection: Long Rest activity required, known Art of level 5 or less, damaging confirmation, Cantrips gated behind a recorded ruling, one Signature at a time, the Art itself never edited", async () => {
  const api = await loadCore();
  const { actor } = commandWorld({ level: 15 });
  const chosen = makeArt(actor, { id: "sig-5", level: 5 });
  const snapshot = JSON.stringify({ name: chosen.name, level: chosen.system.level, activities: [...chosen.system.activities.keys()] });
  await assert.rejects(api.selectSignatureArt(actor, { confirmed: true, itemId: "sig-5", damaging: true }, "sig-no-activity"), /Long Rest/, "the ritual is a Long Rest activity (L436)");
  const tooHigh = makeArt(actor, { id: "sig-6", level: 6 });
  await assert.rejects(api.selectSignatureArt(actor, { confirmed: true, itemId: "sig-6", damaging: true, restCompleted: true }, "sig-high"), /level 5 or less/, "only known Arts of 5th level or less qualify (L436)");
  const missing = { confirmed: true, itemId: "sig-5", restCompleted: true };
  await assert.rejects(api.selectSignatureArt(actor, missing, "sig-no-damaging"), /Damage/, "the Caster must confirm whether the Art deals Damage (L438–440 selection contract)");
  const cantrip = makeArt(actor, { id: "sig-0", level: 0 });
  await assert.rejects(api.selectSignatureArt(actor, { confirmed: true, itemId: "sig-0", damaging: true, restCompleted: true }, "sig-cantrip"), /ruling|permit|Cantrip/i, "Cantrip eligibility is an open ruling (TODO Core; DECISIONS): it must be gated, not silently allowed or denied");
  approved(actor, "signatureCantrips", true);
  const picked = await api.selectSignatureArt(actor, { confirmed: true, itemId: "sig-5", damaging: true, restCompleted: true }, "sig-5");
  assert.equal(actor.flags.ak5e.caster.signature?.itemId, "sig-5", "the Signature is recorded on the Caster (L436)");
  assert.equal(picked?.itemId, "sig-5");
  await api.selectSignatureArt(actor, { confirmed: true, itemId: "sig-0", damaging: false, restCompleted: true }, "sig-cantrip-2");
  assert.deepEqual(actor.flags.ak5e.caster.signature, { itemId: "sig-0", damaging: false }, "only one Signature Art at a time; the newer selection replaces the older (L443)");
  assert.equal(JSON.stringify({ name: chosen.name, level: chosen.system.level, activities: [...chosen.system.activities.keys()] }), snapshot, "selection does not edit the Art's authored data (DECISIONS: Signature selection does not edit authored activities/effects)");
  assert.equal(chosen.updates.length, 0, "no update was written to the Art Item");
});

test("a non-damaging Signature quotes 2 fewer AP, to a minimum of 0", async () => {
  const { actor } = commandWorld({ level: 15, maxArtLevel: 3 });
  const art = makeArt(actor, { id: "silent", level: 3 });
  actor.flags.ak5e.caster.signature = { itemId: art.id, damaging: false };
  const grant = casterGrant(actor, art, {});
  assert.equal(grant.caster?.signatureNonDamaging, true, "the grant exposes the non-damaging Signature reading");
  const quote = quoteArt(artsState(actor), 3, 3, grant, { mode: "ap" });
  assert.equal(quote.cost, 1, "3 AP nominal minus the Savant 2 at full Art Level, where no Growing Power applies (L440)");
  assert.ok(quote.modifiers.some(modifier => modifier.source === "Savant" && modifier.amount === -2), "the discount is attributed to Savant on the quote");
  const cheapEnv = commandWorld({ level: 15, maxArtLevel: 1 });
  const cheapArt = makeArt(cheapEnv.actor, { id: "silent-1", level: 1 });
  cheapEnv.actor.flags.ak5e.caster.signature = { itemId: cheapArt.id, damaging: false };
  const cheapGrant = casterGrant(cheapEnv.actor, cheapArt, {});
  const cheap = quoteArt(artsState(cheapEnv.actor), 1, 1, cheapGrant, { mode: "ap" });
  assert.equal(cheap.cost, 0, "the discount reaches a minimum of 0 and does not go below (L440)");
});

test("Savant combined with Growing Power raises the cost-order reading instead of inventing an order", async () => {
  const { actor } = commandWorld({ level: 15 });
  const art = makeArt(actor, { id: "silent2", level: 1 });
  actor.flags.ak5e.caster.signature = { itemId: art.id, damaging: false };
  const grant = casterGrant(actor, art, {});
  assert.throws(() => quoteArt(artsState(actor), 1, 1, grant, { mode: "ap" }),
    error => error.name === "AK5eReading" && error.key === "costOrder",
    "two overlapping discounts must raise the GM cost-order reading; no order is invented (DECISIONS cost-order ruling)");
  grant.caster.costOrder = "discountsThenSurcharge";
  const quote = quoteArt(artsState(actor), 1, 1, grant, { mode: "ap" });
  assert.equal(quote.cost, 0, "with the recorded reading the quote resolves at the 0 minimum");
  assert.ok(quote.modifiers.some(modifier => modifier.source === "Savant"), "the Savant discount still appears on the resolved quote");
});

test("reroll policy is ruled, dice above 3 refused, only the Signature's own cast may reroll", async () => {
  const api = await loadCore();
  const { actor } = commandWorld({ level: 15 });
  const art = makeArt(actor, { id: "sig-art", level: 3 });
  actor.flags.ak5e.caster.signature = { itemId: art.id, damaging: true };
  const cast = completedCast(actor, art, { id: "sig-cast" });
  await assert.rejects(api.rerollSignatureDice(actor, { confirmed: true, castId: "sig-cast", indices: [0], results: [2], faces: 8 }, "dice-unruled"),
    /ruling|review|policy|reroll/i, "repeated/interactive rerolls stay behind a recorded ruling (TODO open ruling; DECISIONS)");
  const foreign = makeArt(actor, { id: "other-art", level: 2 });
  completedCast(actor, foreign, { id: "other-cast" });
  await assert.rejects(api.rerollSignatureDice(actor, { confirmed: true, castId: "other-cast", indices: [0], results: [1], faces: 8 }, "dice-foreign"),
    /Signature/, "only the Signature Art's own damage roll may use the benefit (L436–438)");
  await assert.rejects(api.rerollSignatureDice(actor, { confirmed: true, castId: "sig-cast", indices: [2], results: [6], faces: 8 }, "dice-high"),
    /3 or less/, "dice showing more than 3 cannot be rerolled (L438)");
});

test("Signature damage ignores DR and resistance, keeps vulnerability, immunity still applies, and unowned targets go through the GM", async () => {
  const { actor, documents } = commandWorld({ level: 15, ap: 20 });
  const art = makeArt(actor, { id: "burn", level: 3, type: "fire" });
  actor.flags.ak5e.caster.signature = { itemId: art.id, damaging: true };
  completedCast(actor, art, { id: "sig-damage-cast" });
  const owned = makeTarget(documents, { id: "owned", owner: true });
  const result = await casterCommand(actor, "damage", { confirmed: true, castId: "sig-damage-cast", targetUuid: owned.uuid,
    amount: 10, type: "fire", reduction: 5, resistance: true, vulnerability: true, immunity: false }, "sig-hp");
  assert.equal(result.final, 20, "DR 5 and resistance are ignored (L439) while vulnerability still applies (DECISIONS: retains vulnerability)");
  const immune = await casterCommand(actor, "damage", { confirmed: true, castId: "sig-damage-cast", targetUuid: owned.uuid,
    amount: 10, type: "fire", reduction: 0, resistance: false, vulnerability: false, immunity: true }, "sig-immune");
  assert.equal(immune.final, 0, "immunity remains effective for a Signature Art");
  const unowned = makeTarget(documents, { id: "foe", owner: false });
  await assert.rejects(casterCommand(actor, "damage", { confirmed: true, castId: "sig-damage-cast", targetUuid: unowned.uuid,
    amount: 10, type: "fire", reduction: 0, resistance: false, vulnerability: false, immunity: false }, "sig-relay"),
    /GM/, "Damage to an unowned target is applied through the GM client (WORKFLOW §3.2)");
});

/* ---------- C7: trust the table (WORKFLOW §3.2) ---------- */
test("Core feature commands confirm first, write nothing on cancel, and roll no dice themselves", async () => {
  const api = await loadCore();
  const env = commandWorld({ level: 15, ap: 10 });
  const before = env.actor.writes.length;
  await assert.rejects(api.powerFromWithin(env.actor, { confirmed: false, restCompleted: true }, "tt-1"), /Confirm/);
  await assert.rejects(api.selectSignatureArt(env.actor, { confirmed: false, itemId: "x", damaging: true, restCompleted: true }, "tt-2"), /Confirm/);
  const art = makeArt(env.actor, { id: "cast-art", level: 1 });
  completedCast(env.actor, art, { id: "tt-cast" });
  await assert.rejects(api.armEmpoweredArts(env.actor, { confirmed: false, castId: "tt-cast" }, "tt-3"), /Confirm/);
  assert.equal(env.actor.writes.length, before, "cancelled feature uses create no writes or receipts");
  const used = await api.armEmpoweredArts(env.actor, { confirmed: true, castId: "tt-cast" }, "tt-4");
  assert.equal(env.rollCount, 0, "arming Empowered Arts rolls nothing itself — no auto-rolled damage (WORKFLOW §3.2; L410 waits for the Caster's own roll)");
  assert.ok(used, "the arming returns a receipt/instruction");
});
