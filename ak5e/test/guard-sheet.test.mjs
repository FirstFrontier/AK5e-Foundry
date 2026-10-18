import test from "node:test";
import assert from "node:assert/strict";
import { guardFixture, world } from "./guard-fixture.mjs";
import { registerGuardFeatureHooks } from "../scripts/guard-features.mjs";
import { registerArtsbladeHooks } from "../scripts/artsblade-features.mjs";
import { registerBrawlerHooks } from "../scripts/brawler-features.mjs";
import { registerCenturionHooks } from "../scripts/centurion-features.mjs";
import { guardUses } from "../scripts/guard-uses.mjs";
import { getPool } from "../scripts/resource-pools.mjs";
import { executeGuardDialog, confirmGuardSetup, openGuardControls, selectedTargets } from "../scripts/guard-sheet.mjs";

/* The Guard sheet's confirm step (WORKFLOW.md §3.2 rule 4): every command shows cost, targets and notes with an explicit
 * Cancel before guardUses.command is called; Cancel or closing writes nothing. DialogV2 is mocked; guardUses is real. */

function setup() {
  const documents = world();
  registerGuardFeatureHooks();
  registerArtsbladeHooks();
  registerBrawlerHooks();
  registerCenturionHooks();
  return documents;
}

const token = (name, uuid) => ({ name, actor: { uuid } });
const target = (...tokens) => { for (const entry of tokens) game.user.targets.add(entry); };

/** Mock DialogV2.wait: `responder(config, index)` answers each dialog; every config is recorded. */
function dialogs(responder) {
  const seen = [];
  foundry.applications = { api: { DialogV2: { wait: async config => { seen.push(config); return responder(config, seen.length - 1, seen); } } } };
  return seen;
}
/** Like Foundry V13's DialogV2._onSubmit: `(await button.callback?.(...)) ?? button.action`, so a null callback resolves to the action id. */
const press = async (config, action, fields = {}) => {
  const buttonConfig = config.buttons.find(entry => entry.action === action);
  assert.ok(buttonConfig, `dialog "${config.window?.title}" offers a ${action} button`);
  return (await buttonConfig.callback?.({}, { form: { elements: fields } }, {})) ?? buttonConfig.action;
};
const cancelAll = () => dialogs(() => null);
const confirmWith = (fields = {}) => dialogs(config => press(config, "confirm", fields));

/** Spy on guardUses.command. `stub` replaces the real engine (for commands whose plans another unit owns). */
function spyCommand(stub) {
  const real = guardUses.command, calls = [];
  guardUses.command = async (...args) => { calls.push(args); return stub ? stub(...args) : real(...args); };
  return { calls, restore: () => { guardUses.command = real; } };
}
const aggression = actor => getPool(actor, "aggression").value;

const ARTSBLADE_COMMANDS = ["bladeArt", "castSpellswordArt", "cutThroughChaos", "augmentedAssault", "ultimateBladeArt"];
const BRAWLER_COMMANDS = ["bodyCheck", "crossCounter", "feint", "followUp", "footwork", "guardUp", "slipOff", "tagIn", "chokehold", "cqc", "disarm", "humanShield", "menace", "skullshaker", "weighIn", "mountainbreaker"];
const CENTURION_COMMANDS = ["cycloneStrike", "brutalExecution", "ferociousFling", "guillotine", "shredder", "stormOfBlood"];
const CORE_COMMANDS = ["forestall", "smite", "strikeTrue", "unrelenting", "pursuitUnrelenting", "unrelentingAggression"];

test("B-129: Cancel or closing any core, Artsblade, Brawler or Centurion command writes nothing and never reaches the engine", async () => {
  const cases = [["artsblade", ARTSBLADE_COMMANDS], ["brawler", BRAWLER_COMMANDS], ["centurion", CENTURION_COMMANDS], [null, CORE_COMMANDS]];
  for (const [branch, commands] of cases) {
    for (const command of commands) for (const answer of ["close", "cancel"]) {
      setup();
      const actor = guardFixture({ level: 17, branch, aggression: 4, unrelenting: 2 });
      target(token("Orc", "Actor.orc"));
      const seen = dialogs(config => answer === "cancel" ? press(config, "cancel") : null);
      const spy = spyCommand();
      try {
        const result = await executeGuardDialog(actor, command);
        assert.equal(result, null, `${command} (${answer}) returns null`);
        assert.equal(spy.calls.length, 0, `${command} (${answer}) never calls guardUses.command`);
        assert.equal(actor.writes.length, 0, `${command} (${answer}) never updates the Actor`);
        assert.equal(game.messages.length, 0, `${command} (${answer}) posts no card`);
        assert.equal(seen.length, 1, `${command} opens exactly one dialog`);
        assert.ok(seen[0].buttons.some(entry => entry.action === "cancel"), `${command} has an explicit Cancel`);
      } finally { spy.restore(); }
    }
  }
});

