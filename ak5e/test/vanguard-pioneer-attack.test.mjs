import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CHAPTER_THREE_CLASSES } from "../scripts/chapter-three-content.mjs";
import { CHAPTER_FOUR_EQUIPMENT } from "../scripts/chapter-four-content.mjs";
import { vanguardExtensionContext, vanguardProgressionContributions, vanguardOwnerControls, vanguardAttackActionBonus,
  checkVanguardTipGrant, vanguardTipGrantSourceKinds } from "../scripts/vanguard-extensions.mjs";
import { previewVanguardProgression, applyVanguardProgression } from "../scripts/vanguard-progression.mjs";
import { getOperatorSkillChoices } from "../scripts/operator-progression.mjs";
import { executeOperatorCommand, actorOperatorSkills, getIntegratedOperatorState } from "../scripts/operator-skills.mjs";
import { emitAk5eEvent } from "../scripts/trigger-events.mjs";
import { vanguardUses } from "../scripts/vanguard-uses.mjs";
import { setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem, createTestCombat, triggerLongRest } from "./base-classes-fixture.mjs";

/*
 * Adversarial challenger suite for the Vanguard Pioneer branch. Written from the source rules
 * (AK5e_1.3.1 chapter 3, Pioneer, L8416-8475) and ak5e/DECISIONS.md, not from the implementation.
 *
 * Behaviour map (the same eight features as vanguard-pioneer-frozen.test.mjs):
 *   B1 Heavy Duty proficiency and HP          B5 Cycle of Violence refund
 *   B2 Auramancy controls, radius and effects B6 Breakthrough slot, exchange and charging exception
 *   B3 committed SP thresholds and Tip grants B7 (see B4) Moment of Power and Skill Haste
 *   B4 Moment of Power and Tactical Burst     B8 (see B2) out-of-turn toggle
 * Note: the map above is the eight-feature order used by the frozen suite; B7 and B8 are the
 * Skill Haste and out-of-turn toggle behaviours, which the names below label explicitly.
 */

const PIONEER_ID = "subclass-vanguard-pioneer";
const AGENT_ID = "subclass-vanguard-agent";
const PIONEER_FILE = fileURLToPath(new URL("../scripts/pioneer-features.mjs", import.meta.url));
const ELITE_CLASSES = ["Guard", "Defender", "Marksman", "Specialist", "Vanguard"];
const SCENE = { id: "scene-attack", grid: { size: 100, distance: 5, units: "ft", type: 0 } };
const BURST_KIND = "pioneer-tactical-burst";
const THRESHOLD_KIND = "pioneer-threshold";

let pioneerApi;
async function loadPioneer() {
  if (pioneerApi) return pioneerApi;
  try {
    pioneerApi = await import("../scripts/pioneer-features.mjs");
  } catch (error) {
    pioneerApi = { loadError: error };
  }
  return pioneerApi;
}

function requirePioneer(api) {
  assert.ok(!api.loadError,
    `Pioneer feature behavior is missing: pioneer-features.mjs did not load (${api.loadError?.code ?? api.loadError?.message})`);
  assert.equal(typeof api.registerPioneerFeatureHooks, "function", "pioneer-features.mjs must export registerPioneerFeatureHooks");
  assert.equal(typeof api.registerPioneerVanguardExtension, "function", "pioneer-features.mjs must export registerPioneerVanguardExtension");
  api.registerPioneerFeatureHooks();
  api.registerPioneerVanguardExtension();
}

function exported(api, name) {
  assert.equal(typeof api[name], "function", `pioneer-features.mjs must export ${name} for this behaviour`);
  return api[name];
}

function classRecord(id) {
  return CHAPTER_THREE_CLASSES.find(entry => entry.kind === (id === "class-vanguard" ? "class" : "subclass") && entry.id === id);
}

function pioneerActor(level = 1, options = {}) {
  const vanguard = classRecord("class-vanguard");
  const branchId = options.branch ?? PIONEER_ID;
  const branch = classRecord(branchId);
  assert.ok(vanguard && branch, "the source catalogue contains Vanguard and the selected branch record");
  const actor = createTestActor({ name: options.name ?? "Pioneer owner", owner: options.owner ?? true, level,
    ownership: options.ownership,
    system: {
      attributes: { prof: Math.floor((level - 1) / 4) + 2, hp: { value: options.hp ?? 20, max: options.hp ?? 20, temp: 0 } },
      traits: { saves: { value: [] }, armorProf: { value: options.armorProf ?? [] }, weaponProf: { value: [] }, toolProf: { value: [] } },
      skills: { acr: { value: 0 }, ath: { value: 0 }, ste: { value: 0 } },
      abilities: { str: { value: 12, mod: 1 }, dex: { value: 16, mod: 3 }, con: { value: 14, mod: 2 }, int: { value: 10, mod: 0 }, wis: { value: 10, mod: 0 }, cha: { value: 12, mod: 1 } },
      currency: { cp: 0 },
      ...options.system
    },
    flags: { ak5e: { vanguard: { enabled: true }, ...options.flags } }
  });
  actor.items.set("vanguard-class", createTestItem({ id: "vanguard-class", name: "Vanguard", type: "class",
    system: { ...vanguard.systemData, levels: level }, flags: { ak5e: { chapterThreeId: vanguard.id } } }, actor));
  actor.items.set("vanguard-branch", createTestItem({ id: "vanguard-branch", name: branch.name, type: "subclass",
    system: branch.systemData, flags: { ak5e: { chapterThreeId: branch.id } } }, actor));
  return actor;
}

const progressionChoices = (branch, level) => ({ branch, martialDCAbility: "dex", saves: ["str"],
  skills: ["acr", "ath", "ste"], tool: "Messenger Kit", startingEquipment: { mode: "existing" },
  hp: Object.fromEntries(Array.from({ length: level }, (_, index) => [index + 1, { mode: "fixed" }])) });

const operatorFlags = (points, extra = {}) => ({ operatorSkills: { enabled: true, points, maximum: 80, start: 0, active: null,
  operatorEvents: [], receipts: [], ...extra } });
const activationEvent = (id, spSpent, extra = {}) => ({ id: `${id}:activation`, activationId: id, kind: "activation", committed: true, spSpent, ...extra });
const endEvent = id => ({ id: `${id}:end`, activationId: id, kind: "end", committed: true });

function skillItem(actor, name, sourceId, cost, duration = "Instant") {
  const item = createTestItem({ name, type: "feat", flags: { ak5e: { operatorSkill: { sourceId, cost, start: 0, methods: ["automatic"],
    activation: "Action", duration } } } }, actor);
  actor.items.set(item.id, item);
  return item;
}

/** Player-side setup: a non-GM user with no active GM connected. Call before creating any document. */
function asPlayer() {
  setupFoundryGlobals({ isGM: false, activeGM: null });
  return game.user;
}

function tokenFor(actor, { x = 0, y = 0, disposition = 1, key }) {
  const token = { id: `token-${key}`, uuid: `Scene.scene-attack.Token.${key}`, name: actor.name, actor, x, y, width: 1, height: 1,
    elevation: 0, disposition, parent: SCENE, getCenterPoint: () => ({ x, y }) };
  globalThis._ak5eTestDocs.set(token.uuid, token);
  return token;
}

