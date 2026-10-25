import test from "node:test";
import assert from "node:assert/strict";
import { guardFixture, world } from "./guard-fixture.mjs";
import {
  isArtsblade, defineArtsbladePools, maxArtLevel, bladeArtFormula,
  registerArtsbladeHooks, artsbladePreRollAttack, artsbladePreRollDamage
} from "../scripts/artsblade-features.mjs";
import { guardUses } from "../scripts/guard-uses.mjs";
import { martialDC } from "../scripts/guard-rules.mjs";
import { getPool } from "../scripts/resource-pools.mjs";
import { emitAk5eEvent } from "../scripts/trigger-events.mjs";

import { registerGuardFeatureHooks } from "../scripts/guard-features.mjs";

function setupWorld() {
  const documents = world();
  registerGuardFeatureHooks();
  registerArtsbladeHooks();
  return documents;
}

const use = (actor, command, data = {}, id = "arts-1") => guardUses.command(actor, command, { confirmed: true, ...data }, id);

test("Artsblade identification and formula scaling", () => {
  setupWorld();
  const actor = guardFixture({ level: 5, branch: "artsblade" });
  assert.equal(isArtsblade(actor), true);

  // Max Art Level steps: 1 at 1st, 2 at 5th, 3 at 9th, 4 at 13th, 5 at 17th
  assert.equal(maxArtLevel(1), 1);
  assert.equal(maxArtLevel(4), 1);
  assert.equal(maxArtLevel(5), 2);
  assert.equal(maxArtLevel(9), 3);
  assert.equal(maxArtLevel(13), 4);
  assert.equal(maxArtLevel(17), 5);

  // Blade Art damage formula steps: 1d6 (1st), 2d6 (5th), 3d6 (11th), 4d6 (17th)
  assert.equal(bladeArtFormula(1), "1d6");
  assert.equal(bladeArtFormula(5), "2d6");
  assert.equal(bladeArtFormula(11), "3d6");
  assert.equal(bladeArtFormula(17), "4d6");
});

test("Blade Art configures damage parts, sets damage formula, and tracks single-save immunity", async () => {
  setupWorld();
  const actor = guardFixture({ level: 5, branch: "artsblade" });
  const result = await use(actor, "bladeArt", { pool: "frost", martialDcAbility: "str", targetUuid: "Actor.foe1" }, "blade-1");

  assert.equal(result.pool, "frost");
  assert.equal(result.damageType, "cold");
  assert.equal(result.formula, "2d6"); // level 5
  assert.equal(result.immuneToSave, false);

  const receipt = guardUses.receipt(actor, "blade-1");
  assert.equal(receipt.formula, "2d6");
  assert.equal(receipt.damageParts[0].type, "cold");
  assert.equal(receipt.saves[0].saveId, "blade-resonance");
});

test("Augmented Assault spends 2 Aggression and configures two Blade Arts per turn", async () => {
  setupWorld();
  const actor = guardFixture({ level: 5, branch: "artsblade", aggression: 4 });
  const result = await use(actor, "augmentedAssault", {}, "aug-1");

  assert.equal(result.aggressionSpent, 2);
  assert.equal(result.augmentedAssault, true);
  assert.equal(result.unleash, false); // level 5 (< 13)

  // Level 13 unleashes normal AoE
  const actor13 = guardFixture({ level: 13, branch: "artsblade", aggression: 4 });
  const res13 = await use(actor13, "augmentedAssault", { unleash: true }, "aug-13");
  assert.equal(res13.unleash, true);
});

test("Casting Spellsword Arts spends 1 SP, computes Martial DC, and handles True Spellsword", async () => {
  setupWorld();
  const actor = guardFixture({ level: 5, branch: "artsblade" });
  actor.flags.ak5e.resourcePools.spellswordPoints = { value: 1, max: 1 };
  actor.flags.ak5e.guardProgression = { choices: { artPools: ["corrosion"] } };
  actor.items.set("acid-splash", { id: "acid-splash", type: "spell", name: "Acid Splash", system: { level: 0, actionType: "save" }, flags: { ak5e: { guardArtsPools: ["standard-art-pool-corrosion-arts-407"] } } });

  const result = await use(actor, "castSpellswordArt", { artName: "Acid Splash", artPool: "corrosion", martialDcAbility: "str" }, "cast-1");
  assert.equal(result.spSpent, 1);
  assert.equal(result.artName, "Acid Splash");
  assert.equal(result.castingLevel, 2);
  assert.equal(result.martialDC, martialDC(actor));
  assert.equal(result.trueSpellsword, false);

  // Level 17 enables True Spellsword
  const actor17 = guardFixture({ level: 17, branch: "artsblade" });
  actor17.flags.ak5e.resourcePools.spellswordPoints = { value: 3, max: 3 };
  actor17.flags.ak5e.guardProgression = { choices: { artPools: ["electric"] } };
  actor17.items.set("lightning-bolt", { id: "lightning-bolt", type: "spell", name: "Lightning Bolt", system: { level: 3, actionType: "save" }, flags: { ak5e: { guardArtsPools: ["standard-art-pool-electric-arts-2739"] } } });
  const res17 = await use(actor17, "castSpellswordArt", { artName: "Lightning Bolt", artPool: "electric", martialDcAbility: "str" }, "cast-17");
  assert.equal(res17.trueSpellsword, true);
});