test("B-129: the confirm dialog shows title, cost, resources, selected targets and notes", async () => {
  setup();
  const actor = guardFixture({ level: 5, branch: "centurion", aggression: 3 });
  target(token("Orc Warchief", "Actor.orc"), token("Goblin <b>Scout</b>", "Actor.gob"));
  const seen = cancelAll();
  await executeGuardDialog(actor, "smite");
  const { content, window: win } = seen[0];
  assert.equal(win.title, "Press the Attack: Smite");
  assert.match(content, /Press the Attack: Smite/);
  assert.match(content, /1-3 Aggression/);
  assert.match(content, /Aggression: 3 \/ 4 now/);
  assert.match(content, /Orc Warchief/);
  assert.match(content, /Goblin &lt;b&gt;Scout&lt;\/b&gt;/, "token names are escaped");
  assert.match(content, /Cancel changes nothing/);
  assert.match(content, /never rolled for you/);
});

test("B-129: every command, including the no-input default path, confirms before the engine runs; Confirm supplies the contract fields", async () => {
  setup();
  const actor = guardFixture({ level: 5, branch: "brawler", aggression: 4 });
  target(token("Orc", "Actor.orc"));
  const spy = spyCommand();
  dialogs(config => { assert.equal(spy.calls.length, 0, "the engine is not called while the dialog is open"); return press(config, "confirm"); });
  try {
    await executeGuardDialog(actor, "bodyCheck", "Body Check (1 Agg)");
    assert.equal(spy.calls.length, 1);
    const [calledActor, name, data, id] = spy.calls[0];
    assert.equal(calledActor, actor);
    assert.equal(name, "bodyCheck");
    assert.equal(data.confirmed, true);
    assert.deepEqual(data.targets, [{ uuid: "Actor.orc", name: "Orc" }]);
    assert.equal(typeof id, "string");
    assert.equal(aggression(actor), 3, "Body Check spent 1 Aggression");
    assert.equal(game.messages.length, 1, "a use card is posted");
  } finally { spy.restore(); }
});

test("B-129: a Press the Attack amount is part of the confirm dialog; Use anyway keeps one operation ID and clamps Aggression at 0", async () => {
  setup();
  const actor = guardFixture({ level: 5, branch: "centurion", aggression: 1 });
  const spy = spyCommand();
  const seen = dialogs(config => config.buttons.some(entry => entry.action === "anyway")
    ? press(config, "anyway") : press(config, "confirm", { amount: { value: "3" } }));
  try {
    await executeGuardDialog(actor, "smite");
    assert.equal(seen.length, 2, "confirm dialog, then the shortfall warning");
    assert.match(seen[1].content, /3 Aggression needed and 1 remain/);
    assert.equal(spy.calls.length, 2, "first attempt throws the warning, the retry carries the override");
    assert.equal(spy.calls[0][3], spy.calls[1][3], "same operation ID across the retry");
    assert.equal(spy.calls[0][2].amount, 3);
    assert.equal(spy.calls[1][2].overrides?.length, 1);
    assert.equal(aggression(actor), 0, "overspent Aggression clamps at 0");
  } finally { spy.restore(); }
});

test("B-130: cancelling Augmented Assault at 13th level spends nothing; an unchecked Unleash box is false, not a cancel", async () => {
  setup();
  const actor = guardFixture({ level: 13, branch: "artsblade", aggression: 4 });
  const spy = spyCommand();
  try {
    cancelAll();
    assert.equal(await executeGuardDialog(actor, "augmentedAssault"), null);
    assert.equal(spy.calls.length, 0);
    assert.equal(aggression(actor), 4);
    assert.equal(actor.writes.length, 0);

    const seen = confirmWith({ unleash: { checked: false } });
    await executeGuardDialog(actor, "augmentedAssault");
    assert.match(seen[0].content, /name="unleash"/);
    assert.equal(spy.calls.length, 1);
    assert.equal(spy.calls[0][2].unleash, false);
    assert.equal(aggression(actor), 2);

    confirmWith({ unleash: { checked: true } });
    await executeGuardDialog(actor, "augmentedAssault");
    assert.equal(spy.calls[1][2].unleash, true);
  } finally { spy.restore(); }
});