const controlsFor = (actor, level) => vanguardOwnerControls(vanguardExtensionContext(actor, { branchId: PIONEER_ID, level, purpose: "controls" }));
const enableAura = (actor, tag) => vanguardUses.command(actor, "pioneerAuramancy", { action: "toggle", enabled: true, confirmed: true }, `${tag}-on`);
async function chooseBase(actor, aura, tag) {
  await vanguardUses.command(actor, "pioneerAuraRest", { confirmed: true }, `${tag}-rest`);
  await vanguardUses.command(actor, "pioneerAuraChoice", { grantId: "base", aura, confirmed: true }, `${tag}-choice`);
}
const flush = async () => { for (let i = 0; i < 20; i += 1) await new Promise(resolve => setImmediate(resolve)); };
/** Every object reachable from a value, so assertions do not depend on the exact nesting of a contribution. */
function allObjects(value, out = []) {
  if (value && typeof value === "object") { out.push(value); for (const child of Object.values(value)) allObjects(child, out); }
  return out;
}
const auraNamed = (actor, name) => Array.from(actor.effects?.values?.() ?? []).filter(effect => effect.name === name);

/** Runs the Pioneer's threshold reconstruction in a child process so a non-terminating loop cannot stall the suite. */
function thresholdInChild(spSpent, timeout) {
  const script = `import(${JSON.stringify(pathToFileURL(PIONEER_FILE).href)}).then(m => {
    const actor = { uuid: "Actor.child", getFlag: (scope, key) => key === "operatorSkills"
      ? { operatorEvents: [{ id: "child:activation", activationId: "child", kind: "activation", committed: true, spSpent: ${spSpent} }] } : undefined };
    const out = m.pioneerThresholds(actor, { resets: [] });
    process.stdout.write(JSON.stringify({ grants: out.grants.length, remainder: out.remainder }));
  }).catch(error => { process.stderr.write(String(error && error.stack || error)); process.exit(2); });`;
  const run = spawnSync(process.execPath, ["-e", script], { encoding: "utf8", timeout, maxBuffer: 1 << 20 });
  return { timedOut: run.error?.code === "ETIMEDOUT" || run.signal === "SIGTERM", status: run.status, stdout: run.stdout ?? "", stderr: run.stderr ?? "" };
}

test.beforeEach(() => setupFoundryGlobals());
test.afterEach(() => teardownFoundryGlobals());

/* ------------------------------------------------------------------ B1 Heavy Duty */

test("B1 Heavy Duty: the level-1 grant adds Medium Armour and never Heavy Armour", async () => {
  const api = await loadPioneer(); requirePioneer(api);
  const actor = pioneerActor(1);
  const choices = progressionChoices(PIONEER_ID, 1);
  const plan = await previewVanguardProgression(actor, choices);
  await applyVanguardProgression(actor, { confirmed: true, contextKey: plan.contextKey, choices });
  const armour = actor.system.traits.armorProf.value;
  assert.ok(armour.includes("med"), "Pioneer gains Medium Armour proficiency");
  assert.ok(!armour.includes("hvy"), "Heavy Duty grants Medium Armour only, not Heavy Armour");
  assert.ok(armour.includes("lgt") && armour.includes("shl"), "ordinary Vanguard armour proficiencies remain");
});

test("B1 Heavy Duty: Heavy Melee becomes proficient by source category, Light Melee comes from the Vanguard class, and an unrelated category stays non-proficient", async () => {
  const api = await loadPioneer(); requirePioneer(api);
  const actor = pioneerActor(1);
  // Source chapter 3 gives the Vanguard class "Weapons: Light Melee" (line 7924), and Heavy Duty adds Heavy Melee (line 8385).
  // The negative control is a category that neither grants, so a blanket weapon grant would be caught.
  const other = CHAPTER_FOUR_EQUIPMENT.find(entry => entry.kind === "weapon" && entry.tableData?.category &&
    !["Light Melee Weapons", "Heavy Melee Weapons"].includes(entry.tableData.category));
  assert.ok(other, "the equipment catalogue contains a weapon category that neither the class nor Heavy Duty grants");
  const heavy = createTestItem({ name: "Heavy test blade", type: "weapon", system: { proficient: 0 },
    flags: { ak5e: { tableData: { category: "Heavy Melee Weapons" } } } }, actor);
  const light = createTestItem({ name: "Light test blade", type: "weapon", system: { proficient: 0 },
    flags: { ak5e: { tableData: { category: "Light Melee Weapons" } } } }, actor);
  const unrelated = createTestItem({ name: "Unrelated test weapon", type: "weapon", system: { proficient: 0 },
    flags: { ak5e: { tableData: { category: other.tableData.category } } } }, actor);
  actor.items.set(heavy.id, heavy);
  actor.items.set(light.id, light);
  actor.items.set(unrelated.id, unrelated);
  const choices = progressionChoices(PIONEER_ID, 1);
  const plan = await previewVanguardProgression(actor, choices);
  await applyVanguardProgression(actor, { confirmed: true, contextKey: plan.contextKey, choices });
  assert.equal(heavy.system.proficient, 1, "Heavy Melee Weapons by source category become proficient (Heavy Duty)");
  assert.equal(light.system.proficient, 1, "Light Melee Weapons become proficient from the Vanguard class grant");
  assert.equal(unrelated.system.proficient, 0, `${other.tableData.category} is not made proficient by Pioneer progression`);
});

test("B1 Heavy Duty: replaying the same progression never duplicates proficiency entries", async () => {
  const api = await loadPioneer(); requirePioneer(api);
  const actor = pioneerActor(1);
  const choices = progressionChoices(PIONEER_ID, 1);
  for (let pass = 0; pass < 2; pass += 1) {
    const plan = await previewVanguardProgression(actor, choices);
    await applyVanguardProgression(actor, { confirmed: true, contextKey: plan.contextKey, choices });
  }
  const armour = actor.system.traits.armorProf.value, weapons = actor.system.traits.weaponProf.value;
  assert.equal(new Set(armour).size, armour.length, "armour proficiencies contain no duplicates after a replay");
  assert.equal(new Set(weapons).size, weapons.length, "weapon proficiencies contain no duplicates after a replay");
  assert.equal(armour.filter(entry => entry === "med").length, 1, "Medium Armour appears exactly once");
});

test("B1 Heavy Duty exchange: the slot offers exactly one of none, first Light Melee Weapon, or second Light Melee Weapon or Light Shield", async () => {
  const api = await loadPioneer(); requirePioneer(api);
  const actor = pioneerActor(1);
  const contribution = vanguardProgressionContributions(vanguardExtensionContext(actor, { branchId: PIONEER_ID, level: 1, purpose: "progression" }));
  const slot = allObjects(contribution).find(entry => entry.key === `branches.${PIONEER_ID}.heavyDuty.slot`);
  assert.ok(slot, "Pioneer progression exposes the Heavy Duty exchange slot");
  assert.equal(slot.count, 1, "the exchange allows exactly one replacement");
  assert.deepEqual(slot.options.map(option => option.value).sort(), ["none", "weapon1", "weapon2"]);
  assert.doesNotMatch(JSON.stringify(slot), /armour|currency|LMD|coin/i, "the exchange never substitutes armour or currency");
});

