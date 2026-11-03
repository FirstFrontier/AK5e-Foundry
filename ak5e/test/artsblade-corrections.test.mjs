import test from "node:test";
import assert from "node:assert/strict";
import { guardFixture, world } from "./guard-fixture.mjs";
import { guardUses } from "../scripts/guard-uses.mjs";
import { registerArtsbladeHooks } from "../scripts/artsblade-features.mjs";
import { previewGuardProgression } from "../scripts/guard-progression.mjs";
import { standardPools } from "../scripts/caster-rules.mjs";

async function use(actor, command, data, id) {
  const preview = guardUses.preview(actor, command, data);
  return guardUses.command(actor, command, { ...data, confirmed: true, overrides: preview.warnings.map(w => w.id) }, id);
}
function setup(level = 10) {
  world(); registerArtsbladeHooks();
  return guardFixture({ level, branch: "artsblade" });
}

test("level ten Wind removes the save and waits for actual applied damage acknowledgment", async () => {
  const actor = setup();
  await use(actor, "bladeArt", { pool: "wind", martialDcAbility: "str", targetUuid: "Actor.foe" }, "wind-ten");
  const receipt = guardUses.receipt(actor, "wind-ten");
  assert.deepEqual(receipt.saves, []);
  assert.equal(receipt.targets.length, 0, "casting does not inflict Bleeding");
  assert.equal(receipt.actions[0].id, "wind-bleeding");
  assert.match(receipt.actions[0].label, /damage/i);
  assert.doesNotMatch(receipt.manualSteps.join(" "), /CON save|CONSTITUTION save/);
});

test("base Wind still offers its source Constitution save", async () => {
  const actor = setup(9);
  await use(actor, "bladeArt", { pool: "wind", martialDcAbility: "str", targetUuid: "Actor.foe" }, "wind-nine");
  assert.equal(guardUses.receipt(actor, "wind-nine").saves[0].ability, "con");
});

test("Spellsword resolution uses the selected native Art metadata for Unleash", async () => {
  const actor = setup(13);
  game.combat = { started: true, id: "combat", round: 1, turn: 0 };
  actor.flags.ak5e.guardUses = { data: { augmentedAssaultTurn: "combat:1:0", augmentedAssaultUnleash: true } };
  actor.items.set("art", { id: "art", uuid: `${actor.uuid}.Item.art`, name: "Lightning Bolt", type: "spell",
    system: { level: 3, activation: { type: "bonus" }, target: { template: { type: "line", size: 100 } } } });
  await use(actor, "castSpellswordArt", { artName: "Lightning Bolt", martialDcAbility: "dex", unleash: true }, "unleash-art");
  const receipt = guardUses.receipt(actor, "unleash-art");
  assert.match(receipt.manualSteps.join(" "), /metadata: bonus/);
  assert.match(receipt.manualSteps.join(" "), /Unleash: use the normal area/);
});

test("Cut Through Chaos snapshots the selected native weapon attack instead of generic STR plus proficiency", async () => {
  const actor = setup();
  actor.items.set("rapier", { id: "rapier", uuid: `${actor.uuid}.Item.rapier`, type: "weapon", name: "Magic finesse sword",
    system: { equipped: true, type: { value: "simpleM" }, proficient: 0, magicalBonus: 2, activities: new Map([
      ["melee", { id: "melee", type: "attack", attack: { type: { value: "melee", classification: "weapon" } } }]
    ]) } });
  await use(actor, "cutThroughChaos", { mode: "spellAttack", weaponUuid: `${actor.uuid}.Item.rapier`, activityId: "melee", incomingTotal: 18 }, "native-cut");
  const receipt = guardUses.receipt(actor, "native-cut");
  assert.equal(receipt.formula, undefined);
  assert.deepEqual(receipt.nativeAttack, { weaponUuid: `${actor.uuid}.Item.rapier`, activityId: "melee" });
  assert.equal(receipt.roll, undefined);
});

test("additional Artsblade pools grant only levelled Arts through third level, primary retains fifth", async () => {
  const actor = setup();
  const choices = { branch: "subclass-guard-artsblade", artPools: ["corrosion"], additionalArtPools: ["flame", "frost"] };
  const plan = await previewGuardProgression(actor, choices);
  const expected = new Set();
  for (const [key, ceiling] of [["corrosion", 5], ["flame", 3], ["frost", 3]]) {
    const pool = standardPools.find(pool => pool.id.includes(`-${key}-arts-`));
    for (const member of pool.members) if (member.level >= 1 && member.level <= ceiling) expected.add(member.name);
  }
  const grants = plan.createItems.filter(item => item.flags?.ak5e?.guardProgressionGrant?.kind === "artsbladeArt");
  assert.deepEqual(grants.map(item => item.name).sort(), [...expected].sort());
  assert.equal(grants.length, new Set(grants.map(item => item.name)).size);
  assert.ok(grants.every(item => item.system.level > 0));
});
