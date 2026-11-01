import test from "node:test";
import assert from "node:assert/strict";
import { inspectVanguardFields, previewVanguardProgression } from "../scripts/vanguard-progression.mjs";
import { getOperatorSkillChoices } from "../scripts/operator-progression.mjs";
import { CHAPTER_THREE_CLASSES } from "../scripts/chapter-three-content.mjs";
import { registerVanguardSheetHooks, vanguardSheetApi } from "../scripts/vanguard-sheet.mjs";
import { executeOperatorCommand } from "../scripts/operator-skills.mjs";
import { vanguardUses } from "../scripts/vanguard-uses.mjs";
import { setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem } from "./base-classes-fixture.mjs";

const agentProbe = { progression: [], controls: [], notifications: [], throwOnCommit: false, effects: new Map(), openCount: 0 };
const pioneerProbe = { actorUuid: null, replacementKey: null };

// Keep an absent baseline module inside the assertion path so an incomplete
// candidate reports the missing behavior, rather than a loader failure.
async function extensionApi() {
  try {
    return await import("../scripts/vanguard-extensions.mjs");
  } catch (error) {
    return { loadError: error };
  }
}

test("Vanguard branch registry collects read descriptors in order and dispatches each durable commit once", async () => {
  const api = await extensionApi();
  assert.ok(!api.loadError,
    `extension registry behavior missing: vanguard-extensions.mjs could not load (${api.loadError?.code ?? api.loadError?.message})`);

  for (const name of [
    "registerVanguardExtension",
    "vanguardProgressionContributions",
    "vanguardOwnerControls",
    "vanguardSkillSlots",
    "notifyVanguardOperatorCommit"
  ]) assert.equal(typeof api[name], "function", `${name} is required by the branch extension contract`);

  const actor = { id: "foundation-actor" };
  const context = Object.freeze({ actor, purpose: "render", marker: Symbol("identity") });
  const event = Object.freeze({ id: "operator-commit-104", activationId: "operator-activation-29", kind: "activation", spSpent: 10 });
  const notice = Object.freeze({ actor, actorUuid: "Actor.foundation-actor", branchId: "foundation-first", event,
    state: "present", reason: "commit", requestId: "request-foundation-1", initiatingUserId: "owner-1" });
  const calls = [];
  let acceptedCommitCount = 0;
  let duplicateHookCount = 0;
  let acceptedContributionCount = 0;

  const firstHooks = {
    progressionContribution(received) {
      if (received?.marker !== context.marker) return null;
      acceptedContributionCount++;
      assert.strictEqual(received, context);
      return { branchId: "foundation-first", level: 4 };
    },
    ownerControls(received) {
      if (received?.marker !== context.marker) return [];
      calls.push(["first-controls", received]);
      return [{ id: "first-owner-control" }];
    },
    skillSlots(received) {
      if (received?.marker !== context.marker) return [];
      calls.push(["first-slots", received]);
      return [{ id: "first-skill-slot" }];
    },
    onOperatorCommit(received) {
      if (received?.actor?.id !== actor.id) return;
      calls.push(["first-commit", received]);
    }
  };
  api.registerVanguardExtension("foundation-first", firstHooks);
  api.registerVanguardExtension("foundation-second", {
    progressionContribution(received) {
      if (received?.marker !== context.marker) return null;
      calls.push(["second-progression", received]);
      return null;
    },
    ownerControls(received) {
      if (received?.marker !== context.marker) return [];
      calls.push(["second-controls", received]);
      return [{ id: "second-owner-control" }];
    },
    skillSlots(received) {
      if (received?.marker !== context.marker) return [];
      calls.push(["second-slots", received]);
      return [{ id: "second-skill-slot" }];
    },
    onOperatorCommit(received) {
      if (received?.actor?.id !== actor.id) return;
      acceptedCommitCount++;
      calls.push(["second-commit", received]);
    }
  });
  // Re-registering the same branch cannot replace or duplicate its hooks.
  api.registerVanguardExtension("foundation-first", {
    progressionContribution() {
      duplicateHookCount++;
      return { branchId: "duplicate" };
    },
    ownerControls() {
      duplicateHookCount++;
      return [{ id: "duplicate-owner-control" }];
    },
    skillSlots() {
      duplicateHookCount++;
      return [{ id: "duplicate-skill-slot" }];
    },
    onOperatorCommit() {
      duplicateHookCount++;
    }
  });

  assert.equal(acceptedContributionCount, 0, "registration does not invoke callbacks");
  assert.equal(duplicateHookCount, 0, "duplicate registration does not invoke rejected callbacks");
  assert.deepEqual(api.vanguardProgressionContributions(context), [
    { branchId: "foundation-first", level: 4 }
  ], "contributions omit null and retain registration order");
  assert.deepEqual(api.vanguardOwnerControls(context), [
    { id: "first-owner-control" }, { id: "second-owner-control" }
  ]);
  assert.deepEqual(api.vanguardSkillSlots(context), [
    { id: "first-skill-slot" }, { id: "second-skill-slot" }
  ]);
  assert.equal(acceptedContributionCount, 1);
  assert.equal(duplicateHookCount, 0);
  assert.deepEqual(calls.map(([kind]) => kind), [
    "second-progression", "first-controls", "second-controls", "first-slots", "second-slots"
  ], "read collectors invoke only their matching hooks once and in registration order");
  for (const [, received] of calls) assert.strictEqual(received, context, "context identity is preserved");

  await api.notifyVanguardOperatorCommit(notice);
  assert.deepEqual(calls.slice(-2).map(([kind]) => kind), ["first-commit", "second-commit"]);
  for (const [, received] of calls.slice(-2)) assert.strictEqual(received, notice, "the full notification object is preserved");
  assert.equal(event.id, "operator-commit-104", "operator event carries its durable id");
  assert.equal(event.activationId, "operator-activation-29", "operator event carries its activation id");
  assert.equal(event.spSpent, 10, "notification event carries the committed SP amount");
  assert.equal(acceptedCommitCount, 1, "one notification reaches each registered branch once");
  assert.equal(duplicateHookCount, 0, "duplicate branch registration never dispatches");
});