test("B1 Heavy Duty exchange: a Light Melee Weapon named as the Heavy Melee replacement is never accepted as an exchange", async () => {
  const api = await loadPioneer(); requirePioneer(api);
  const actor = pioneerActor(1);
  const light = CHAPTER_FOUR_EQUIPMENT.find(entry => entry.kind === "weapon" && entry.tableData?.category !== "Heavy Melee Weapons");
  assert.ok(light, "the equipment catalogue contains a non-Heavy weapon for the negative control");
  const context = vanguardExtensionContext(actor, { branchId: PIONEER_ID, level: 1, purpose: "progression",
    choices: { branches: { [PIONEER_ID]: { heavyDuty: { slot: "weapon1", sourceId: light.id } } } } });
  const contribution = vanguardProgressionContributions(context);
  assert.ok(!allObjects(contribution).some(entry => "equipmentExchange" in entry),
    "a non-Heavy-Melee replacement must not produce an equipment exchange");
});

test("B1 Heavy Duty exchange: a Heavy Melee Weapon replacement is accepted (positive control)", async () => {
  const api = await loadPioneer(); requirePioneer(api);
  const actor = pioneerActor(1);
  const heavy = CHAPTER_FOUR_EQUIPMENT.find(entry => entry.kind === "weapon" && entry.tableData?.category === "Heavy Melee Weapons");
  assert.ok(heavy, "the equipment catalogue contains a Heavy Melee Weapon");
  const context = vanguardExtensionContext(actor, { branchId: PIONEER_ID, level: 1, purpose: "progression",
    choices: { branches: { [PIONEER_ID]: { heavyDuty: { slot: "weapon1", sourceId: heavy.id } } } } });
  const contribution = vanguardProgressionContributions(context);
  assert.ok(allObjects(contribution).some(entry => entry.equipmentExchange?.sourceId === heavy.id),
    "a Heavy Melee replacement is the exchange the source allows");
});

/* ------------------------------------------------------------------ B2 Auramancy */

test("B2 Auramancy: Pressure, Shadows and Vigilance are offered only from level 10, and all ten Auras are offered by level 13", async () => {
  const api = await loadPioneer(); requirePioneer(api);
  const low = JSON.stringify(controlsFor(pioneerActor(9), 9));
  for (const aura of ["Pressure", "Shadows", "Vigilance"]) assert.doesNotMatch(low, new RegExp(`Aura of ${aura}`), `Aura of ${aura} is not offered at level 9`);
  const high = JSON.stringify(controlsFor(pioneerActor(13), 13));
  for (const aura of ["Clarity", "Liberation", "Protection", "Punishment", "Purity", "Infirmity", "Violence", "Pressure", "Shadows", "Vigilance"])
    assert.match(high, new RegExp(`Aura of ${aura}`), `Aura of ${aura} is offered at level 13`);
});

test("B2 Auramancy radius: 15 feet below level 13 and 30 feet from level 13, measured in feet", async () => {
  const api = await loadPioneer(); requirePioneer(api);
  const view = exported(api, "pioneerAuraRecipients");
  const at12 = pioneerActor(12), at13 = pioneerActor(13);
  await enableAura(at12, "rad12"); await enableAura(at13, "rad13");
  const src12 = tokenFor(at12, { key: "rad-src-12" }), src13 = tokenFor(at13, { key: "rad-src-13" });
  const twentyFeet12 = tokenFor(createTestActor({ name: "Creature at 20 ft" }), { x: 400, key: "rad-20-12" });
  const twentyFeet13 = tokenFor(createTestActor({ name: "Creature at 20 ft b" }), { x: 400, key: "rad-20-13" });
  const thirtyFeet13 = tokenFor(createTestActor({ name: "Creature at 30 ft" }), { x: 600, key: "rad-30-13" });
  const thirtyTwo13 = tokenFor(createTestActor({ name: "Creature at 32.5 ft" }), { x: 650, key: "rad-325-13" });
  const outside12 = view(src12, twentyFeet12);
  assert.equal(outside12.radius, 15, "the Aura is 15 feet at level 12");
  assert.ok(outside12.warnings.some(text => /outside the 15-foot/i.test(text)), "a creature 20 feet away is warned as outside the 15-foot Aura");
  const inside13 = view(src13, twentyFeet13);
  assert.equal(inside13.radius, 30, "the Aura is 30 feet from level 13");
  assert.ok(!inside13.warnings.some(text => /outside/i.test(text)), "a creature 20 feet away is inside the 30-foot Aura");
  assert.ok(!view(src13, thirtyFeet13).warnings.some(text => /outside/i.test(text)), "exactly 30 feet is inside the 30-foot Aura");
  assert.ok(view(src13, thirtyTwo13).warnings.some(text => /outside the 30-foot/i.test(text)), "32.5 feet is outside the 30-foot Aura");
});

test("B2 Auramancy relation: Protection reaches allies only, and Punishment reaches hostile creatures only", async () => {
  const api = await loadPioneer(); requirePioneer(api);
  const view = exported(api, "pioneerAuraRecipients");
  const bearer = pioneerActor(4);
  await enableAura(bearer, "rel");
  await chooseBase(bearer, "Protection", "rel-prot");
  const src = tokenFor(bearer, { key: "rel-src" });
  const ally = tokenFor(createTestActor({ name: "Ally" }), { x: 100, disposition: 1, key: "rel-ally" });
  const foe = tokenFor(createTestActor({ name: "Foe" }), { x: 100, disposition: -1, key: "rel-foe" });
  assert.ok(view(src, ally).effects.some(effect => effect.name === "Aura of Protection"), "Protection applies to an allied creature");
  assert.ok(!view(src, foe).effects.some(effect => effect.name === "Aura of Protection"), "Protection does not apply to a hostile creature");
});

test("B2 Auramancy relation: a hostile creature is affected by a chosen hostile Aura, and an allied creature is not", async () => {
  const api = await loadPioneer(); requirePioneer(api);
  const view = exported(api, "pioneerAuraRecipients");
  const bearer = pioneerActor(4);
  await enableAura(bearer, "pun");
  await chooseBase(bearer, "Punishment", "pun-choice");
  const src = tokenFor(bearer, { key: "pun-src" });
  const ally = tokenFor(createTestActor({ name: "Ally pun" }), { x: 100, disposition: 1, key: "pun-ally" });
  const foe = tokenFor(createTestActor({ name: "Foe pun" }), { x: 100, disposition: -1, key: "pun-foe" });
  assert.ok(view(src, foe).effects.some(effect => effect.name === "Aura of Punishment"), "Punishment applies to a hostile creature");
  assert.ok(!view(src, ally).effects.some(effect => effect.name === "Aura of Punishment"), "Punishment does not apply to an allied creature");
});

test("B2 Auramancy: Clarity reaches the bearer as well as allies", async () => {
  const api = await loadPioneer(); requirePioneer(api);
  const view = exported(api, "pioneerAuraRecipients");
  const bearer = pioneerActor(4);
  await enableAura(bearer, "self");
  await chooseBase(bearer, "Clarity", "self");
  const src = tokenFor(bearer, { key: "self-src" });
  const self = tokenFor(bearer, { key: "self-token" });
  assert.ok(view(src, self).effects.some(effect => effect.name === "Aura of Clarity"), "Clarity names 'You and allied Creatures', so the bearer is affected");
});

