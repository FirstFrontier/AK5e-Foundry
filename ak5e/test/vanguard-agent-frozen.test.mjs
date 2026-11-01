import test from "node:test";
import assert from "node:assert/strict";
import { vanguardExtensionContext, vanguardOwnerControls, vanguardProgressionContributions } from "../scripts/vanguard-extensions.mjs";
import { vanguardUses } from "../scripts/vanguard-uses.mjs";
import { emitAk5eEvent } from "../scripts/trigger-events.mjs";
import { setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem, triggerShortRest, triggerLongRest } from "./base-classes-fixture.mjs";

// Frozen Agent integration contract: agent-features.mjs registers rules hooks and
// agent-sheet.mjs registers branch progression/owner controls into V0's shared
// Vanguard extension registry. Tests observe only that public registry/sheet edge.
// `prepare()` exposes Expertise as `{ expertiseChoice: { count, options } }`;
// Agent commands register their plans through vanguardUses.register().
async function loadAgentModules() {
  try {
    const [features, sheet] = await Promise.all([
      import("../scripts/agent-features.mjs"),
      import("../scripts/agent-sheet.mjs")
    ]);
    return { features, sheet };
  } catch (error) {
    return { loadError: error };
  }
}

function agentActor(level = 1, extraItems = []) {
  const cls = createTestItem({ name: "Vanguard", type: "class", system: { levels: level },
    flags: { ak5e: { chapterThreeId: "class-vanguard" } } });
  const branch = createTestItem({ name: "Agent", type: "subclass", system: { levels: 1 },
    flags: { ak5e: { chapterThreeId: "subclass-vanguard-agent" } } });
  return createTestActor({ name: "Agent", items: [cls, branch, ...extraItems], system: {
    attributes: { prof: Math.floor((level - 1) / 4) + 2, movement: { walk: 30 }, hp: { value: 30, max: 30, temp: 0 } },
    skills: { ste: { value: 1 }, sle: { value: 1 }, acr: { value: 0 } }
  }, flags: { ak5e: { vanguard: { enabled: true } } } });
}

function agentWeapon(actor, name, { ranged = false, thrown = false } = {}) {
  const item = createTestItem({ name, type: "weapon", system: {
    actionType: ranged ? "rwak" : "mwak", type: { value: ranged ? "simpleR" : "simpleM" },
    properties: new Set(thrown ? ["thr"] : []), range: { value: ranged ? 20 : 5, long: ranged ? 60 : 5 }
  } }, actor);
  actor.items.set(item.id, item);
  return item;
}

async function agentRuntime(level = 1) {
  const api = await loadAgentModules();
  assert.ok(!api.loadError, `Agent behavior/API missing: ${api.loadError?.code ?? api.loadError?.message}`);
  api.features.registerAgentFeatureHooks();
  api.sheet.registerAgentVanguardExtension();
  const actor = agentActor(level);
  const context = vanguardExtensionContext(actor, { branchId: "subclass-vanguard-agent", level, purpose: "controls" });
  return { actor, context, controls: vanguardOwnerControls(context) };
}

function descriptorFor(controls, pattern) {
  const descriptor = controls.find(control => pattern.test(`${control.label ?? ""} ${control.hint ?? ""}`));
  assert.ok(descriptor, `owner workflow exposes a control matching ${pattern}`);
  assert.equal(typeof descriptor.command, "string", "actionable control routes through the shared use engine");
  assert.equal(typeof descriptor.prepare, "function", "control gathers current per-use choices before confirmation");
  return descriptor;
}

// This frozen public state contract keeps feature results inspectable and undoable
// without requiring tests to bind to a specific rules-helper implementation.
function agentState(actor) {
  assert.ok(actor.flags.ak5e.agent, "Agent feature state is persisted on the Actor");
  return actor.flags.ak5e.agent;
}

async function prepareUse(descriptor, context, choices = {}) {
  const prepared = await descriptor.prepare(context);
  assert.ok(prepared && typeof prepared === "object", `${descriptor.label} produced command-ready owner choices`);
  return { ...prepared, ...choices };
}

async function emitWeaponHit(actor, item, target, eventKey) {
  const snapshot = { uuid: target.uuid, name: target.name, ac: 10, hit: true };
  const attackId = `agent-test:${eventKey}`;
  const common = { attackId, actorUuid: actor.uuid, itemUuid: item.uuid, targets: [snapshot], targetUuids: [target.uuid] };
  await emitAk5eEvent("attack", { ...common, eventId: `attack:${eventKey}` });
  await emitAk5eEvent("hit", { ...common, eventId: `hit:${eventKey}:${target.uuid}`, targetUuid: target.uuid, ac: snapshot.ac });
}