test("Vanguard progression consumer supplies the documented read and plan contexts without mutating Actor documents", async () => {
  const api = await extensionApi();
  assert.ok(!api.loadError, `extension registry behavior missing: ${api.loadError?.code ?? api.loadError?.message}`);
  setupFoundryGlobals();
  try {
    const classItem = createTestItem({ name: "Vanguard", type: "class", system: { levels: 1 },
      flags: { ak5e: { chapterThreeId: "class-vanguard" } } });
    const actor = createTestActor({ items: [classItem], system: { details: { level: 1 } } });
    const selected = {
      branch: "subclass-vanguard-agent", martialDCAbility: "dex", saves: ["str"],
      skills: ["acr", "ath", "ste"], tool: "Messenger Kit",
      startingEquipment: { mode: "existing" }, hp: { 1: { mode: "fixed" } }
    };
    api.registerVanguardExtension(selected.branch, {
      progressionContribution(context) {
        if (context.branchId !== selected.branch) return null;
        agentProbe.progression.push(context);
        assert.strictEqual(context.actor, actor);
        assert.equal(context.actorUuid, actor.uuid);
        assert.equal(context.level, 1);
        assert.equal(context.purpose, "progression");
        assert.equal(Object.getPrototypeOf(context.profile), Object.prototype, "profile is plain data");
        if (context.phase === "fields") {
          assert.equal(context.basePlan, null);
          assert.ok(context.progressionState && typeof context.progressionState === "object");
        } else {
          assert.equal(context.phase, "plan");
          assert.ok(context.basePlan && typeof context.basePlan === "object");
        }
        assert.deepEqual(context.branchChoices, context.choices.branches?.[context.branchId] ?? {});
        return null;
      },
      ownerControls(context) {
        if (context.branchId !== selected.branch) return [];
        agentProbe.controls.push(context);
        return [{ id: "subclass-vanguard-agent:guide", label: "Guide <Vanguard>", hint: "Notes & rules", kind: "dialog",
          async open({ actor: openedActor, actorUuid }) {
            agentProbe.openCount++;
            assert.strictEqual(openedActor, context.actor);
            assert.equal(actorUuid, context.actorUuid);
          } }];
      },
      onOperatorCommit(notice) {
        if (notice.branchId !== selected.branch) return;
        agentProbe.notifications.push(notice);
        const key = `${notice.actorUuid}\u0000${notice.event.id}\u0000${notice.state}`;
        if (!agentProbe.effects.has(key)) agentProbe.effects.set(key, { activationId: notice.event.activationId, spSpent: notice.event.spSpent });
        if (agentProbe.throwOnCommit) throw new Error("simulated extension callback failure");
      }
    });

    const before = structuredClone(actor.toObject());
    inspectVanguardFields(actor, selected);
    await previewVanguardProgression(actor, selected);
    assert.deepEqual(agentProbe.progression.map(context => context.phase), ["fields", "plan"], "field and plan phases are both supplied");
    assert.deepEqual(actor.toObject(), before, "registration, field rendering, and preview are read-only");
  } finally {
    teardownFoundryGlobals();
  }
});