test("B2 Auramancy: the Aura is disabled while the bearer is Incapacitated, and no effects are offered", async () => {
  const api = await loadPioneer(); requirePioneer(api);
  const view = exported(api, "pioneerAuraRecipients");
  const bearer = pioneerActor(4);
  await enableAura(bearer, "incap");
  await chooseBase(bearer, "Protection", "incap");
  bearer.statuses = new Set(["incapacitated"]);
  const src = tokenFor(bearer, { key: "incap-src" });
  const ally = tokenFor(createTestActor({ name: "Ally incap" }), { x: 100, disposition: 1, key: "incap-ally" });
  const result = view(src, ally);
  assert.equal(result.eligible, false, "an Incapacitated bearer's Aura is not eligible");
  assert.deepEqual(result.effects, [], "no Aura effect is offered while Incapacitated");
});

test("B2 Auramancy relation: an unknown allegiance is warned and never silently treated as allied", async () => {
  const api = await loadPioneer(); requirePioneer(api);
  const view = exported(api, "pioneerAuraRecipients");
  const bearer = pioneerActor(4);
  await enableAura(bearer, "unknown");
  const src = tokenFor(bearer, { key: "unknown-src" });
  const neutral = tokenFor(createTestActor({ name: "Neutral" }), { x: 100, disposition: 0, key: "unknown-neutral" });
  const result = view(src, neutral);
  assert.equal(result.relation, "unknown", "a neutral creature has an unknown relation");
  assert.ok(result.warnings.some(text => /allied or hostile/i.test(text)), "the owner is asked to confirm the allegiance");
});

test("B2 Auramancy effects: applying Protection creates one managed effect with the bearer's Proficiency Bonus, and undo removes it", async () => {
  const api = await loadPioneer(); requirePioneer(api);
  const bearer = pioneerActor(4);
  const ally = createTestActor({ name: "Ally apply" });
  await enableAura(bearer, "apply");
  await chooseBase(bearer, "Protection", "apply");
  const src = tokenFor(bearer, { key: "apply-src" });
  const dst = tokenFor(ally, { x: 100, disposition: 1, key: "apply-ally" });
  await vanguardUses.command(bearer, "pioneerAuraApply", { sourceTokenUuid: src.uuid, recipients: [{ tokenUuid: dst.uuid }], confirmed: true }, "apply-use");
  const effects = auraNamed(ally, "Aura of Protection");
  assert.equal(effects.length, 1, "one managed Aura effect is created on the allied creature");
  const save = effects[0].changes?.find(change => change.key === "system.bonuses.abilities.save");
  assert.ok(save, "the Protection effect carries the saving-throw bonus as a static change");
  assert.equal(String(save.value), "+2", "the bonus equals the bearer's Proficiency Bonus (2 at level 4)");
  await vanguardUses.command(bearer, "undoUse", { useId: "apply-use" }, "apply-undo");
  assert.equal(auraNamed(ally, "Aura of Protection").length, 0, "undoing the apply removes the managed effect");
});

test("B2 Auramancy effects: a player with no connected GM cannot change an unowned creature", async () => {
  const api = await loadPioneer(); requirePioneer(api);
  const player = asPlayer();
  const bearer = pioneerActor(4, { ownership: { default: 0, [player.id]: 3 }, flags: operatorFlags(10) });
  const creature = createTestActor({ name: "Unowned creature", owner: false });
  const src = tokenFor(bearer, { key: "nogm-src" });
  const dst = tokenFor(creature, { x: 100, disposition: -1, key: "nogm-dst" });
  await enableAura(bearer, "nogm");
  await chooseBase(bearer, "Punishment", "nogm");
  await assert.rejects(
    vanguardUses.command(bearer, "pioneerAuraApply", { sourceTokenUuid: src.uuid, recipients: [{ tokenUuid: dst.uuid }], confirmed: true }, "nogm-apply"),
    /GM/i);
  assert.equal(auraNamed(creature, "Aura of Punishment").length, 0, "no effect is written to the unowned creature without a GM");
});

test("B2 Auramancy overlap: a beneficial Aura follows the creature's recorded choice between two Pioneers", async () => {
  const api = await loadPioneer(); requirePioneer(api);
  const settle = exported(api, "settleAuraOverlap");
  const auraEffect = (id, sourceUuid, pb, appliedAt) => {
    const mark = { aura: "Protection", sourceUuid, pb, appliedAt, suspended: false };
    const effect = { id, name: "Aura of Protection", disabled: false, flags: { ak5e: { pioneerAuraEffect: mark } } };
    effect.update = async changes => {
      if ("disabled" in changes) effect.disabled = changes.disabled;
      if ("flags.ak5e.pioneerAuraEffect.suspended" in changes) mark.suspended = changes["flags.ak5e.pioneerAuraEffect.suspended"];
      return effect;
    };
    return effect;
  };
  const a = auraEffect("eff-a", "Actor.pioneer-a", 2, 1), b = auraEffect("eff-b", "Actor.pioneer-b", 4, 2);
  const target = { uuid: "Actor.overlap-protect", effects: new Map([[a.id, a], [b.id, b]]),
    flags: { ak5e: { pioneerAuraChosen: { Protection: "Actor.pioneer-a" } } } };
  await settle(target, "Protection");
  assert.equal(a.disabled, false, "the creature's recorded choice (Pioneer A) stays active");
  assert.equal(b.disabled, true, "the other beneficial Protection is suspended, not stacked");
});

test("B2 Auramancy overlap: a negative Aura uses the worse effect, the larger Proficiency Bonus, when the creature has no choice", async () => {
  const api = await loadPioneer(); requirePioneer(api);
  const settle = exported(api, "settleAuraOverlap");
  const auraEffect = (id, sourceUuid, pb, appliedAt) => {
    const mark = { aura: "Infirmity", sourceUuid, pb, appliedAt, suspended: false };
    const effect = { id, name: "Aura of Infirmity", disabled: false, flags: { ak5e: { pioneerAuraEffect: mark } } };
    effect.update = async changes => {
      if ("disabled" in changes) effect.disabled = changes.disabled;
      if ("flags.ak5e.pioneerAuraEffect.suspended" in changes) mark.suspended = changes["flags.ak5e.pioneerAuraEffect.suspended"];
      return effect;
    };
    return effect;
  };
  const weak = auraEffect("eff-weak", "Actor.pioneer-weak", 2, 1), strong = auraEffect("eff-strong", "Actor.pioneer-strong", 4, 2);
  const target = { uuid: "Actor.overlap-infirm", effects: new Map([[weak.id, weak], [strong.id, strong]]), flags: { ak5e: {} } };
  await settle(target, "Infirmity");
  assert.equal(strong.disabled, false, "the larger penalty (Proficiency Bonus 4) applies");
  assert.equal(weak.disabled, true, "the smaller penalty is suspended");
});

