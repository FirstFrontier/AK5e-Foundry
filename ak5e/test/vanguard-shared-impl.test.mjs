import test from "node:test";
import assert from "node:assert/strict";
import { vanguardUses } from "../scripts/vanguard-uses.mjs";
import { VANGUARD_CLASS_ID } from "../scripts/vanguard-rules.mjs";
import { registerVanguardExtension, registerVanguardTipGrantSource, getVanguardTipGrantSource, vanguardAttackActionBonus } from "../scripts/vanguard-extensions.mjs";
import { refreshPlayUseCards, registerPlayUseCardRefresh } from "../scripts/play-uses-sheet.mjs";
import { registerVanguardSheetHooks, refreshVanguardCards } from "../scripts/vanguard-sheet.mjs";
import { registerVanguardBenefitHooks } from "../scripts/vanguard-benefits.mjs";
import { skillDefinition, operatorState, learnedSkills } from "../scripts/operator-rules.mjs";
import { setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem } from "./base-classes-fixture.mjs";

test.beforeEach(() => setupFoundryGlobals());
test.afterEach(() => teardownFoundryGlobals());

const WARNINGS = ["range", "range-unverified", "visibility-unverified", "alliance-unverified"];
function vanguard() {
  const cls = createTestItem({ name: "Vanguard", type: "class", system: { levels: 5 }, flags: { ak5e: { chapterThreeId: VANGUARD_CLASS_ID } } });
  const tipFeature = createTestItem({ name: "1st Level: Tip of the Spear", type: "feat", flags: { ak5e: { chapterThreeId: "class-feature-vanguard-1st-level-tip-of-the-spear-3092" } } });
  return createTestActor({ name: "Vanguard", items: [cls, tipFeature], system: { attributes: { prof: 3, hp: { value: 20, max: 20, temp: 0 } } }, flags: { ak5e: { vanguard: { enabled: true } } } });
}
const ally = name => createTestActor({ name, system: { attributes: { hp: { value: 20, max: 20, temp: 0 }, movement: { walk: 30 } } } });
const tip = (actor, target, id, grant = {}) => vanguardUses.command(actor, "tipOfTheSpear",
  { targetUuid: target.uuid, targetName: target.name, overrides: WARNINGS, confirmed: true, ...grant }, id);

test("Tip grant sources: unregistered, invalid and duplicate grants are rejected; undo releases; plain Tip unchanged", async () => {
  const actor = vanguard(), target = ally("Ally");
  let valid = true;
  registerVanguardTipGrantSource("impl-test", (_actor, eventId, index) => valid && eventId === "evt" && index <= 2 ? true : { ok: false, reason: "no such grant" });
  assert.equal(typeof getVanguardTipGrantSource("impl-test"), "function");
  await assert.rejects(() => tip(actor, target, "t-unreg", { grantKind: "never-registered", sourceEventId: "evt", grantIndex: 1 }), /not registered/);
  await assert.rejects(() => tip(actor, target, "t-bad", { grantKind: "impl-test", sourceEventId: "other", grantIndex: 1 }), /no such grant/);
  await assert.rejects(() => tip(actor, target, "t-noidx", { grantKind: "impl-test", sourceEventId: "evt" }), /grant index/);
  assert.equal(vanguardUses.uses(actor).length, 0, "rejections write no receipt");
  await tip(actor, target, "t-1", { grantKind: "impl-test", sourceEventId: "evt", grantIndex: 1 });
  await assert.rejects(() => tip(actor, target, "t-1b", { grantKind: "impl-test", sourceEventId: "evt", grantIndex: 1 }), /already used/);
  await tip(actor, target, "t-2", { grantKind: "impl-test", sourceEventId: "evt", grantIndex: 2 });
  await vanguardUses.command(actor, "undoUse", { useId: "t-1" });
  await tip(actor, target, "t-1c", { grantKind: "impl-test", sourceEventId: "evt", grantIndex: 1 });
  // Resolving the Roll of a live granted Tip does not re-judge the grant.
  valid = false;
  await assert.doesNotReject(() => vanguardUses.command(actor, "useRoll", { useId: "t-2" }));
  // Same operation ID replays idempotently.
  await tip(actor, target, "t-2", { grantKind: "impl-test", sourceEventId: "evt", grantIndex: 2 });
  // No grant source: ordinary use, any number of times.
  await tip(actor, target, "plain-1"); await tip(actor, target, "plain-2");
});

