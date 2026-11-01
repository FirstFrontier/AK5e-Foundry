import test from "node:test";
import assert from "node:assert/strict";
import { vanguardUses, recordVanguardRuling } from "../scripts/vanguard-uses.mjs";
import { VANGUARD_CLASS_ID } from "../scripts/vanguard-rules.mjs";
import { vanguardBenefitsEngine, vanguardBenefitPreRoll, vanguardBenefitPostMessage } from "../scripts/vanguard-benefits.mjs";
import { tipCritThreshold } from "../scripts/tip-of-the-spear.mjs";
import { expireFeatureTags, tagHasExpired } from "../scripts/feature-tags.mjs";
import { getReactions } from "../scripts/trigger-events.mjs";
import { confirmPlayUse } from "../scripts/play-uses-sheet.mjs";
import { registerVanguardSheetHooks, vanguardSheetApi } from "../scripts/vanguard-sheet.mjs";
import {
  setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem, createTestCombat
} from "./base-classes-fixture.mjs";

const TARGET_WARNINGS = ["range", "range-unverified", "visibility-unverified", "alliance-unverified"];

test.beforeEach(() => {
  setupFoundryGlobals();
  registerVanguardSheetHooks();
  foundry.applications ??= {};
  foundry.applications.api ??= {};
  foundry.applications.api.DialogV2 = {
    async wait() { throw new Error("Unexpected DialogV2 call outside an explicit Tip reading test"); }
  };
});
test.afterEach(() => teardownFoundryGlobals());

function vanguard(level = 15) {
  const cls = createTestItem({
    name: "Vanguard", type: "class", system: { levels: level },
    flags: { ak5e: { chapterThreeId: VANGUARD_CLASS_ID } }
  });
  const tipFeature = createTestItem({
    name: "1st Level: Tip of the Spear", type: "feat",
    flags: { ak5e: { chapterThreeId: "class-feature-vanguard-1st-level-tip-of-the-spear-3092" } }
  });
  return createTestActor({
    name: "Vanguard player",
    items: [cls, tipFeature],
    system: {
      attributes: { prof: Math.floor((level - 1) / 4) + 2, hp: { value: 20, max: 20, temp: 0 } },
      abilities: { dex: { mod: 3 }, str: { mod: 1 }, con: { mod: 2 } }
    },
    flags: { ak5e: { vanguard: { enabled: true } } }
  });
}

function ally(name = "Ally", temp = 0) {
  return createTestActor({
    name,
    system: { attributes: { hp: { value: 20, max: 20, temp }, movement: { walk: 30, fly: 0 } } }
  });
}

function tipWarnings(source, target) {
  try {
    return vanguardUses.plan(source, "tipOfTheSpear", { targetUuid: target.uuid }).warnings ?? [];
  } catch (error) {
    assert.equal(error.name, "AK5eWarnings", "the plan reports target warnings through the public warning result");
    return error.warnings ?? [];
  }
}

function exposesSelectableZeroToFourRange(value) {
  if (Array.isArray(value)) {
    const choices = value.map(entry => typeof entry === "object" && entry !== null ? Number(entry.value) : Number(entry));
    if (choices.length === 5 && choices.every((choice, index) => choice === index)) return true;
    return value.some(exposesSelectableZeroToFourRange);
  }
  if (value && typeof value === "object") {
    const pairs = [
      [value.min, value.max], [value.minimum, value.maximum], [value.minValue, value.maxValue],
      [value.lowerBound, value.upperBound]
    ];
    if (pairs.some(([minimum, maximum]) => Number(minimum) === 0 && Number(maximum) === 4)) return true;
    return Object.values(value).some(exposesSelectableZeroToFourRange);
  }
  return false;
}

function publicTempHpSnapshot(value) {
  const seen = new WeakSet();
  const find = current => {
    if (!current || typeof current !== "object" || seen.has(current)) return null;
    seen.add(current);
    if (Object.hasOwn(current, "expectedTemp") && Object.hasOwn(current, "expectedRevision")) {
      return { expectedTemp: current.expectedTemp, expectedRevision: current.expectedRevision };
    }
    for (const nested of Array.isArray(current) ? current : Object.values(current)) {
      const result = find(nested);
      if (result) return result;
    }
    return null;
  };
  return find(value);
}

function settlementData(use, snapshot, options = {}) {
  return {
    useId: use.useId,
    remaining: options.remaining ?? 2,
    expectedTemp: snapshot.expectedTemp,
    expectedRevision: snapshot.expectedRevision,
    manualBoundary: options.manualBoundary ?? false,
    reason: options.reason ?? "Owner confirms Tip temporary HP expiry",
    confirmed: options.confirmed ?? true
  };
}

function isPublicTipReconciliation(message, useId) {
  const evidence = `${message?.content ?? ""} ${JSON.stringify(message?.flags ?? {})}`;
  return evidence.includes(useId) && /reconcil|remaining Tip|Temporary HP/i.test(evidence);
}

function removeTargetAttributionForUse(target, useId) {
  const seen = new WeakSet();
  let removed = 0;
  const referencesUse = value => value && typeof value === "object" &&
    Object.entries(value).some(([key, child]) => /(?:use|grant|source|operation).*id|^id$/i.test(key) && child === useId);
  const visit = value => {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (let index = value.length - 1; index >= 0; index--) {
        if (referencesUse(value[index])) { value.splice(index, 1); removed++; }
        else visit(value[index]);
      }
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (referencesUse(child)) { delete value[key]; removed++; }
      else visit(child);
    }
  };
  visit(target.flags);
  return removed;
}

function emitActorUpdateHooksForTempHp(actor) {
  const update = actor.update.bind(actor);
  actor.update = async (changes, options = {}) => {
    const writesTempHp = Object.hasOwn(changes ?? {}, "system.attributes.hp.temp") ||
      Object.hasOwn(changes?.system?.attributes?.hp ?? {}, "temp");
    if (writesTempHp) await Hooks.callAll("preUpdateActor", actor, changes, options, game.user.id);
    const result = await update(changes, options);
    if (writesTempHp) await Hooks.callAll("updateActor", actor, changes, options, game.user.id);
    return result;
  };
  return actor;
}

async function startTipTwo({ temp = 3, useId = "tip-thp-duration", outOfCombat = false } = {}) {
  const bearer = vanguard(5);
  const recipient = ally("Temporary HP recipient", temp);
  const combat = createTestCombat([bearer, recipient], { started: true, round: 1, turn: 0 });
  game.combat = outOfCombat ? null : combat;
  game.user = { id: "player", isGM: false, targets: new Set() };
  globalThis.fromUuidSync = uuid => uuid === recipient.uuid ? recipient : null;
  const formulas = [], rollOwners = [], forced = [2, 4];
  const OriginalRoll = globalThis.Roll;
  globalThis.Roll = class extends OriginalRoll {
    constructor(formula, ...args) { formulas.push(formula); super(formula, ...args); }
    async evaluate() { rollOwners.push(game.user.id); this.total = forced.shift(); return this; }
  };
  await vanguardUses.command(bearer, "tipOfTheSpear", {
    targetUuid: recipient.uuid, targetName: recipient.name, overrides: TARGET_WARNINGS, confirmed: true
  }, useId);
  assert.equal(formulas.length, 0, "the Feature starts no dice before an owner click");
  await vanguardUses.command(bearer, "useRoll", { useId });
  const receipt = vanguardUses.receipt(bearer, useId);
  assert.equal(receipt.outcome, 2);
  assert.equal(receipt.status, "awaitingRoll", "the Temporary HP roll remains owner-clicked");
  assert.equal(recipient.system.attributes.hp.temp, temp, "outcome selection alone does not grant Temporary HP");
  assert.deepEqual(formulas, ["1d6"], "only the owner-clicked Tip outcome die has been rolled");
  return { bearer, recipient, combat, formulas, rollOwners, forced, useId };
}

async function runTipReading(use, answer, extraPayload = {}) {
  const previous = foundry.applications.api.DialogV2;
  const dialogs = [];
  foundry.applications.api.DialogV2 = {
    ...previous,
    wait: async options => {
      dialogs.push(options);
      if (answer === null) return null;
      const button = (options.buttons ?? []).find(candidate => candidate.action === "read");
      assert.ok(button, "the no-ruling flow offers a public per-use reading action");
      return (await button.callback?.(null, { form: { elements: { reading: { value: answer } } } })) ?? button.action;
    }
  };
  try {
    const result = await confirmPlayUse("Tip of the Spear", extra =>
      vanguardUses.command(use.bearer, "useRoll", { useId: use.useId, ...extra, ...extraPayload }), { confirmed: true });
    return { result, dialogs };
  } finally {
    foundry.applications.api.DialogV2 = previous;
  }
}