test("B-130: below 13th level there is no Unleash checkbox, yet the use is still confirmed", async () => {
  setup();
  const actor = guardFixture({ level: 5, branch: "artsblade", aggression: 4 });
  const seen = cancelAll();
  await executeGuardDialog(actor, "augmentedAssault");
  assert.doesNotMatch(seen[0].content, /name="unleash"/);
  assert.match(seen[0].content, /both must be Blade Art/);
  assert.equal(actor.writes.length, 0);
});

test("B-131: the setup button previews the changes, passes the preview's contextKey on accept, and Cancel changes nothing", async () => {
  setup();
  const actor = guardFixture({ level: 3, branch: null, enabled: false });
  const seen = cancelAll();
  assert.equal(await confirmGuardSetup(actor), null);
  assert.equal(actor.writes.length, 0);
  assert.equal(actor.created.length, 0);
  assert.match(seen[0].content, /Will add \(\d+\)/);
  assert.match(seen[0].content, /1st Level: Press the Attack/);
  assert.match(seen[0].content, /3rd Level: Unrelenting/);
  assert.doesNotMatch(seen[0].content, /4th Level: Ability Score Improvement/, "only features up to the current level");
  assert.ok(seen[0].buttons.some(entry => entry.action === "cancel"));

  // Pressing Cancel resolves to the action id "cancel" (truthy), which must not count as accepting.
  dialogs(config => press(config, "cancel"));
  assert.equal(await confirmGuardSetup(actor), null);
  assert.equal(actor.writes.length, 0);
  assert.equal(actor.created.length, 0);

  dialogs(config => press(config, "grant"));
  const result = await confirmGuardSetup(actor);
  assert.ok(result.created.includes("1st Level: Press the Attack"));
  assert.equal(actor.flags.ak5e.guard.enabled, true);
  const names = Array.from(actor.items.values()).map(item => item.name);
  assert.ok(names.includes("3rd Level: Unrelenting"));

  // Running it again keeps what exists.
  const before = actor.created.length;
  const again = dialogs(config => press(config, "grant"));
  const second = await confirmGuardSetup(actor);
  assert.deepEqual(second.created, []);
  assert.equal(actor.created.length, before, "idempotent: nothing is created twice");
  assert.match(again[0].content, /Will add \(0\)/);
});

test("B-131: a character that changes between the preview and Grant is refused without partial writes", async () => {
  setup();
  const actor = guardFixture({ level: 3, branch: null, enabled: false });
  dialogs(config => {
    actor.items.set("late", { id: "late", type: "feat", name: "1st Level: Press the Attack", flags: {}, getFlag() { return undefined; } });
    return press(config, "grant");
  });
  await assert.rejects(confirmGuardSetup(actor), /changed since the preview/);
  assert.equal(actor.created.length, 0);
  assert.equal(actor.writes.length, 0);
});

test("B-136: Blade Art sends the selected Arts Pool in the shared artPool field (and the legacy pool field)", async () => {
  setup();
  const actor = guardFixture({ level: 5, branch: "artsblade" });
  const spy = spyCommand();
  const seen = confirmWith({ artPool: { value: "frost" } });
  try {
    const result = await executeGuardDialog(actor, "bladeArt");
    assert.match(seen[0].content, /Frost \(cold\)/);
    assert.match(seen[0].content, /2d6 additional Arts Damage/, "level-5 scaling is shown");
    assert.equal(spy.calls[0][2].artPool, "frost");
    assert.equal(spy.calls[0][2].pool, "frost");
    assert.equal(result.damageType, "cold", "the current plan resolves the chosen pool");
    assert.equal(game.messages[0].content.includes("Frost"), true);
  } finally { spy.restore(); }
});

test("B-138: Spellsword casting shows the maximum Art level read-only and sends it as level", async () => {
  for (const [level, max] of [[1, 1], [5, 2], [9, 3], [13, 4], [17, 5]]) {
    setup();
    const actor = guardFixture({ level, branch: "artsblade" });
    const spy = spyCommand();
    const seen = confirmWith({ artName: { value: "Ice Knife" }, level: { value: "1" } });
    try {
      await executeGuardDialog(actor, "castSpellswordArt");
      assert.doesNotMatch(seen[0].content, /<select name="level"/, "no lower-level choices");
      assert.match(seen[0].content, new RegExp(`Casting level: ${max}`));
      assert.match(seen[0].content, /must cast it at the maximum level/);
      const data = spy.calls[0][2];
      assert.equal(data.artName, "Ice Knife");
      assert.equal(data.level, max, "a tampered level field is ignored");
      assert.equal(data.castingLevel, max);
      assert.equal(guardUses.receipt(actor, spy.calls[0][3]).result.castingLevel, max);
    } finally { spy.restore(); }
  }
});

