/**
 * Artificer Heavy Duty Upgrades (U6): data transcription, restrictions, cap, duplicates, wrong-target errors,
 * uses and recovery, card buttons (no roll on post), undo, and the Basic Personality Matrix.
 * Source: AK5e 1.3.1 Ch. 3 L6923-7073 (Loaded for Bear, Automaton and Mobile Cover upgrades) and Ch. 6 L6583-6685
 * (Automaton variants). Oracles are copied from the source text, not read from the implementation.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { setupFoundryGlobals, createTestActor, createTestItem, triggerShortRest, triggerLongRest } from "./base-classes-fixture.mjs";

setupFoundryGlobals();
const Upgrades = await import("../scripts/artificer-upgrades.mjs");
const { supporterUses, registerSupporterPlans } = await import("../scripts/supporter-uses.mjs");

registerSupporterPlans({ plans: Upgrades.artificerUpgradePlans });
Upgrades.defineArtificerUpgradePools();
const { artificerUpgradePlans, ARTIFICER_UPGRADES, upgradeCapFor, upgradesAtCreation, restrictionMet, recoverUpgradeUses } = Upgrades;

const DEFAULT_MODS = { str: 0, dex: 2, con: 1, int: 4, wis: 0, cha: 0 };

/** Artificer (Supporter, branch artificer) at a level, with an INT modifier and optional covers. */
function artificer({ level = 17, int = DEFAULT_MODS.int, covers = [], automatons = [] } = {}) {
  const abilities = {};
  for (const [key, mod] of Object.entries({ ...DEFAULT_MODS, int })) abilities[key] = { mod, value: 10 + 2 * mod };
  return createTestActor({
    name: `Artificer L${level}`, level, abilities,
    items: [
      createTestItem({ name: "Supporter", type: "class", system: { levels: level }, flags: { ak5e: { chapterThreeId: "class-supporter" } } }),
      createTestItem({ name: "Artificer", type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-supporter-artificer" } } })
    ],
    flags: { ak5e: { supporter: { enabled: true, branch: "artificer", aidAbility: "int" }, artificer: { automatons, covers } } }
  });
}

/** An Automaton: a plain NPC carrying the contract flag. */
function automaton(creator, { name = "Automaton", variant = "turret", upgrades = [], destroyed = false, upgradeUses = {}, personality = null } = {}) {
  return createTestActor({
    name, type: "npc",
    flags: { ak5e: { automaton: { creator: creator.uuid, variant, upgrades, personality, destroyed, upgradeUses } } }
  });
}

/** Re-register the Artificer's automaton list after the Automaton exists (fixtures are created in order). */
function link(creator, automatons) {
  creator.flags.ak5e.artificer.automatons = automatons.map(a => a.uuid);
  return creator;
}

const plan = (actor, name, data) => artificerUpgradePlans[name](actor, {}, data);
const warningIds = result => result.warnings.map(w => w.id);
const entry = id => ARTIFICER_UPGRADES.find(u => u.id === id);
const latestUse = actor => supporterUses.uses(actor)[0];

/* ---------------------------------------------------------------- data transcription */

test("transcription: all 17 Automaton upgrades and 4 Mobile Cover upgrades are present", () => {
  const automatonIds = ARTIFICER_UPGRADES.filter(u => u.target === "automaton").map(u => u.id).sort();
  const coverIds = ARTIFICER_UPGRADES.filter(u => u.target === "cover").map(u => u.id).sort();
  assert.equal(automatonIds.length, 17);
  assert.equal(coverIds.length, 4);
  assert.deepEqual(coverIds, ["mountedCrossbow", "reinforced", "stimulantVaporiser", "ultralight"]);
  assert.ok(Object.isFrozen(ARTIFICER_UPGRADES));
});

test("transcription: Flamethrower is a Dex save, 3 Aid Dice Fire, half on success, SR/LR shared", () => {
  const f = entry("flamethrower");
  assert.equal(f.name, "Flamethrower");
  assert.equal(f.action, "action");
  assert.deepEqual({ ...f.save }, { ability: "dex", dc: "artificer", halfOnSave: true });
  assert.deepEqual({ ...f.dice }, { count: 3, type: "aid", kind: "damage" });
  assert.deepEqual({ ...f.uses }, { max: 1, recovery: "srlr", sharedRest: true });
});

test("transcription: Arbalest is Turret only, Dex save vs Artificer DC, one Aid Die, no half on save", () => {
  const a = entry("arbalest");
  assert.equal(a.restriction, "turret");
  assert.equal(a.action, "action");
  assert.equal(a.save.ability, "dex");
  assert.equal(a.save.halfOnSave, false);
  assert.equal(a.dice.count, 1);
});

test("transcription: Bombtail is Air Support only, 5 Aid Dice Thunder, Long Rest recovery", () => {
  const b = entry("bombtail");
  assert.equal(b.restriction, "airSupport");
  assert.equal(b.dice.count, 5);
  assert.deepEqual({ ...b.uses }, { max: 1, recovery: "lr", sharedRest: true });
  assert.equal(b.save.halfOnSave, true);
});

test("transcription: Gas Projectors is a Con save, 2 Aid Dice Poison, Long Rest recovery", () => {
  const g = entry("gasProjectors");
  assert.equal(g.save.ability, "con");
  assert.equal(g.dice.count, 2);
  assert.equal(g.uses.recovery, "lr");
});

test("transcription: Electroshock Cables is 3 Aid Dice, Short or Long Rest, no half on a save", () => {
  const e = entry("electroshockCables");
  assert.equal(e.dice.count, 3);
  assert.equal(e.uses.recovery, "srlr");
  assert.equal(e.save.halfOnSave, false);
});

test("transcription: Medical Dispenser is Platform only, uses equal INT mod, heals one Aid Die", () => {
  const m = entry("medicalDispenser");
  assert.equal(m.restriction, "platform");
  assert.equal(m.uses.max, "intMod");
  assert.equal(m.uses.recovery, "sr");
  assert.equal(m.dice.kind, "heal");
  assert.equal(m.dice.count, 1);
});

test("transcription: Search and Rescue Suite is Platform only with a Strength save; Smoke Launcher uses INT mod", () => {
  assert.equal(entry("searchAndRescueSuite").restriction, "platform");
  assert.equal(entry("searchAndRescueSuite").save.ability, "str");
  assert.equal(entry("smokeLauncher").uses.max, "intMod");
});

test("transcription: Crossbow-tagged upgrades and Stimulant Vaporiser dice", () => {
  assert.equal(entry("rotaryCrossbow").restriction, "crossbow");
  assert.equal(entry("tracerShots").restriction, "crossbow");
  assert.equal(entry("hoistSystem").restriction, "airSupport");
  assert.equal(entry("mobilitySystem").restriction, "turret");
  assert.deepEqual({ ...entry("stimulantVaporiser").dice }, { count: 1, type: "aid", kind: "tempHP" });
});

test("restrictions: crossbow means Air Support or Turret; platform and turret are exact", () => {
  assert.equal(restrictionMet("crossbow", "airSupport"), true);
  assert.equal(restrictionMet("crossbow", "turret"), true);
  assert.equal(restrictionMet("crossbow", "platform"), false);
  assert.equal(restrictionMet("turret", "airSupport"), false);
  assert.equal(restrictionMet("platform", "platform"), true);
  assert.equal(restrictionMet(null, "platform"), true);
});

test("restrictions: install warns (never blocks) for a variant the upgrade does not suit", () => {
  const creator = artificer({ level: 17 });
  const turret = automaton(creator, { variant: "turret" });
  const platform = automaton(creator, { variant: "platform" });
  const airSupport = automaton(creator, { variant: "airSupport" });
  assert.deepEqual(warningIds(plan(creator, "installUpgrade", { automatonUuid: turret.uuid, upgradeId: "bombtail", timing: "creation" })), ["restriction"]);
  assert.deepEqual(warningIds(plan(creator, "installUpgrade", { automatonUuid: airSupport.uuid, upgradeId: "bombtail", timing: "creation" })), []);
  assert.deepEqual(warningIds(plan(creator, "installUpgrade", { automatonUuid: platform.uuid, upgradeId: "rotaryCrossbow", timing: "creation" })), ["restriction"]);
  assert.deepEqual(warningIds(plan(creator, "installUpgrade", { automatonUuid: turret.uuid, upgradeId: "rotaryCrossbow", timing: "creation" })), []);
  assert.deepEqual(warningIds(plan(creator, "installUpgrade", { automatonUuid: turret.uuid, upgradeId: "medicalDispenser", timing: "creation" })), ["restriction"]);
  assert.deepEqual(warningIds(plan(creator, "installUpgrade", { automatonUuid: platform.uuid, upgradeId: "medicalDispenser", timing: "creation" })), []);
});

/* ---------------------------------------------------------------- cap, levels, duplicates */

test("cap: 2 Upgrades per Automaton, 3 from level 17; creation grants 1, or 2 from level 17", () => {
  assert.equal(upgradeCapFor(artificer({ level: 16 })), 2);
  assert.equal(upgradeCapFor(artificer({ level: 17 })), 3);
  assert.equal(upgradesAtCreation(artificer({ level: 16 })), 1);
  assert.equal(upgradesAtCreation(artificer({ level: 17 })), 2);
});

test("cap: a third Upgrade at level 16 warns; the same third at level 17 does not", () => {
  const sixteen = artificer({ level: 16 });
  const full16 = automaton(sixteen, { upgrades: ["aegisSystem", "castleSystem"] });
  assert.ok(warningIds(plan(sixteen, "installUpgrade", { automatonUuid: full16.uuid, upgradeId: "raptorArmour", timing: "longRest" })).includes("cap"));

  const seventeen = artificer({ level: 17 });
  const two17 = automaton(seventeen, { upgrades: ["aegisSystem", "castleSystem"] });
  assert.equal(warningIds(plan(seventeen, "installUpgrade", { automatonUuid: two17.uuid, upgradeId: "raptorArmour", timing: "longRest" })).includes("cap"), false);
  const three17 = automaton(seventeen, { upgrades: ["aegisSystem", "castleSystem", "raptorArmour"] });
  assert.ok(warningIds(plan(seventeen, "installUpgrade", { automatonUuid: three17.uuid, upgradeId: "reconnaissanceSuite", timing: "longRest" })).includes("cap"));
});

test("cap: Mobile Cover takes the same cap (ruling A4)", () => {
  const creator = link(artificer({ level: 16, covers: [{ id: "c1", label: "Cover A", upgrades: ["reinforced", "ultralight"], upgradeUses: {}, deployedAt: null }] }), []);
  assert.ok(warningIds(plan(creator, "installUpgrade", { coverId: "c1", upgradeId: "mountedCrossbow", timing: "fortBuilder" })).includes("cap"));
});

test("duplicates: installing the same Upgrade twice on one target warns", () => {
  const creator = artificer({ level: 17 });
  const turret = automaton(creator, { upgrades: ["flamethrower"] });
  assert.ok(warningIds(plan(creator, "installUpgrade", { automatonUuid: turret.uuid, upgradeId: "flamethrower", timing: "longRest" })).includes("duplicate"));
});

test("level gate: Heavy Duty Upgrades warn below level 4 and do not block", () => {
  const creator = artificer({ level: 3 });
  const turret = automaton(creator, { variant: "turret" });
  const result = plan(creator, "installUpgrade", { automatonUuid: turret.uuid, upgradeId: "aegisSystem", timing: "creation" });
  assert.deepEqual(warningIds(result), ["level"]);
  assert.equal(typeof result.apply, "function");
});

test("timing: an unknown timing is a clear error", () => {
  const creator = artificer();
  const turret = automaton(creator);
  assert.throws(() => plan(creator, "installUpgrade", { automatonUuid: turret.uuid, upgradeId: "aegisSystem", timing: "sometime" }), /Choose a timing/);
});

/* ---------------------------------------------------------------- wrong target */

test("wrong target: a Mobile Cover Upgrade on an Automaton is a clear error, not a warning", () => {
  const creator = artificer();
  const turret = automaton(creator);
  assert.throws(() => plan(creator, "installUpgrade", { automatonUuid: turret.uuid, upgradeId: "mountedCrossbow", timing: "creation" }), /Mobile Cover Upgrade/);
});

test("wrong target: an Automaton Upgrade on a Mobile Cover is a clear error", () => {
  const creator = link(artificer({ covers: [{ id: "c1", label: "Cover A", upgrades: [], upgradeUses: {}, deployedAt: null }] }), []);
  assert.throws(() => plan(creator, "installUpgrade", { coverId: "c1", upgradeId: "flamethrower", timing: "creation" }), /Automaton Upgrade/);
});

test("wrong target: naming both or neither target is a clear error", () => {
  const creator = artificer();
  const turret = automaton(creator);
  assert.throws(() => plan(creator, "installUpgrade", { upgradeId: "aegisSystem", timing: "creation" }), /exactly one target/);
  assert.throws(() => plan(creator, "installUpgrade", { automatonUuid: turret.uuid, coverId: "c1", upgradeId: "aegisSystem", timing: "creation" }), /exactly one target/);
});

/* ---------------------------------------------------------------- install, undo */

test("install and undo: Flamethrower and Arbalest install on a turret, and undo removes the upgrade", async () => {
  const creator = artificer({ level: 17 });
  const turret = automaton(creator, { variant: "turret" });
  link(creator, [turret]);

  await supporterUses.execute(creator, "installUpgrade", { automatonUuid: turret.uuid, upgradeId: "flamethrower", timing: "creation" }, "u6-install-1");
  await supporterUses.execute(creator, "installUpgrade", { automatonUuid: turret.uuid, upgradeId: "arbalest", timing: "creation" }, "u6-install-2");
  assert.deepEqual(turret.flags.ak5e.automaton.upgrades, ["flamethrower", "arbalest"]);

  await supporterUses.undo(creator, "u6-install-2");
  assert.deepEqual(turret.flags.ak5e.automaton.upgrades, ["flamethrower"]);
});

test("install on a cover appends to the cover entry, and undo removes it", async () => {
  const creator = artificer({ level: 17, covers: [{ id: "c1", label: "Cover A", upgrades: [], upgradeUses: {}, deployedAt: null }] });
  await supporterUses.execute(creator, "installUpgrade", { coverId: "c1", upgradeId: "reinforced", timing: "fortBuilder" }, "u6-cover-1");
  assert.deepEqual(creator.flags.ak5e.artificer.covers[0].upgrades, ["reinforced"]);
  await supporterUses.undo(creator, "u6-cover-1");
  assert.deepEqual(creator.flags.ak5e.artificer.covers[0].upgrades, []);
});

/* ---------------------------------------------------------------- uses, clamp, recovery */

test("uses: Flamethrower spends its one use; a second use warns (overuse) and clamps at 0 with the shortfall shown", async () => {
  const creator = artificer({ level: 17 });
  const turret = automaton(creator, { variant: "turret", upgrades: ["flamethrower"] });
  link(creator, [turret]);

  await supporterUses.execute(creator, "useUpgrade", { automatonUuid: turret.uuid, upgradeId: "flamethrower", targets: [] }, "u6-use-1");
  assert.equal(turret.flags.ak5e.automaton.upgradeUses.flamethrower.used, 1);

  await assert.rejects(
    () => supporterUses.execute(creator, "useUpgrade", { automatonUuid: turret.uuid, upgradeId: "flamethrower", targets: [] }, "u6-use-2"),
    error => error.name === "AK5eWarnings" && error.warnings.some(w => w.id === "overuse")
  );
  await supporterUses.execute(creator, "useUpgrade", { automatonUuid: turret.uuid, upgradeId: "flamethrower", targets: [], overrides: ["overuse"] }, "u6-use-3");
  assert.equal(turret.flags.ak5e.automaton.upgradeUses.flamethrower.used, 1, "clamped at the maximum");
  assert.match(supporterUses.receipt(creator, "u6-use-3").shortfalls.join(" "), /Flamethrower short by 1/);
});

test("uses: undo restores the spent use", async () => {
  const creator = artificer({ level: 17 });
  const turret = automaton(creator, { variant: "turret", upgrades: ["flamethrower"] });
  link(creator, [turret]);
  await supporterUses.execute(creator, "useUpgrade", { automatonUuid: turret.uuid, upgradeId: "flamethrower", targets: [] }, "u6-undo-use");
  assert.equal(turret.flags.ak5e.automaton.upgradeUses.flamethrower.used, 1);
  await supporterUses.undo(creator, "u6-undo-use");
  assert.equal(turret.flags.ak5e.automaton.upgradeUses.flamethrower.used, 0);
});

test("uses: Medical Dispenser's uses equal the Artificer's INT modifier (4 here)", async () => {
  const creator = artificer({ level: 17, int: 4 });
  const platform = automaton(creator, { variant: "platform", upgrades: ["medicalDispenser"] });
  link(creator, [platform]);
  assert.equal(Upgrades.upgradeUseMax(entry("medicalDispenser"), creator), 4);
  await supporterUses.execute(creator, "useUpgrade", { automatonUuid: platform.uuid, upgradeId: "medicalDispenser", targets: [] }, "u6-medical");
  assert.equal(platform.flags.ak5e.automaton.upgradeUses.medicalDispenser.used, 1);
});

test("recovery: a Short Rest recovers the Short Rest use when the Creator rests and the Automaton is not destroyed", async () => {
  const creator = artificer({ level: 17 });
  const platform = automaton(creator, { variant: "platform", upgrades: ["medicalDispenser"], upgradeUses: { medicalDispenser: { used: 2 } } });
  link(creator, [platform]);
  await recoverUpgradeUses(creator, "short");
  assert.equal(platform.flags.ak5e.automaton.upgradeUses.medicalDispenser.used, 0);
});

test("recovery: a Long Rest does not recover a Short Rest use", async () => {
  const creator = artificer({ level: 17 });
  const platform = automaton(creator, { variant: "platform", upgrades: ["medicalDispenser"], upgradeUses: { medicalDispenser: { used: 2 } } });
  link(creator, [platform]);
  await recoverUpgradeUses(creator, "long");
  assert.equal(platform.flags.ak5e.automaton.upgradeUses.medicalDispenser.used, 2);
});

test("recovery (ruling A5): a shared-rest use does not recover when the Automaton is destroyed", async () => {
  const creator = artificer({ level: 17 });
  const turret = automaton(creator, { variant: "turret", upgrades: ["flamethrower"], destroyed: true, upgradeUses: { flamethrower: { used: 1 } } });
  link(creator, [turret]);
  const result = await recoverUpgradeUses(creator, "long");
  assert.equal(turret.flags.ak5e.automaton.upgradeUses.flamethrower.used, 1);
  assert.ok(result.skipped.some(line => /destroyed/.test(line)));
});

test("recovery is wired to the Creator's dnd5e.restCompleted hook and posts a shared-rest reminder", async () => {
  Upgrades.registerArtificerUpgradeHooks();
  const creator = artificer({ level: 17 });
  const turret = automaton(creator, { variant: "turret", upgrades: ["flamethrower"], upgradeUses: { flamethrower: { used: 1 } } });
  link(creator, [turret]);
  const before = globalThis.game.messages.length;
  await triggerLongRest(creator);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(turret.flags.ak5e.automaton.upgradeUses.flamethrower.used, 0);
  const reminder = globalThis.game.messages.slice(before).find(message => /Reminder/.test(message.content));
  assert.ok(reminder, "a reminder that the Automaton must rest alongside its Creator");
});

/* ---------------------------------------------------------------- card buttons, no roll on post */

test("cards: a use with a save and dice posts Roll and save buttons, and evaluates no roll", async () => {
  const creator = artificer({ level: 17 });
  const turret = automaton(creator, { variant: "turret", upgrades: ["flamethrower"] });
  const foe = createTestActor({ name: "Goblin", type: "character" });
  link(creator, [turret]);

  const RealRoll = globalThis.Roll;
  let evaluations = 0;
  globalThis.Roll = class CountingRoll extends RealRoll { async evaluate() { evaluations += 1; return super.evaluate(); } };
  try {
    await supporterUses.execute(creator, "useUpgrade", { automatonUuid: turret.uuid, upgradeId: "flamethrower", targets: [foe.uuid] }, "u6-card");
  } finally {
    globalThis.Roll = RealRoll;
  }
  assert.equal(evaluations, 0, "no roll is evaluated when the card is posted");
  const card = globalThis.game.messages.find(message => /data-ak5e-upgrade-save="dex"/.test(message.content ?? ""));
  assert.ok(card, "the card has a DEX save button for the target");
  assert.match(card.content, /data-dc="\d+"/);
  // Level 17 is at or above 14, so the Aid Die is a d12 (aidDieSize): three rolls of it.
  assert.match(card.content, /data-ak5e-upgrade-roll="3d12"/);
});

/* ---------------------------------------------------------------- Basic Personality Matrix */

test("personality: choosing a row stores it on the Automaton, and undo clears it", async () => {
  const creator = artificer({ level: 4 });
  const turret = automaton(creator, { variant: "turret" });
  link(creator, [turret]);
  await supporterUses.execute(creator, "basicPersonalityMatrix", { automatonUuid: turret.uuid, choice: 3 }, "u6-pers");
  assert.equal(turret.flags.ak5e.automaton.personality, "Excitable");
  await supporterUses.undo(creator, "u6-pers");
  assert.equal(turret.flags.ak5e.automaton.personality, null);
});

test("personality: the d6 roll is never automatic; the roll happens on the card's command and maps 1 to 6", async () => {
  const creator = artificer({ level: 4 });
  const turret = automaton(creator, { variant: "turret" });
  link(creator, [turret]);
  const RealRoll = globalThis.Roll;
  const fixedRoll = total => class FixedRoll extends RealRoll { async evaluate() { this.total = total; return this; } };

  globalThis.Roll = fixedRoll(6);
  try {
    await supporterUses.execute(creator, "basicPersonalityMatrix", { automatonUuid: turret.uuid }, "u6-roll");
    assert.equal(turret.flags.ak5e.automaton.personality, null, "nothing was rolled automatically");
    assert.equal(supporterUses.receipt(creator, "u6-roll").status, "awaitingRoll");
    assert.equal(supporterUses.receipt(creator, "u6-roll").formula, "1d6");
    await supporterUses.command(creator, "useRoll", { useId: "u6-roll" }, "u6-roll-click");
  } finally {
    globalThis.Roll = RealRoll;
  }
  assert.equal(turret.flags.ak5e.automaton.personality, "Analytic");
});

test("personality: below level 4 it warns and does not block", () => {
  const creator = artificer({ level: 3 });
  const turret = automaton(creator, { variant: "turret" });
  assert.deepEqual(warningIds(plan(creator, "basicPersonalityMatrix", { automatonUuid: turret.uuid, choice: 1 })), ["level"]);
});

/* ---------------------------------------------------------------- panel and API surface */

test("panel: lists the Automaton's upgrades with data-supporter-cmd buttons; non-Artificers get nothing", () => {
  const creator = artificer({ level: 17 });
  const turret = automaton(creator, { variant: "turret", upgrades: ["flamethrower"] });
  link(creator, [turret]);
  const html = Upgrades.artificerUpgradePanel(creator);
  assert.match(html, /data-supporter-cmd="artificerInstallUpgrade"/);
  assert.match(html, /Flamethrower/);
  assert.equal(Upgrades.artificerUpgradePanel(createTestActor({ name: "Plain", type: "character" })), "");
});

test("command: a command it does not own returns undefined", async () => {
  assert.equal(await Upgrades.artificerUpgradeCommand(artificer(), "not-an-artificer-control"), undefined);
});

test("api: the frozen surface exposes the cap helpers and the install call", () => {
  assert.ok(Object.isFrozen(Upgrades.artificerUpgradeApi));
  assert.equal(Upgrades.artificerUpgradeApi.upgradeCapFor(artificer({ level: 17 })), 3);
  assert.equal(typeof Upgrades.artificerUpgradeApi.install, "function");
});