test("six Tip results preserve their source effect, stack independently, and name the source turn expiry", async () => {
  const bearer = vanguard(5);
  const recipient = ally("Cumulative ally", 3);
  const combat = createTestCombat([bearer, recipient], { started: true, round: 1, turn: 0 });
  game.combat = combat;
  globalThis.fromUuidSync = uuid => uuid === recipient.uuid ? recipient : null;
  game.user = { id: "player", isGM: false, targets: new Set() };
  const rolledFormulas = [];
  const rollOwners = [];
  const forcedResults = [1, 2, 4, 3, 4, 5, 6];
  const OriginalRoll = globalThis.Roll;
  globalThis.Roll = class extends OriginalRoll {
    constructor(formula, ...args) { rolledFormulas.push(formula); super(formula, ...args); }
    async evaluate() { rollOwners.push(game.user.id); this.total = forcedResults.shift(); return this; }
  };

  for (const outcome of [1, 2, 3, 4, 5, 6]) {
    const useId = `base-tip-${outcome}`;
    await vanguardUses.command(bearer, "tipOfTheSpear", {
      targetUuid: recipient.uuid, targetName: recipient.name, overrides: TARGET_WARNINGS, confirmed: true
    }, useId);
    assert.equal(rolledFormulas.length, outcome - 1 + (outcome > 2 ? 1 : 0),
      "no Tip outcome is rolled until its owner clicks the roll button");
    await vanguardUses.command(bearer, "useRoll", { useId });
    let receipt = vanguardUses.receipt(bearer, useId);
    assert.equal(receipt.outcome, outcome, `choice ${outcome} stays associated with its receipt`);
    if (outcome === 2) {
      assert.equal(receipt.status, "awaitingRoll", "the 1d6 THP remains a player-started roll");
      assert.equal(recipient.system.attributes.hp.temp, 3, "THP is unchanged before its roll button is clicked");
      assert.deepEqual(rolledFormulas, ["1d6", "1d6"], "the Feature does not roll THP with the outcome die");
      await vanguardUses.command(bearer, "useRoll", {
        useId, readings: { tipTemporaryHpExpiry: "retain" }
      });
      assert.equal(rolledFormulas[2], "1d6", "the clicked THP roll is the source 1d6");
      assert.ok(rollOwners.every(userId => userId === "player"), "the non-GM source owner starts each roll");
      assert.equal(recipient.system.attributes.hp.temp, 7, "the rolled THP adds to existing THP");
      assert.equal(vanguardUses.receipt(bearer, useId).readingValue, "retain",
        "the per-use Temporary HP duration is provided explicitly with the owner-clicked roll");
    } else {
      assert.equal(receipt.status, "complete");
    }
  }

  const effects = [...recipient.effects.values()];
  assert.equal(effects.length, 5, "each non-THP result has its own concurrent effect");
  const standardBenefit = effect => effect.flags?.ak5e?.vanguardUsesEffect?.standardBenefit;
  const tip1Effect = effects.find(effect => standardBenefit(effect)?.kind === "tip1");
  const tip6Effect = effects.find(effect => standardBenefit(effect)?.kind === "tip6");
  const tipMovementEffect = effects.find(effect => effect.changes.some(change =>
    change.key === "system.attributes.movement.walk" && change.value === "10"));
  const isTipAttackEffect = effect => [
    "system.bonuses.mwak.attack", "system.bonuses.rwak.attack",
    "system.bonuses.msak.attack", "system.bonuses.rsak.attack"
  ].every(key => effect.changes.some(change => change.key === key && change.value === "2"));
  const tipAttackEffect = effects.find(isTipAttackEffect);
  assert.ok(tip1Effect && tip6Effect && tipMovementEffect && tipAttackEffect,
    "damage, SP, walking-speed, and attack outcomes each have their observable recipient benefit");
  assert.equal(standardBenefit(tip1Effect).value, bearer.system.attributes.prof,
    "Tip 1 adds the source's PB to its chosen damage roll");
  assert.equal(tipMovementEffect.changes.some(change =>
    ["system.attributes.movement.fly", "system.attributes.movement.climb", "system.attributes.movement.swim", "system.attributes.movement.burrow"].includes(change.key)),
  false, "Tip 3 adds +10 to walking speed only and grants no other movement mode");
  assert.equal(tipAttackEffect.changes.filter(change => change.value === "2").length, 4,
    "Tip 4 adds +2 to every native attack roll mode");
  assert.equal(tipCritThreshold(recipient), 19, "recipient's next attack crits on a 19 or 20");
  assert.equal(standardBenefit(tip6Effect).value, 1, "Tip 6 adds one SP for each qualifying gain");

  const tipDamageEffect = tip1Effect;
  await vanguardBenefitsEngine.command(recipient, "armTipDamage", {
    effectId: tipDamageEffect.id, componentIndex: 1, confirmed: true
  }, "tip-one-damage-arm");
  const baseRoll = { parts: ["1d8"], options: {} };
  const unrelatedRoll = { parts: ["1d6"], options: {} };
  const damageConfig = { subject: { actor: recipient }, rolls: [unrelatedRoll, baseRoll] };
  const messageConfig = {};
  vanguardBenefitPreRoll(damageConfig, {}, messageConfig);
  vanguardBenefitPreRoll(damageConfig, {}, messageConfig);
  assert.deepEqual(unrelatedRoll.parts, ["1d6"], "Tip 1 changes only the chosen damage roll");
  assert.deepEqual(baseRoll.parts, ["1d8", String(bearer.system.attributes.prof)], "the chosen roll receives PB once");
  const damageMessage = {
    documentName: "ChatMessage", uuid: "ChatMessage.tip-one-damage", author: { id: game.user.id },
    speaker: { actor: recipient.id }, flags: { dnd5e: { roll: { type: "damage" } }, ak5e: messageConfig.data.flags.ak5e },
    rolls: [baseRoll]
  };
  globalThis.fromUuidSync = uuid => uuid === recipient.uuid ? recipient : uuid === damageMessage.uuid ? damageMessage : null;
  await vanguardBenefitPostMessage(damageMessage, game.user.id);
  assert.equal(vanguardBenefitsEngine.receipt(recipient, "tip-one-damage-arm").status, "complete",
    "the selected damage ChatMessage consumes the Tip 1 benefit");

  const operator = { enabled: true, points: 1, maximum: 20,
    receipts: [{ id: "qualifying-sp-gain", before: 0, after: 1, gained: 1 }], operatorEvents: [] };
  await recipient.update({ "flags.ak5e.operatorSkills": operator });
  await vanguardBenefitsEngine.command(recipient, "tipSkillPointBonus", {
    effectId: tip6Effect.id, eventId: "qualifying-sp-gain", confirmed: true, overrides: ["timing-unverified"]
  }, "tip-six-sp-gain");
  assert.equal(recipient.getFlag("ak5e", "operatorSkills").points, 2, "one qualifying SP gain receives one extra SP");
  await vanguardBenefitsEngine.command(recipient, "tipSkillPointBonus", {
    effectId: tip6Effect.id, eventId: "qualifying-sp-gain", confirmed: true, overrides: ["timing-unverified"]
  }, "tip-six-sp-retry").catch(() => {});
  assert.equal(recipient.getFlag("ak5e", "operatorSkills").points, 2,
    "a duplicate SP event cannot award a second bonus, whether rejected or ignored");
  const operatorAfterFirst = recipient.getFlag("ak5e", "operatorSkills");
  operatorAfterFirst.points = 5;
  operatorAfterFirst.receipts.push({ id: "qualifying-sp-gain-many", before: 2, after: 5, gained: 3 });
  await recipient.update({ "flags.ak5e.operatorSkills": operatorAfterFirst });
  await vanguardBenefitsEngine.command(recipient, "tipSkillPointBonus", {
    effectId: tip6Effect.id, eventId: "qualifying-sp-gain-many", confirmed: true, overrides: ["timing-unverified"]
  }, "tip-six-sp-gain-many");
  assert.equal(recipient.getFlag("ak5e", "operatorSkills").points, 8,
    "a three-point qualifying gain receives a matching three-point bonus");
  await vanguardBenefitsEngine.command(recipient, "undoUse", { useId: "tip-six-sp-gain" }, "tip-six-sp-undo");
  assert.equal(recipient.getFlag("ak5e", "operatorSkills").points, 7,
    "undo removes only its extra SP and preserves the later three-point grant and bonus");

  await vanguardUses.command(bearer, "tipOfTheSpear", {
    targetUuid: recipient.uuid, targetName: recipient.name, directed: true, choice: 4,
    overrides: [...TARGET_WARNINGS, "level"], confirmed: true
  }, "base-tip-4-stack");
  assert.equal([...recipient.effects.values()].filter(isTipAttackEffect).length, 2,
  "a second Tip 4 stacks with the first Tip 4");
  await vanguardUses.undo(bearer, "base-tip-4-stack");
  assert.equal([...recipient.effects.values()].filter(isTipAttackEffect).length, 1,
  "undo removes only the second cumulative benefit");

  const expiries = effects.map(effect => ({ effect, expiry: effect.flags?.ak5e?.temporaryTag?.expiry }));
  assert.ok(expiries.every(({ expiry }) => expiry?.trigger === "turnStart" && expiry?.actorUuid === bearer.uuid),
    "each non-THP outcome expires at the source Vanguard's next Turn start");
  combat.previous = { round: 1, turn: 0 };
  combat.round = 1;
  combat.turn = 1;
  assert.ok(expiries.every(({ expiry }) => !tagHasExpired({ expiry }, { kind: "combatTurn", combat })),
    "another Creature's Turn does not expire any of the source's benefits");
  combat.previous = { round: 1, turn: 1 };
  combat.round = 2;
  combat.turn = 0;
  assert.ok(expiries.every(({ expiry }) => tagHasExpired({ expiry }, { kind: "combatTurn", combat })),
    "all effects expire when the source Vanguard starts its next Turn");
  game.user = game.users.get("gm");
  await expireFeatureTags({ kind: "combatTurn", combat });
  assert.ok(expiries.every(({ effect }) => !recipient.effects.has(effect.id)),
    "the next-source-turn lifecycle removes every active non-THP effect");

  await vanguardUses.undo(bearer, "base-tip-2");
  assert.equal(recipient.system.attributes.hp.temp, 3, "undo reverses the additive THP grant on the target");
});