test("Pioneer Operator Skill consumer merges branch slots, hydrates source IDs, and preserves standard keys", async () => {
  const api = await extensionApi();
  assert.ok(!api.loadError, `extension registry behavior missing: ${api.loadError?.code ?? api.loadError?.message}`);
  const id = `foundation-pioneer-${Date.now()}`;
  const actor = { id, uuid: `Actor.${id}`, name: id, type: "character", documentName: "Actor", items: new Map(),
    flags: { ak5e: { operatorSkills: { enabled: true, points: 0, maximum: 0, start: 0 } } },
    getFlag(namespace, key) { return this.flags[namespace]?.[key]; },
    testUserPermission() { return true; } };
  const classRecord = CHAPTER_THREE_CLASSES.find(entry => entry.kind === "class" && entry.id === "class-vanguard");
  const pioneerRecord = CHAPTER_THREE_CLASSES.find(entry => entry.kind === "subclass" && /Pioneer/.test(entry.name));
  assert.ok(classRecord && pioneerRecord, "Vanguard and Pioneer records exist in the source catalogue");
  const add = data => actor.items.set(data.id, { ...data, parent: actor,
    getFlag(namespace, key) { return this.flags?.[namespace]?.[key]; } });
  add({ id: "vanguard-class", name: "Vanguard", type: "class", system: { ...classRecord.systemData, levels: 14 },
    flags: { ak5e: { chapterThreeId: classRecord.id } } });
  add({ id: "vanguard-pioneer", name: pioneerRecord.name, type: "subclass", system: pioneerRecord.systemData,
    flags: { ak5e: { chapterThreeId: pioneerRecord.id } } });

  const basicSkill = CHAPTER_THREE_CLASSES.find(entry => entry.operatorSkill?.tier === "Basic" && entry.parentClass === "Vanguard");
  const eliteSkills = CHAPTER_THREE_CLASSES.filter(entry => entry.operatorSkill?.tier === "Elite" &&
    ["Guard", "Defender", "Marksman", "Specialist", "Vanguard"].includes(entry.parentClass));
  assert.ok(basicSkill && eliteSkills.length > 1, "source catalogue contains Basic and eligible Elite Operator Skills");
  let received;
  api.registerVanguardExtension(pioneerRecord.id, { skillSlots(context) {
    if (context.branchId !== pioneerRecord.id) return [];
    received = context;
    const replacementKey = context.actorUuid === pioneerProbe.actorUuid ? pioneerProbe.replacementKey : null;
    return [
      { key: "class-vanguard:Breakthrough", label: "Breakthrough", tier: "Elite", level: 17, optionSourceIds: eliteSkills.map(skill => skill.id),
        ...(replacementKey ? { replacementKey } : {}) }
    ];
  } });
  const view = getOperatorSkillChoices(actor);
  assert.ok(view.slots.some(slot => slot.key === "class-vanguard:Breakthrough"), "Pioneer adds its Breakthrough slot");
  assert.ok(view.slots.some(slot => slot.key === "class-vanguard:Breakthrough" && slot.options.some(option => option.id === eliteSkills[0].id)),
    "consumer resolves extension source IDs through the authoritative Skill catalogue");
  assert.deepEqual(view.slots.filter(slot => slot.key !== "class-vanguard:Breakthrough").map(slot => slot.key),
    ["class-vanguard:Basic", "class-vanguard:Advanced", "class-vanguard:Elite"], "standard keys remain stable");
  assert.ok(received, "consumer calls registered skill-slot contributors");
  assert.strictEqual(received.actor, actor);
  assert.equal(received.actorUuid, actor.uuid);
  assert.equal(received.branchId, pioneerRecord.id);
  assert.equal(received.level, 14);
  assert.equal(received.purpose, "skills");
  assert.ok(Array.isArray(received.standardSlots));
  assert.ok(received.operatorState && typeof received.operatorState === "object");
});