test.beforeEach(() => setupFoundryGlobals());
test.afterEach(() => teardownFoundryGlobals());

test("Agent registration exposes its level-gated owner workflow through the shared Vanguard registry", async () => {
  const api = await loadAgentModules();
  assert.ok(!api.loadError, `Agent behavior/API missing: ${api.loadError?.code ?? api.loadError?.message}`);
  assert.equal(typeof api.features.registerAgentFeatureHooks, "function", "Agent rules hooks register with the shared feature lifecycle");
  assert.equal(typeof api.sheet.registerAgentVanguardExtension, "function", "Agent branch registers through the shared V0 extension registry");
  api.features.registerAgentFeatureHooks();
  api.sheet.registerAgentVanguardExtension();

  for (const [level, expected] of [
    [1, ["Strike from the Shadows", "Secret Agent"]],
    [3, ["Strike from the Shadows", "Secret Agent"]],
    [4, ["Strike from the Shadows", "Secret Agent", "Surgical Strike"]],
    [9, ["Strike from the Shadows", "Secret Agent", "Surgical Strike"]],
    [10, ["Strike from the Shadows", "Secret Agent", "Surgical Strike", "Closing the Case"]],
    [13, ["Strike from the Shadows", "Secret Agent", "Surgical Strike", "Closing the Case", "Consummate Professional"]],
    [17, ["Strike from the Shadows", "Secret Agent", "Surgical Strike", "Closing the Case", "Consummate Professional", "Smoke and Mirrors"]]
  ]) {
    const authoredKit = level >= 13 ? createTestItem({ name: "Mechanism Kit", type: "tool", system: { uses: { value: 3, max: 3 } },
      flags: { ak5e: { authoredByTable: true } } }) : null;
    const actor = agentActor(level, authoredKit ? [authoredKit] : []);
    const context = vanguardExtensionContext(actor, { branchId: "subclass-vanguard-agent", level, purpose: "controls" });
    const controls = vanguardOwnerControls(context);
    const labels = controls.map(control => `${control.label ?? ""} ${control.hint ?? ""}`).join(" ");
    for (const feature of expected) assert.ok(labels.toLowerCase().includes(feature.toLowerCase()), `${feature} is available at Agent level ${level}`);
    const contributions = vanguardProgressionContributions({ ...context, purpose: "plan" });
    assert.ok(contributions.length > 0, `Agent progression contributes to the shared plan at level ${level}`);
    if (level >= 13) {
      const contributionText = JSON.stringify(contributions).toLowerCase();
      assert.match(contributionText, /mechanism kit/, "Consummate Professional contributes proficiency/access through progression");
      assert.deepEqual(contributions.find(entry => entry.proficiencies?.tools)?.proficiencies.tools, [{ key: "ak5emechanismkit", minimum: 1 }],
        "B-309: the registered Mechanism Kit tool key is granted, not a bare 'mechanism' key");
      assert.match(contributionText, /unlimited|always considered|virtual/, "progression grants unlimited virtual kit access");
      const embeddedKit = actor.items.get(authoredKit.id);
      assert.ok(embeddedKit, "the authored Mechanism Kit remains embedded on the Actor");
      assert.deepEqual(embeddedKit.system.uses, { value: 3, max: 3 }, "virtual access preserves the physical kit's authored charges");
      assert.equal(embeddedKit.flags.ak5e.authoredByTable, true, "progression preserves the item's authored table flag");
    }
  }
});