for (const [readingValue, expectedTemp, label] of [
  ["expire", 3, /expire|remove.*temporary hp/i],
  ["retain", 7, /retain|keep.*temporary hp/i]
]) {
  test(`Tip outcome 2 records the public per-use ${readingValue} duration choice and applies it at the source's next Turn`, async () => {
    const use = await startTipTwo({ useId: `tip-thp-${readingValue}` });
    const beforeRulings = structuredClone(use.bearer.getFlag("ak5e", "vanguard")?.rulings ?? {});
    assert.deepEqual(beforeRulings, {}, "the fixture has no recorded GM duration ruling");
    const { result, dialogs } = await runTipReading(use, readingValue);
    assert.ok(result, "the selected per-use duration proceeds");
    assert.equal(dialogs.length, 1, "an unresolved rule prompts once for this use");
    assert.match(dialogs[0].content, /expire/i, "the reading prompt offers the expire choice");
    assert.match(dialogs[0].content, /retain/i, "the reading prompt offers the retain choice");
    assert.equal(use.recipient.system.attributes.hp.temp, 7, "the owner-clicked 1d6 adds to existing Temporary HP");
    assert.deepEqual(use.formulas, ["1d6", "1d6"], "the THP die is rolled only after the player's click");
    assert.ok(use.rollOwners.every(ownerId => ownerId === "player"), "the non-GM source owner starts the outcome and THP rolls");

    const receipt = vanguardUses.receipt(use.bearer, use.useId);
    assert.equal(receipt.readingValue, readingValue, "the exact selected duration is recorded with this use");
    assert.match(receipt.reading, label, "the use evidence carries a readable duration label");
    assert.match(game.messages.at(-1).content, label, "the public card explains the chosen duration in readable terms");
    assert.match(game.messages.at(-1).content, /source.{0,30}turn|next.{0,30}turn/i,
      "the public evidence names the source Vanguard Turn deadline");
    assert.deepEqual(use.bearer.getFlag("ak5e", "vanguard")?.rulings ?? {}, beforeRulings,
      "a temporary choice never becomes a permanent GM ruling");

    use.combat.previous = { round: 1, turn: 1 };
    use.combat.round = 2;
    use.combat.turn = 0;
    game.user = game.users.activeGM;
    await expireFeatureTags({ kind: "combatTurn", combat: use.combat });
    assert.equal(use.recipient.system.attributes.hp.temp, expectedTemp,
      readingValue === "expire" ? "expiry removes the remaining Tip contribution" : "the retain choice preserves Temporary HP");
    game.user = { id: "player", isGM: false, targets: new Set() };
    await vanguardUses.command(use.bearer, "useRoll", { useId: use.useId }).catch(() => {});
    game.user = game.users.activeGM;
    await expireFeatureTags({ kind: "combatTurn", combat: use.combat });
    assert.equal(use.recipient.system.attributes.hp.temp, expectedTemp,
      "a duplicate boundary event or use retry cannot apply the duration result twice");
    assert.deepEqual(use.bearer.getFlag("ak5e", "vanguard")?.rulings ?? {}, beforeRulings,
      "the completed use still has not written a persistent ruling");
  });
}

test("cancelling Tip outcome 2's unresolved duration choice preserves Temporary HP and its use receipt", async () => {
  const use = await startTipTwo({ useId: "tip-thp-cancel" });
  assert.deepEqual(use.bearer.getFlag("ak5e", "vanguard")?.rulings ?? {}, {}, "the fixture has no recorded GM duration ruling");
  const beforeHP = use.recipient.system.attributes.hp.temp;
  const beforeReceipt = structuredClone(vanguardUses.receipt(use.bearer, use.useId));
  const { result, dialogs } = await runTipReading(use, null);
  assert.equal(result, null, "Cancel leaves the use waiting for a duration decision");
  assert.equal(dialogs.length, 1, "one public choice was offered");
  assert.equal(use.recipient.system.attributes.hp.temp, beforeHP, "Cancel grants no Temporary HP");
  assert.deepEqual(vanguardUses.receipt(use.bearer, use.useId), beforeReceipt,
    "Cancel does not consume the pending use receipt or record a choice");
  assert.deepEqual(use.formulas, ["1d6"], "Cancel starts no owner-clicked Temporary HP roll");
});

test("a recorded GM Tip Temporary HP duration ruling controls over a conflicting per-use choice", async () => {
  const use = await startTipTwo({ useId: "tip-thp-gm-ruling" });
  const player = game.user;
  game.user = game.users.activeGM;
  await recordVanguardRuling(use.bearer, "tipTemporaryHpExpiry", "expire", "Tip temporary HP expires at source turn start");
  const recordedRuling = structuredClone(use.bearer.getFlag("ak5e", "vanguard")?.rulings ?? {});
  game.user = player;

  const { result, dialogs } = await runTipReading(use, null, { reading: "retain" });
  assert.ok(result, "the applicable GM ruling resolves the duration without another choice");
  assert.equal(dialogs.length, 0, "a recorded ruling suppresses the per-use readings prompt");
  assert.equal(use.recipient.system.attributes.hp.temp, 7, "the player-clicked d6 still grants Temporary HP");
  assert.deepEqual(use.bearer.getFlag("ak5e", "vanguard")?.rulings ?? {}, recordedRuling,
    "the conflicting temporary choice does not change the recorded GM ruling");

  use.combat.previous = { round: 1, turn: 1 };
  use.combat.round = 2;
  use.combat.turn = 0;
  game.user = game.users.activeGM;
  await expireFeatureTags({ kind: "combatTurn", combat: use.combat });
  assert.equal(use.recipient.system.attributes.hp.temp, 3, "the GM's expire ruling controls despite the conflicting retain choice");
  assert.deepEqual(use.bearer.getFlag("ak5e", "vanguard")?.rulings ?? {}, recordedRuling,
    "the source note and ruling remain unchanged after the use");
});

test("a saved per-use Tip Temporary HP reading survives a later GM ruling change", async () => {
  const use = await startTipTwo({ useId: "tip-thp-reading-locked" });
  const { result } = await runTipReading(use, "retain");
  assert.ok(result, "the owner resolves this use with a per-use retain reading");
  const chosenCard = game.messages.at(-1).content;
  assert.equal(vanguardUses.receipt(use.bearer, use.useId).readingValue, "retain");

  const player = game.user;
  game.user = game.users.activeGM;
  await recordVanguardRuling(use.bearer, "tipTemporaryHpExpiry", "expire", "Tip temporary HP expires at source turn start");
  game.user = player;
  assert.equal(vanguardUses.receipt(use.bearer, use.useId).readingValue, "retain",
    "a later ruling edit does not rewrite the already recorded per-use selection");
  assert.match(chosenCard, /retain|keep.*temporary hp/i,
    "the original public use evidence continues to identify its selected reading");

  use.combat.previous = { round: 1, turn: 1 };
  use.combat.round = 2;
  use.combat.turn = 0;
  game.user = game.users.activeGM;
  await expireFeatureTags({ kind: "combatTurn", combat: use.combat });
  assert.equal(use.recipient.system.attributes.hp.temp, 7,
    "the saved per-use retain decision controls this grant after the later ruling change");
});

test("Tip Temporary HP keeps its use-time deadline through a late owner roll", async () => {
  const use = await startTipTwo({ useId: "tip-thp-late-roll-deadline" });
  // Outcome 2 is known, but the player has not clicked the Temporary HP roll yet.
  use.combat.previous = { round: 1, turn: 1 };
  use.combat.round = 2;
  use.combat.turn = 0;
  game.user = game.users.activeGM;
  await expireFeatureTags({ kind: "combatTurn", combat: use.combat });
  assert.equal(use.recipient.system.attributes.hp.temp, 3, "crossing the use-time deadline grants no unrolled HP");

  game.user = { id: "player", isGM: false, targets: new Set() };
  const { result } = await runTipReading(use, "expire");
  assert.ok(result, "the owner may still resolve the pending roll after the boundary");
  assert.deepEqual(use.rollOwners, ["player", "player"], "the late outcome and feature dice remain owner-clicked");
  assert.equal(use.recipient.system.attributes.hp.temp, 3,
    "the late roll does not restart the duration from its later click or resurrect an expired grant");
  assert.equal(vanguardUses.receipt(use.bearer, use.useId).readingValue, "expire",
    "the public use receipt retains the selected duration across the late roll");
});

test("Tip Temporary HP does not settle on a rewind, missing source combatant, or combat end", async () => {
  const use = await startTipTwo({ useId: "tip-thp-boundary-guards" });
  const { result } = await runTipReading(use, "expire");
  assert.ok(result);
  const sourceCombatant = use.combat.turns.find(turn => turn.actor === use.bearer);
  const originalIndex = use.combat.turns.indexOf(sourceCombatant);
  use.combat.turns.splice(originalIndex, 1);
  use.combat.combatants.delete(sourceCombatant.id);
  use.combat.previous = { round: 1, turn: 1 };
  use.combat.round = 2;
  use.combat.turn = 0;
  game.user = game.users.activeGM;
  await expireFeatureTags({ kind: "combatTurn", combat: use.combat });
  assert.equal(use.recipient.system.attributes.hp.temp, 7,
    "a missing source combatant does not fabricate the source's Turn-start event");

  use.combat.turns.splice(originalIndex, 0, sourceCombatant);
  use.combat.combatants.set(sourceCombatant.id, sourceCombatant);
  use.combat.previous = { round: 2, turn: 0 };
  use.combat.round = 1;
  use.combat.turn = 0;
  await expireFeatureTags({ kind: "combatTurn", combat: use.combat });
  assert.equal(use.recipient.system.attributes.hp.temp, 7, "rewinding combat does not settle a future deadline");
  await expireFeatureTags({ kind: "combatEnd", combat: use.combat });
  assert.equal(use.recipient.system.attributes.hp.temp, 7, "ending combat alone does not settle this turn-based duration");

  use.combat.previous = { round: 1, turn: 1 };
  use.combat.round = 2;
  use.combat.turn = 0;
  await expireFeatureTags({ kind: "combatTurn", combat: use.combat });
  assert.equal(use.recipient.system.attributes.hp.temp, 3,
    "a forward crossing at the source's next Turn start settles the grant exactly once");
});