test("extension slot replacement entitlements validate, commit, replay, and preserve unrelated Items", async () => {
  const api = await extensionApi();
  assert.ok(!api.loadError, `extension registry behavior missing: ${api.loadError?.code ?? api.loadError?.message}`);
  setupFoundryGlobals();
  try {
    const classRecord = CHAPTER_THREE_CLASSES.find(entry => entry.kind === "class" && entry.id === "class-vanguard");
    const branchRecord = CHAPTER_THREE_CLASSES.find(entry => entry.kind === "subclass" && /Pioneer/.test(entry.name));
    const basicSkill = CHAPTER_THREE_CLASSES.find(entry => entry.operatorSkill?.tier === "Basic" && entry.parentClass === "Vanguard");
    const eliteSkills = CHAPTER_THREE_CLASSES.filter(entry => entry.operatorSkill?.tier === "Elite" &&
      ["Guard", "Defender", "Marksman", "Specialist", "Vanguard"].includes(entry.parentClass));
    const actor = createTestActor({ name: "Pioneer replacement owner", level: 17,
      flags: { ak5e: { operatorSkills: { enabled: true, points: 7, maximum: 12, start: 4, active: null } } } });
    assert.ok(classRecord && branchRecord && basicSkill && eliteSkills.length > 1, "source catalogue supplies Vanguard, Pioneer, eligible Elite choices, and wrong-tier Skill");
    actor.items.set("vanguard-class", createTestItem({ id: "vanguard-class", name: "Vanguard", type: "class",
      system: { ...classRecord.systemData, levels: 17 }, flags: { ak5e: { chapterThreeId: classRecord.id } } }, actor));
    actor.items.set("vanguard-pioneer", createTestItem({ id: "vanguard-pioneer", name: branchRecord.name, type: "subclass",
      system: branchRecord.systemData, flags: { ak5e: { chapterThreeId: branchRecord.id } } }, actor));
    const authored = createTestItem({ name: "Authored notes", type: "feat", system: { description: { value: "Keep this Item" } },
      flags: { ak5e: { authoredByTable: true } } }, actor);
    actor.items.set(authored.id, authored);
    const choiceData = view => ({ contextKey: view.contextKey, selections: view.pending.map(slot => ({
      key: slot.key, sourceId: slot.options[0].id, ...(slot.replacementKey ? { replacementKey: slot.replacementKey } : {})
    })) });
    const choose = (id, data) => executeOperatorCommand(actor, { id, command: "chooseSkills", data }, game.user);

    let initial = getOperatorSkillChoices(actor);
    const breakthroughKey = "class-vanguard:Breakthrough";
    assert.ok(initial.pending.some(slot => slot.key === breakthroughKey), "new extension slot participates in normal choice commit");
    assert.equal(initial.slots.find(slot => slot.key === breakthroughKey).replacementKey, undefined,
      "replacement key is absent before the branch entitlement exists");
    const initialRequest = choiceData(initial);
    const originalCreate = actor.createEmbeddedDocuments.bind(actor);
    let interruptCreate = true;
    actor.createEmbeddedDocuments = async (...args) => {
      const created = await originalCreate(...args);
      if (interruptCreate) { interruptCreate = false; throw new Error("interrupted Item creation"); }
      return created;
    };
    await assert.rejects(() => choose("foundation-slot-initial", initialRequest), /interrupted Item creation/);
    const afterPartialCreate = actor.items.size;
    const initialResult = await choose("foundation-slot-initial", initialRequest);
    assert.equal(actor.items.size, afterPartialCreate, "retry reconciles the request marker without duplicate Items");
    assert.equal(getOperatorSkillChoices(actor).pending.length, 0);
    assert.ok(initialResult.result, "same-Actor choice commit returns its existing operation result");
    const progression = actor.getFlag("ak5e", "operatorSkills").progression;
    const oldChoice = progression.choices[breakthroughKey];
    assert.ok(oldChoice?.itemId && actor.items.has(oldChoice.itemId), "initial extension choice has its own embedded Item");
    const oldSourceId = oldChoice.sourceId;
    const oldItemId = oldChoice.itemId;
    const otherSlotItemId = progression.choices["class-vanguard:Basic"]?.itemId;
    assert.ok(otherSlotItemId && otherSlotItemId !== oldItemId, "a standard slot retains an independent Item reference");

    pioneerProbe.actorUuid = actor.uuid;
    pioneerProbe.replacementKey = "opaque-entitlement-1";
    let replacementView = getOperatorSkillChoices(actor);
    let replacementSlot = replacementView.slots.find(slot => slot.key === breakthroughKey);
    assert.ok(replacementSlot, "the chosen extension slot remains visible");
    assert.equal(replacementSlot.replacementKey, "opaque-entitlement-1", "replacement key is opaque and carried by the slot");
    const nextElite = eliteSkills.find(option => option.id !== oldSourceId);
    assert.ok(nextElite, "another eligible Elite source choice is available in the slot's tier");
    const invalidContext = replacementView.contextKey;
    pioneerProbe.replacementKey = "opaque-entitlement-stale";
    await assert.rejects(() => choose("foundation-slot-stale", { contextKey: invalidContext, selections: [{
      key: breakthroughKey, sourceId: nextElite.id, replacementKey: replacementSlot.replacementKey
    }] }), /StaleChoices/);

    pioneerProbe.replacementKey = "opaque-entitlement-1";
    replacementView = getOperatorSkillChoices(actor);
    replacementSlot = replacementView.slots.find(slot => slot.key === breakthroughKey);
    const replacementSelection = { key: breakthroughKey, sourceId: nextElite.id, replacementKey: replacementSlot.replacementKey };
    await assert.rejects(() => choose("foundation-slot-unknown", { contextKey: replacementView.contextKey,
      selections: [{ ...replacementSelection, sourceId: "not-a-source-item" }] }), /InvalidSkillChoice/);
    await assert.rejects(() => choose("foundation-slot-tier", { contextKey: replacementView.contextKey,
      selections: [{ ...replacementSelection, sourceId: basicSkill.id }] }), /InvalidSkillChoice/);
    const committedReplacement = await choose("foundation-slot-replace-1", { contextKey: replacementView.contextKey,
      selections: [replacementSelection] });
    const operation = actor.getFlag("ak5e", "operatorSkills").operations.find(entry => entry.id === "foundation-slot-replace-1");
    const recordedReplacement = operation?.result?.replacements?.find(entry => entry.replacementKey === "opaque-entitlement-1");
    assert.deepEqual(Object.fromEntries(["replacementKey", "key", "previousSourceId", "sourceId"].map(key => [key, recordedReplacement?.[key]])),
      { replacementKey: "opaque-entitlement-1", key: breakthroughKey, previousSourceId: oldSourceId, sourceId: nextElite.id },
      "operation records the required replacement transition");
    assert.ok(committedReplacement.result, "replacement is committed on the same Actor");
    const newItemId = actor.getFlag("ak5e", "operatorSkills").progression.choices[breakthroughKey].itemId;
    assert.notEqual(newItemId, oldItemId);
    assert.equal(actor.items.has(oldItemId), false, "exclusive prior slot-managed Item is removed");
    assert.equal(actor.items.has(otherSlotItemId), true, "another standard slot's independent Item is preserved");
    assert.equal(actor.items.has(authored.id), true, "authored Items remain untouched");

    const itemCountAfterReplacement = actor.items.size;
    const replay = await choose("foundation-slot-replace-1", { contextKey: replacementView.contextKey,
      selections: [replacementSelection] });
    assert.deepEqual(replay.result, committedReplacement.result, "operation replay returns the same replacement result");
    assert.equal(actor.items.size, itemCountAfterReplacement, "replacement replay does not create or delete Items twice");
    let consumedView = getOperatorSkillChoices(actor);
    assert.equal(consumedView.slots.find(slot => slot.key === breakthroughKey).replacementKey, undefined,
      "consumed opaque key is no longer advertised");
    await assert.rejects(() => choose("foundation-slot-reuse", { contextKey: consumedView.contextKey,
      selections: [{ key: breakthroughKey, sourceId: oldSourceId, replacementKey: "opaque-entitlement-1" }] }), /InvalidSkillChoice/);

    const sharedState = structuredClone(actor.getFlag("ak5e", "operatorSkills"));
    sharedState.progression.choices["class-vanguard:Basic"].itemId = newItemId;
    await actor.update({ "flags.ak5e.operatorSkills": sharedState });
    pioneerProbe.replacementKey = "opaque-entitlement-2";
    const secondEntitlementView = getOperatorSkillChoices(actor);
    const secondReplacementSlot = secondEntitlementView.slots.find(slot => slot.key === breakthroughKey);
    assert.equal(secondReplacementSlot?.replacementKey, "opaque-entitlement-2", "a new entitlement key enables a later replacement");
    const secondSource = eliteSkills.find(option => option.id !== nextElite.id);
    assert.ok(secondSource, "second entitlement can select another valid Elite Skill");
    const secondReplacement = await choose("foundation-slot-replace-2", { contextKey: secondEntitlementView.contextKey,
      selections: [{ key: breakthroughKey, sourceId: secondSource.id, replacementKey: secondReplacementSlot.replacementKey }] });
    assert.ok(secondReplacement.result, "second entitlement commits as a distinct operation");
    assert.equal(actor.items.has(newItemId), true, "prior Item remains while another slot still references its exact managed Item");
  } finally {
    pioneerProbe.actorUuid = null;
    pioneerProbe.replacementKey = null;
    teardownFoundryGlobals();
  }
});