test("B-146: Brutal Execution lists the selected targets, sends data.targets, and only warns when none are selected", async () => {
  setup();
  const actor = guardFixture({ level: 5, branch: "centurion", aggression: 4 });
  const stub = () => ({ ok: true });
  const spy = spyCommand(stub);
  try {
    target(token("Bandit", "Actor.bandit"), token("Thug", "Actor.thug"));
    let seen = confirmWith();
    await executeGuardDialog(actor, "brutalExecution", "Brutal Execution (2 Aggression)");
    assert.match(seen[0].content, /Bandit/);
    assert.match(seen[0].content, /Thug/);
    assert.deepEqual(spy.calls[0][2].targets, [{ uuid: "Actor.bandit", name: "Bandit" }, { uuid: "Actor.thug", name: "Thug" }]);
    assert.equal(spy.calls[0][2].confirmed, true);

    game.user.targets.clear();
    seen = confirmWith();
    await executeGuardDialog(actor, "brutalExecution", "Brutal Execution (2 Aggression)");
    assert.match(seen[0].content, /none selected/, "warns");
    assert.equal(spy.calls.length, 2, "but does not block");
    assert.deepEqual(spy.calls[1][2].targets, []);
  } finally { spy.restore(); }
});

test("B-146: Ferocious Fling, Guillotine, Shredder, Storm of Blood and Cyclone Strike send targets; Fling keeps targetUuid/targetConMod", async () => {
  setup();
  const actor = guardFixture({ level: 17, branch: "centurion" });
  target(token("Cultist", "Actor.cultist"));
  const spy = spyCommand(() => ({}));
  try {
    confirmWith({ conMod: { value: "3" }, brutalExecution: { checked: true }, eliteOrLeader: { checked: true }, frightened: { checked: true } });
    for (const command of ["ferociousFling", "guillotine", "shredder", "stormOfBlood", "cycloneStrike"]) await executeGuardDialog(actor, command);
    const byName = Object.fromEntries(spy.calls.map(call => [call[1], call[2]]));
    for (const command of ["ferociousFling", "guillotine", "shredder", "stormOfBlood", "cycloneStrike"])
      assert.deepEqual(byName[command].targets, [{ uuid: "Actor.cultist", name: "Cultist" }], command);
    assert.equal(byName.ferociousFling.targetUuid, "Actor.cultist");
    assert.equal(byName.ferociousFling.targetConMod, 3);
    assert.equal(byName.ferociousFling.brutalExecution, true);
    assert.equal(byName.guillotine.eliteOrLeader, true);
    assert.equal(byName.shredder.targetFrightened, true);
  } finally { spy.restore(); }
});

test("selectedTargets reads token.actor.uuid and token.name and skips tokens without an Actor", () => {
  setup();
  target(token("A", "Actor.a"), { name: "No actor" });
  assert.deepEqual(selectedTargets(), [{ uuid: "Actor.a", name: "A" }]);
});

test("B-149: Cut Through Chaos describes the melee-roll comparison, not advantage or disadvantage", async () => {
  setup();
  const actor = guardFixture({ level: 13, branch: "artsblade" });
  const seen = confirmWith({ mode: { value: "savingThrow" } });
  const spy = spyCommand(() => ({}));
  try {
    await executeGuardDialog(actor, "cutThroughChaos");
    const { content } = seen[0];
    assert.match(content, /Melee Attack as a Reaction; if the result of your Attack Roll is greater than the Spell Attack Roll, that Spell Attack misses you/);
    assert.match(content, /greater than the DC of that Saving Throw, you are considered to have succeeded/);
    assert.match(content, /without expending a Spellsword Point/);
    assert.match(content, /Clear Path \(13th Level\): you take no Damage if you succeed on the Saving Throw, and only half Damage if you fail/);
    assert.doesNotMatch(content, /advantage|disadvantage/i);
    assert.equal(spy.calls[0][2].mode, "savingThrow");
    const low = guardFixture({ level: 5, branch: "artsblade" });
    cancelAll();
    const lowSeen = dialogs(() => null);
    await executeGuardDialog(low, "cutThroughChaos");
    assert.doesNotMatch(lowSeen[0].content, /Clear Path/, "Clear Path is a 13th-level benefit");
  } finally { spy.restore(); }
});