test("undo before the Tip deadline removes its grant and the later boundary cannot subtract or resurrect it", async () => {
  const use = await startTipTwo({ useId: "tip-thp-undo-before-deadline" });
  const { result } = await runTipReading(use, "expire");
  assert.ok(result);
  await vanguardUses.command(use.bearer, "undoUse", { useId: use.useId }, `${use.useId}-undo`);
  assert.equal(use.recipient.system.attributes.hp.temp, 3, "undo before the deadline removes the additive grant");
  use.combat.previous = { round: 1, turn: 1 };
  use.combat.round = 2;
  use.combat.turn = 0;
  game.user = game.users.activeGM;
  await expireFeatureTags({ kind: "combatTurn", combat: use.combat });
  assert.equal(use.recipient.system.attributes.hp.temp, 3,
    "the later expiry boundary neither subtracts a second time nor resurrects undone Temporary HP");
});

test("undo after the Tip expiry boundary does not restore Temporary HP", async () => {
  const use = await startTipTwo({ useId: "tip-thp-undo-after-deadline" });
  const outcome = await runTipReading(use, "expire");
  assert.ok(outcome.result);
  use.combat.previous = { round: 1, turn: 1 };
  use.combat.round = 2;
  use.combat.turn = 0;
  game.user = game.users.activeGM;
  await expireFeatureTags({ kind: "combatTurn", combat: use.combat });
  assert.equal(use.recipient.system.attributes.hp.temp, 3, "the grant expires at the recorded boundary");
  game.user = { id: "player", isGM: false, targets: new Set() };
  await vanguardUses.command(use.bearer, "undoUse", { useId: use.useId }, use.useId + "-undo-after-expiry");
  assert.equal(use.recipient.system.attributes.hp.temp, 3,
    "undo after expiry neither double-subtracts nor resurrects the expired grant");
});

for (const [mutation, changedPool] of [["ABA", 7], ["replacement", 2]]) {
  test("changed Tip Temporary HP after " + mutation + " attribution stays untouched until owner reconciliation", async () => {
    const use = await startTipTwo({ useId: "tip-thp-" + mutation.toLowerCase() + "-pool" });
    emitActorUpdateHooksForTempHp(use.recipient);
    const outcome = await runTipReading(use, "expire");
    assert.ok(outcome.result);
    if (mutation === "ABA") {
      await use.recipient.update({ "system.attributes.hp.temp": 9 });
      await use.recipient.update({ "system.attributes.hp.temp": 7 });
    } else {
      await use.recipient.update({ "system.attributes.hp.temp": changedPool });
    }
    use.combat.previous = { round: 1, turn: 1 };
    use.combat.round = 2;
    use.combat.turn = 0;
    const messageStart = game.messages.length;
    game.user = game.users.activeGM;
    await expireFeatureTags({ kind: "combatTurn", combat: use.combat });
    assert.equal(use.recipient.system.attributes.hp.temp, changedPool,
      mutation + " evidence makes attribution uncertain, so the boundary does not guess at a subtraction");
    const offer = game.messages.slice(messageStart).find(message =>
      /reconcil|remaining Tip|Temporary HP/i.test(message.content ?? ""));
    assert.ok(offer,
    "the owner receives a public offer to resolve the uncertain grant");
    const snapshot = publicTempHpSnapshot(offer);
    assert.ok(snapshot, "the public offer exposes expected temporary HP and revision values");
    assert.equal(snapshot.expectedTemp, changedPool, "the offer snapshot matches the current target pool");
    if (mutation === "replacement") {
      game.user = { id: "player", isGM: false, targets: new Set() };
      await assert.rejects(() => vanguardUses.command(use.bearer, "settleTipTemporaryHp", {
        ...settlementData(use, snapshot, { remaining: 3 })
      }, "tip-thp-replacement-over-pool"), /./,
      "the selectable remaining amount cannot exceed the current two-point pool");
      assert.equal(use.recipient.system.attributes.hp.temp, 2, "an out-of-range choice does not alter the replacement pool");
      await vanguardUses.command(use.bearer, "settleTipTemporaryHp", {
        ...settlementData(use, snapshot, { remaining: 0 })
      }, "tip-thp-replacement-zero");
      assert.equal(use.recipient.system.attributes.hp.temp, 2,
        "zero remaining Tip HP is a valid choice and removes zero from the current pool");
    }
  });
}

test("missing target-side Tip attribution preserves the pool and offers owner reconciliation at source turn start", async () => {
  const use = await startTipTwo({ useId: "tip-thp-missing-target-attribution" });
  const outcome = await runTipReading(use, "expire");
  assert.ok(outcome.result);
  assert.equal(use.recipient.system.attributes.hp.temp, 7, "the owner-clicked grant is present before the boundary");
  assert.ok(vanguardUses.receipt(use.bearer, use.useId), "the source use receipt remains recorded");
  assert.ok(removeTargetAttributionForUse(use.recipient, use.useId),
    "the test removes the target-side attribution associated with this use");
  assert.equal(use.recipient.system.attributes.hp.temp, 7, "removing attribution does not alter the temporary HP pool");

  use.combat.previous = { round: 1, turn: 1 };
  use.combat.round = 2;
  use.combat.turn = 0;
  const messageStart = game.messages.length;
  game.user = game.users.activeGM;
  await expireFeatureTags({ kind: "combatTurn", combat: use.combat });

  assert.equal(use.recipient.system.attributes.hp.temp, 7,
    "without target-side attribution, expiry does not guess at a subtraction");
  assert.ok(game.messages.slice(messageStart).some(message => {
    const evidence = `${message?.content ?? ""} ${JSON.stringify(message?.flags ?? {})}`;
    return evidence.includes(use.useId) && /reconcil|owner.{0,40}(decision|choice)|(?:decision|choice).{0,40}owner/i.test(evidence);
  }), "public evidence identifies this use as needing reconciliation or an owner decision");
  assert.ok(vanguardUses.receipt(use.bearer, use.useId), "the source use receipt survives the boundary");
});

test("multiple Tip Temporary HP grants remain individually attributable after a changed pool", async () => {
  const use = await startTipTwo({ useId: "tip-thp-multiple-first" });
  const first = await runTipReading(use, "expire");
  assert.ok(first.result);
  use.forced.push(2, 4);
  const secondId = "tip-thp-multiple-second";
  await vanguardUses.command(use.bearer, "tipOfTheSpear", {
    targetUuid: use.recipient.uuid, targetName: use.recipient.name,
    overrides: TARGET_WARNINGS, confirmed: true
  }, secondId);
  await vanguardUses.command(use.bearer, "useRoll", { useId: secondId });
  const second = await runTipReading({ ...use, useId: secondId }, "expire");
  assert.ok(second.result);
  assert.equal(use.recipient.system.attributes.hp.temp, 11, "two additive Tip grants total eight Temporary HP");

  use.combat.previous = { round: 1, turn: 1 };
  use.combat.round = 2;
  use.combat.turn = 0;
  const messageStart = game.messages.length;
  game.user = game.users.activeGM;
  await expireFeatureTags({ kind: "combatTurn", combat: use.combat });
  assert.equal(use.recipient.system.attributes.hp.temp, 11,
    "two overlapping grants are not automatically subtracted even when the pool has no unrelated edit");
  const offers = game.messages.slice(messageStart).filter(message =>
    /reconcil|remaining Tip|Temporary HP/i.test(message.content ?? ""));
  assert.ok(offers.length >= 2, "public reconciliation evidence preserves both grant opportunities");

  const previewTemp = use.recipient.system.attributes.hp.temp;
  const preview = vanguardUses.previewUndo(use.bearer, use.useId);
  assert.equal(preview.blocked, false, "the earlier grant can be undone while the second grant remains active");
  const previewText = (preview.lines ?? []).map(line =>
    typeof line === "string" ? line : line?.text ?? line?.label ?? JSON.stringify(line)).join(" ");
  assert.match(previewText, /reconcil|owner.{0,40}(?:choose|select|confirm|resolve)|(?:choose|select|confirm|resolve).{0,40}owner/i,
    "the undo preview directs the owner to reconcile the changed grant attribution");
  assert.equal(use.recipient.system.attributes.hp.temp, previewTemp,
    "previewing the conflicting undo does not guess at or mutate the pool");
  const firstOffer = offers.find(message => isPublicTipReconciliation(message, use.useId));
  assert.ok(firstOffer, "the owner receives an individual reconciliation offer for the first grant");
  const firstSnapshot = publicTempHpSnapshot(firstOffer);
  assert.ok(firstSnapshot, "the first grant's offer includes a current public snapshot");
  game.user = { id: "player", isGM: false, targets: new Set() };
  await vanguardUses.command(use.bearer, "settleTipTemporaryHp", {
    ...settlementData(use, firstSnapshot, { remaining: 4, reason: "Owner identifies four remaining Tip HP for the first grant" })
  }, "tip-thp-reconcile-first-grant");
  assert.equal(use.recipient.system.attributes.hp.temp, 7,
    "only the owner's explicit four-point attribution is removed, preserving the original pool and second grant");
});