test("B2 Auramancy: an out-of-turn toggle needs a confirmed override, and undo restores the prior Aura state", async () => {
  const api = await loadPioneer(); requirePioneer(api);
  const player = asPlayer();
  const bearer = pioneerActor(4, { ownership: { default: 0, [player.id]: 3 }, flags: operatorFlags(10) });
  const other = createTestActor({ name: "Other combatant" });
  game.combat = createTestCombat([other, bearer], { started: true, round: 2, turn: 0 });
  const plan = await vanguardUses.preview(bearer, "pioneerAuramancy", { action: "toggle", enabled: true });
  const warningIds = plan.warnings.map(warning => warning.id);
  assert.ok(warningIds.includes("out-of-turn"), "the non-active owner is warned that the Action is out of turn");
  const before = JSON.stringify(vanguardUses.state(bearer));
  await assert.rejects(vanguardUses.command(bearer, "pioneerAuramancy", { action: "toggle", enabled: true }, "b2-cancel"), /Confirm this use/);
  assert.equal(JSON.stringify(vanguardUses.state(bearer)), before, "a cancelled toggle changes no state");
  await vanguardUses.command(bearer, "pioneerAuramancy", { action: "toggle", enabled: true, overrides: warningIds, confirmed: true }, "b2-toggle");
  assert.equal(vanguardUses.state(bearer).data.pioneerAura?.enabled, true, "the confirmed override enables Auramancy");
  await vanguardUses.command(bearer, "undoUse", { useId: "b2-toggle" }, "b2-undo");
  assert.notEqual(vanguardUses.state(bearer).data.pioneerAura?.enabled, true, "undo restores the Aura to its prior state");
  assert.equal(vanguardUses.receipt(bearer, "b2-toggle")?.status, "undone", "the receipt is marked undone");
});

test("B2 Auramancy: a Long Rest offers the base Aura choice again", async () => {
  const api = await loadPioneer(); requirePioneer(api);
  const actor = pioneerActor(4);
  await triggerLongRest(actor);
  await flush();
  assert.equal(vanguardUses.state(actor).data.pioneerAura?.baseAvailable, true,
    "completing a Long Rest makes the base Aura choice available");
});

/* ------------------------------------------------------------------ B3 committed SP thresholds */

test("B3 thresholds: 15 then 10 committed Skill Points grant one Aura threshold and carry 5", async () => {
  const api = await loadPioneer(); requirePioneer(api);
  const actor = pioneerActor(4, { flags: operatorFlags(60, { operatorEvents: [activationEvent("t15", 15), activationEvent("t10", 10)] }) });
  const counted = exported(api, "pioneerThresholds")(actor);
  assert.equal(counted.grants.length, 1, "actual cumulative expenditure of 25 crosses one 20-SP threshold");
  assert.equal(counted.remainder, 5, "the 5 SP beyond the threshold carry toward the next one");
});

test("B3 thresholds: one 45-SP activation crosses two thresholds and carries 5", async () => {
  const api = await loadPioneer(); requirePioneer(api);
  const actor = pioneerActor(4, { flags: operatorFlags(60, { operatorEvents: [activationEvent("t45", 45)] }) });
  const counted = exported(api, "pioneerThresholds")(actor);
  assert.equal(counted.grants.length, 2, "45 SP expended crosses 20 and 40");
  assert.equal(counted.remainder, 5);
});

test("B3 thresholds: exactly 20 SP grants one threshold with no remainder and no pending source", async () => {
  const api = await loadPioneer(); requirePioneer(api);
  const actor = pioneerActor(4, { flags: operatorFlags(60, { operatorEvents: [activationEvent("t20", 20)] }) });
  const counted = exported(api, "pioneerThresholds")(actor);
  assert.equal(counted.grants.length, 1);
  assert.equal(counted.remainder, 0);
  assert.equal(counted.pendingSources.length, 0, "no Skill Points remain pending after a whole threshold");
});

test("B3 thresholds: only committed activations count, and a duplicate event id counts once", async () => {
  const api = await loadPioneer(); requirePioneer(api);
  const pioneerThresholds = exported(api, "pioneerThresholds");
  const uncommitted = pioneerActor(4, { flags: operatorFlags(60, { operatorEvents: [
    { ...activationEvent("u20", 20), committed: false }, endEvent("u20"),
    { id: "nan:activation", activationId: "nan", kind: "activation", committed: true, spSpent: Number.NaN }
  ] }) });
  const none = pioneerThresholds(uncommitted);
  assert.equal(none.grants.length, 0, "uncommitted, end and non-numeric events grant nothing");
  assert.equal(none.remainder, 0, "they leave no remainder either");
  const duplicate = pioneerActor(4, { flags: operatorFlags(60, { operatorEvents: [activationEvent("dup", 20), activationEvent("dup", 20)] }) });
  assert.equal(pioneerThresholds(duplicate).grants.length, 1, "replaying the same committed event id cannot grant a second threshold");
});

test("B3 thresholds: a Long Rest reset after the 15-SP activation discards its count, so a later 10 SP grants nothing", async () => {
  const api = await loadPioneer(); requirePioneer(api);
  const pioneerThresholds = exported(api, "pioneerThresholds");
  const actor = pioneerActor(4, { flags: operatorFlags(60, { operatorEvents: [activationEvent("r15", 15), activationEvent("r10", 10)] }) });
  const reset = pioneerThresholds(actor, { resets: [{ afterEventId: "r15:activation", restId: "rest-reset" }] });
  assert.equal(reset.grants.length, 0, "the reset counter restarts after the 15-SP activation");
  assert.equal(reset.remainder, 10, "only the 10 SP after the reset counts");
  assert.equal(pioneerThresholds(actor, { resets: [] }).grants.length, 1, "carrying the count over (no reset) crosses the threshold");
});

test("B3 thresholds: grant identifiers are stable across recalculation and distinct per crossing", async () => {
  const api = await loadPioneer(); requirePioneer(api);
  const pioneerThresholds = exported(api, "pioneerThresholds");
  const actor = pioneerActor(4, { flags: operatorFlags(60, { operatorEvents: [activationEvent("ids45", 45)] }) });
  const first = pioneerThresholds(actor).grants.map(grant => grant.id);
  const second = pioneerThresholds(actor).grants.map(grant => grant.id);
  assert.deepEqual(first, second, "recalculating does not change grant identifiers");
  assert.equal(new Set(first).size, first.length, "each crossing has its own identifier");
});

test("B3 thresholds: a threshold Tip grant is valid once for its Pioneer, and refused for a fabricated id or a second use", async () => {
  const api = await loadPioneer(); requirePioneer(api);
  const pioneerThresholds = exported(api, "pioneerThresholds");
  const actor = pioneerActor(4, { flags: operatorFlags(60, { operatorEvents: [activationEvent("tip20", 20)] }) });
  const [grant] = pioneerThresholds(actor).grants;
  assert.ok(grant, "a committed 20-SP activation yields a grant to validate");
  assert.equal(checkVanguardTipGrant(THRESHOLD_KIND, actor, grant.id, 1).ok, true, "the real threshold grant is valid");
  assert.equal(checkVanguardTipGrant(THRESHOLD_KIND, actor, grant.id, 2).ok, false, "a threshold grants one Tip, not two");
  assert.equal(checkVanguardTipGrant(THRESHOLD_KIND, actor, "fabricated-grant", 1).ok, false, "a fabricated grant identifier is refused");
});

