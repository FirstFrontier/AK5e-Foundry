import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { previewVanguardProgression, applyVanguardProgression } from "../scripts/vanguard-progression.mjs";
import { registerVanguardExtension, notifyVanguardOperatorCommit } from "../scripts/vanguard-extensions.mjs";
import { openVanguardControls } from "../scripts/vanguard-sheet.mjs";
import { CHAPTER_THREE_CLASSES } from "../scripts/chapter-three-content.mjs";
import { VANGUARD_CLASS_ID } from "../scripts/vanguard-rules.mjs";
import { setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem } from "./base-classes-fixture.mjs";

const branchId = "subclass-vanguard-agent";
const selections = {
  branch: branchId,
  martialDCAbility: "dex",
  saves: ["str"],
  skills: ["acr", "ath", "ste"],
  tool: "Messenger Kit",
  startingEquipment: { mode: "existing" },
  hp: { 1: { mode: "existing" } }
};
const probes = { progressionActorUuid: null, contribution: null, controlsActorUuid: null, controls: null,
  commitActorUuid: null, commitCalls: 0, rejectFalsyCommit: false };

registerVanguardExtension(branchId, {
  progressionContribution(context) {
    if (context.branchId !== branchId || context.actorUuid !== probes.progressionActorUuid) return null;
    return probes.contribution?.(context) ?? null;
  },
  ownerControls(context) {
    if (context.branchId !== branchId || context.actorUuid !== probes.controlsActorUuid) return [];
    return probes.controls?.(context) ?? [];
  },
  async onOperatorCommit(notice) {
    if (notice.actorUuid !== probes.commitActorUuid) return;
    probes.commitCalls++;
    if (probes.rejectFalsyCommit) return Promise.reject();
  }
});

function makeVanguard({ owner = true, level = 1, withBranch = true, items = [] } = {}) {
  const classRecord = CHAPTER_THREE_CLASSES.find(entry => entry.id === VANGUARD_CLASS_ID);
  const branchRecord = CHAPTER_THREE_CLASSES.find(entry => entry.id === branchId);
  const classItem = createTestItem({ name: "Vanguard", type: "class", system: { levels: level },
    flags: { ak5e: { chapterThreeId: VANGUARD_CLASS_ID } } });
  const branchItem = createTestItem({ name: branchRecord.name, type: "subclass", system: branchRecord.systemData,
    flags: { ak5e: { chapterThreeId: branchId } } });
  const actor = createTestActor({ name: "Vanguard attack probe", owner, level,
    system: { attributes: { hp: { value: 20, max: 20, temp: 0 }, prof: 2 },
      traits: { saves: { value: [] }, armorProf: { value: [] }, weaponProf: { value: [] }, toolProf: { value: [] } },
      skills: { acr: { value: 0 }, ath: { value: 0 }, ste: { value: 0 } } },
    items: [classItem, ...(withBranch ? [branchItem] : []), ...items],
    flags: { ak5e: { vanguard: { enabled: true } } } });
  assert.ok(classRecord && branchRecord);
  return actor;
}

test.beforeEach(() => setupFoundryGlobals());
test.afterEach(() => {
  probes.progressionActorUuid = null;
  probes.contribution = null;
  probes.controlsActorUuid = null;
  probes.controls = null;
  probes.commitActorUuid = null;
  probes.commitCalls = 0;
  probes.rejectFalsyCommit = false;
  teardownFoundryGlobals();
});

test("falsy async commit rejection remains retryable for the same notification", async () => {
  const actor = makeVanguard();
  probes.commitActorUuid = actor.uuid;
  probes.rejectFalsyCommit = true;
  const notice = { actor, actorUuid: actor.uuid, branchId, state: "present", reason: "commit", requestId: "retry-falsy", initiatingUserId: "owner",
    event: Object.freeze({ id: "activation-falsy", activationId: "activation-falsy", spSpent: 10 }) };

  await notifyVanguardOperatorCommit(notice);
  await notifyVanguardOperatorCommit(notice);

  assert.equal(probes.commitCalls, 2, "a rejected callback with a falsy reason is not marked delivered and can be retried");
});