test("unowned Tip Temporary HP is applied, retried, and undone through the validated GM relay", async () => {
  const use = await startTipTwo({ useId: "tip-thp-unowned-relay" });
  const gm = game.users.activeGM;
  const player = { id: "player", isGM: false, targets: new Set() };
  game.users = new Map([[gm.id, gm], [player.id, player]]);
  game.users.activeGM = gm;
  use.bearer.ownership = { default: 0, [player.id]: 3 };
  use.recipient.ownership = { default: 0, [gm.id]: 3 };
  use.bearer.isOwner = true;
  use.recipient.isOwner = false;
  game.user = player;

  const seenRequests = new Set();
  const waitForRequest = async () => {
    let request = null;
    for (let i = 0; i < 2000 && !request; i++) {
      request = game.messages.find(message => {
        const key = message.uuid ?? message.id ?? message;
        return !seenRequests.has(key) && Object.keys(message.flags?.ak5e ?? {}).some(flag => /RelayRequest/.test(flag));
      }) ?? null;
      if (!request) await new Promise(resolve => setImmediate(resolve));
    }
    assert.ok(request, "the owner mutation is preserved as a GM relay request");
    seenRequests.add(request.uuid ?? request.id ?? request);
    return request;
  };

  const applying = runTipReading(use, "expire").then(value => ({ value }), error => ({ error }));
  const applyRequest = await waitForRequest();
  assert.equal(use.recipient.system.attributes.hp.temp, 3, "the owner does not directly change an unowned target");
  assert.ok(vanguardUses.receipt(use.bearer, use.useId), "the source receipt holds the relay-backed grant");
  game.user = gm;
  use.recipient.isOwner = true;
  try { await vanguardUses.handleRelay(applyRequest, {}, player.id); }
  finally { game.user = player; use.recipient.isOwner = false; }
  Hooks.call("updateChatMessage", applyRequest);
  const applyResult = await applying;
  assert.ok(applyResult.value?.result, `the GM applies the validated THP grant: ${applyResult.error?.message ?? ""}`);
  assert.equal(use.recipient.system.attributes.hp.temp, 7, "the GM-side relay applies the owner-clicked d6");

  await vanguardUses.command(use.bearer, "useRoll", { useId: use.useId });
  assert.equal(use.recipient.system.attributes.hp.temp, 7, "retrying the completed roll does not duplicate its THP grant");

  const undoing = vanguardUses.command(use.bearer, "undoUse", { useId: use.useId }, use.useId + "-undo")
    .then(value => ({ value }), error => ({ error }));
  const undoRequest = await waitForRequest();
  game.user = gm;
  use.recipient.isOwner = true;
  try { await vanguardUses.handleRelay(undoRequest, {}, player.id); }
  finally { game.user = player; use.recipient.isOwner = false; }
  Hooks.call("updateChatMessage", undoRequest);
  const undoResult = await undoing;
  assert.ok(undoResult.value, `the GM applies the validated undo: ${undoResult.error?.message ?? ""}`);
  assert.equal(use.recipient.system.attributes.hp.temp, 3, "the relayed undo restores only the recorded grant");
});

test("an unowned Tip Temporary HP settlement relays, retries once, and undo preserves an intervening edit", async () => {
  const use = await startTipTwo({ useId: "tip-thp-unowned-settlement-relay" });
  const gm = game.users.activeGM;
  const player = { id: "player", isGM: false, targets: new Set() };
  game.users = new Map([[gm.id, gm], [player.id, player]]);
  game.users.activeGM = gm;
  use.bearer.ownership = { default: 0, [player.id]: 3 };
  use.recipient.ownership = { default: 0, [gm.id]: 3 };
  use.bearer.isOwner = true;
  use.recipient.isOwner = false;
  game.user = player;

  const seenRequests = new Set();
  const waitForRequest = async () => {
    let request = null;
    for (let i = 0; i < 2000 && !request; i++) {
      request = game.messages.find(message => {
        const key = message.uuid ?? message.id ?? message;
        return !seenRequests.has(key) && Object.keys(message.flags?.ak5e ?? {}).some(flag => /RelayRequest/.test(flag));
      }) ?? null;
      if (!request) await new Promise(resolve => setImmediate(resolve));
    }
    assert.ok(request, "each owner-side target mutation creates a GM relay request");
    seenRequests.add(request.uuid ?? request.id ?? request);
    return request;
  };

  const granting = runTipReading(use, "expire").then(value => ({ value }), error => ({ error }));
  const grantRequest = await waitForRequest();
  assert.equal(use.recipient.system.attributes.hp.temp, 3, "the owner cannot directly grant THP to the unowned recipient");
  game.user = gm;
  use.recipient.isOwner = true;
  try { await vanguardUses.handleRelay(grantRequest, {}, player.id); }
  finally { game.user = player; use.recipient.isOwner = false; }
  Hooks.call("updateChatMessage", grantRequest);
  const grantResult = await granting;
  assert.ok(grantResult.value?.result, `the GM applies the initial grant: ${grantResult.error?.message ?? ""}`);
  assert.equal(use.recipient.system.attributes.hp.temp, 7);

  game.user = gm;
  use.recipient.isOwner = true;
  await use.recipient.update({ "system.attributes.hp.temp": 9 });
  use.recipient.isOwner = false;
  use.combat.previous = { round: 1, turn: 1 };
  use.combat.round = 2;
  use.combat.turn = 0;
  const boundaryMessages = game.messages.length;
  use.recipient.isOwner = true;
  await expireFeatureTags({ kind: "combatTurn", combat: use.combat });
  use.recipient.isOwner = false;
  const offer = game.messages.slice(boundaryMessages).find(message => isPublicTipReconciliation(message, use.useId));
  assert.ok(offer, "the owner is prompted to resolve the changed unowned pool");
  const snapshot = publicTempHpSnapshot(offer);
  assert.ok(snapshot, "the owner receives a public settlement snapshot");
  game.user = player;

  const settlementId = "tip-thp-unowned-settlement";
  const settling = confirmPlayUse("Settle Tip Temporary HP", extra =>
    vanguardUses.command(use.bearer, "settleTipTemporaryHp", {
      ...settlementData(use, snapshot, { remaining: 2 }), ...extra
    }, settlementId), { confirmed: true }).then(value => ({ value }), error => ({ error }));
  const settlementRequest = await waitForRequest();
  assert.equal(use.recipient.system.attributes.hp.temp, 9,
    "the owner settlement request does not directly write the unowned target");
  game.user = gm;
  use.recipient.isOwner = true;
  try { await vanguardUses.handleRelay(settlementRequest, {}, player.id); }
  finally { game.user = player; use.recipient.isOwner = false; }
  Hooks.call("updateChatMessage", settlementRequest);
  const settlementResult = await settling;
  assert.ok(settlementResult.value, `the GM applies the receipt-backed settlement: ${settlementResult.error?.message ?? ""}`);
  assert.equal(use.recipient.system.attributes.hp.temp, 7, "the relayed settlement removes only the selected two points");

  await vanguardUses.command(use.bearer, "settleTipTemporaryHp", {
    ...settlementData(use, snapshot, { remaining: 2 })
  }, settlementId);
  assert.equal(use.recipient.system.attributes.hp.temp, 7, "retrying the same settlement operation does not apply twice");

  game.user = gm;
  use.recipient.isOwner = true;
  await use.recipient.update({ "system.attributes.hp.temp": 8 });
  use.recipient.isOwner = false;
  game.user = player;
  const undoing = vanguardUses.command(use.bearer, "undoUse", { useId: settlementId }, settlementId + "-undo")
    .then(value => ({ value }), error => ({ error }));
  const undoRequest = await waitForRequest();
  game.user = gm;
  use.recipient.isOwner = true;
  try { await vanguardUses.handleRelay(undoRequest, {}, player.id); }
  finally { game.user = player; use.recipient.isOwner = false; }
  Hooks.call("updateChatMessage", undoRequest);
  const undoResult = await undoing;
  assert.ok(undoResult.value, `the GM relays the settlement undo: ${undoResult.error?.message ?? ""}`);
  assert.equal(use.recipient.system.attributes.hp.temp, 10,
    "undo reverses only its two-point settlement delta and preserves the intervening one point");
});