test("Secret Agent Expertise lists proficient Skills first and preserves unrelated authored Skill data", async () => {
  const { actor, context, controls } = await agentRuntime(1);
  actor.system.skills.ste = { value: 1, ability: "wis", bonus: 7, custom: "authored-stealth" };
  actor.system.skills.sle = { value: 1, ability: "dex", bonus: 5, custom: "authored-sleight" };
  actor.system.skills.acr = { value: 0, ability: "dex", bonus: 0, custom: "authored-acrobatics" };
  const expertise = descriptorFor(controls, /Expertise/i);
  const prepared = await prepareUse(expertise, context);
  const expertiseOptions = prepared.expertiseChoice?.options ?? [];
  assert.equal(prepared.expertiseChoice?.count, 1, "the setup grants exactly one Expertise choice");
  assert.deepEqual(new Set(expertiseOptions.slice(0, 2).map(option => option.skillId ?? option)), new Set(["ste", "sle"]),
    "Stealth and Sleight of Hand are listed first because they are proficient");
  assert.equal(expertiseOptions.length, 3, "every Skill is listed (BUG B-309: prerequisites warn, they do not block)");
  assert.equal(expertiseOptions[2].skillId, "acr", "the non-proficient Skill follows the proficient ones");
  await vanguardUses.command(actor, expertise.command, { ...prepared, skillId: "ste", confirmed: true }, "agent-expertise-stealth");
  assert.equal(actor.system.skills.ste.value, 2, "the selected proficient Skill gains Expertise");
  assert.equal(actor.system.skills.ste.ability, "wis", "the authored ability mapping is preserved");
  assert.equal(actor.system.skills.ste.bonus, 7, "the authored bonus is preserved");
  assert.equal(actor.system.skills.ste.custom, "authored-stealth", "other authored Skill data is preserved");
  assert.deepEqual(actor.system.skills.sle, { value: 1, ability: "dex", bonus: 5, custom: "authored-sleight" },
    "the unselected proficient Skill is unchanged");
  assert.deepEqual(actor.system.skills.acr, { value: 0, ability: "dex", bonus: 0, custom: "authored-acrobatics" },
    "the non-proficient Skill remains unchanged");

  const invalidRuntime = await agentRuntime(1);
  invalidRuntime.actor.system.skills.acr = { value: 0, ability: "dex", bonus: 0 };
  const invalidExpertise = descriptorFor(invalidRuntime.controls, /Expertise/i);
  const invalidPrepared = await prepareUse(invalidExpertise, invalidRuntime.context);
  const invalidPreview = vanguardUses.preview(invalidRuntime.actor, invalidExpertise.command,
    { ...invalidPrepared, skillId: "acr" });
  assert.ok(invalidPreview.warnings.length, "an unproficient Expertise selection is warned");
  await assert.rejects(() => vanguardUses.command(invalidRuntime.actor, invalidExpertise.command,
    { ...invalidPrepared, skillId: "acr", confirmed: true }, "agent-expertise-untrained"), /proficient|expertise|skill|warning/i);
  assert.equal(invalidRuntime.actor.system.skills.acr.value, 0, "an un-overridden warning makes no Actor change");
  assert.equal(vanguardUses.receipt(invalidRuntime.actor, "agent-expertise-untrained"), null);
  await vanguardUses.command(invalidRuntime.actor, invalidExpertise.command,
    { ...invalidPrepared, skillId: "acr", confirmed: true, overrides: invalidPreview.warnings.map(warning => warning.id) }, "agent-expertise-untrained-overridden");
  assert.equal(invalidRuntime.actor.system.skills.acr.value, 2, "trust the table: an overridden warning applies Expertise");
  assert.ok(vanguardUses.receipt(invalidRuntime.actor, "agent-expertise-untrained-overridden"), "the overridden use is receipted and undoable");
});

