import test from "node:test";
import assert from "node:assert/strict";
import { fixture, world, setup } from "./defender-fixture.mjs";
import { previewDefenderSetup, applyDefenderSetup, registerSetupPlanner, reconcileManagedEffect, planActivity, MANAGED_EFFECT_FLAG } from "../scripts/defender-setup.mjs";
import { registerDefenderHooks } from "../scripts/defender-features.mjs";

test("a Defender that is not yet configured previews enabling, and level 13 also previews Reactive", () => {
  world(); registerDefenderHooks();
  const actor = fixture({ level: 13, enabled: false });
  const plan = previewDefenderSetup(actor);
  assert.equal(plan.enable, true);
  assert.equal(plan.reactionMax, 2);
  assert.equal(plan.empty, false);
  assert.deepEqual(plan.blocked, []);
  assert.ok(plan.warnings.some(w => /No Defender Branch/.test(w)));
  assert.equal(previewDefenderSetup(fixture({ level: 5, enabled: false })).reactionMax, null);
});

test("preview never writes", () => {
  world(); registerDefenderHooks();
  const actor = fixture({ level: 13, enabled: false });
  previewDefenderSetup(actor);
  assert.equal(actor.writes.length, 0);
});

test("non-Defenders, multiclass characters and unsupported branches are blocked", () => {
  world(); registerDefenderHooks();
  const none = fixture(); none.items.clear();
  assert.ok(previewDefenderSetup(none).blocked.includes("NotDefender"));
  const multi = fixture(); multi.items.set("c2", { id: "c2", type: "class", system: { levels: 1 }, flags: { ak5e: { chapterThreeId: "class-caster" } }, getFlag() { return "class-caster"; } });
  assert.ok(previewDefenderSetup(multi).blocked.includes("MultipleClasses"));
});

test("apply needs confirmation and a matching, fresh preview", async () => {
  world(); registerDefenderHooks();
  const actor = setup(fixture({ level: 13, enabled: false }));
  const plan = previewDefenderSetup(actor);
  await assert.rejects(applyDefenderSetup(actor, { confirmed: false, contextKey: plan.contextKey }), /Confirm/);
  await assert.rejects(applyDefenderSetup(actor, { confirmed: true, contextKey: "stale" }), /preview the setup again/);
  assert.equal(actor.writes.length, 0, "rejections write nothing");
  await assert.rejects(applyDefenderSetup({ ...actor, isOwner: false }, { confirmed: true, contextKey: plan.contextKey }), /owned character/);
});

test("apply enables, sets Reactive, is idempotent, and a replayed operation ID changes nothing", async () => {
  world(); registerDefenderHooks();
  const actor = setup(fixture({ level: 13, enabled: false }));
  const plan = previewDefenderSetup(actor);
  const result = await applyDefenderSetup(actor, { confirmed: true, contextKey: plan.contextKey, operationId: "setup1" });
  assert.equal(actor.flags.ak5e.defender.enabled, true);
  assert.equal(actor.flags.ak5e.reactionBudget.max, 2);
  assert.equal(result.reactionMax, 2);
  const writes = actor.writes.length;
  assert.deepEqual(await applyDefenderSetup(actor, { confirmed: true, contextKey: plan.contextKey, operationId: "setup1" }), result);
  assert.equal(actor.writes.length, writes);
  assert.equal(previewDefenderSetup(actor).empty, true, "a second preview has nothing to do");
});

test("planned managed effects and activities are created once and authored data is preserved", async () => {
  world(); registerDefenderHooks();
  const desired = { sourceId: "test-managed", name: "Managed", changes: [{ key: "system.bonuses.mwak.damage", mode: 2, value: "@prof", priority: 20 }] };
  const activity = { _id: "ak5eTestActivity1", type: "utility", name: "Test" };
  const feature = { id: "feat", name: "Feature", system: { activities: new Map() }, flags: { ak5e: { chapterThreeId: "feature-x" } },
    getFlag(s, k) { return this.flags?.[s]?.[k]; }, async update(changes) { for (const [k, v] of Object.entries(changes)) this.system.activities.set(k.split(".").pop(), v); } };
  registerSetupPlanner((actor, _profile, plan) => { reconcileManagedEffect(actor, desired, plan); planActivity(actor, "feature-x", activity, plan); });
  const actor = setup(fixture({ level: 5, enabled: false }));
  actor.items.set("feat", feature);
  actor.items.get = id => actor.items.constructor.prototype.get.call(actor.items, id);
  let plan = previewDefenderSetup(actor);
  assert.equal(plan.createEffects.length, 1);
  assert.equal(plan.addActivities.length, 1);
  await applyDefenderSetup(actor, { confirmed: true, contextKey: plan.contextKey, operationId: "s1" });
  assert.equal(actor.effects.size, 1);
  assert.ok(feature.system.activities.has("ak5eTestActivity1"));
  plan = previewDefenderSetup(actor);
  assert.equal(plan.empty, true, "idempotent");
  // An authored edit to the effect is kept and flagged, not overwritten.
  const effect = [...actor.effects.values()][0];
  effect.changes = [{ key: "system.bonuses.mwak.damage", mode: 2, value: "99", priority: 20 }];
  desired.changes = [{ key: "system.bonuses.mwak.damage", mode: 2, value: "@prof + 1", priority: 20 }];
  plan = previewDefenderSetup(actor);
  assert.equal(plan.updateEffects.length, 0);
  assert.ok(plan.warnings.some(w => /beyond its managed baseline/.test(w)));
  // An edited activity wins over the managed one.
  feature.system.activities.set("ak5eTestActivity1", { ...activity, name: "Edited" });
  assert.equal(previewDefenderSetup(actor).addActivities.length, 0);
  assert.equal(MANAGED_EFFECT_FLAG, "defenderManagedEffect");
});