test("B-149: Chokehold offers Strength or Dexterity Score (never Constitution) and shows the scores", async () => {
  setup();
  const actor = guardFixture({ level: 10, branch: "brawler", aggression: 4 });
  const spy = spyCommand(() => ({}));
  try {
    const seen = confirmWith({ ability: { value: "dex" } });
    await executeGuardDialog(actor, "chokehold");
    const { content } = seen[0];
    assert.match(content, /Strength Score \(18\)/);
    assert.match(content, /Dexterity Score \(14\)/);
    assert.match(content, /no more than one Size Category larger than you/);
    assert.doesNotMatch(content, /Constitution|value="con"/);
    assert.equal(spy.calls[0][2].ability, "dex");
    confirmWith({ ability: { value: "con" } });
    await executeGuardDialog(actor, "chokehold");
    assert.equal(spy.calls[1][2].ability, "str", "an unsupported value never reaches the plan");
  } finally { spy.restore(); }
});

test("B-149: Mountainbreaker offers the ten-attack cumulative -2 chain or the fivefold hit with push and Prone", async () => {
  setup();
  const actor = guardFixture({ level: 17, branch: "brawler" });
  const spy = spyCommand(() => ({}));
  try {
    const seen = confirmWith({ mode: { value: "knockout" } });
    await executeGuardDialog(actor, "mountainbreaker");
    const { content } = seen[0];
    assert.match(content, /until you miss or have made 10 Attacks/);
    assert.match(content, /cumulative -2 to hit/);
    assert.match(content, /multiplied by five/);
    assert.match(content, /knocked 20 feet directly away from you and fall Prone/);
    assert.match(content, /complete a Long Rest/);
    assert.doesNotMatch(content, /4 Unarmed|Flurry of Blows|Stun/i);
    assert.equal(spy.calls[0][2].mode, "knockout");
    confirmWith({});
    await executeGuardDialog(actor, "mountainbreaker");
    assert.equal(spy.calls[1][2].mode, "flurry");
  } finally { spy.restore(); }
});

test("Pursuit Unrelenting asks Action or Bonus Action; Unrelenting Aggression sends a typed damage formula only when given", async () => {
  setup();
  const actor = guardFixture({ level: 18, branch: null, unrelenting: 2, aggression: 4 });
  const spy = spyCommand(() => ({}));
  try {
    confirmWith({ actionType: { value: "bonus" } });
    await executeGuardDialog(actor, "pursuitUnrelenting");
    assert.equal(spy.calls[0][2].actionType, "bonus");

    confirmWith({ formula: { value: " 2d6 " } });
    await executeGuardDialog(actor, "unrelentingAggression");
    assert.equal(spy.calls[1][2].formula, "2d6");

    confirmWith({ formula: { value: "" } });
    await executeGuardDialog(actor, "unrelentingAggression");
    assert.equal("formula" in spy.calls[2][2], false, "a blank formula is not invented");
  } finally { spy.restore(); }
});

test("Feint and Tag In send the sole selected token as targetUuid / allyUuid", async () => {
  setup();
  const actor = guardFixture({ level: 5, branch: "brawler", aggression: 4 });
  const spy = spyCommand(() => ({}));
  try {
    target(token("Rival", "Actor.rival"));
    confirmWith();
    await executeGuardDialog(actor, "feint", "Feint (1 Agg, Bonus Action)");
    await executeGuardDialog(actor, "tagIn", "Tag In (2 Agg)");
    assert.equal(spy.calls[0][2].targetUuid, "Actor.rival");
    assert.equal(spy.calls[1][2].allyUuid, "Actor.rival");
    target(token("Second", "Actor.second"));
    await executeGuardDialog(actor, "feint", "Feint (1 Agg, Bonus Action)");
    assert.equal("targetUuid" in spy.calls[2][2], false, "two targets are ambiguous for a single-target field");
  } finally { spy.restore(); }
});