test("Fade is owner-operated, offers darkness and unresolved expiry readings, and spends the shared PB pool only on confirmed use", async () => {
  const { actor, context, controls } = await agentRuntime(5);
  actor.system.attributes.prof = 4; // Shared Actor PB may differ from this Vanguard's own progression.
  game.user = { id: "agent-player", isGM: false, targets: new Set() };
  // Deliberately out of the Agent's turn: owner actions are never GM-approval or turn gated.
  game.combat = { started: true, round: 2, turn: 0, combatant: { actor: createTestActor({ name: "Other turn" }) } };
  const fade = descriptorFor(controls, /Fade/i);
  const before = structuredClone(agentState(actor));
  const setup = await prepareUse(fade, context);
  const choiceText = JSON.stringify(setup).toLowerCase();
  assert.match(choiceText, /darkness/, "the no-cost Darkness condition is an explicit per-use choice");
  assert.match(choiceText, /turn|expire|expiry/, "unresolved Fade expiry timing remains a public per-use choice");
  assert.match(choiceText, /proficiency bonus|long rest|uses/, "Fade's shared Actor PB uses recover on a Long Rest");
  assert.deepEqual(agentState(actor), before, "preparing Fade changes no resources or conditions");
  const cancelPreview = vanguardUses.preview(actor, fade.command, setup);
  assert.ok(cancelPreview, "the cancel path can inspect a Fade use without writing it");
  await assert.rejects(() => vanguardUses.command(actor, fade.command, { ...setup, confirmed: false }, "agent-fade-cancelled"),
    /confirm|cancel/i);
  assert.deepEqual(agentState(actor), before, "cancel before confirmation spends no use and grants no condition");
  assert.equal(vanguardUses.receipt(actor, "agent-fade-cancelled"), null, "cancel before confirmation creates no receipt");

  await vanguardUses.command(actor, fade.command, { ...setup, inDarkness: true, confirmed: true }, "agent-fade-dark-free");
  assert.equal(agentState(actor).fade.usesSpent, 0, "Fade in Darkness applies without consuming a PB use");
  assert.equal(agentState(actor).fade.active, true, "confirmed Fade grants Invisible");
  assert.equal(vanguardUses.receipt(actor, "agent-fade-dark-free").status, "complete");

  const first = await prepareUse(fade, context, { inDarkness: false });
  const firstPreview = vanguardUses.preview(actor, fade.command, first);
  assert.ok(firstPreview.costs.some(cost => Number(cost.amount) === 1), "ordinary Fade preview shows exactly one use cost");
  await vanguardUses.command(actor, fade.command, { ...first, confirmed: true }, "agent-fade-confirmed");
  assert.equal(agentState(actor).fade.usesSpent, 1, "confirmation spends one of the Actor's shared PB uses");
  assert.equal(agentState(actor).fade.active, true);
  assert.doesNotMatch(JSON.stringify(vanguardUses.receipt(actor, "agent-fade-confirmed")), /\b\d+d\d+\b/i,
    "Fade has no automatically rolled feature die");
  await emitAk5eEvent("attack", { eventId: "fade-early-attack", attackId: "fade-early-attack",
    actorUuid: actor.uuid, targets: [], targetUuids: [] });
  assert.equal(agentState(actor).fade.active, false, "Fade ends early after this Agent makes an Attack Roll");

  for (let index = 2; index <= 4; index++) {
    const prepared = await prepareUse(fade, context, { inDarkness: false });
    await vanguardUses.command(actor, fade.command, { ...prepared, confirmed: true }, `agent-fade-${index}`);
  }
  assert.equal(agentState(actor).fade.usesSpent, 4, "Fade use count follows shared Actor PB, not Vanguard-only progression");
  const fourth = await prepareUse(fade, context, { inDarkness: false });
  const exhausted = vanguardUses.preview(actor, fade.command, fourth);
  assert.ok(exhausted.warnings.length, "attempting beyond PB is warned before confirmation");
  const exhaustionOverrides = exhausted.warnings.map(warning => warning.id).filter(Boolean);
  await vanguardUses.command(actor, fade.command, { ...fourth, overrides: exhaustionOverrides, confirmed: true }, "agent-fade-over-pb");
  assert.ok(vanguardUses.receipt(actor, "agent-fade-over-pb")?.overridden?.length,
    "the owner may explicitly override the exhaustion warning and gets a receipt");
  assert.equal(agentState(actor).fade.usesSpent, 4, "an exhausted Fade attempt cannot spend below zero or overdraw");
  assert.equal(vanguardUses.receipt(actor, "agent-fade-over-pb").resources?.[0]?.after, 0,
    "the override records a resource clamped at zero");
  await triggerLongRest(actor);
  assert.equal(agentState(actor).fade.usesSpent, 0, "a Long Rest recovers all shared Fade uses");

  // trigger-events emits only the saving Creature's actorUuid on `save`; it has no
  // source attribution for the Agent that forced the save, so this edge is not
  // fabricated here. It remains an explicit adapter/spec integration gap.
});

