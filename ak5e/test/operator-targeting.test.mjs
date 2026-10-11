import test from "node:test";
import assert from "node:assert/strict";
import { containsPoint, affectedTokens, reachesPoint, feetToPixels } from "../scripts/operator-geometry.mjs";
import { CHAPTER_THREE_CLASSES } from "../scripts/chapter-three-content.mjs";
import { skillTargetProfile, validateSkillPrerequisites } from "../scripts/operator-target-profiles.mjs";
import { validateSkillResolution, targetSkillTokens, nativePhaseActivities, tokenPoints } from "../scripts/operator-targeting.mjs";

const entries = CHAPTER_THREE_CLASSES.filter(entry => entry.operatorSkill);
const entry = (name, parentClass) => entries.find(entry => entry.name === name && (!parentClass || entry.parentClass === parentClass));
test("all 320 profiles retain stable identity and exact effects; variants and separate healing instances survive", () => {
  assert.equal(entries.length, 320);
  for (const source of entries) {
    const profile = skillTargetProfile(source);
    assert.equal(profile.sourceId, source.id); assert.equal(profile.sourceEffect, source.operatorSkill.effect);
    assert.equal(new Set(profile.phases.map(phase => phase.id)).size, profile.phases.length);
    assert.ok(Object.values(nativePhaseActivities(profile)).every(activity => activity.consumption.targets.length === 0));
  }
  assert.equal(skillTargetProfile(entry("Harpoon Shot", "Marksman")).phases[1].damage, "3d8");
  assert.equal(skillTargetProfile(entry("Harpoon Shot", "Specialist")).phases[1].damage, "5d8");
  assert.equal(skillTargetProfile(entry("Harpoon Shot")).phases[0].range, 100);
  assert.equal(skillTargetProfile(entry("Monitoring", "Vanguard")).phases[0].maximum, 4);
  assert.equal(skillTargetProfile(entry("Monitoring", "Supporter")).phases[0].maximum, null);
  const heal = skillTargetProfile(entry("Echoes of Life")).phases[0];
  assert.equal(heal.healing, "2d8"); assert.equal(heal.instances, 5);
  assert.equal(skillTargetProfile(entry("Wave Strike")).phases[0].damageType, "thunder");
  const exclusion = skillTargetProfile(entry("Exclusion Zone"));
  assert.equal(exclusion.phases.find(phase => phase.id === "triggered").damage, null);
  assert.equal(skillTargetProfile(entry("Thousand Cuts")).phases[0].noInitialRoll, true);
  assert.equal(skillTargetProfile(entry("Ring of Purgatory")).phases[0].templates, 2);
  assert.equal(skillTargetProfile(entry("Storm's Wake")).phases.find(phase => phase.id === "movement").areaMovement.feet, 20);
  const volcanian = skillTargetProfile(entry("Volcanian"));
  assert.equal(volcanian.phases[0].damage, null);
  assert.equal(volcanian.phases[1].range, 45);
  assert.equal(volcanian.phases[1].damage, "6d6");
});
test("spell-only DC prerequisites reject the default D&D5e DC without a casting ability; alternatives remain legal", () => {
  const actor = { system: { attributes: { spell: { dc: 10 } }, abilities: { wis: { mod: 2 } } } };
  assert.throws(() => validateSkillPrerequisites(actor, entry("Levitate").operatorSkill), /Spell Save DC/);
  assert.throws(() => validateSkillPrerequisites(actor, entry("Gentle Binding Gaze").operatorSkill), /Spell Save DC/);
  assert.doesNotThrow(() => validateSkillPrerequisites(actor, entry("EMP Eruption").operatorSkill));
  actor.system.attributes.spellcasting = "wis";
  assert.doesNotThrow(() => validateSkillPrerequisites(actor, entry("Levitate").operatorSkill));
  actor.system.attributes.hp = { value: 0 };
  assert.throws(() => validateSkillPrerequisites(actor, entry("Adrenaline Rush").operatorSkill), /Hit Points greater than 0/);
});
test("cell centers cover large square/hex tokens; gridless uses the token center", () => {
  const grid = { size: 100, getCenterPoint: ({ i, j }) => ({ x: j * 100 + 50, y: i * 100 + 50 }) };
  const token = { x: 0, y: 0, width: 2, height: 2, parent: { grid }, getOccupiedGridSpaceOffsets: () => [{ i: 0, j: 0 }, { i: 0, j: 1 }, { i: 1, j: 0 }, { i: 1, j: 1 }] };
  assert.equal(tokenPoints(token).length, 4);
  assert.equal(affectedTokens([{ id: "large", points: tokenPoints(token) }], [{ type: "circle", x: 150, y: 150, distance: 1 }]).length, 1);
  token.getOccupiedGridSpaceOffsets = () => [];
  assert.deepEqual(tokenPoints(token), [{ x: 100, y: 100 }]);
  grid.getCenterPoint = ({ i, j }) => ({ x: j * 75 + 50, y: i * 86.6 + (j % 2) * 43.3 });
  token.getOccupiedGridSpaceOffsets = () => [{ i: 0, j: 1 }, { i: 1, j: 1 }];
  assert.deepEqual(tokenPoints(token)[0], { x: 125, y: 43.3 });
  grid.type = 0;
  assert.deepEqual(tokenPoints(token), [{ x: 100, y: 100 }]);
});
test("Grand Cross orientation, cones and overlapping Cluster Bombs deduplicate occupied cells", () => {
  const cross = { type: "cross", x: 0, y: 0, distance: 50, width: 10, direction: 0 };
  assert.ok(containsPoint(cross, { x: 24, y: 4 })); assert.ok(containsPoint(cross, { x: 4, y: 24 }));
  assert.ok(!containsPoint(cross, { x: 10, y: 10 }));
  assert.ok(containsPoint({ ...cross, direction: 45 }, { x: 15, y: 15 }));
  const cone = { type: "cone", x: 0, y: 0, distance: 30, angle: 180 };
  assert.ok(containsPoint(cone, { x: 0, y: 30 })); assert.ok(!containsPoint(cone, { x: -1, y: 0 }));
  const circles = [0, 5, 10].map(x => ({ type: "circle", x, y: 0, distance: 10 }));
  const tokens = [{ id: "source", points: [{ x: 0, y: 0 }] }, { id: "victim", points: [{ x: 5, y: 0 }, { x: 10, y: 0 }] }];
  assert.deepEqual(affectedTokens(tokens, circles, { sourceId: "source", excludeSource: true }).map(token => token.id), ["victim"]);
});
test("ordinary walls, open doors, corner propagation and sealed rooms differ", () => {
  const shape = { type: "circle", x: 0, y: 0, distance: 100 }, point = { x: 30, y: 0 };
  const wall = { c: [15, -20, 15, 20], move: 20, sight: 20, door: 0 };
  assert.ok(!reachesPoint(shape, point, [wall])); assert.ok(reachesPoint(shape, point, [wall], true));
  assert.ok(reachesPoint(shape, point, [{ ...wall, door: 1, ds: 1 }]));
  const closed = [wall, { ...wall, c: [15, 20, 50, 20] }, { ...wall, c: [50, 20, 50, -20] }, { ...wall, c: [50, -20, 15, -20] }];
  assert.ok(!reachesPoint(shape, point, closed, true));
  assert.equal(affectedTokens([{ id: "v", points: [point] }], [shape], { walls: closed, piercing: true }).length, 1);
});
test("units are converted explicitly and unrecognized units require configuration", () => {
  assert.equal(feetToPixels({ grid: { units: "ft", size: 100, distance: 5 } }, 30), 600);
  assert.equal(feetToPixels({ grid: { units: "m", size: 100, distance: 1.524 } }, 30), 600);
  assert.throws(() => feetToPixels({ grid: { units: "squares" } }, 30), /units/);
});
test("Ctrl+T targets an unowned hovered enemy; Shift adds, controls are the fallback", () => {
  globalThis.document = { activeElement: { matches: () => false } };
  const calls = [], token = (id, hover, owned = false) => ({ id, hover, visible: true, isOwner: owned, document: { hidden: false }, setTarget: (value, options) => calls.push([id, value, options.releaseOthers]) });
  const enemy = token("enemy", true), ally = token("ally", false, true);
  globalThis.canvas = { ready: true, tokens: { placeables: [enemy, ally], controlled: [ally] } };
  globalThis.game = { user: { targets: new Set([ally]) } };
  assert.ok(targetSkillTokens()); assert.deepEqual(calls.map(call => call.slice(0, 2)), [["ally", false], ["enemy", true]]);
  calls.length = 0; targetSkillTokens({ event: { shiftKey: true } }); assert.deepEqual(calls, [["enemy", true, false]]);
  enemy.hover = false; calls.length = 0; targetSkillTokens(); assert.equal(calls.at(-1)[0], "ally");
});
test("the GM independently validates supplied scene references, target count/range and recomputes area dimensions", async () => {
  const actor = { uuid: "Actor.source", system: {} }, docs = new Map();
  const scene = { id: "scene", documentName: "Scene", grid: { units: "ft", size: 100, distance: 5 }, walls: [], tokens: [], testUserPermission: () => true };
  const token = (id, x, y, tokenActor = { uuid: `Actor.${id}` }) => ({ id, uuid: `Scene.scene.Token.${id}`, documentName: "Token", parent: scene, actor: tokenActor, x, y, width: 1, height: 1, getOccupiedGridSpaceOffsets: () => [] });
  const source = token("source", 0, 0, actor), near = token("near", 100, 0), far = token("far", 3000, 0);
  scene.tokens = [source, near, far]; for (const doc of scene.tokens) docs.set(doc.uuid, doc);
  globalThis.fromUuid = async uuid => docs.get(uuid);
  const item = name => ({ flags: { ak5e: { operatorSkill: entry(name).operatorSkill } } });
  const data = { sourceTokenUuid: source.uuid, targetTokenUuids: [near.uuid], confirmation: true };
  assert.equal((await validateSkillResolution(actor, item("Stormbolt"), data, { isGM: true })).targets[0], near);
  await assert.rejects(validateSkillResolution(actor, item("Stormbolt"), { ...data, targetTokenUuids: [far.uuid] }, { isGM: true }), /range/);
  await assert.rejects(validateSkillResolution(actor, item("Stormbolt"), { ...data, targetTokenUuids: [near.uuid, far.uuid] }, { isGM: true }), /one target/);
  await assert.rejects(validateSkillResolution(actor, item("Stormbolt"), { ...data, sourceTokenUuid: near.uuid }, { isGM: true }), /source/);
  const area = await validateSkillResolution(actor, item("Grand Cross"), { ...data, shapes: [{ type: "cross", x: 9999, y: 9999, distance: 99999, direction: 0 }] }, { isGM: true });
  assert.equal(area.shapes[0].distance, 1000); assert.equal(area.shapes[0].x, 50); assert.ok(!area.targets.includes(source));
  source.disposition = 1; near.disposition = 0; far.disposition = -1;
  const guardData = { ...data, shapes: [{ type: "circle", x: 0, y: 0, direction: 0 }] };
  assert.ok(!(await validateSkillResolution(actor, item("Radial Guard"), guardData, { isGM: true })).targets.includes(near));
  assert.ok((await validateSkillResolution(actor, item("Radial Guard"), { ...guardData, narrativeTokenUuids: [near.uuid] }, { isGM: true })).targets.includes(near));
});