test("changed Tip Temporary HP is settled by the owner, subtracts only the selected remainder, and undoes by delta", async () => {
  const use = await startTipTwo({ useId: "tip-thp-reconcile" });
  const { result } = await runTipReading(use, "expire");
  assert.ok(result);
  assert.equal(use.recipient.system.attributes.hp.temp, 7, "the expiring Tip grant starts at four additive Temporary HP");

  // An unrelated Temporary HP update makes attribution uncertain before the source Turn boundary.
  await use.recipient.update({ "system.attributes.hp.temp": 9 });
  use.combat.previous = { round: 1, turn: 1 };
  use.combat.round = 2;
  use.combat.turn = 0;
  const messageStart = game.messages.length;
  game.user = game.users.activeGM;
  await expireFeatureTags({ kind: "combatTurn", combat: use.combat });
  assert.equal(use.recipient.system.attributes.hp.temp, 9,
    "the GM-side boundary preserves a changed pool instead of silently subtracting the original grant");
  const offer = game.messages.slice(messageStart).find(message =>
    /reconcil|remaining Tip|Temporary HP/i.test(message.content ?? ""));
  assert.ok(offer, "the owner receives a public reconciliation offer after attribution becomes uncertain");
  const offerText = `${offer.content ?? ""} ${JSON.stringify(offer.flags ?? {})}`;
  assert.match(offerText, new RegExp(use.useId), "the offer identifies the recorded Tip grant");
  assert.ok(
    exposesSelectableZeroToFourRange(offer) || /remaining\s+Tip\s+HP.{0,40}0\s*[–-]\s*4/i.test(offerText),
    "the owner is offered a structured selectable zero-through-four range or a clear remaining Tip HP range of 0–4"
  );
  const snapshot = publicTempHpSnapshot(offer);
  assert.ok(snapshot, "the public reconciliation offer contains a target pool and revision snapshot");
  assert.equal(snapshot.expectedTemp, 9, "the public snapshot identifies the changed pool awaiting owner choice");

  game.user = { id: "player", isGM: false, targets: new Set() };
  await assert.rejects(() => vanguardUses.command(use.bearer, "settleTipTemporaryHp", {
    ...settlementData(use, snapshot, { remaining: 2, confirmed: false })
  }, "tip-thp-reconcile-cancel"), /./, "cancelling the settlement consumes neither grant nor Temporary HP");
  assert.equal(use.recipient.system.attributes.hp.temp, 9, "a cancelled settlement leaves the changed pool intact");
  assert.equal(vanguardUses.receipt(use.bearer, "tip-thp-reconcile-cancel"), null,
    "a cancelled settlement creates no use receipt");
  await assert.rejects(() => vanguardUses.command(use.bearer, "settleTipTemporaryHp", {
    ...settlementData(use, snapshot, { remaining: -1 })
  }, "tip-thp-reconcile-negative"), /./, "a negative remaining grant is rejected");
  await assert.rejects(() => vanguardUses.command(use.bearer, "settleTipTemporaryHp", {
    ...settlementData(use, snapshot, { remaining: 5 })
  }, "tip-thp-reconcile-over-grant"), /./, "remaining Tip HP cannot exceed the four-point grant or current pool");
  assert.equal(use.recipient.system.attributes.hp.temp, 9, "invalid reconciliation amounts leave Temporary HP unchanged");
  const reconciliationId = "tip-thp-reconcile-owner-choice";
  const reconciled = await confirmPlayUse("Reconcile Tip Temporary HP", extra =>
    vanguardUses.command(use.bearer, "settleTipTemporaryHp", {
      ...settlementData(use, snapshot, { remaining: 2 }), ...extra
    }, reconciliationId), { confirmed: true });
  assert.ok(reconciled, "the owner confirms the selected remaining Tip amount through the public use flow");
  assert.equal(use.recipient.system.attributes.hp.temp, 7,
    "confirming two remaining Tip HP removes only two and preserves the other seven Temporary HP");
  assert.ok(vanguardUses.receipt(use.bearer, reconciliationId), "the reconciliation records a reversible use receipt");
  assert.match(game.messages.at(-1).content, /Tip temporary HP.{0,80}2/i,
    "the public receipt/card names the Tip Temporary HP adjustment and its two-point amount");
  await vanguardUses.command(use.bearer, "settleTipTemporaryHp", {
    ...settlementData(use, snapshot, { remaining: 2 })
  }, reconciliationId);
  assert.equal(use.recipient.system.attributes.hp.temp, 7,
    "retrying the same settlement operation does not subtract the selected remainder twice");

  await use.recipient.update({ "system.attributes.hp.temp": 8 });
  await vanguardUses.command(use.bearer, "undoUse", { useId: reconciliationId }, `${reconciliationId}-undo`);
  assert.equal(use.recipient.system.attributes.hp.temp, 10,
    "undo restores the two-point expiry delta while preserving the unrelated intervening one point");
});

test("a Tip use initiated outside combat waits for a confirmed owner manual boundary", async () => {
  const use = await startTipTwo({ useId: "tip-thp-manual-boundary", outOfCombat: true });
  const outcome = await runTipReading(use, "expire");
  assert.ok(outcome.result);
  assert.equal(use.recipient.system.attributes.hp.temp, 7);
  assert.equal(use.recipient.system.attributes.hp.temp, 7,
    "an out-of-combat use has no automatic combat boundary to settle its duration");
  const publicEvidence = [vanguardUses.receipt(use.bearer, use.useId), ...game.messages.slice().reverse()];
  const snapshot = publicEvidence.map(publicTempHpSnapshot).find(Boolean);
  assert.ok(snapshot, "the owner-facing use evidence exposes the pool and revision needed for manual settlement");

  game.user = { id: "player", isGM: false, targets: new Set() };
  const manualBoundaryId = "tip-thp-confirmed-manual-boundary";
  const settled = await confirmPlayUse("Settle Tip Temporary HP", extra =>
    vanguardUses.command(use.bearer, "settleTipTemporaryHp", {
      ...settlementData(use, snapshot, {
        remaining: 4,
        manualBoundary: true,
        reason: "Owner confirms the source's next Turn boundary outside combat"
      }),
      ...extra
    }, manualBoundaryId), { confirmed: true });
  assert.ok(settled, "an owner-confirmed manual boundary settles the recorded grant");
  assert.equal(use.recipient.system.attributes.hp.temp, 3,
    "the manual boundary removes the four remaining Tip HP and preserves unrelated Temporary HP");
});

test("hydrated Tip grants preserve the per-use choice and deduplicate a replayed boundary", async () => {
  const use = await startTipTwo({ useId: "tip-thp-hydrated-boundary" });
  const outcome = await runTipReading(use, "expire");
  assert.ok(outcome.result);
  const savedReceipt = structuredClone(vanguardUses.receipt(use.bearer, use.useId));
  const savedCard = game.messages.at(-1).content;
  const bearer = createTestActor(use.bearer.toObject());
  const recipient = createTestActor(use.recipient.toObject());
  assert.equal(vanguardUses.receipt(bearer, use.useId).readingValue, "expire",
    "the per-use reading survives Actor rehydration");
  assert.equal(vanguardUses.receipt(bearer, use.useId).readingValue, savedReceipt.readingValue);
  assert.match(savedCard, /source.{0,30}turn|next.{0,30}turn/i, "the saved public card names the use-time deadline");
  globalThis.fromUuidSync = uuid => uuid === recipient.uuid ? recipient : uuid === bearer.uuid ? bearer : null;

  const combat = createTestCombat([bearer, recipient], { id: use.combat.id, started: true, round: 2, turn: 0 });
  combat.previous = { round: 1, turn: 1 };
  game.combat = combat;
  game.user = game.users.activeGM;
  await expireFeatureTags({ kind: "combatTurn", combat });
  assert.equal(recipient.system.attributes.hp.temp, 3, "the hydrated grant settles at its persisted source-turn deadline");

  const reloadedBearer = createTestActor(bearer.toObject());
  const reloadedRecipient = createTestActor(recipient.toObject());
  globalThis.fromUuidSync = uuid => uuid === reloadedRecipient.uuid ? reloadedRecipient : uuid === reloadedBearer.uuid ? reloadedBearer : null;
  const replayCombat = createTestCombat([reloadedBearer, reloadedRecipient], {
    id: use.combat.id, started: true, round: 2, turn: 0
  });
  replayCombat.previous = { round: 1, turn: 1 };
  game.combat = replayCombat;
  await expireFeatureTags({ kind: "combatTurn", combat: replayCombat });
  assert.equal(reloadedRecipient.system.attributes.hp.temp, 3,
    "replaying the persisted boundary after another hydration cannot subtract or restore THP twice");
  assert.equal(vanguardUses.receipt(reloadedBearer, use.useId).readingValue, "expire",
    "the selected reading and its settlement state remain on the reloaded use receipt");
});