test("other subclasses use the same confirm step with the cost from their button label", async () => {
  setup();
  const actor = guardFixture({ level: 5, branch: null });
  const spy = spyCommand();
  try {
    const seen = cancelAll();
    await executeGuardDialog(actor, "reaperGainRuin", "Gain Ruin (+1)");
    await executeGuardDialog(actor, "riposte", "Riposte (1 Agg, Reaction)");
    assert.equal(seen.length, 2);
    assert.match(seen[0].content, /\+1 \(as shown on the button/);
    assert.match(seen[1].content, /1 Agg, Reaction/);
    assert.equal(spy.calls.length, 0);
    assert.equal(actor.writes.length, 0);
  } finally { spy.restore(); }
});

test("Guard Controls: Unrelenting appears from 3rd level; unconfigured characters are offered setup; summary text is escaped", async () => {
  const html = async (actor) => {
    const seen = dialogs(() => null);
    await openGuardControls(actor);
    return seen[0].content;
  };
  setup();
  // Level prerequisites warn (the plan's levelWarning) rather than hide the button: WORKFLOW section 3.2 rule 3.
  assert.doesNotMatch(await html(guardFixture({ level: 2 })), /data-guard-cmd="unrelenting"/);
  assert.match(await html(guardFixture({ level: 5 })), /data-guard-cmd="pursuitUnrelenting"/);
  assert.match(await html(guardFixture({ level: 15 })), /Unrelenting Aggression \(2 Aggression, Reaction\)/);

  const unconfigured = await html(guardFixture({ level: 3, enabled: false }));
  assert.match(unconfigured, /data-guard-act="__setup"/);
  assert.doesNotMatch(unconfigured, /data-guard-cmd=/);

  const master = guardFixture({ level: 10, branch: "weaponmaster" });
  master.flags.ak5e.weaponmaster = { signatureWeaponName: '<img src=x onerror="alert(1)">' };
  const content = await html(master);
  assert.doesNotMatch(content, /<img src=x/);
  assert.match(content, /&lt;img src=x/);
});

test("Guard Controls list the Artsblade, Brawler and Centurion commands with source-accurate costs", async () => {
  setup();
  const seenFor = async actor => { const seen = dialogs(() => null); await openGuardControls(actor); return seen[0].content; };
  const brawler = await seenFor(guardFixture({ level: 17, branch: "brawler" }));
  for (const command of BRAWLER_COMMANDS) assert.match(brawler, new RegExp(`data-guard-cmd="${command}"`));
  assert.match(brawler, /Disarm \(3 Agg\)/);
  const centurion = await seenFor(guardFixture({ level: 17, branch: "centurion" }));
  for (const command of CENTURION_COMMANDS) assert.match(centurion, new RegExp(`data-guard-cmd="${command}"`));
  const artsblade = await seenFor(guardFixture({ level: 17, branch: "artsblade" }));
  for (const command of ARTSBLADE_COMMANDS) assert.match(artsblade, new RegExp(`data-guard-cmd="${command}"`));
});

test("a Press the Attack amount outside 1-3 is refused with a warning and nothing is used", async () => {
  setup();
  const actor = guardFixture({ level: 5, branch: "centurion", aggression: 4 });
  const warnings = [];
  ui.notifications.warn = message => warnings.push(message);
  const spy = spyCommand();
  try {
    for (const bad of ["", "0", "4", "1.5", "abc"]) {
      confirmWith({ amount: { value: bad } });
      assert.equal(await executeGuardDialog(actor, "smite"), null, `amount "${bad}"`);
    }
    assert.equal(spy.calls.length, 0);
    assert.equal(actor.writes.length, 0);
    assert.equal(warnings.length, 5);
  } finally { spy.restore(); }
});

test("Blade Art sends targetUuid only when exactly one token is selected", async () => {
  setup();
  const actor = guardFixture({ level: 5, branch: "artsblade" });
  const spy = spyCommand(() => ({}));
  try {
    confirmWith({ artPool: { value: "flame" } });
    await executeGuardDialog(actor, "bladeArt");
    assert.equal("targetUuid" in spy.calls[0][2], false, "no selected token, no targetUuid");
    target(token("Orc", "Actor.orc"));
    await executeGuardDialog(actor, "bladeArt");
    assert.equal(spy.calls[1][2].targetUuid, "Actor.orc");
    assert.deepEqual(spy.calls[1][2].targets, [{ uuid: "Actor.orc", name: "Orc" }]);
    target(token("Second", "Actor.second"));
    await executeGuardDialog(actor, "bladeArt");
    assert.equal("targetUuid" in spy.calls[2][2], false, "two tokens are ambiguous");
  } finally { spy.restore(); }
});
