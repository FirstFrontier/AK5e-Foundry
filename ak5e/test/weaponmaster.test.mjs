import test from "node:test";
import assert from "node:assert/strict";
import { guardFixture, world } from "./guard-fixture.mjs";
import {
  isWeaponmaster,
  MARTIAL_MASTERY_TABLE,
  getWeaponMasteryProperty,
  WEAPONMASTER_FIGHTING_STYLES,
  isWeaponmasterProficient,
  getWeaponmasterView,
  weaponmasterPreRollAttack,
  weaponmasterPreRollDamage,
  registerWeaponmasterHooks
} from "../scripts/weaponmaster-features.mjs";
import { registerGuardFeatureHooks } from "../scripts/guard-features.mjs";
import { guardUses } from "../scripts/guard-uses.mjs";
import { getPool } from "../scripts/resource-pools.mjs";

function setupWorld(combat = null) {
  const documents = world(combat);
  registerGuardFeatureHooks();
  registerWeaponmasterHooks();
  return documents;
}

const use = (actor, command, data = {}, id = "wm-1") =>
  guardUses.command(actor, command, { confirmed: true, ...data }, id);

test("Weaponmaster identification", () => {
  setupWorld();
  const wm = guardFixture({ level: 5, branch: "weaponmaster" });
  assert.equal(isWeaponmaster(wm), true);

  const centurion = guardFixture({ level: 5, branch: "centurion" });
  assert.equal(isWeaponmaster(centurion), false);

  const unconfigured = guardFixture({ level: 5, branch: null, enabled: false });
  assert.equal(isWeaponmaster(unconfigured), false);
});

test("Martial Mastery Table and weapon property resolution", () => {
  setupWorld();
  const crossbow = { name: "Heavy Crossbow", system: { baseItem: "heavy crossbow" } };
  assert.equal(getWeaponMasteryProperty(crossbow), "canOpener");

  const bow = { name: "Longbow", system: { baseItem: "bow" } };
  assert.equal(getWeaponMasteryProperty(bow), "cornering");

  const spear = { name: "Spear", system: { baseItem: "spear" } };
  assert.equal(getWeaponMasteryProperty(spear), "drive");

  const knife = { name: "Dagger", system: { baseItem: "knife" } };
  assert.equal(getWeaponMasteryProperty(knife), "executioner");

  const greatsword = { name: "Greatsword", system: { baseItem: "greatsword" } };
  assert.equal(getWeaponMasteryProperty(greatsword), "flourish");

  const axe = { name: "Greataxe", system: { baseItem: "greataxe" } };
  assert.equal(getWeaponMasteryProperty(axe), "lethality");
});

test("Judgement Cut: Mark (1/SR) and Detonation (half damage)", async () => {
  setupWorld();
  const actor = guardFixture({ level: 5, branch: "weaponmaster" });
  assert.equal(getPool(actor, "judgementCut").value, 1);

  // Mark target
  const markRes = await use(actor, "weaponmasterJudgementCut", { targetName: "Iron Guard" }, "jc-1");
  assert.equal(markRes.targetName, "Iron Guard");
  assert.equal(getPool(actor, "judgementCut").value, 0);
  assert.equal(actor.flags.ak5e.weaponmaster.judgementCut.active, true);

  // Detonate after dealing 30 weapon damage
  const detRes = await use(actor, "weaponmasterDetonateJudgementCut", { totalDamage: 30 }, "jc-2");
  assert.equal(detRes.totalDamage, 30);
  assert.equal(detRes.detonationDamage, 15);
  assert.equal(actor.flags.ak5e.weaponmaster.judgementCut, null);
});

test("A Master's Weapon: Signature Weapon and Every Part of the Weapon", async () => {
  setupWorld();
  const actor = guardFixture({ level: 10, branch: "weaponmaster" });
  actor.items.set("sw-1", {
    id: "sw-1",
    type: "weapon",
    name: "Fine Katana",
    system: { baseItem: "sword", equipped: true }
  });

  // Designate signature weapon
  const sigRes = await use(actor, "weaponmasterSetSignatureWeapon", { weaponId: "sw-1", weaponName: "Fine Katana" }, "sig-1");
  assert.equal(sigRes.weaponId, "sw-1");
  assert.equal(actor.flags.ak5e.weaponmaster.signatureWeaponId, "sw-1");
  assert.equal(actor.flags.ak5e.weaponmaster.signatureWeaponName, "Fine Katana");

  // Every Part of the Weapon (BA mastery change)
  const epwRes = await use(actor, "weaponmasterEveryPartOfTheWeapon", { propertyKey: "canOpener" }, "epw-1");
  assert.equal(epwRes.propertyKey, "canOpener");
  assert.equal(actor.flags.ak5e.weaponmaster.activeMasteryOverride, "canOpener");

  // Attack roll hook applies +1 bonus
  const weaponItem = { id: "sw-1", actor };
  const attackConfig = { bonus: "" };
  weaponmasterPreRollAttack(weaponItem, attackConfig);
  assert.match(attackConfig.bonus, /1/);

  // Damage roll hook applies +1 bonus
  const damageConfig = { bonus: "" };
  weaponmasterPreRollDamage(weaponItem, damageConfig);
  assert.match(damageConfig.bonus, /1/);
});