test("B3 thresholds: a non-Pioneer Vanguard cannot use a Pioneer threshold grant", async () => {
  const api = await loadPioneer(); requirePioneer(api);
  const pioneerThresholds = exported(api, "pioneerThresholds");
  const pioneer = pioneerActor(4, { flags: operatorFlags(60, { operatorEvents: [activationEvent("agent20", 20)] }) });
  const [grant] = pioneerThresholds(pioneer).grants;
  assert.ok(grant);
  const agent = pioneerActor(4, { branch: AGENT_ID, flags: operatorFlags(60, { operatorEvents: [activationEvent("agent20", 20)] }) });
  assert.equal(checkVanguardTipGrant(THRESHOLD_KIND, agent, grant.id, 1).ok, false, "only a Pioneer owns Auramancy threshold Tips");
});

test("B3 thresholds: the threshold and Tactical Burst Tip grant kinds are registered", async () => {
  const api = await loadPioneer(); requirePioneer(api);
  const kinds = vanguardTipGrantSourceKinds();
  assert.ok(kinds.includes(THRESHOLD_KIND), "the threshold grant kind is registered with the shared Tip API");
  assert.ok(kinds.includes(BURST_KIND), "the Tactical Burst grant kind is registered with the shared Tip API");
});

test("B3 thresholds: a non-finite committed SP value terminates and grants nothing", () => {
  const out = thresholdInChild("Infinity", 4000);
  assert.equal(out.timedOut, false, "pioneerThresholds must not loop forever on Infinity Skill Points");
  assert.equal(out.status, 0, `the child process completes normally (stderr: ${out.stderr.slice(0, 300)})`);
  assert.equal(JSON.parse(out.stdout).grants, 0, "a non-finite value is not a real expenditure and grants no threshold");
});

test("B3 thresholds: a large finite committed value is counted exactly within bounded time", () => {
  const out = thresholdInChild("1000000", 10000);
  assert.equal(out.timedOut, false, "a 1,000,000 SP event finishes within 10 seconds");
  assert.equal(out.status, 0, `the child process completes normally (stderr: ${out.stderr.slice(0, 300)})`);
  assert.deepEqual(JSON.parse(out.stdout), { grants: 50000, remainder: 0 }, "1,000,000 SP is exactly 50,000 thresholds");
});

/* ------------------------------------------------------------------ B4 Moment of Power and Tactical Burst */

test("B4 Moment of Power: the control is offered from level 4 and not at level 3", async () => {
  const api = await loadPioneer(); requirePioneer(api);
  const findMoment = controls => controls.find(control => /moment of power/i.test(control.label ?? ""));
  assert.equal(findMoment(controlsFor(pioneerActor(3), 3)), undefined, "Moment of Power is not available below level 4");
  assert.ok(findMoment(controlsFor(pioneerActor(4), 4)), "Moment of Power is available at level 4");
});

test("B4 Tactical Burst: a 25-SP activation offers three Tip uses, a 9-SP activation offers one, and level 3 offers none", async () => {
  const api = await loadPioneer(); requirePioneer(api);
  const bursts = controls => controls.filter(control => /^Tactical Burst: Tip of the Spear/.test(control.label ?? ""));
  const at25 = pioneerActor(4, { flags: operatorFlags(60, { operatorEvents: [activationEvent("burst-25", 25)] }) });
  assert.equal(bursts(controlsFor(at25, 4)).length, 3, "one Tip plus two more for 25 SP (one per 10 SP)");
  const at9 = pioneerActor(4, { flags: operatorFlags(60, { operatorEvents: [activationEvent("burst-9", 9)] }) });
  assert.equal(bursts(controlsFor(at9, 4)).length, 1, "9 SP grants only the activation's own Tip");
  const at3 = pioneerActor(3, { flags: operatorFlags(60, { operatorEvents: [activationEvent("burst-25", 25)] }) });
  assert.equal(bursts(controlsFor(at3, 3)).length, 0, "Tactical Burst is a level-4 feature");
});

test("B4 Tactical Burst: the count is one plus one per full 10 Skill Points, with bad input treated as zero", async () => {
  const api = await loadPioneer(); requirePioneer(api);
  const count = exported(api, "tacticalBurstCount");
  assert.equal(count(0), 1);
  assert.equal(count(9), 1);
  assert.equal(count(10), 2);
  assert.equal(count(19), 2);
  assert.equal(count(25), 3);
  assert.equal(count(45), 5);
  assert.equal(count(-5), 1, "negative spend is not a source of extra Tips");
  assert.equal(count(Number.NaN), 1, "non-numeric spend is not a source of extra Tips");
});

test("B4 Tactical Burst: the Tip grant validator accepts grants 1 to 3 of a 25-SP activation and refuses 0, 4 and unknown activations", async () => {
  const api = await loadPioneer(); requirePioneer(api);
  const actor = pioneerActor(4, { flags: operatorFlags(60, { operatorEvents: [activationEvent("burst-val-25", 25)] }) });
  for (const index of [1, 2, 3]) assert.equal(checkVanguardTipGrant(BURST_KIND, actor, "burst-val-25", index).ok, true, `grant ${index} of 3 is valid`);
  assert.equal(checkVanguardTipGrant(BURST_KIND, actor, "burst-val-25", 4).ok, false, "a fourth Tip from a 25-SP activation is refused");
  assert.equal(checkVanguardTipGrant(BURST_KIND, actor, "burst-val-25", 0).ok, false, "grant index 0 is refused");
  assert.equal(checkVanguardTipGrant(BURST_KIND, actor, "not-an-activation", 1).ok, false, "an activation that was not committed is refused");
});

test("B4 Skill Haste: the extra Attack is available during the activation Turn, and gone on the next Turn with no Skill active", async () => {
  const api = await loadPioneer(); requirePioneer(api);
  const player = asPlayer();
  const bearer = pioneerActor(4, { ownership: { default: 0, [player.id]: 3 }, flags: operatorFlags(40) });
  const instant = skillItem(bearer, "Haste instant skill", "haste-instant", 10, "Instant");
  const other = createTestActor({ name: "Haste other" });
  const combat = createTestCombat([bearer, other], { started: true, round: 1, turn: 0 });
  game.combat = combat;
  await executeOperatorCommand(bearer, { id: "haste-activate", command: "activate", data: { itemId: instant.id } }, player);
  assert.equal(vanguardAttackActionBonus(bearer, { branchId: PIONEER_ID, level: 4 }), 1, "one additional Attack during the activation Turn");
  combat.nextTurn();
  assert.equal(vanguardAttackActionBonus(bearer, { branchId: PIONEER_ID, level: 4 }), 0, "the activation Turn's window closes on the next Turn");
});

test("B4 Skill Haste: while a Skill stays active on a later Turn the extra Attack remains, and ends with the Skill", async () => {
  const api = await loadPioneer(); requirePioneer(api);
  const player = asPlayer();
  const bearer = pioneerActor(4, { ownership: { default: 0, [player.id]: 3 }, flags: operatorFlags(40) });
  const lasting = skillItem(bearer, "Haste lasting skill", "haste-lasting", 10, "10 Rounds");
  const other = createTestActor({ name: "Haste other lasting" });
  const combat = createTestCombat([bearer, other], { started: true, round: 1, turn: 0 });
  game.combat = combat;
  await executeOperatorCommand(bearer, { id: "haste-lasting-activate", command: "activate", data: { itemId: lasting.id } }, player);
  combat.nextTurn();
  assert.equal(vanguardAttackActionBonus(bearer, { branchId: PIONEER_ID, level: 4 }), 1,
    "UNCERTAIN reading: the source's 'and while you have an Active Operator Skill' is treated as a second window");
  await executeOperatorCommand(bearer, { id: "haste-lasting-end", command: "end" }, player);
  assert.equal(vanguardAttackActionBonus(bearer, { branchId: PIONEER_ID, level: 4 }), 0, "ending the Skill removes the window on a later Turn");
});