test("attack action bonus hook sums valid extension contributions only", () => {
  const actor = vanguard();
  assert.equal(vanguardAttackActionBonus(actor, { branchId: "x", level: 5 }), 0);
  registerVanguardExtension("impl-a", { attackActionBonus: ctx => ctx.level >= 3 ? 1 : 0 });
  registerVanguardExtension("impl-b", { attackActionBonus: () => "nope" });
  registerVanguardExtension("impl-c", { attackActionBonus: () => { throw new Error("boom"); } });
  registerVanguardExtension("impl-d", { attackActionBonus: () => -2 });
  const seen = console.error; console.error = () => {};
  try { assert.equal(vanguardAttackActionBonus(actor, { branchId: "x", level: 5 }), 1); assert.equal(vanguardAttackActionBonus(actor, { level: 1 }), 0); }
  finally { console.error = seen; }
});

test("ignoreCharging Skills add no charging rate but still set SP cost", () => {
  const base = { cost: 10, start: 0, methods: ["automatic", "offensive"], duration: "Instant", activation: "Action" };
  assert.equal(skillDefinition(base).ignoreCharging, undefined);
  assert.equal(skillDefinition({ ...base, ignoreCharging: "yes" }).ignoreCharging, undefined);
  const plain = skillDefinition(base), ignored = skillDefinition({ ...base, cost: 20, ignoreCharging: true });
  const state = operatorState({ enabled: true }, [plain, ignored]);
  assert.equal(state.maximum, 20);
  assert.deepEqual(state.counts, { automatic: 1, offensive: 1, defensive: 0 });
  assert.deepEqual(state.rates, { automatic: 2, offensive: 1, defensive: 0 });
  const item = createTestItem({ name: "Elite", type: "feat", flags: { ak5e: { operatorSkill: base, operatorSkillChoice: { key: "k", sourceId: "s", ignoreCharging: true } } } });
  assert.equal(learnedSkills([item])[0].ignoreCharging, true);
});

test("card refresh: updateActor on the receipt flag re-renders that Actor's displayed cards; sheet hooks refresh once", async () => {
  const updated = [];
  globalThis.ui.chat = { updateMessage: message => { updated.push(message.id); } };
  const msg = (id, actorUuid) => ({ id, flags: { ak5e: { vanguardUsesUse: { actorUuid, useId: `u-${id}` } } }, getFlag(_s, k) { return this.flags.ak5e[k]; } });
  game.messages.push(msg("m1", "Actor.a"), msg("m2", "Actor.b"));
  assert.equal(refreshPlayUseCards(vanguardUses, { actorUuid: "Actor.a" }), 1);
  assert.deepEqual(updated, ["m1"]);
  updated.length = 0;
  assert.equal(registerPlayUseCardRefresh(vanguardUses), true);
  assert.equal(registerPlayUseCardRefresh(vanguardUses), false);
  const handlers = Hooks._hooks.get("updateActor") ?? [];
  assert.equal(handlers.length, 1);
  handlers[0]({ uuid: "Actor.b" }, { flags: { ak5e: { vanguardUses: { undo: [] } } } });
  handlers[0]({ uuid: "Actor.b" }, { name: "unrelated" });
  assert.deepEqual(updated, ["m2"]);
  updated.length = 0;
  assert.equal(refreshVanguardCards(), 2);
  registerVanguardSheetHooks();
  assert.equal((Hooks._hooks.get("updateActor") ?? []).length, 1, "registering the sheet hooks does not duplicate the receipt refresh");
});

test("benefit engine cards get the shared render hook", () => {
  registerVanguardBenefitHooks();
  assert.equal((Hooks._hooks.get("renderChatMessageHTML") ?? []).length, 1);
});