test("stale Tip pool and revision snapshots fail closed and refresh before settlement", async () => {
  const use = await startTipTwo({ useId: "tip-thp-stale-snapshot" });
  emitActorUpdateHooksForTempHp(use.recipient);
  const outcome = await runTipReading(use, "expire");
  assert.ok(outcome.result);
  await use.recipient.update({ "system.attributes.hp.temp": 9 });
  use.combat.previous = { round: 1, turn: 1 };
  use.combat.round = 2;
  use.combat.turn = 0;
  game.user = game.users.activeGM;
  await expireFeatureTags({ kind: "combatTurn", combat: use.combat });
  const firstOffer = game.messages.slice().reverse().find(message => isPublicTipReconciliation(message, use.useId));
  assert.ok(firstOffer, "the changed pool produces the first public snapshot");
  const firstSnapshot = publicTempHpSnapshot(firstOffer);
  assert.ok(firstSnapshot, "the first offer identifies expectedTemp and expectedRevision");

  game.user = { id: "player", isGM: false, targets: new Set() };
  await use.recipient.update({ "system.attributes.hp.temp": 10 });
  const afterTempChange = game.messages.length;
  await vanguardUses.command(use.bearer, "settleTipTemporaryHp", {
    ...settlementData(use, firstSnapshot, { remaining: 2 })
  }, "tip-thp-stale-temp").catch(() => {});
  assert.equal(use.recipient.system.attributes.hp.temp, 10,
    "a stale expected Temporary HP value cannot mutate the current pool");
  const refreshedAfterTemp = game.messages.slice(afterTempChange).find(message => isPublicTipReconciliation(message, use.useId));
  assert.ok(refreshedAfterTemp, "a stale pool response exposes a refreshed public snapshot");
  const tempSnapshot = publicTempHpSnapshot(refreshedAfterTemp);
  assert.ok(tempSnapshot, "the refreshed pool response identifies expectedTemp and expectedRevision");
  assert.equal(tempSnapshot.expectedTemp, 10, "the refreshed snapshot reflects the current pool");

  await use.recipient.update({ "system.attributes.hp.temp": 11 });
  await use.recipient.update({ "system.attributes.hp.temp": 10 });
  const afterRevisionChange = game.messages.length;
  await vanguardUses.command(use.bearer, "settleTipTemporaryHp", {
    ...settlementData(use, tempSnapshot, { remaining: 2 })
  }, "tip-thp-stale-revision").catch(() => {});
  assert.equal(use.recipient.system.attributes.hp.temp, 10,
    "a stale revision fails closed even when the numeric pool has returned to its prior value");
  const refreshedAfterRevision = game.messages.slice(afterRevisionChange).find(message => isPublicTipReconciliation(message, use.useId));
  assert.ok(refreshedAfterRevision, "a stale revision response exposes a refreshed public snapshot");
  const revisionSnapshot = publicTempHpSnapshot(refreshedAfterRevision);
  assert.ok(revisionSnapshot, "the refreshed revision response identifies a new snapshot");
  assert.equal(revisionSnapshot.expectedTemp, 10);
  assert.notEqual(revisionSnapshot.expectedRevision, tempSnapshot.expectedRevision,
    "the public snapshot revision changes after the pool's ABA update");

  const settled = await vanguardUses.command(use.bearer, "settleTipTemporaryHp", {
    ...settlementData(use, revisionSnapshot, { remaining: 2 })
  }, "tip-thp-settle-refreshed-snapshot");
  assert.ok(settled, "a new operation with the refreshed public values settles successfully");
  assert.equal(use.recipient.system.attributes.hp.temp, 8,
    "the refreshed choice removes only its selected two-point Tip contribution");
});

test("Tip range includes a visible allied Creature at 60 feet and warns beyond that boundary", () => {
  const bearer = vanguard(5), recipient = ally("Boundary ally");
  const scene = { id: "tip-range-scene", grid: { units: "ft", distance: 5, size: 100, type: 0 } };
  const token = (actor, x) => ({
    actor, x, y: 0, width: 1, height: 1, parent: scene, isVisible: true,
    document: { hidden: false, disposition: 1 }, getCenterPoint() { return { x: this.x, y: this.y }; }
  });
  const source = token(bearer, 0);
  const target = token(recipient, 1200);
  globalThis.canvas = { tokens: { placeables: [source, target] } };

  const boundary = tipWarnings(bearer, recipient);
  assert.equal(boundary.some(warning => warning.id === "range"), false, "60 feet is in range");
  target.x = 1220;
  const beyond = tipWarnings(bearer, recipient);
  assert.ok(beyond.some(warning => warning.id === "range"), "61 feet raises a range warning");
  target.x = 100;
  target.isVisible = false;
  target.document.hidden = true;
  target.document.disposition = 0;
  const unseenNeutral = tipWarnings(bearer, recipient);
  assert.ok(unseenNeutral.some(warning => warning.id === "visibility-unverified"), "an unseen target raises a visibility warning");
  assert.ok(unseenNeutral.some(warning => warning.id === "alliance"), "a neutral target with known disposition raises an alliance warning");
  target.document.disposition = 1;
  const hiddenAlly = tipWarnings(bearer, recipient);
  assert.ok(hiddenAlly.some(warning => warning.id === "visibility-unverified"), "an unseen allied Creature raises a visibility warning");
  assert.equal(hiddenAlly.some(warning => warning.id === "alliance" || warning.id === "alliance-unverified"), false,
    "an allied Creature does not raise an alliance warning");
  target.isVisible = true;
  target.document.hidden = false;
  target.document.disposition = 0;
  const visibleNeutral = tipWarnings(bearer, recipient);
  assert.equal(visibleNeutral.some(warning => warning.id === "visibility-unverified"), false, "a visible Creature has no visibility warning");
  assert.ok(visibleNeutral.some(warning => warning.id === "alliance"), "a visible neutral Creature still warns about alliance");
  delete globalThis.canvas;
});

test("an owner can use Tip outside their turn without GM approval, and override warnings stay public", async () => {
  setupFoundryGlobals({ isGM: false, combat: { started: true, round: 2, turn: 0 } });
  registerVanguardSheetHooks();
  const bearer = vanguard(5);
  const recipient = ally("Owned ally");
  globalThis.fromUuidSync = uuid => uuid === recipient.uuid ? recipient : null;

  await vanguardUses.command(bearer, "tipOfTheSpear", {
    targetUuid: recipient.uuid, targetName: recipient.name,
    overrides: TARGET_WARNINGS, confirmed: true
  }, "player-out-of-turn-tip");

  const receipt = vanguardUses.receipt(bearer, "player-out-of-turn-tip");
  assert.equal(receipt.status, "awaitingRoll", "no approval or turn gate blocks the owner");
  assert.equal(game.messages.length, 1, "the use produces a public chat card");
  const card = game.messages[0].content;
  assert.match(card, /Used anyway:/i, "the public card marks that the player overrode warnings");
  assert.match(card, /range|visibility|alliance/i, "the public card identifies the overridden target warning");
});

test("the sheet's owner-use Tip confirmation shows the feature name instead of its command key", async () => {
  const bearer = vanguard(5), recipient = ally("Owned target");
  const targetToken = { actor: recipient, name: recipient.name, document: { hidden: false, disposition: 1 }, isVisible: true };
  game.user = { id: "player", isGM: false, targets: new Set([targetToken]) };
  globalThis.fromUuidSync = uuid => uuid === recipient.uuid ? recipient : null;
  const confirmations = [], useDialogs = [];
  foundry.applications.api.DialogV2 = {
    confirm: async options => { confirmations.push(options); return true; },
    wait: async options => {
      if (String(options.window?.title ?? "").startsWith("Vanguard — ")) {
        let click;
        const button = {
          dataset: { action: "tip" }, disabled: false,
          addEventListener(type, listener) { if (type === "click") click = listener; }
        };
        options.render?.(null, { element: { querySelectorAll: () => [button] } });
        assert.ok(click, "the public Vanguard controls bind the Tip action");
        return click({ preventDefault() {}, stopPropagation() {} });
      }
      useDialogs.push(options);
      const action = (options.buttons ?? []).find(button => ["use", "anyway"].includes(button.action));
      assert.ok(action, "the ordinary owner-use confirmation offers Use or Use anyway");
      return (await action.callback?.(null, { form: { elements: {} } })) ?? action.action;
    }
  };

  await vanguardSheetApi.open(bearer);

  const ownerUseConfirmation = confirmations.find(options => /^Confirm /i.test(options.window?.title ?? "")
    && !/confirm trigger/i.test(options.window?.title ?? ""));
  assert.ok(ownerUseConfirmation, "the sheet presents an owner confirmation after confirming the trigger");
  const confirmationText = `${ownerUseConfirmation.window?.title ?? ""} ${String(ownerUseConfirmation.content ?? "").replace(/<[^>]*>/g, " ")}`;
  assert.match(confirmationText, /Tip of the Spear/i, "the owner confirmation uses the readable feature name");
  assert.doesNotMatch(confirmationText, /tipOfTheSpear/, "the owner confirmation does not expose the internal command key");

  assert.equal(useDialogs.filter(options => options.window?.title === "Tip of the Spear").length, 1,
    "the owner sees one ordinary upfront confirmation titled Tip of the Spear");
  for (const options of useDialogs) {
    const visibleText = `${options.window?.title ?? ""} ${String(options.content ?? "").replace(/<[^>]*>/g, " ")}`;
    assert.match(visibleText, /Tip of the Spear/i, "each owner-facing play-use dialog uses the readable feature name");
    assert.doesNotMatch(visibleText, /tipOfTheSpear/, "play-use dialogs do not expose the internal command key");
  }
});

test("a cancelled or unconfirmed Tip leaves the use, target and dice untouched", async () => {
  const bearer = vanguard(5);
  const recipient = ally("Unchanged ally", 2);
  globalThis.fromUuidSync = uuid => uuid === recipient.uuid ? recipient : null;
  const before = structuredClone(recipient.toObject());
  const sourceBefore = structuredClone(bearer.toObject());
  let evaluations = 0;
  const OriginalRoll = globalThis.Roll;
  globalThis.Roll = class extends OriginalRoll {
    async evaluate() { evaluations++; return super.evaluate(); }
  };

  await assert.rejects(() => vanguardUses.command(bearer, "tipOfTheSpear", {
    targetUuid: recipient.uuid, targetName: recipient.name, overrides: TARGET_WARNINGS,
    confirmed: false
  }, "cancelled-tip"));

  assert.equal(vanguardUses.receipt(bearer, "cancelled-tip"), null);
  assert.equal(evaluations, 0, "cancellation starts no Feature or cost dice");
  assert.deepEqual(recipient.toObject(), before, "cancellation changes no target state");
  assert.deepEqual(bearer.toObject(), sourceBefore, "cancellation preserves source grants and resources");
});