test("B4 Skill Haste: two activations in one Turn still give one additional Attack, not one per activation", async () => {
  const api = await loadPioneer(); requirePioneer(api);
  const player = asPlayer();
  const bearer = pioneerActor(4, { ownership: { default: 0, [player.id]: 3 }, flags: operatorFlags(60) });
  // The engine derives the SP maximum from the largest learned Skill cost, so an 80 SP Skill keeps the pool from clamping.
  skillItem(bearer, "Haste ceiling", "haste-ceiling", 80);
  const first = skillItem(bearer, "Haste first", "haste-first", 10, "Instant");
  const second = skillItem(bearer, "Haste second", "haste-second", 10, "Instant");
  const other = createTestActor({ name: "Haste other two" });
  game.combat = createTestCombat([bearer, other], { started: true, round: 1, turn: 0 });
  await executeOperatorCommand(bearer, { id: "haste-two-a", command: "activate", data: { itemId: first.id } }, player);
  await executeOperatorCommand(bearer, { id: "haste-two-b", command: "activate", data: { itemId: second.id } }, player);
  assert.equal(vanguardAttackActionBonus(bearer, { branchId: PIONEER_ID, level: 4 }), 1, "Skill Haste grants one additional Attack per Turn");
});

test("B4 Skill Haste: below level 4 there is no extra Attack even while a Skill is active", async () => {
  const api = await loadPioneer(); requirePioneer(api);
  const bearer = pioneerActor(3, { flags: operatorFlags(40, { active: { activationId: "low-haste", sourceId: "low" } }) });
  assert.equal(vanguardAttackActionBonus(bearer, { branchId: PIONEER_ID, level: 3 }), 0, "Skill Haste is a level-4 feature");
});

test("B4 Moment of Power: the control reports the three Tip uses from a 25-SP activation and the Haste text", async () => {
  const api = await loadPioneer(); requirePioneer(api);
  const player = asPlayer();
  const actor = pioneerActor(4, { ownership: { default: 0, [player.id]: 3 }, flags: operatorFlags(35, { maximum: 50 }) });
  const skill = skillItem(actor, "25 SP attack test", "b4-25", 25, "Instant");
  await executeOperatorCommand(actor, { id: "b4-activate-25", command: "activate", data: { itemId: skill.id } }, player);
  const actual = actor.getFlag("ak5e", "operatorSkills").operatorEvents.find(event => event.activationId === "b4-activate-25" && event.kind === "activation");
  assert.equal(actual?.spSpent, 25, "the activation recorded 25 committed SP");
  const moment = controlsFor(actor, 4).find(control => /moment of power/i.test(control.label ?? ""));
  assert.ok(moment, "Moment of Power is surfaced to the owner");
  assert.match(moment.hint, /3 Tip of the Spear uses/, "25 SP gives three Tip uses");
  assert.match(moment.hint, /Skill Haste/i, "the control names Skill Haste");
});

/* ------------------------------------------------------------------ B5 Cycle of Violence */

function cycleSetup(level, points = 60, maximum = 80) {
  const player = asPlayer();
  const bearer = pioneerActor(level, { ownership: { default: 0, [player.id]: 3 }, flags: operatorFlags(points, { maximum }) });
  // The engine derives the SP maximum from the largest learned Skill cost, so a ceiling Skill keeps the pool at `maximum`.
  skillItem(bearer, "Ceiling test skill", `ceiling-cycle-${level}-${points}`, maximum);
  const skill = skillItem(bearer, "Cycle test skill", `cycle-${level}-${points}`, 20, "10 Rounds");
  const target = createTestActor({ name: "Cycle target", type: "npc", owner: false, system: { attributes: { hp: { value: 5, max: 5, temp: 0 } } } });
  return { player, bearer, skill, target };
}

test("B5 Cycle of Violence: a Creature the Pioneer reduces to 0 HP during the Skill refunds the Vanguard level (10) when the Skill ends", async () => {
  const api = await loadPioneer(); requirePioneer(api);
  const { player, bearer, skill, target } = cycleSetup(10);
  await executeOperatorCommand(bearer, { id: "cyc-a-activate", command: "activate", data: { itemId: skill.id } }, player);
  assert.equal(bearer.getFlag("ak5e", "operatorSkills").points, 40, "the Skill costs 20 SP");
  await emitAk5eEvent("kill", { actorUuid: target.uuid, sourceActorUuid: bearer.uuid, hpAfter: 0, eventId: "cyc-a-kill" });
  await executeOperatorCommand(bearer, { id: "cyc-a-end", command: "end" }, player);
  assert.equal(bearer.getFlag("ak5e", "operatorSkills").points, 50, "the refund is the Vanguard level (10), not the Skill's cost");
});

test("B5 Cycle of Violence: the refund is capped at the shared Skill Point maximum", async () => {
  const api = await loadPioneer(); requirePioneer(api);
  const { player, bearer, skill, target } = cycleSetup(10, 60, 60);
  // The cap is the maximum the fixture actually produces (the largest learned Skill cost), read from the engine, not hard-coded.
  const fixtureMax = getIntegratedOperatorState(bearer).maximum;
  assert.ok(fixtureMax < 55 + 10, `the fixture maximum (${fixtureMax}) is below 55 + 10, so an uncapped refund would exceed it`);
  await executeOperatorCommand(bearer, { id: "cyc-cap-activate", command: "activate", data: { itemId: skill.id } }, player);
  await emitAk5eEvent("kill", { actorUuid: target.uuid, sourceActorUuid: bearer.uuid, hpAfter: 0, eventId: "cyc-cap-kill" });
  await bearer.update({ "flags.ak5e.operatorSkills.points": 55 });
  await executeOperatorCommand(bearer, { id: "cyc-cap-end", command: "end" }, player);
  assert.equal(bearer.getFlag("ak5e", "operatorSkills").points, fixtureMax,
    `55 + 10 would exceed the fixture maximum of ${fixtureMax}, so the refund is capped at it`);
});

test("B5 Cycle of Violence: an unattributed kill does not qualify for the refund", async () => {
  const api = await loadPioneer(); requirePioneer(api);
  const { player, bearer, skill, target } = cycleSetup(10);
  await executeOperatorCommand(bearer, { id: "cyc-b-activate", command: "activate", data: { itemId: skill.id } }, player);
  await emitAk5eEvent("kill", { actorUuid: target.uuid, hpAfter: 0, eventId: "cyc-b-kill" });
  await executeOperatorCommand(bearer, { id: "cyc-b-end", command: "end" }, player);
  assert.equal(bearer.getFlag("ak5e", "operatorSkills").points, 40, "a kill with no known source is not the Pioneer's damage");
});