test("Vanguard owner-control consumer passes context and renders descriptor text as escaped text", async () => {
  const api = await extensionApi();
  assert.ok(!api.loadError, `extension registry behavior missing: ${api.loadError?.code ?? api.loadError?.message}`);
  setupFoundryGlobals();
  try {
    registerVanguardSheetHooks();
    foundry.applications ??= {};
    foundry.applications.api ??= {};
    const classItem = createTestItem({ name: "Vanguard", type: "class", system: { levels: 1 }, flags: { ak5e: { chapterThreeId: "class-vanguard" } } });
    const agent = CHAPTER_THREE_CLASSES.find(entry => entry.kind === "subclass" && entry.id === "subclass-vanguard-agent");
    assert.ok(agent, "Agent branch exists in the source catalogue");
    const branchItem = createTestItem({ name: agent.name, type: "subclass", system: agent.systemData, flags: { ak5e: { chapterThreeId: agent.id } } });
    const tipFeature = createTestItem({ name: "Tip of the Spear", type: "feat", flags: { ak5e: { chapterThreeId: "class-feature-vanguard-1st-level-tip-of-the-spear-3092" } } });
    const actor = createTestActor({ name: "Owner Control Probe", items: [classItem, branchItem, tipFeature], flags: { ak5e: { vanguard: { enabled: true } } } });
    const dialogs = [];
    foundry.applications.api.DialogV2 = { async wait(options) { dialogs.push(options); return null; } };

    const controlsBefore = agentProbe.controls.length;
    const opensBefore = agentProbe.openCount;
    await vanguardSheetApi.open(actor);
    assert.ok(agentProbe.controls.length > controlsBefore, "owner-control consumer invokes registered descriptors");
    const context = agentProbe.controls.at(-1);
    assert.strictEqual(context.actor, actor);
    assert.equal(context.actorUuid, actor.uuid);
    assert.equal(context.branchId, "subclass-vanguard-agent");
    assert.equal(context.level, 1);
    assert.equal(context.purpose, "controls");
    assert.equal(Object.getPrototypeOf(context.profile), Object.prototype);
    assert.ok(dialogs.length, "owner controls render through the sheet dialog");
    const rendered = dialogs.map(dialog => `${dialog.window?.title ?? ""} ${String(dialog.content ?? "")}`).join(" ");
    assert.match(rendered, /Guide &lt;Vanguard&gt;/, "descriptor labels are escaped before rendering");
    assert.match(rendered, /Notes &amp; rules/, "descriptor hints are escaped before rendering");
    assert.doesNotMatch(rendered, /\[object Object\]/, "callback descriptors are not interpolated as objects");
    assert.equal(agentProbe.openCount, opensBefore, "rendering a dialog descriptor does not execute its open callback");
  } finally {
    teardownFoundryGlobals();
  }
});