test("self-targeting uses a public per-use reading and never writes a permanent Vanguard ruling", async () => {
  const bearer = vanguard();
  const beforeRulings = structuredClone(bearer.getFlag("ak5e", "vanguard")?.rulings ?? {});
  const args = {
    targetUuid: bearer.uuid, targetName: bearer.name, directed: true, choice: 3,
    overrides: TARGET_WARNINGS, confirmed: true
  };

  await assert.rejects(() => vanguardUses.command(bearer, "tipOfTheSpear", args, "tip-self-needs-reading"),
    error => error.name === "AK5eReading");
  assert.equal(vanguardUses.receipt(bearer, "tip-self-needs-reading"), null);
  await vanguardUses.command(bearer, "tipOfTheSpear", { ...args, reading: "allowSelf" }, "tip-self-allow");

  const receipt = vanguardUses.receipt(bearer, "tip-self-allow");
  assert.equal(receipt.readingValue, "allowSelf", "the machine-readable choice belongs to this use receipt");
  assert.notEqual(receipt.reading, "allowSelf", "the generic reading field is not the raw choice key");
  assert.match(receipt.reading, /self (?:is )?allowed|includes? self|self permitted/i,
    "the receipt carries a readable label for including the bearer");
  assert.match(game.messages.at(-1).content, /Player's reading for this use/i,
    "the reading is visible to the table on the public card");
  assert.match(game.messages.at(-1).content, /self (?:is )?allowed|includes? self|self permitted/i,
    "the public card explains in readable terms that the bearer may be included");
  assert.deepEqual(bearer.getFlag("ak5e", "vanguard")?.rulings ?? {}, beforeRulings,
    "a temporary player choice never becomes a GM ruling");

  await vanguardUses.command(bearer, "tipOfTheSpear", {
    ...args, reading: "otherAllyOnly", overrides: [...TARGET_WARNINGS, "selfTarget"]
  }, "tip-self-excluded-override");
  const excludedReceipt = vanguardUses.receipt(bearer, "tip-self-excluded-override");
  assert.equal(excludedReceipt.readingValue, "otherAllyOnly", "the machine-readable excluding choice belongs to this receipt");
  assert.notEqual(excludedReceipt.reading, "otherAllyOnly", "the generic reading field is not the raw choice key");
  assert.match(excludedReceipt.reading, /other allies only|only other allies|excludes? self|self(?: is)? excluded|only another ally/i,
    "the receipt carries a readable label for excluding the bearer");
  assert.match(game.messages.at(-1).content, /Player's reading for this use/i,
    "the temporary reading is visible on the public card");
  assert.match(game.messages.at(-1).content, /other allies only|only other allies|excludes? self|self(?: is)? excluded|only another ally/i,
    "the public card explains in readable terms that only another ally may be chosen");
  assert.match(game.messages.at(-1).content, /self/i, "the public card identifies the self-target warning override");
  assert.deepEqual(bearer.getFlag("ak5e", "vanguard")?.rulings ?? {}, beforeRulings,
    "neither per-use choice persists as a ruling");
});

test("replaying the same confirmed Tip operation does not duplicate its target effect", async () => {
  const bearer = vanguard();
  const recipient = ally("Retry ally");
  globalThis.fromUuidSync = uuid => uuid === recipient.uuid ? recipient : null;
  const args = {
    targetUuid: recipient.uuid, targetName: recipient.name, directed: true, choice: 4,
    overrides: [...TARGET_WARNINGS, "level"], confirmed: true
  };

  await vanguardUses.command(bearer, "tipOfTheSpear", args, "same-tip-operation");
  await vanguardUses.command(bearer, "tipOfTheSpear", args, "same-tip-operation");

  assert.equal(recipient.effects.size, 1, "one operation has one target change after retry");
  assert.ok(vanguardUses.receipt(bearer, "same-tip-operation"), "the original receipt remains the operation's record");
});

test("a qualifying Leading Lance kill grants exactly 10 SP, dedupes retries, and its receipt restores the grant", async () => {
  const bearer = vanguard(5);
  await bearer.update({ "flags.ak5e.operatorSkills": {
    enabled: true, points: 4, maximum: 20, active: null,
    operatorEvents: [{ id: "lance-activation:activation", activationId: "lance-activation", kind: "activation",
      sourceId: "operator-skill-vanguard-basic-leading-lance", spBefore: 14, spAfter: 4, spSpent: 10, committed: true }]
  } });
  const args = { confirmed: true, eventId: "lance-activation" };

  await vanguardUses.command(bearer, "leadingLanceSP", args, "leading-lance-kill");
  assert.equal(bearer.getFlag("ak5e", "operatorSkills").points, 14);
  assert.equal(bearer.getFlag("ak5e", "operatorSkills").operatorEvents[1].spGained, 10);
  await vanguardUses.command(bearer, "leadingLanceSP", args, "leading-lance-kill");
  assert.equal(bearer.getFlag("ak5e", "operatorSkills").points, 14, "retry grants no additional SP");

  await vanguardUses.undo(bearer, "leading-lance-kill");
  assert.equal(bearer.getFlag("ak5e", "operatorSkills").points, 4, "undo restores the exact prior pool value");
});

test("an unowned ally change uses the owner's relay request and undo relays only the recorded target change", async () => {
  const bearer = vanguard();
  const gm = { id: "gm", isGM: true };
  const player = { id: "player", isGM: false };
  game.user = player;
  game.users = new Map([[gm.id, gm], [player.id, player]]);
  game.users.activeGM = gm;
  game.combat = createTestCombat([bearer], { started: true, round: 1, turn: 0 });
  bearer.ownership = { default: 0, [player.id]: 3 };
  const unowned = createTestActor({ name: "Unowned ally", owner: false, ownership: { default: 0, [gm.id]: 3 } });
  unowned.isOwner = false;
  globalThis.fromUuidSync = uuid => uuid === unowned.uuid ? unowned : uuid === bearer.uuid ? bearer : null;
  const useId = "tip-relayed-target";

  const seenRequests = new Set();
  const relayRequest = () => game.messages.find(message => {
    const key = message.uuid ?? message.id ?? message;
    return !seenRequests.has(key) && Object.keys(message.flags?.ak5e ?? {}).some(flag => /RelayRequest/.test(flag));
  }) ?? null;
  const waitForRelayRequest = async () => {
    let request = null;
    for (let i = 0; i < 2000 && !request; i++) {
      request = relayRequest();
      if (!request) await new Promise(resolve => setImmediate(resolve));
    }
    assert.ok(request, "the owner operation produces a public GM relay request");
    seenRequests.add(request.uuid ?? request.id ?? request);
    return request;
  };
  const applying = vanguardUses.command(bearer, "tipOfTheSpear", {
    targetUuid: unowned.uuid, targetName: unowned.name, directed: true, choice: 3,
    overrides: [...TARGET_WARNINGS, "level"], confirmed: true
  }, useId).then(value => ({ value }), error => ({ error }));
  const applyRequest = await waitForRelayRequest();
  assert.equal(unowned.effects.size, 0, "the player's client does not write an unowned target directly");
  assert.ok(vanguardUses.receipt(bearer, useId), "the source receipt preserves the requested operation for relay");
  assert.equal(vanguardUses.receipt(bearer, useId).reaction?.spent, true, "the Directed Engagement Reaction is recorded");
  await unowned.update({ "system.attributes.movement.fly": 20 });

  game.user = gm;
  unowned.isOwner = true;
  try { await vanguardUses.handleRelay(applyRequest, {}, player.id); }
  finally { game.user = player; unowned.isOwner = false; }
  Hooks.call("updateChatMessage", applyRequest);
  const applyOutcome = await applying;
  assert.ok(applyOutcome.value, `GM applies the requested receipt-backed effect: ${applyOutcome.error?.message ?? ""}`);
  assert.equal(unowned.effects.size, 1, "the active GM client applies the receipt-backed effect");
  assert.equal(unowned.system.attributes.movement.fly, 20,
    "the GM applies the recorded walking-speed benefit without overwriting a later fly-speed edit");
  await vanguardUses.command(bearer, "tipOfTheSpear", {
    targetUuid: unowned.uuid, targetName: unowned.name, directed: true, choice: 3,
    overrides: [...TARGET_WARNINGS, "level"], confirmed: true
  }, useId);
  assert.equal(unowned.effects.size, 1, "retrying the same relayed operation does not duplicate its effect");
  assert.equal(unowned.system.attributes.movement.fly, 20, "the duplicate operation preserves the unrelated movement edit");

  const undoing = vanguardUses.command(bearer, "undoUse", { useId }, `${useId}-undo`).then(value => ({ value }), error => ({ error }));
  const revertRequest = await waitForRelayRequest();
  game.user = gm;
  unowned.isOwner = true;
  try { await vanguardUses.handleRelay(revertRequest, {}, player.id); }
  finally { game.user = player; unowned.isOwner = false; }
  Hooks.call("updateChatMessage", revertRequest);
  const undoOutcome = await undoing;
  assert.ok(undoOutcome.value, `GM applies the owner's undo request: ${undoOutcome.error?.message ?? ""}`);
  assert.equal(unowned.effects.size, 0, "undo removes the relayed change from the target");
  assert.equal(unowned.system.attributes.movement.fly, 20, "undo preserves the unrelated fly-speed edit");
  assert.equal(getReactions(bearer).available, 1, "undo restores the source Reaction as well as the target change");
});