test("Untouchable: Reaction melee duel (2/LR)", async () => {
  setupWorld();
  const actor = guardFixture({ level: 13, branch: "weaponmaster" });
  assert.equal(getPool(actor, "untouchable").value, 2);

  const uRes = await use(actor, "weaponmasterUntouchable", { attackerName: "Duelist Champion" }, "untouch-1");
  assert.equal(uRes.attackerName, "Duelist Champion");
  assert.equal(uRes.reactionSpent, true);
  assert.equal(getPool(actor, "untouchable").value, 1);
});

test("Song of Steel (17th level): 1/LR Bonus Action stance", async () => {
  setupWorld();
  const actor = guardFixture({ level: 17, branch: "weaponmaster" });
  assert.equal(getPool(actor, "songOfSteel").value, 1);

  const sRes = await use(actor, "weaponmasterSongOfSteel", {}, "sos-1");
  assert.equal(sRes.active, true);
  assert.equal(getPool(actor, "songOfSteel").value, 0);
  assert.equal(actor.flags.ak5e.weaponmaster.songOfSteelActive, true);

  // PreRollAttack with signature weapon has Advantage under Song of Steel
  actor.flags.ak5e.weaponmaster.signatureWeaponId = "sig-blade";
  const sigItem = { id: "sig-blade", actor };
  const attackConfig = { bonus: "", advantage: false };
  weaponmasterPreRollAttack(sigItem, attackConfig);
  assert.equal(attackConfig.advantage, true);
});

test("Weaponmaster encounter-window undo", async () => {
  setupWorld();
  const actor = guardFixture({ level: 5, branch: "weaponmaster" });
  assert.equal(getPool(actor, "judgementCut").value, 1);

  await use(actor, "weaponmasterJudgementCut", { targetName: "Foe" }, "undo-jc-1");
  assert.equal(getPool(actor, "judgementCut").value, 0);

  await use(actor, "undoUse", { useId: "undo-jc-1" });
  assert.equal(getPool(actor, "judgementCut").value, 1);
  assert.equal(actor.flags.ak5e.weaponmaster.judgementCut, undefined);
});

test("Dualstrike and Art of War: Steelwind, Fast Hands, and Fighting Style swap", async () => {
  setupWorld();
  const actor = guardFixture({ level: 3, branch: "weaponmaster" });

  // View inspection
  const view = getWeaponmasterView(actor);
  assert.equal(view.isWeaponmaster, true);
  assert.equal(view.fastHands, true);
  assert.equal(view.steelwind, true);

  // Weapon proficiency helper
  assert.equal(isWeaponmasterProficient(actor, { type: "weapon", name: "Heavy Crossbow" }), true);
  assert.equal(isWeaponmasterProficient(actor, { type: "equipment", name: "Shield" }), false);

  // Steelwind Dualstrike action integration
  const swRes = await use(actor, "weaponmasterSteelwind", {}, "sw-1");
  assert.equal(swRes.attackMade, true);
  assert.equal(swRes.preservedBonusAction, true);

  // Swap Fighting Style (LR exchange)
  assert.ok(WEAPONMASTER_FIGHTING_STYLES.closeAndPersonal); // Marksman style available
  assert.ok(WEAPONMASTER_FIGHTING_STYLES.brawler); // Guard style available
  const swapRes = await use(actor, "weaponmasterSwapFightingStyle", { styleKey: "closeAndPersonal" }, "fs-swap-1");
  assert.equal(swapRes.newStyle, "closeAndPersonal");
  assert.equal(actor.flags.ak5e.weaponmaster.additionalFightingStyle, "closeAndPersonal");

  // Undo fighting style swap
  await use(actor, "undoUse", { useId: "fs-swap-1" });
  assert.ok(!actor.flags.ak5e?.weaponmaster?.additionalFightingStyle);
});