test("branch contribution validation rejects uninstalled proficiency identifiers and malformed categories", async () => {
  const actor = makeVanguard();
  probes.progressionActorUuid = actor.uuid;
  probes.contribution = context => {
    return context.phase === "fields" ? null : { proficiencies: {
      armor: ["not-an-installed-armor-id"], weapons: ["not-an-ak5e-weapon-category"]
    } };
  };
  const before = structuredClone(actor.toObject());
  await assert.rejects(() => previewVanguardProgression(actor, selections),
    /Invalid|Unknown|proficiency|category/i,
    "extension proficiency descriptors must be checked against installed identifiers and AK5e categories");
  assert.deepEqual(actor.toObject(), before, "invalid contribution preview makes no Actor or Item writes");
});

test("branch contribution preview keys refresh on descriptor changes and retry recovers grants and HP receipts", async () => {
  const item = createTestItem({ id: "branch-update-probe", name: "Branch update probe", type: "feat",
    system: { description: { value: "before" } } });
  const actor = makeVanguard({ items: [item] });
  const originalItemCount = actor.items.size;
  const config = { actorUuid: actor.uuid, total: 3, warning: "first" };
  let lastContext;
  probes.progressionActorUuid = actor.uuid;
  probes.contribution = context => {
    lastContext = context;
    if (context.phase === "fields") return null;
    return {
      warnings: [config.warning],
      proficiencies: { skills: [{ key: "acr", minimum: 1 }], armor: ["lgt"], weapons: ["Light Melee"],
        tools: [{ key: "messengerkit", minimum: 1, ability: "dex" }] },
      hpBonuses: [{ key: "branch-vitality", sourceId: "agent-vitality-source", total: config.total, alreadyIncluded: false }],
      createItems: [{ name: "Agent grant", type: "feat", flags: { ak5e: { chapterThreeId: "agent-grant-source" } } }],
      updateItems: [{ _id: item.id, system: { description: { value: "after" } } }]
    };
  };
  const before = structuredClone(actor.toObject());
  const preview = await previewVanguardProgression(actor, selections);
  assert.deepEqual(actor.toObject(), before, "contribution collection and preview are read-only");
  assert.equal(lastContext.actor, actor, "extension context preserves the live Actor identity");
  assert.ok(Object.isFrozen(lastContext.profile) && Object.isFrozen(lastContext.choices), "plain read context is frozen");
  assert.equal(preview.warnings.at(-1), "first");
  assert.equal(preview.writes["system.skills.acr.value"], 1);
  assert.ok(preview.createItems.some(entry => entry.name === "Agent grant"));
  assert.ok(preview.updateItems.some(entry => entry._id === item.id && entry["system.description.value"] === "after"));

  config.warning = "changed after preview";
  await assert.rejects(() => applyVanguardProgression(actor, { confirmed: true, contextKey: preview.contextKey, choices: selections }),
    /changed since the preview/i, "changing a contribution invalidates the reviewed plan");
  assert.deepEqual(actor.toObject(), before, "stale contribution preview causes no writes");

  config.warning = "fresh";
  const current = await previewVanguardProgression(actor, selections);
  const originalUpdate = actor.update.bind(actor);
  let interruptSave = true;
  actor.update = async (changes, options) => {
    if (interruptSave && Object.hasOwn(changes ?? {}, "flags.ak5e.vanguardProgression")) {
      interruptSave = false;
      throw new Error("interrupted progression state save");
    }
    return originalUpdate(changes, options);
  };
  await assert.rejects(() => applyVanguardProgression(actor, { confirmed: true, contextKey: current.contextKey, choices: selections }), /interrupted progression state save/);
  assert.equal(actor.system.attributes.hp.max, 20, "failed state save does not apply the cumulative HP bonus");
  assert.equal(actor.items.size, originalItemCount + 1, "failed save may leave one marked embedded grant for retry reconciliation");
  assert.equal(actor.items.get(item.id).system.description.value, "after", "the item update is retried independently of the Actor save");

  const retry = await previewVanguardProgression(actor, selections);
  await applyVanguardProgression(actor, { confirmed: true, contextKey: retry.contextKey, choices: selections });
  assert.equal(actor.items.size, originalItemCount + 1, "retry does not duplicate an embedded grant created before interruption");
  assert.equal(actor.system.attributes.hp.max, 23, "successful retry applies the cumulative contribution once");
  const saved = actor.getFlag("ak5e", "vanguardProgression");
  assert.equal(saved.receipts[`branchHp:${branchId}:branch-vitality`], 3, "HP receipt commits with progression state");

  config.total = 1;
  let lower = await previewVanguardProgression(actor, selections);
  assert.equal(lower.writes["system.attributes.hp.max"], undefined, "a decrease does not subtract previously granted HP");
  await applyVanguardProgression(actor, { confirmed: true, contextKey: lower.contextKey, choices: selections });
  assert.equal(actor.system.attributes.hp.max, 23);
  config.total = 5;
  const raised = await previewVanguardProgression(actor, selections);
  assert.equal(raised.writes["system.attributes.hp.max"], 25, "later cumulative increase applies only its delta");
});