test("Agent combat benefits correlate source and target events, keep unresolved readings public, and do not roll feature dice automatically", async () => {
  const { actor, controls } = await agentRuntime(14);
  game.user = { id: "agent-player", isGM: false, targets: new Set() };
  const targetA = createTestActor({ name: "Chosen target" });
  const targetB = createTestActor({ name: "Unrelated target" });
  const attack = descriptorFor(controls, /Closing the Case/i);
  const smoke = descriptorFor(controls, /Smoke and Mirrors/i);
  const surgical = descriptorFor(controls, /Surgical Strike|Pay it Forward|Second Strike/i);
  const professional = controls.find(control => /Consummate Professional|Mechanism Kit/i.test(`${control.label ?? ""} ${control.hint ?? ""}`));
  assert.ok(professional, "level 13+ Mechanism Kit guidance is present");
  const strike = controls.find(control => /Strike from the Shadows/i.test(`${control.label ?? ""} ${control.hint ?? ""}`));
  assert.ok(strike, "level 1 Strike from the Shadows guidance is available");
  const thrownWeapon = agentWeapon(actor, "Thrown Knife", { ranged: true, thrown: true });
  const meleeWeapon = agentWeapon(actor, "Melee Sword");
  const rollCalls = [];
  const OriginalRoll = globalThis.Roll;
  globalThis.Roll = class extends OriginalRoll {
    constructor(formula, ...args) { rollCalls.push({ formula, phase: "construct" }); super(formula, ...args); }
    async evaluate(...args) { rollCalls.push({ formula: this.formula, phase: "evaluate" }); return super.evaluate(...args); }
  };
  try {
    // Match trigger-events.mjs: attack has actor/item UUIDs and target snapshots;
    // hit has actorUuid + targetUuid. No invented `invisible`, `attackAction`,
    // `ranged`, `thrown`, or `melee` event fields are sent.
    await emitWeaponHit(actor, thrownWeapon, targetA, "agent-a-first-hit");
    const otherSource = createTestActor({ name: "Other source" });
    const otherThrownWeapon = agentWeapon(otherSource, "Other Thrown Knife", { ranged: true, thrown: true });
    await emitWeaponHit(otherSource, otherThrownWeapon, targetA, "other-source-hit");
    assert.equal(otherSource.flags.ak5e.agent, undefined, "events from a non-Agent Actor do not create or inherit this Agent's state");
    await emitWeaponHit(actor, thrownWeapon, targetB, "agent-b-hit");
    assert.equal(rollCalls.length, 0, "observing qualifying hits never rolls attacks, damage, saves, or feature dice");
    // The real attack adapter does not expose an Attack Action marker or an
    // Invisible-at-action-start snapshot; Shadowstrike gating remains unasserted
    // until that information has a stable event/UI contract.
    assert.equal(agentState(actor).surgical.payItForwardAvailable, true,
      "a qualifying Agent ranged Thrown hit enables Pay it Forward");
    assert.equal(agentState(actor).surgical.secondStrike.pendingTargetUuid, targetA.uuid,
      "Second Strike is armed for the exact target of a qualifying thrown ranged hit");

    const payData = await prepareUse(surgical, vanguardExtensionContext(actor, { branchId: "subclass-vanguard-agent", level: 14,
      purpose: "controls", targetUuid: targetA.uuid }), { benefit: "payItForward", targetUuid: targetA.uuid });
    await vanguardUses.command(actor, surgical.command, { ...payData, confirmed: true }, "agent-pay-forward-1");
    assert.equal(agentState(actor).surgical.payItForwardUsedThisTurn, true, "movement allowance is recorded once this Turn");
    assert.equal(agentState(actor).surgical.payItForward.movementAllowanceFeet, 15,
      "Pay it Forward allows at most half this Agent's 30-foot Speed");
    assert.ok(vanguardUses.receipt(actor, "agent-pay-forward-1"), "Pay it Forward has an undoable use receipt");
    const repeatedPayData = await prepareUse(surgical, vanguardExtensionContext(actor, { branchId: "subclass-vanguard-agent", level: 14,
      purpose: "controls", targetUuid: targetA.uuid }), { benefit: "payItForward", targetUuid: targetA.uuid });
    const repeatedPayPreview = vanguardUses.preview(actor, surgical.command, repeatedPayData);
    assert.ok(repeatedPayPreview.warnings.length, "a second Pay it Forward attempt this Turn is warned");
    await assert.rejects(() => vanguardUses.command(actor, surgical.command, { ...repeatedPayData, confirmed: true }, "agent-pay-forward-2"),
      /turn|once|already|warning/i);

    await emitWeaponHit(actor, meleeWeapon, targetB, "second-strike-wrong-target");
    assert.equal(agentState(actor).surgical.secondStrike.pendingTargetUuid, targetA.uuid,
      "a melee hit against another Creature does not consume Second Strike");
    await emitWeaponHit(actor, meleeWeapon, targetA, "second-strike-right-target");
    assert.equal(agentState(actor).surgical.secondStrike.awaitingLevelChoice, true,
      "the matching melee hit asks for the unresolved Agent Level instead of silently choosing it");
    const secondStrikeData = await prepareUse(surgical, vanguardExtensionContext(actor, { branchId: "subclass-vanguard-agent", level: 14,
      purpose: "controls", targetUuid: targetA.uuid }), { benefit: "secondStrike", targetUuid: targetA.uuid, agentLevel: 14 });
    assert.match(JSON.stringify(secondStrikeData).toLowerCase(), /agent level|reading|choice|choose/,
      "Second Strike exposes Agent Level as a per-use player choice");
    await vanguardUses.command(actor, surgical.command, { ...secondStrikeData, confirmed: true }, "agent-second-strike");
    assert.equal(agentState(actor).surgical.secondStrike.lastApplied.targetUuid, targetA.uuid,
      "the next Melee Attack against the same target receives Second Strike");
    assert.equal(agentState(actor).surgical.secondStrike.lastApplied.agentLevelDamage, 14,
      "Second Strike applies the Agent Level selected for this use");
    assert.equal(agentState(actor).surgical.secondStrike.pendingTargetUuid, null, "Second Strike is consumed after that attack");
    await emitWeaponHit(actor, meleeWeapon, targetA, "second-strike-third-attack");
    assert.equal(agentState(actor).surgical.secondStrike.lastApplied.attackEventId, "attack:second-strike-right-target",
      "Second Strike adds its damage only once, not to later attacks");
    const strikeText = `${strike.label ?? ""} ${strike.hint ?? ""} ${JSON.stringify(strike)}`.toLowerCase();
    assert.match(strikeText, /invisible/, "Shadowstrike is conditional on being Invisible when the Attack Action begins");
    assert.match(strikeText, /additional attack|one additional|extra attack/, "the once-per-Action extra attack is guided");
    assert.match(strikeText, /tip of the spear|tip/, "each qualifying hit offers a free Tip procedure");
    assert.match(strikeText, /quicklaunch|draw.*thrown/, "Quicklaunch guides drawing a different Thrown weapon during the attack");
    const surgicalText = JSON.stringify(surgical).toLowerCase();
    assert.match(surgicalText, /once per turn/, "Pay it Forward is limited once per Turn");
    assert.match(surgicalText, /half.*speed/, "Pay it Forward caps movement at half Speed");
    assert.match(surgicalText, /ranged|thrown/, "Pay it Forward requires a qualifying ranged Thrown weapon hit");
    assert.match(surgicalText, /same target|that creature/, "Second Strike is tied to the next Melee Attack against the hit Creature");
    assert.match(surgicalText, /next melee|melee attack/, "Second Strike applies only to the next Melee Attack this Turn");
    assert.match(surgicalText, /agent level|reading|choose/, "the unresolved Agent Level damage is a public per-use choice");
    const professionalText = JSON.stringify(professional).toLowerCase();
    assert.match(professionalText, /mechanism kit/, "Consummate Professional grants Mechanism Kit proficiency");
    assert.match(professionalText, /unlimited|always considered|without.*kit/, "virtual kit access works without a physical kit and has unlimited charges");
    const caseContext = vanguardExtensionContext(actor, { branchId: "subclass-vanguard-agent", level: 14,
      purpose: "controls", targetUuid: targetA.uuid, targetVisible: true, targetDistanceFeet: 25 });
    game.user.targets = new Set([{ actor: targetB, uuid: targetB.uuid }]); // Deliberately stale/current target mismatch.
    const caseSetup = await prepareUse(attack, caseContext);
    const setupText = JSON.stringify(caseSetup).toLowerCase();
    assert.match(setupText, /30/, "Closing the Case presents the 30-foot target boundary");
    assert.match(setupText, /visible|sight|see/, "target visibility is checked or shown as an overridable warning");
    assert.match(setupText, /shadowstrike/, "the once-this-Turn Shadowstrike prerequisite is shown");
    assert.match(setupText, /6d8/, "level 14 uses the doubled d8 damage expression for three qualifying hits");
    assert.match(setupText, /hit|count|attack/, "damage is based on this Turn's qualifying hit count");
    assert.match(setupText, /vanguard level/, "B-309: Closing the Case scales by the Vanguard level, not an editable Agent Level");
    assert.ok(!("agentLevel" in caseSetup), "Closing the Case offers no Agent Level field");
    assert.equal(caseSetup.targetUuid, targetA.uuid, "the selected owner target, not live current targets, is used");
    assert.equal(caseSetup.qualifyingHitCount, 3, "this Agent's three qualifying hits against A contribute; other-source A and this-Agent B are excluded");
    assert.equal(caseSetup.damageFormula, "6d8", "three qualifying hits at Agent level 14 are six d8");
    assert.ok(JSON.stringify(caseSetup).includes(targetA.uuid), "Closing the Case target choice comes from the owner-selected target");
    assert.ok(!JSON.stringify(caseSetup).includes("other-source-hit"), "another creature's hit is not attributed to this Agent");
    const badTargetPreview = vanguardUses.preview(actor, attack.command, { ...caseSetup, targetVisible: false, targetDistanceFeet: 31 });
    assert.ok(badTargetPreview.warnings.length >= 2, "invisible and beyond-30-foot targets are both surfaced as overridable warnings");
    assert.match(JSON.stringify(badTargetPreview.warnings).toLowerCase(), /visible|sight/);
    assert.match(JSON.stringify(badTargetPreview.warnings).toLowerCase(), /range|30/);
    const warningOverrides = badTargetPreview.warnings.map(warning => warning.id).filter(Boolean);
    const targetHpBeforeCase = targetA.system.attributes.hp.value;
    await vanguardUses.command(actor, attack.command, { ...caseSetup, targetVisible: false, targetDistanceFeet: 31,
      overrides: warningOverrides, confirmed: true }, "agent-closing-case");
    const caseReceipt = vanguardUses.receipt(actor, "agent-closing-case");
    assert.equal(caseReceipt.status, "awaitingRoll", "Closing the Case waits for the owner's explicit damage-roll click");
    assert.match(JSON.stringify(caseReceipt), /6d8/, "the public receipt/card shows six d8 for the three qualifying hits");
    assert.ok(caseReceipt.overridden?.length,
      "the shared receipt's overridden field records the warnings chosen on the use card");
    assert.equal(targetA.system.attributes.hp.value, targetHpBeforeCase, "Closing the Case does not apply damage before the card roll is clicked");
    assert.equal(rollCalls.length, 0, "preview and target selection still wait for an explicit card roll click");

    const noStrikeRuntime = await agentRuntime(14);
    const noStrikeCase = descriptorFor(noStrikeRuntime.controls, /Closing the Case/i);
    const noStrikeSetup = await prepareUse(noStrikeCase, vanguardExtensionContext(noStrikeRuntime.actor,
      { branchId: "subclass-vanguard-agent", level: 14, purpose: "controls", targetUuid: targetA.uuid,
        targetVisible: true, targetDistanceFeet: 20 }));
    const noStrikePreview = vanguardUses.preview(noStrikeRuntime.actor, noStrikeCase.command, noStrikeSetup);
    assert.match(JSON.stringify(noStrikePreview.warnings).toLowerCase(), /shadowstrike/,
      "Closing the Case is unavailable without Shadowstrike used this Turn");

    const lv10 = await agentRuntime(10);
    const lv14StateBeforeLv10Events = structuredClone(agentState(actor));
    const lv10Case = descriptorFor(lv10.controls, /Closing the Case/i);
    const meleeTarget = createTestActor({ name: "Melee-only target" });
    const lv10MeleeWeapon = agentWeapon(lv10.actor, "Level 10 Melee Sword");
    await emitWeaponHit(lv10.actor, lv10MeleeWeapon, meleeTarget, "agent-lv10-melee-hit");
    assert.deepEqual(agentState(actor), lv14StateBeforeLv10Events,
      "a separate Agent's event sequence cannot mutate the first Actor through persistent hook registration");
    const lv10Setup = await prepareUse(lv10Case, vanguardExtensionContext(lv10.actor,
      { branchId: "subclass-vanguard-agent", level: 10, purpose: "controls", targetUuid: meleeTarget.uuid,
        targetVisible: true, targetDistanceFeet: 10 }));
    assert.equal(lv10Setup.qualifyingHitCount, 1, "a qualifying Melee Weapon hit is included in Closing the Case");
    assert.equal(lv10Setup.damageFormula, "1d8", "before Agent level 14, each qualifying hit adds one d8");

    const smokeRuntime = await agentRuntime(17);
    const smokeActor = smokeRuntime.actor;
    const smoke = descriptorFor(smokeRuntime.controls, /Smoke and Mirrors/i);
    const smokeSetup = await smoke.prepare(vanguardExtensionContext(smokeActor, { branchId: "subclass-vanguard-agent", level: 17, purpose: "controls" }));
    const smokeText = JSON.stringify(smokeSetup).toLowerCase();
    assert.match(smokeText, /10/, "Smoke and Mirrors describes its 10-foot radius");
    assert.match(smokeText, /self|center|centre/, "the sphere is centered on the Agent");
    assert.match(smokeText, /turn|reaction|timing/, "the unresolved action or reaction timing remains a public choice");
    assert.match(smokeText, /short rest|shortrest|recover/, "Smoke and Mirrors records its once-per-Short-Rest use");
    assert.match(smokeText, /kill|0 hp|0 hit points/, "the sourced kill exemption is visible in the use flow");
    await vanguardUses.command(smokeActor, smoke.command, { ...smokeSetup, confirmed: true }, "agent-smoke-first");
    const smokeReceipt = vanguardUses.receipt(smokeActor, "agent-smoke-first");
    assert.ok(smokeReceipt, "confirmed Smoke and Mirrors use is undoable");
    assert.equal(agentState(smokeActor).smoke.usesSpent, 1, "ordinary activation spends its Short Rest use");
    assert.equal(agentState(smokeActor).smoke.active.radiusFeet, 10, "the applied magical sphere has a 10-foot radius");
    assert.equal(agentState(smokeActor).smoke.active.centerActorUuid, smokeActor.uuid, "the sphere is centered on the Agent");
    assert.equal(agentState(smokeActor).smoke.active.selfCanSee, true, "the Agent can see through their own magical Darkness");
    assert.equal(agentState(smokeActor).smoke.active.expiry, "startOfNextTurn", "the sphere expires at the start of the Agent's next Turn");
    assert.ok(vanguardUses.previewUndo(smokeActor, "agent-smoke-first"), "the public undo preview is available during the encounter window");
    const secondSmoke = await prepareUse(smoke, vanguardExtensionContext(smokeActor, { branchId: "subclass-vanguard-agent", level: 17, purpose: "controls" }));
    const secondPreview = vanguardUses.preview(smokeActor, smoke.command, secondSmoke);
    assert.ok(secondPreview.warnings.length || secondPreview.costs.length, "a second ordinary activation is unavailable until Short Rest");
    await assert.rejects(() => vanguardUses.command(smokeActor, smoke.command, { ...secondSmoke, confirmed: true }, "agent-smoke-second"),
      /rest|use|spent|unavailable|warning/i);
    const otherVictim = createTestActor({ name: "Other source's victim" });
    await emitAk5eEvent("kill", { eventId: "other-source-kill", actorUuid: otherVictim.uuid,
      sourceActorUuid: targetB.uuid });
    assert.equal(agentState(smokeActor).smoke.freeKillUseAvailable, false, "another source's kill does not grant this Agent an exemption");
    await assert.rejects(() => vanguardUses.command(smokeActor, smoke.command, { ...secondSmoke, confirmed: true }, "agent-smoke-other-kill"),
      /rest|use|spent|unavailable|warning/i);
    const agentVictim = createTestActor({ name: "Agent's victim" });
    await emitAk5eEvent("kill", { eventId: "agent-sourced-kill", actorUuid: agentVictim.uuid,
      sourceActorUuid: smokeActor.uuid });
    assert.equal(agentState(smokeActor).smoke.freeKillUseAvailable, true, "only a kill attributed to this Agent grants the exemption");
    const freeSmoke = await prepareUse(smoke, vanguardExtensionContext(smokeActor, { branchId: "subclass-vanguard-agent", level: 17, purpose: "controls" }));
    await vanguardUses.command(smokeActor, smoke.command, { ...freeSmoke, confirmed: true }, "agent-smoke-kill-exemption");
    assert.equal(agentState(smokeActor).smoke.usesSpent, 1, "the kill-exempt activation does not spend a Short Rest use");
    await vanguardUses.command(smokeActor, "undoUse", { useId: "agent-smoke-first", confirmed: true }, "agent-smoke-first-undo");
    assert.equal(vanguardUses.receipt(smokeActor, "agent-smoke-first").status, "undone", "the owner can undo Smoke and Mirrors before the window locks");
    assert.equal(rollCalls.length, 0, "Smoke and Mirrors creates no automatic attack or feature roll");
    await triggerShortRest(smokeActor);
    assert.equal(agentState(smokeActor).smoke.usesSpent, 0, "a Short Rest recovers the ordinary use");
    await emitAk5eEvent("turnStart", { eventId: "smoke-expiry-turn", actorUuid: smokeActor.uuid, combatUuid: "Combat.agent", round: 3, turn: 0 });
    assert.equal(agentState(smokeActor).smoke.active, null, "the sphere ends at the start of the Agent's next Turn");
  } finally {
    globalThis.Roll = OriginalRoll;
  }
});