test("B5 Cycle of Violence: a kill caused by another Actor does not qualify for the refund", async () => {
  const api = await loadPioneer(); requirePioneer(api);
  const { player, bearer, skill, target } = cycleSetup(10);
  const ally = createTestActor({ name: "Cycle other source", type: "character" });
  await executeOperatorCommand(bearer, { id: "cyc-c-activate", command: "activate", data: { itemId: skill.id } }, player);
  await emitAk5eEvent("kill", { actorUuid: target.uuid, sourceActorUuid: ally.uuid, hpAfter: 0, eventId: "cyc-c-kill" });
  await executeOperatorCommand(bearer, { id: "cyc-c-end", command: "end" }, player);
  assert.equal(bearer.getFlag("ak5e", "operatorSkills").points, 40, "another Actor's kill does not refund the Pioneer");
});

test("B5 Cycle of Violence: a kill before the Skill is activated does not count toward it", async () => {
  const api = await loadPioneer(); requirePioneer(api);
  const { player, bearer, skill, target } = cycleSetup(10);
  await emitAk5eEvent("kill", { actorUuid: target.uuid, sourceActorUuid: bearer.uuid, hpAfter: 0, eventId: "cyc-d-kill" });
  await executeOperatorCommand(bearer, { id: "cyc-d-activate", command: "activate", data: { itemId: skill.id } }, player);
  await executeOperatorCommand(bearer, { id: "cyc-d-end", command: "end" }, player);
  assert.equal(bearer.getFlag("ak5e", "operatorSkills").points, 40, "only a kill during the active Skill qualifies");
});

test("B5 Cycle of Violence: a Pioneer below level 10 gets no refund from a kill during a Skill", async () => {
  const api = await loadPioneer(); requirePioneer(api);
  const { player, bearer, skill, target } = cycleSetup(9);
  await executeOperatorCommand(bearer, { id: "cyc-e-activate", command: "activate", data: { itemId: skill.id } }, player);
  await emitAk5eEvent("kill", { actorUuid: target.uuid, sourceActorUuid: bearer.uuid, hpAfter: 0, eventId: "cyc-e-kill" });
  await executeOperatorCommand(bearer, { id: "cyc-e-end", command: "end" }, player);
  assert.equal(bearer.getFlag("ak5e", "operatorSkills").points, 40, "Skill Recharge is a level-10 feature");
});

test("B5 Cycle of Violence: the refund is recorded once and a repeated refund for the same Skill is refused", async () => {
  const api = await loadPioneer(); requirePioneer(api);
  const { player, bearer, skill, target } = cycleSetup(10);
  await executeOperatorCommand(bearer, { id: "cyc-f-activate", command: "activate", data: { itemId: skill.id } }, player);
  await emitAk5eEvent("kill", { actorUuid: target.uuid, sourceActorUuid: bearer.uuid, hpAfter: 0, eventId: "cyc-f-kill" });
  await executeOperatorCommand(bearer, { id: "cyc-f-end", command: "end" }, player);
  assert.equal(bearer.getFlag("ak5e", "operatorSkills").points, 50);
  await assert.rejects(
    vanguardUses.command(bearer, "pioneerCycleRefund", { activationId: "cyc-f-activate", confirmed: true }, "cyc-f-again"),
    /already|refund/i);
  assert.equal(bearer.getFlag("ak5e", "operatorSkills").points, 50, "a repeated refund changes no Skill Points");
});

test("B5 Cycle of Violence: the three level-10 Auras are offered only at level 10 or later", async () => {
  const api = await loadPioneer(); requirePioneer(api);
  const low = JSON.stringify(controlsFor(pioneerActor(9), 9));
  assert.doesNotMatch(low, /Aura of Vigilance/, "Vigilance is not offered at level 9");
  const high = JSON.stringify(controlsFor(pioneerActor(10), 10));
  for (const aura of ["Pressure", "Shadows", "Vigilance"]) assert.match(high, new RegExp(`Aura of ${aura}`), `Aura of ${aura} is offered at level 10`);
});

/* ------------------------------------------------------------------ B6 Breakthrough */

const slotOf = (actor) => getOperatorSkillChoices(actor).slots.find(entry => /breakthrough/i.test(`${entry.key} ${entry.label ?? ""}`));

test("B6 Breakthrough: no Breakthrough slot below level 17, and at level 17 a separate Elite slot that ignores its Charging Method", async () => {
  const api = await loadPioneer(); requirePioneer(api);
  assert.equal(slotOf(pioneerActor(16, { flags: operatorFlags(7, { start: 4, maximum: 12 }) })), undefined, "Breakthrough is a level-17 feature");
  const slot = slotOf(pioneerActor(17, { flags: operatorFlags(7, { start: 4, maximum: 12 }) }));
  assert.ok(slot, "Pioneer receives a separate additional Breakthrough slot at level 17");
  assert.equal(slot.tier, "Elite", "Breakthrough draws from the Elite tier");
  assert.equal(slot.ignoreCharging, true, "the slot documents that its Skill ignores its normal Charging Method");
});

test("B6 Breakthrough: the slot sits beside the level-14 Elite slot rather than replacing it", async () => {
  const api = await loadPioneer(); requirePioneer(api);
  const view = getOperatorSkillChoices(pioneerActor(17, { flags: operatorFlags(7, { start: 4, maximum: 12 }) }));
  const elite = view.slots.filter(entry => entry.tier === "Elite");
  assert.ok(elite.length >= 2, "an Elite Skill slot and the Breakthrough slot both exist");
  assert.ok(elite.some(entry => !/breakthrough/i.test(`${entry.key} ${entry.label ?? ""}`)), "the ordinary Elite slot remains");
});

test("B6 Breakthrough: the options are exactly the Elite Skills of the five allowed classes (equality reading, UNCERTAIN)", async () => {
  const api = await loadPioneer(); requirePioneer(api);
  const slot = slotOf(pioneerActor(17, { flags: operatorFlags(7, { start: 4, maximum: 12 }) }));
  assert.ok(slot);
  const allowed = CHAPTER_THREE_CLASSES.filter(entry => entry.operatorSkill?.tier === "Elite" && ELITE_CLASSES.includes(entry.parentClass));
  const offered = slot.options.map(option => option.id ?? option.value);
  for (const parentClass of ELITE_CLASSES) {
    const names = allowed.filter(entry => entry.parentClass === parentClass).map(entry => entry.id);
    assert.ok(names.length > 0, `the catalogue contains Elite Skills for ${parentClass}`);
    assert.ok(names.some(id => offered.includes(id)), `Breakthrough offers ${parentClass} Elite Skills`);
  }
  assert.deepEqual([...offered].sort(), allowed.map(entry => entry.id).sort(), "every eligible Elite Skill is offered and nothing else");
});

test("B6 Breakthrough: the replacement key changes on each Long Rest, so a Long Rest exchanges the Skill", async () => {
  const api = await loadPioneer(); requirePioneer(api);
  const actor = pioneerActor(17, { flags: operatorFlags(7, { start: 4, maximum: 12 }) });
  assert.equal(slotOf(actor).replacementKey, undefined, "no exchange is offered before a Long Rest");
  await vanguardUses.command(actor, "pioneerAuraRest", { confirmed: true }, "bt-rest-1");
  const first = slotOf(actor).replacementKey;
  assert.ok(first, "a completed Long Rest offers the Breakthrough exchange");
  await vanguardUses.command(actor, "pioneerAuraRest", { confirmed: true }, "bt-rest-2");
  const second = slotOf(actor).replacementKey;
  assert.ok(second, "the next Long Rest offers an exchange too");
  assert.notEqual(second, first, "each Long Rest has its own exchange key");
});