test("extension control click re-resolves ownership and current descriptor; prepare cancellation has no use", async () => {
  const actor = makeVanguard({ owner: true });
  const originalFromUuid = globalThis.fromUuid;
  globalThis.fromUuid = async uuid => uuid === actor.uuid ? actor : null;
  const flags = { available: true, prepareCount: 0, commands: [] };
  probes.controlsActorUuid = actor.uuid;
  probes.controls = () => {
    return flags.available ? [{ id: `${branchId}:test-use`, label: "Test use", kind: "use", command: "quickOffTheMark",
      prepare: async () => { flags.prepareCount++; return null; } }] : [];
  };

  let config;
  foundry.applications ??= {};
  foundry.applications.api ??= {};
  foundry.applications.api.DialogV2 = { async wait(options) { config = options; return null; }, async confirm() { flags.commands.push("confirmed"); return true; } };
  const opened = await openVanguardControls(actor);
  assert.equal(opened, null, "control sheet open does not execute its use descriptor");
  const { document, window } = parseHTML(`<html><body>${config.content}</body></html>`);
  const button = document.querySelector("[data-extension-index]");
  assert.ok(button);
  const app = { element: document };
  config.render?.(null, app);
  const click = async () => button.dispatchEvent(new window.Event("click", { bubbles: true, cancelable: true }));

  flags.available = false;
  await click();
  assert.equal(flags.prepareCount, 0, "a removed descriptor cannot run its stale prepare closure");
  assert.equal(flags.commands.length, 0);

  flags.available = true;
  actor.isOwner = false;
  await click();
  assert.equal(flags.prepareCount, 0, "ownership loss blocks a previously rendered control");
  assert.equal(flags.commands.length, 0);
  actor.isOwner = true;

  // Re-open to obtain a current button and cancel during fact preparation.
  await openVanguardControls(actor);
  const fresh = config;
  const freshDom = parseHTML(`<html><body>${fresh.content}</body></html>`).document;
  const freshButton = freshDom.querySelector("[data-extension-index]");
  fresh.render?.(null, { element: freshDom });
  freshButton.dispatchEvent(new window.Event("click", { bubbles: true, cancelable: true }));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(flags.prepareCount, 1);
  assert.equal(flags.commands.length, 0, "prepare cancellation returns no command, confirmation, or dice action");
  globalThis.fromUuid = originalFromUuid;
});