test("Operator commit notifications follow durable save, replay idempotently, isolate callback errors, and report successful undo", async () => {
  setupFoundryGlobals();
  try {
    const gm = game.user;
    const owner = { id: "foundation-operator-owner", isGM: false };
    game.user = gm;
    game.users = new Map([[owner.id, owner], [gm.id, gm]]);
    game.users.activeGM = gm;
    const classItem = createTestItem({ name: "Vanguard", type: "class", system: { levels: 5 }, flags: { ak5e: { chapterThreeId: "class-vanguard" } } });
    const agent = CHAPTER_THREE_CLASSES.find(entry => entry.kind === "subclass" && entry.id === "subclass-vanguard-agent");
    assert.ok(agent, "source catalogue supplies the Agent branch");
    const branchItem = createTestItem({ name: agent.name, type: "subclass", system: agent.systemData, flags: { ak5e: { chapterThreeId: agent.id } } });
    const actor = createTestActor({ name: "Durable Operator Vanguard", ownership: { default: 0, [owner.id]: 3 }, items: [classItem, branchItem],
      flags: { ak5e: { vanguard: { enabled: true }, operatorSkills: { enabled: true, points: 100, maximum: 100, start: 0, active: null, operatorEvents: [], receipts: [] } } } });
    const skill = createTestItem({ name: "Foundation Skill", type: "feat",
      flags: { ak5e: { operatorSkill: { sourceId: "foundation-skill-source", cost: 10, start: 10,
        methods: ["automatic", "offensive", "defensive"], activation: "Action", duration: "Instant" } } } }, actor);
    actor.items.set(skill.id, skill);
    const originalUpdate = actor.update.bind(actor);
    let failSave = true;
    actor.update = async (change, options) => {
      if (failSave && Object.hasOwn(change ?? {}, "flags.ak5e.operatorSkills")) return false;
      return originalUpdate(change, options);
    };

    const notificationsBefore = agentProbe.notifications.length;
    await assert.rejects(() => executeOperatorCommand(actor, { id: "foundation-failed-save", command: "activate", data: { itemId: skill.id } }, owner));
    assert.equal(agentProbe.notifications.length, notificationsBefore, "a failed Actor save cannot emit a commit callback");

    failSave = false;
    agentProbe.throwOnCommit = true;
    const committed = await executeOperatorCommand(actor, { id: "foundation-commit-replay", command: "activate", data: { itemId: skill.id } }, owner);
    agentProbe.throwOnCommit = false;
    assert.ok(committed, "callback failure does not fail an already committed use");
    const committedState = actor.getFlag("ak5e", "operatorSkills");
    const notice = agentProbe.notifications.find(entry => entry.actorUuid === actor.uuid && entry.state === "present" && entry.reason === "commit");
    assert.ok(notice, "successful durable Actor save emits a commit notification");
    assert.strictEqual(notice.actor, actor);
    assert.ok(committedState.operatorEvents.some(event => event.id === notice.event.id && event.activationId === notice.event.activationId && event.committed),
      "callback observes the event only after it is durably committed");
    assert.equal(notice.event.spSpent, 10);

    const deliveryCount = agentProbe.notifications.length;
    const effectKey = `${notice.actorUuid}\u0000${notice.event.id}\u0000${notice.state}`;
    const effect = agentProbe.effects.get(effectKey);
    const replay = await executeOperatorCommand(actor, { id: "foundation-commit-replay", command: "activate", data: { itemId: skill.id } }, owner);
    assert.ok(replay, "replayed operation returns its existing commit");
    assert.equal(agentProbe.notifications.length, deliveryCount + 1, "replay retries a callback that failed after commit");
    assert.deepEqual(agentProbe.effects.get(effectKey), effect, "replay does not duplicate downstream effect");

    const undoId = "foundation-undo-commit";
    await vanguardUses.command(actor, "undoOperatorActivation", { activationId: notice.event.activationId, confirmed: true }, undoId);
    await vanguardUses.undo(actor, undoId);
    assert.ok(agentProbe.notifications.some(entry => entry.actorUuid === actor.uuid && entry.event.id === notice.event.id
      && entry.state === "removed" && entry.reason === "undo"), "successful undo dispatches removed-state notification");
  } finally {
    agentProbe.throwOnCommit = false;
    teardownFoundryGlobals();
  }
});