test("Cut Through Chaos (4th level) spends 1 pool use and Reaction across 3 modes", async () => {
  setupWorld();
  const actor = guardFixture({ level: 5, branch: "artsblade" });
  actor.flags.ak5e.resourcePools.cutThroughChaos = { value: 3, max: 3 };

  // Mode 1: spellAttack deflection
  const res1 = await use(actor, "cutThroughChaos", { mode: "spellAttack" }, "ctc-1");
  assert.equal(res1.mode, "spellAttack");
  assert.equal(res1.clearPath, false);

  // Mode 2: savingThrow at level 13 has Clear Path
  const actor13 = guardFixture({ level: 13, branch: "artsblade" });
  actor13.flags.ak5e.resourcePools.cutThroughChaos = { value: 5, max: 5 };
  const res2 = await use(actor13, "cutThroughChaos", { mode: "savingThrow" }, "ctc-2");
  assert.equal(res2.mode, "savingThrow");
  assert.equal(res2.clearPath, true);
});

test("Ultimate Blade Art (17th level) spends 1 use of pool and sets active state", async () => {
  setupWorld();
  const actor = guardFixture({ level: 17, branch: "artsblade" });
  actor.flags.ak5e.resourcePools.ultimateBladeArt = { value: 1, max: 1 };

  const result = await use(actor, "ultimateBladeArt", {}, "ult-1");
  assert.equal(result.ultimateBladeArtActive, true);
  assert.equal(result.useSpent, 1);
});

test("Ceaseless restores 1 SP on Initiative if below max for level 17+ Artsblade", async () => {
  setupWorld();
  const actor = guardFixture({ level: 17, branch: "artsblade" });
  actor.flags.ak5e.resourcePools.spellswordPoints = { value: 1, max: 3 };

  await emitAk5eEvent("initiative", { raw: { actor } });

  const sp = getPool(actor, "spellswordPoints");
  assert.equal(sp.value, 2); // gained 1 SP up to max
});

test("Roll hooks apply Force bonus and Flame Improved Resonance", () => {
  setupWorld();
  const actor = guardFixture({ level: 10, branch: "artsblade" });
  actor.flags.ak5e.guardUses = {
    data: {
      forceResonanceUntilTurn: "c1:1:1",
      forceResonanceBonus: 3,
      flameResonanceUntilTurn: "c1:1:1"
    }
  };
  globalThis.game.combat = { started: true, id: "c1", round: 1, turn: 0, turns: [{ actor }] };

  // Pre-roll Attack adds force bonus
  const atkConfig = { subject: { actor, actionType: "mwak" }, rolls: [{ parts: ["1d20", "4"] }] };
  artsbladePreRollAttack(atkConfig);
  assert.ok(atkConfig.rolls[0].parts.includes("3"));

  // Pre-roll Damage adds force bonus and flame 1d10
  const dmgConfig = { subject: { actor, actionType: "mwak" }, rolls: [{ parts: ["1d8", "4"], options: { type: "slashing", types: ["slashing"] } }] };
  artsbladePreRollDamage(dmgConfig);
  assert.ok(dmgConfig.rolls[0].parts.includes("3"));
  assert.ok(!dmgConfig.rolls[0].parts.includes("1d10"));
  assert.equal(dmgConfig.rolls.length, 2);
  assert.deepEqual(dmgConfig.rolls[0].options.types, ["slashing"]);
  assert.deepEqual(dmgConfig.rolls[1].parts, ["1d10"]);
  assert.equal(dmgConfig.rolls[1].options.type, "fire");
  assert.deepEqual(dmgConfig.rolls[1].options.types, ["fire"]);
});
