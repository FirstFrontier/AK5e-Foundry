/**
 * Frozen tests — WP `guard-base` (Guard vanguard base polish).
 * Criteria G01–G12 from .codex-work/guard-vanguard-base-polish/SPEC-guard-base.md.
 *
 * Criterion → test identifier map:
 *   G01 → G01_readonly_permissions                      (green)
 *   G02 → G02_confirm_cancel_preview                    (green: confirmation contract)
 *   G02 → G02_reaction_and_target_summary               (RED: Reaction cost + manual targeting absent)
 *   G03 → G03_setup_preview_key                         (green: key handoff)
 *   G03 → G03_named_delta_preview                       (RED: setup confirm names nothing)
 *   G04 → G04_progression_contributions_once            (green)
 *   G05 → G05_grants_preserved_retry                    (green)
 *   G06 → G06_undo_flags_conflicts_windows              (green)
 *   G07 → G07_durable_reaction_failure_retry            (green)
 *   G08 → G08_eternal_roll_button_once                  (green: state level; rendered persistence unverified)
 *   G09 → G09_pursuit_action_choices                    (RED: pursuit form absent)
 *   G09 → G09_unrelenting_aggression_formula            (RED: 1d8 assumed, no weapon formula flow)
 *   G09 → G09_input_validation                          (green)
 *   G10 → G10_progression_preview_apply_keys            (green)
 *   G10 → G10_progression_entry_apply_cancel            (RED: sheet entry absent)
 *   G11 → G11_base_rules_agency                         (green)
 *   G12 → G12_setup_receipts_undo                       (RED: receipts/undo absent)
 *   G12 → G12_progression_receipts_undo                 (RED: receipts/undo absent)
 *
 * Authority is chapter 3 source text, not production internals. Do not edit these
 * tests to make an implementation pass; escalate spec questions to the manager.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { guardFixture, world } from "./guard-fixture.mjs";
import {
  aggressionMax, unrelentingMax, guardProfile, guardState, guardLevel, martialDCChoice
} from "../scripts/guard-rules.mjs";
import {
  defineGuardPools, registerGuardFeatureHooks, aggression, unrelenting, getGuardView
} from "../scripts/guard-features.mjs";
import { guardUses } from "../scripts/guard-uses.mjs";
import { previewGuardSetup, applyGuardSetup } from "../scripts/guard-setup.mjs";
import {
  inspectGuardFields, previewGuardProgression, applyGuardProgression
} from "../scripts/guard-progression.mjs";
import { openGuardControls, runGuardUse, executeGuardDialog } from "../scripts/guard-sheet.mjs";
import { setReactionStore } from "../scripts/trigger-events.mjs";
import { getPoolDefinition } from "../scripts/resource-pools.mjs";

/* ------------------------------------------------------------------ harness */

/** DialogV2 emulation with separate wait/confirm answer queues. `wait` follows
 *  `(await button.callback(...)) ?? button.action`, so an answer naming a missing
 *  button resolves undefined (never a false confirmation). */
function dialogHarness({ wait = [], confirm = [] } = {}) {
  const seen = [];
  globalThis.foundry.applications = { api: { DialogV2: {
    async wait(config) {
      seen.push(config);
      for (const [key, value] of Object.entries(config)) assert.notEqual(value, undefined, `DialogV2 option ${key} must not be undefined`);
      const answer = wait.shift() ?? { action: "cancel" };
      const button = config.buttons.find(entry => entry.action === answer.action);
      const control = { form: { elements: Object.fromEntries(Object.entries(answer.values ?? {}).map(([key, value]) => [key, { value, checked: value === true }])) } };
      control.closest = () => control.form;
      return (await button?.callback?.({}, control, {})) ?? button?.action;
    },
    async confirm(config) {
      seen.push(config);
      const answer = confirm.shift();
      return answer === true || answer?.action === "ok";
    }
  } } };
  return seen;
}

const tick = () => new Promise(resolve => setTimeout(resolve, 0));
async function settle(predicate, what) {
  for (let i = 0; i < 200 && !predicate(); i++) await tick();
  assert.ok(predicate(), `timed out waiting for ${what}`);
}

/** Opens Guard controls, lets the sheet wire its buttons, and returns the
 *  click handlers it registered, plus the dialog log. */
async function openControls(actor, harness = {}) {
  const seen = harness.seen ?? dialogHarness(harness);
  const acts = {};
  const app = {
    element: { querySelectorAll: selector => selector === "[data-guard-act]"
      ? [...String(seen[0].content).matchAll(/data-guard-act="([^"]+)"/g)].map(([, act]) => ({
        dataset: { guardAct: act }, addEventListener: (_t, fn) => { acts[act] = fn; }
      }))
      : [] },
    close() {}
  };
  const opened = openGuardControls(actor);
  await settle(() => seen.length > 0, "the Guard controls dialog");
  seen[0].render?.(null, app);
  await settle(() => Object.keys(acts).length > 0, "the controls button wiring");
  return { seen, acts, opened };
}

let uuidSeq = 0;
/** Fixture with a uuid unique to the test, so the shared Reaction store never leaks across actors. */
function guard(opts) {
  const actor = guardFixture(opts);
  actor.uuid = `Actor.${opts?.id ?? `gb${++uuidSeq}`}`;
  return actor;
}

let rolls;
function countedRoll(total) {
  rolls = 0;
  globalThis.Roll = class {
    constructor(formula) { this.formula = formula; }
    async evaluate() { rolls++; this.total = total; return this; }
    async toMessage() { return this; }
  };
}

function baseWorld({ epoch = false } = {}) {
  world();
  const reactions = new Map();
  setReactionStore({ read: a => reactions.get(a.uuid), async write(actor, state) { reactions.set(actor.uuid, structuredClone(state)); } });
  registerGuardFeatureHooks();
  defineGuardPools();
  countedRoll(9);
  let currentEpoch = 0;
  if (epoch) game.settings = { get: () => currentEpoch, set: async (_m, _k, v) => { currentEpoch = v; } };
  const use = (actor, command, data = {}, id = "frozen-use") => guardUses.command(actor, command, { confirmed: true, ...data }, id);
  return { reactions, use, setEpoch: v => { currentEpoch = v; } };
}

const meleeWeapon = (actor, { id = "glaive", formula = "1d10" } = {}) => {
  const weapon = {
    id, uuid: `${actor.uuid}.Item.${id}`, type: "weapon", name: `Weapon ${id}`,
    system: {
      equipped: true, quantity: 1,
      damage: { templates: [], versatile: {}, value: [{ components: { value: { formula } } }] },
      activities: new Map([["melee", { id: "melee", type: "attack", attack: { type: { value: "melee" } } }]])
    }
  };
  actor.items.set(id, weapon);
  return weapon;
};

const levelChoices = extra => ({
  branch: "subclass-guard-centurion", fightingStyle: "duelling", saves: ["con"],
  skills: ["ath", "itm", "ak5elore"], tool: "Maintenance Kit", startingEquipment: { mode: "cash" }, ...extra
});
const fullHpAsi = extra => levelChoices({
  hp: { 1: { mode: "fixed", roll: 10 }, 2: { mode: "fixed", roll: 6 }, 3: { mode: "fixed", roll: 6 }, 4: { mode: "fixed", roll: 6 }, 5: { mode: "fixed", roll: 6 } },
  asi: { 4: { increases: [{ ability: "str", amount: 2 }] } }, ...extra
});

/* ------------------------------------------------------------------ G01 */

test("G01_readonly_permissions: inspection, previews and undo review change nothing; owners act, observers do not", async () => {
  const { reactions } = baseWorld();
  const actor = guard({ level: 5, aggression: 4, unrelenting: 1 });

  getGuardView(actor); guardState(actor); guardProfile(actor); guardLevel(actor); martialDCChoice(actor);
  inspectGuardFields(actor);
  await previewGuardSetup(actor);
  await previewGuardProgression(actor, {});
  guardUses.preview(actor, "smite", { amount: 1 });
  guardUses.uses(actor);
  guardUses.state(actor);
  assert.deepEqual(guardUses.previewUndo(actor, "ghost"), { lines: ["This use is no longer recorded."], blocked: true });
  assert.equal(actor.writes.length, 0, "no read-only surface wrote to the Actor");
  assert.equal(actor.created.length, 0, "no read-only surface created Items");
  assert.equal(reactions.size, 0, "no read-only surface touched the Reaction store");

  // Opening and closing the Guard controls changes nothing.
  const harness = dialogHarness({ wait: [{ action: "close" }] });
  const { opened } = await openControls(actor, { seen: harness });
  await opened;
  assert.equal(actor.writes.length, 0, "rendering the controls wrote nothing");
  assert.equal(actor.created.length, 0);

  // A non-GM player who owns the Guard can run a confirmed base use.
  assert.equal(game.user.isGM, false);
  dialogHarness({ wait: [{ action: "use" }] });
  const result = await runGuardUse(actor, "Press the Attack: Smite", "smite", { amount: 1 });
  assert.ok(result, "the owner's confirmed use executed");
  assert.equal(aggression(actor).value, 3);

  // An observer cannot mutate someone else's Guard through the engine.
  const observed = guard({ level: 5, aggression: 4, owner: false });
  await assert.rejects(
    () => guardUses.command(observed, "smite", { confirmed: true, amount: 1 }, "g01-observer"),
    /owned/i,
    "a non-owner is refused"
  );
  assert.equal(observed.writes.length, 0, "the refused use wrote nothing");
  assert.equal(aggression(observed).value, 4);
});

/* ------------------------------------------------------------------ G02 */

test("G02_confirm_cancel_preview: every base use confirms once, names costs and warnings, and Cancel writes nothing", async () => {
  const { reactions } = baseWorld();
  const actor = guard({ level: 5, aggression: 0 });

  dialogHarness({ wait: [{ action: "cancel" }] });
  const before = actor.writes.length;
  assert.equal(await runGuardUse(actor, "Press the Attack: Smite", "smite", { amount: 2 }), null, "Cancel resolves to null");
  assert.equal(actor.writes.length, before, "Cancel wrote nothing");
  assert.equal(guardUses.uses(actor).length, 0, "Cancel recorded no use");
  assert.equal(reactions.size, 0, "Cancel touched no Reaction");

  const seen = dialogHarness({ wait: [{ action: "cancel" }] });
  await runGuardUse(actor, "Press the Attack: Smite", "smite", { amount: 2 });
  const content = String(seen[0].content);
  assert.match(content, /Cost:<\/strong> 2 Aggression/, "the confirmation names the resource cost");
  assert.match(content, /2 Aggression needed and 0 remain/, "and the applicable warning");
  assert.deepEqual(seen[0].buttons.map(b => b.label), ["Use anyway", "Cancel"], "warnings offer an explicit override");

  // A supplied target appears in the preview.
  dialogHarness({ wait: [{ action: "cancel" }] });
  await runGuardUse(actor, "Press the Attack: Smite", "smite", { amount: 1 });
  const withTarget = dialogHarness({ wait: [{ action: "cancel" }] });
  await runGuardUse(actor, "Unrelenting", "unrelenting", { targetUuid: "Actor.foe", targetName: "Foe" });
  assert.match(String(withTarget[0].content), /Targets:.*Foe/, "the selected target is shown");
});

test("G02_reaction_and_target_summary: a base Reaction use previews its Reaction cost and an explicit targeting summary", async () => {
  baseWorld();
  const actor = guard({ level: 5, aggression: 4, unrelenting: 1 });

  // Forestall is "a Reaction when you are hit by an Attack" (C3:1882-1886): the
  // confirmation must say the use consumes the Reaction.
  const forestall = dialogHarness({ wait: [{ action: "cancel" }] });
  await runGuardUse(actor, "Press the Attack: Forestall", "forestall", { amount: 2 });
  assert.match(String(forestall[0].content), /Reaction/, "the confirmation states the Reaction cost");
  assert.equal(aggression(actor).value, 4);

  // Unrelenting attacks a creature the player must point at: when no target is
  // supplied the preview must say targeting is manual, not silently stay blank.
  const unrelentingDialog = dialogHarness({ wait: [{ action: "cancel" }] });
  await runGuardUse(actor, "Unrelenting", "unrelenting", {});
  assert.match(String(unrelentingDialog[0].content), /Reaction/, "Unrelenting is a Reaction feature and the preview says so");
  assert.match(String(unrelentingDialog[0].content), /manual/i, "with no target the preview states explicit manual targeting");
});

/* ------------------------------------------------------------------ G03 */

test("G03_setup_preview_key: missing or wrong keys fail before any write; the accepted key grants; Cancel preserves state", async () => {
  baseWorld();
  const actor = guard({ level: 3 });

  await assert.rejects(() => applyGuardSetup(actor, { confirmed: true }), /preview/i, "no key: refused");
  await assert.rejects(() => applyGuardSetup(actor, { confirmed: true, contextKey: "bogus" }), /preview/i, "a wrong key: refused");
  assert.equal(actor.writes.length, 0, "the refused applies wrote nothing");
  assert.equal(actor.items.size, 1);

  // The sheet's Grant Core Guard Features path previews first and passes that
  // preview's contextKey; Cancel on the confirm changes nothing.
  const cancelRun = await openControls(actor, { seen: dialogHarness({ wait: [{ action: "close" }], confirm: [false] }) });
  cancelRun.acts.__setup({ preventDefault() {} });
  await settle(() => cancelRun.seen.length > 1, "the setup confirm to be shown");
  assert.equal(actor.writes.length, 0, "cancel on the setup preview wrote nothing");
  assert.equal(actor.items.size, 1);

  const acceptSeen = dialogHarness({ wait: [{ action: "close" }], confirm: [true] });
  const again = await openControls(actor, { seen: acceptSeen });
  again.acts.__setup({ preventDefault() {} });
  await settle(() => actor.items.size > 1, "the accepted preview to apply");
  const names = [...actor.items.values()].map(i => i.name);
  assert.ok(names.some(n => n.includes("Unrelenting")), "the accepted preview's key granted the pending features");
});

test("G03_named_delta_preview: the setup preview names the created features and the retained items", async () => {
  baseWorld();
  const actor = guard({ level: 3 });

  dialogHarness({ wait: [{ action: "close" }], confirm: [true] });
  const { seen, acts } = await openControls(actor);
  acts.__setup({ preventDefault() {} });
  await settle(() => seen.length > 1, "the setup preview dialog");
  const content = String(seen[1].content ?? "") + " " + String(seen[1].window?.title ?? "");
  // B-131 / AC3: "previews named creates and retained Items" — a bare count is not a preview.
  assert.match(content, /Unrelenting/, "the preview names the features it will create");
  assert.match(content, /Press the Attack/, "including every created feature, not just a count");
});

/* ------------------------------------------------------------------ G04 */

test("G04_progression_contributions_once: repeat applies add nothing; level increases add only new contributions; authored values preserved", async () => {
  baseWorld();
  const actor = guard({ level: 5 });

  let plan = await previewGuardProgression(actor, fullHpAsi());
  await applyGuardProgression(actor, { confirmed: true, contextKey: plan.contextKey, ...fullHpAsi() });
  assert.equal(actor.system.attributes.hp.max, 94, "45 + (10+3) + four lots of (6+3) per C3:1765-1767");
  assert.equal(actor.system.abilities.str.value, 20, "the level-4 ASI landed once");
  const hpAfter = structuredClone(actor.system.attributes.hp);

  plan = await previewGuardProgression(actor, fullHpAsi());
  assert.deepEqual(plan.progression.hpLevels, [], "already-recorded HP levels are never re-added (B-132)");
  assert.equal(plan.writes["system.attributes.hp.max"], undefined, "no HP write in a repeat plan");
  assert.equal(plan.writes["system.abilities.str.value"], undefined);
  await applyGuardProgression(actor, { confirmed: true, contextKey: plan.contextKey, ...fullHpAsi() });
  assert.deepEqual(actor.system.attributes.hp, hpAfter, "re-applying identical level-4/HP contributions adds zero HP");
  assert.equal(actor.system.abilities.str.value, 20, "and zero ASI");
  assert.equal(actor.system.attributes.hp.value, 45, "the authored current HP is preserved");

  // Level increase: only the new level contributes.
  actor.items.get("class").system.levels = 6;
  const up = fullHpAsi({ hp: { ...fullHpAsi().hp, 6: { mode: "fixed", roll: 6 } } });
  plan = await previewGuardProgression(actor, up);
  assert.deepEqual(plan.progression.hpLevels, [6], "only the newly selected level is pending");
  assert.equal(plan.writes["system.attributes.hp.max"], 94 + 6 + 3, "the level-6 contribution is 6 + CON modifier (C3:1767)");
  await applyGuardProgression(actor, { confirmed: true, contextKey: plan.contextKey, ...up });
  assert.equal(actor.system.attributes.hp.max, 103);
  assert.equal(actor.system.attributes.hp.value, 45, "authored HP value still untouched");

  // Omitted HP/ASI levels stay untaken; an explicit "existing" marks inclusion without adding.
  const fresh = guard({ level: 5 });
  let bare = await previewGuardProgression(fresh, levelChoices({}));
  assert.equal(bare.writes["system.attributes.hp.max"], undefined, "nothing supplied marks nothing granted");
  await applyGuardProgression(fresh, { confirmed: true, contextKey: bare.contextKey, ...levelChoices({}) });
  assert.deepEqual(fresh.flags.ak5e.guardProgression.hpLevels, []);
  bare = await previewGuardProgression(fresh, levelChoices({ hp: { 1: { mode: "fixed", roll: 10 } } }));
  assert.deepEqual(bare.progression.hpLevels, [1], "the omitted level can still be taken later");

  const marked = guard({ level: 2 });
  const existing = levelChoices({ hp: { 1: { mode: "existing" }, 2: { mode: "existing" } } });
  const markPlan = await previewGuardProgression(marked, existing);
  assert.deepEqual(markPlan.progression.hpLevels, [1, 2], "explicit existing marks inclusion");
  assert.equal(markPlan.writes["system.attributes.hp.max"], undefined, "without adding any value");
});

/* ------------------------------------------------------------------ G05 */

test("G05_grants_preserved_retry: repeats preserve IDs and content; duplicate slots are legitimate; partial failure retries only what is missing and never repeats cash", async () => {
  baseWorld();

  // Setup run twice: same item IDs, no duplicated core features.
  const actor = guard({ level: 3 });
  let preview = await previewGuardSetup(actor);
  await applyGuardSetup(actor, { confirmed: true, contextKey: preview.contextKey });
  const ids = [...actor.items.keys()].sort().join(",");
  preview = await previewGuardSetup(actor);
  assert.equal(preview.creates.length, 0, "the second preview creates nothing new");
  assert.equal(preview.kept.length, 6, "and names every retained feature");
  const second = await applyGuardSetup(actor, { confirmed: true, contextKey: preview.contextKey });
  assert.deepEqual(second.created, []);
  assert.equal([...actor.items.keys()].sort().join(","), ids, "existing Item IDs are preserved");

  // Two starting-weapon slots may legitimately grant the identical weapon;
  // an authored same-name Item is never adopted or edited.
  const fresh = guard({ level: 1 });
  const authored = { id: "owned-axe", type: "weapon", name: "Axe", system: { quantity: 2 }, flags: { ak5e: { chapterFourId: "weapon-axe-2" } }, getFlag(s, k) { return this.flags?.[s]?.[k]; } };
  fresh.items.set("owned-axe", authored);
  const choices = levelChoices({ startingEquipment: { mode: "items", weapon1: "weapon-axe-2", weapon2: "weapon-axe-2", armour: "equipment-reinforced-outfit-1" } });
  const create = fresh.createEmbeddedDocuments;
  fresh.createEmbeddedDocuments = async (type, data) => {
    const docs = await create.call(fresh, type, data);
    docs.forEach((doc, index) => { doc.type = data[index].type ?? type; });
    return docs;
  };
  let plan = await previewGuardProgression(fresh, choices);
  await applyGuardProgression(fresh, { confirmed: true, contextKey: plan.contextKey, ...choices });
  const slots = [...fresh.items.values()].filter(i => i.flags?.ak5e?.guardStartingSlot?.startsWith("weapon"));
  assert.equal(slots.length, 2, "both slots granted their own copy");
  assert.equal(authored.system.quantity, 2, "the authored item is untouched");
  plan = await previewGuardProgression(fresh, choices);
  assert.equal(plan.createItems.filter(i => i.flags?.ak5e?.guardStartingSlot?.startsWith("weapon")).length, 0, "no re-grant on retry");
  await applyGuardProgression(fresh, { confirmed: true, contextKey: plan.contextKey, ...choices });
  assert.equal([...fresh.items.values()].filter(i => i.flags?.ak5e?.guardStartingSlot?.startsWith("weapon")).length, 2);

  // Partial embedded-document failure: retry creates only the missing slots.
  const partial = guard({ level: 1 });
  let failOnce = true;
  const make = partial.createEmbeddedDocuments;
  partial.createEmbeddedDocuments = async (type, data) => {
    if (failOnce) {
      failOnce = false;
      const docs = await make.call(partial, type, data.slice(0, 4));
      docs.forEach((doc, index) => { doc.type = data[index].type ?? type; });
      throw new Error("simulated partial embedded-item batch");
    }
    const docs = await make.call(partial, type, data);
    docs.forEach((doc, index) => { doc.type = data[index].type ?? type; });
    return docs;
  };
  plan = await previewGuardProgression(partial, choices);
  await assert.rejects(() => applyGuardProgression(partial, { confirmed: true, contextKey: plan.contextKey, ...choices }), /simulated partial/);
  plan = await previewGuardProgression(partial, choices);
  assert.deepEqual(plan.createItems.map(i => i.flags?.ak5e?.guardStartingSlot).sort(), ["armour", "kit"], "only the missing slots are re-offered");
  await applyGuardProgression(partial, { confirmed: true, contextKey: plan.contextKey, ...choices });
  for (const slot of ["weapon1", "weapon2", "armour", "kit"]) {
    assert.equal([...partial.items.values()].filter(i => i.flags?.ak5e?.guardStartingSlot === slot).length, 1, `${slot} granted exactly once`);
  }

  // Cash is never repeated: a second identical apply keeps 1300 LMD exactly.
  const cash = guard({ level: 5 });
  plan = await previewGuardProgression(cash, levelChoices());
  await applyGuardProgression(cash, { confirmed: true, contextKey: plan.contextKey, ...levelChoices() });
  plan = await previewGuardProgression(cash, levelChoices());
  assert.equal(plan.writes["system.currency.cp"], undefined, "the repeat plan does not offer cash again");
  await applyGuardProgression(cash, { confirmed: true, contextKey: plan.contextKey, ...levelChoices() });
  assert.deepEqual(cash.system.currency, { cp: 1300 }, "1300 LMD granted once, per C3:1786");
});

/* ------------------------------------------------------------------ G06 */

test("G06_undo_flags_conflicts_windows: undo restores resources and flag values (absence vs existing), leaves unrelated edits and conflicting fields alone, explains them, and keeps encounter locks enforced", async () => {
  const { use, setEpoch } = baseWorld({ epoch: true });

  // Absence vs an existing value.
  const fresh = guard({ level: 5 });
  await use(fresh, "chooseMartialDC", { ability: "dex" }, "g06-absent");
  assert.equal(martialDCChoice(fresh), "dex");
  await use(fresh, "undoUse", { useId: "g06-absent" }, "g06-absent-undo");
  assert.equal(martialDCChoice(fresh), null, "undo of the first choice restores absence, not a stored null string");
  assert.ok(!("martialDCAbility" in fresh.flags.ak5e.guard), "the flag key is genuinely absent again");

  const chained = guard({ level: 5 });
  await use(chained, "chooseMartialDC", { ability: "str" }, "g06-str");
  await use(chained, "chooseMartialDC", { ability: "dex" }, "g06-dex");
  await use(chained, "undoUse", { useId: "g06-dex" }, "g06-dex-undo");
  assert.equal(martialDCChoice(chained), "str", "undo of a changed choice restores the previous value, not absence");

  // Unrelated later edits survive.
  const unrelated = guard({ level: 5, aggression: 4 });
  await use(unrelated, "smite", { amount: 1 }, "g06-smite");
  await unrelated.update({ "flags.ak5e.unrelatedNote": "keep me" });
  assert.equal(aggression(unrelated).value, 3);
  await use(unrelated, "undoUse", { useId: "g06-smite" }, "g06-smite-undo");
  assert.equal(aggression(unrelated).value, 4, "the resource came back");
  assert.equal(unrelated.flags.ak5e.unrelatedNote, "keep me", "the unrelated edit survived the undo");

  // B-133 conflicts: explained before undo, and the conflicting field is not overwritten.
  const conflict = guard({ level: 5, branch: "artsblade" });
  await use(conflict, "chooseMartialDC", { ability: "str" }, "g06-c-str");
  await use(conflict, "chooseMartialDC", { ability: "dex" }, "g06-c-dex");
  conflict.flags.ak5e.guard.martialDCAbility = null; // a later external edit
  const review = guardUses.previewUndo(conflict, "g06-c-dex");
  assert.match(review.lines.join(" "), /changed after this use/, "the conflict is explained before undoing");
  await use(conflict, "undoUse", { useId: "g06-c-dex" }, "g06-c-undo");
  assert.equal(conflict.flags.ak5e.guard.martialDCAbility, null, "the conflicting later value is not overwritten");

  // Encounter locks stay visible and enforced (base pool is refunded only within the window).
  const locked = guard({ level: 5, aggression: 4 });
  await use(locked, "smite", { amount: 1 }, "g06-lock");
  assert.equal(aggression(locked).value, 3);
  setEpoch(1); // a new encounter window
  assert.equal(guardUses.uses(locked).find(u => u.id === "g06-lock").locked, true, "the receipt is visibly locked");
  assert.equal(guardUses.previewUndo(locked, "g06-lock").blocked, true, "the review says it is locked");
  await assert.rejects(() => guardUses.command(locked, "undoUse", { useId: "g06-lock" }, "g06-lock-undo"), /locked/i);
  assert.equal(aggression(locked).value, 3, "the locked undo changed nothing");
});

/* ------------------------------------------------------------------ G07 */

test("G07_durable_reaction_failure_retry: injected write failures strand nothing, retries spend exactly once, and undo refunds only committed changes", async () => {
  const { reactions } = baseWorld();
  const actor = guard({ level: 5, aggression: 4 });
  const original = actor.update.bind(actor);
  let failureCountdown = 1;
  actor.update = async changes => {
    if (failureCountdown-- === 1) throw new Error("injected persistence failure");
    return original(changes);
  };

  await assert.rejects(() => guardUses.command(actor, "forestall", { confirmed: true, amount: 2 }, "g07-use"), /injected persistence failure/);
  assert.equal(aggression(actor).value, 4, "the failed attempt spent no Aggression");
  assert.equal(reactions.get(actor.uuid), undefined, "the failed attempt spent no Reaction");
  assert.equal(guardUses.uses(actor).length, 0, "and left no committed receipt");

  failureCountdown = -1;
  const retry = await guardUses.command(actor, "forestall", { confirmed: true, amount: 2 }, "g07-use"); // same operation id
  assert.equal(retry.acBonus, 6, "the retry completed");
  assert.equal(aggression(actor).value, 2, "the retry spent exactly once in total");
  const store = reactions.get(actor.uuid);
  assert.equal(store.spent, 1, "exactly one Reaction was spent");
  assert.equal(Object.keys(store.triggers).length, 1);

  await guardUses.command(actor, "undoUse", { useId: "g07-use" }, "g07-undo");
  assert.equal(aggression(actor).value, 4, "undo refunded the committed spend");
  assert.equal(reactions.get(actor.uuid).spent, 0, "undo returned the committed Reaction");

  const again = await guardUses.command(actor, "undoUse", { useId: "g07-use" }, "g07-undo-2");
  assert.equal(again.already, true, "a replayed undo is a no-op");
  assert.equal(aggression(actor).value, 4, "nothing was refunded twice");

  // The Unrelenting pool must be durable the same way.
  const rel = guard({ level: 5, unrelenting: 1 });
  const relOriginal = rel.update.bind(rel);
  let relFail = 1;
  rel.update = async changes => { if (relFail-- === 1) throw new Error("injected persistence failure"); return relOriginal(changes); };
  await assert.rejects(() => guardUses.command(rel, "unrelenting", { confirmed: true }, "g07-rel"), /injected persistence failure/);
  assert.equal(unrelenting(rel).value, 1, "the failed attempt spent no Unrelenting use");
  assert.equal(reactions.get(rel.uuid), undefined, "the failed attempt spent no Reaction");
  rel.update = relOriginal;
  await guardUses.command(rel, "unrelenting", { confirmed: true }, "g07-rel");
  assert.equal(unrelenting(rel).value, 0, "the retry spent exactly once");
  await guardUses.command(rel, "undoUse", { useId: "g07-rel" }, "g07-rel-undo");
  assert.equal(unrelenting(rel).value, 1, "undo returned the use");
});

/* ------------------------------------------------------------------ G08 */

test("G08_eternal_roll_button_once: the 18th-level Unrelenting exposes an awaiting-Roll receipt that survives reload, rolls exactly once on click, caps at maximum and undoes", async () => {
  baseWorld();

  const actor = guard({ level: 18, aggression: 2, unrelenting: 2, id: "g08a" });
  countedRoll(3);
  await guardUses.command(actor, "unrelenting", { confirmed: true }, "g08-use");
  const receipt = guardUses.receipt(actor, "g08-use");
  assert.equal(receipt.status, "awaitingRoll", "the confirmation evaluated no dice");
  assert.equal(receipt.formula, "1d4", "Eternal Aggression rolls 1d4 per C3:1938");
  assert.match(String(guardUses.uses(actor).find(u => u.id === "g08-use").rollLabel), /Eternal Aggression/, "an owner/GM Roll affordance is exposed");
  assert.equal(rolls, 0, "nothing was rolled during the workflow");
  assert.equal(aggression(actor).value, 2, "confirmation granted no Aggression");

  // Reload: a fresh in-memory Actor carrying the persisted flags still sees the awaiting receipt.
  const reloaded = guard({ level: 18, aggression: 2, unrelenting: 2, id: "g08a" });
  reloaded.uuid = actor.uuid;
  reloaded.flags = structuredClone(actor.flags);
  assert.equal(guardUses.receipt(reloaded, "g08-use").status, "awaitingRoll", "the intent survives a reload");
  await guardUses.command(reloaded, "useRoll", { useId: "g08-use" }, "g08-roll");
  assert.equal(rolls, 1, "the click rolled exactly once");
  assert.equal(aggression(reloaded).value, 5, "recovered the rolled 3");
  await guardUses.command(reloaded, "useRoll", { useId: "g08-use" }, "g08-roll-again");
  assert.equal(rolls, 1, "a replayed Roll click evaluates no second die");
  assert.equal(aggression(reloaded).value, 5, "and recovers nothing more");

  await guardUses.command(reloaded, "undoUse", { useId: "g08-use" }, "g08-undo");
  assert.equal(aggression(reloaded).value, 2, "undo reversed the committed recovery");
  assert.equal(unrelenting(reloaded).value, 2, "and the spent use");

  // Recovery caps at the pool maximum; Pursuit keeps its established 2d4.
  const capped = guard({ level: 18, aggression: 7, unrelenting: 2 });
  countedRoll(9);
  await guardUses.command(capped, "pursuitUnrelenting", { confirmed: true, actionType: "action" }, "g08-pursuit");
  assert.equal(guardUses.receipt(capped, "g08-pursuit").formula, "2d4", "two expended uses roll two d4 (established behaviour pending manager ruling)");
  await guardUses.command(capped, "useRoll", { useId: "g08-pursuit" }, "g08-pursuit-roll");
  assert.equal(aggression(capped).value, 8, "recovery stops at the maximum of 8");

  // Below 18th level there is no Eternal Aggression.
  const below = guard({ level: 17, aggression: 4, unrelenting: 1 });
  await guardUses.command(below, "unrelenting", { confirmed: true }, "g08-below");
  assert.equal(guardUses.receipt(below, "g08-below").formula, undefined, "Eternal Aggression is an 18th-level feature");
});

/* ------------------------------------------------------------------ G09 */

test("G09_pursuit_action_choices: the Pursuit sheet flow offers Action or Bonus Action and honours the choice", async () => {
  baseWorld();
  const actor = guard({ level: 11, unrelenting: 2 });
  const seen = dialogHarness({ wait: [{ action: "ok", values: { actionType: "bonusAction" } }, { action: "use" }] });

  const first = await executeGuardDialog(actor, "pursuitUnrelenting");

  // AC9 / B-132-adjacent: Pursuit must let the player choose Action or Bonus Action (C3:1934-1940)
  // via a form, then confirm.
  assert.ok(seen.length >= 2, "a Pursuit form dialog appears before the confirmation");
  assert.match(String(seen[0].content), /Bonus Action/i, "the form offers the Bonus Action option");
  assert.match(String(seen[0].content), /\bAction\b/, "and the Action option");
  assert.equal(first?.actionType, "Bonus Action", "the chosen mode is what executes");

  // A malformed mode must be rejected before any write, not silently coerced.
  const strict = guard({ level: 11, unrelenting: 2 });
  await assert.rejects(
    () => guardUses.command(strict, "pursuitUnrelenting", { confirmed: true, actionType: "sleep" }, "g09-mode"),
    /Action|Bonus/i,
    "an unknown action mode is refused"
  );
  assert.equal(strict.writes.length, 0, "the refused mode wrote nothing");
});

test("G09_unrelenting_aggression_formula: the miss-damage flow uses the wielded weapon's dice, never a silent 1d8 and never the ability modifier", async () => {
  baseWorld();
  const actor = guard({ level: 15, aggression: 4 });
  meleeWeapon(actor, { formula: "1d10" });
  const seen = dialogHarness({ wait: [{ action: "ok", values: { weaponUuid: `${actor.uuid}.Item.glaive` } }, { action: "use" }] });

  await executeGuardDialog(actor, "unrelentingAggression");

  // AC9: the flow must obtain the intended weapon-damage formula rather than silently
  // assuming 1d8 (C3:1949-1951 rolls "the Damage for that Attack" without the Ability modifier).
  assert.ok(seen.length >= 2, "a form precedes the confirmation so the weapon/damage source is captured");
  const receipt = guardUses.uses(actor).find(u => u.command === "unrelentingAggression");
  assert.equal(String(receipt?.formula), "1d10", "the previewed use carries the wielded weapon's damage dice");
  assert.doesNotMatch(String(receipt?.formula ?? ""), /\+/, "no ability modifier is ever auto-added");
});

test("G09_input_validation: malformed amounts, formulas and identifiers are rejected before any write", async () => {
  const { use } = baseWorld();
  const actor = guard({ level: 5, aggression: 4 });

  for (const [index, amount] of [0, 4, -1, "abc", 1.5, NaN].entries()) {
    await assert.rejects(
      () => guardUses.command(actor, "forestall", { confirmed: true, amount }, `g09-amount-${index}`),
      /Aggression to expend/,
      `amount ${String(amount)} is refused`
    );
  }
  await assert.rejects(() => guardUses.command(actor, "unrelentingAggression", { confirmed: true, formula: "fireball()" }, "g09-formula"), /weapon's damage dice/);
  await assert.rejects(() => guardUses.command(actor, "chooseMartialDC", { confirmed: true, ability: "luck" }, "g09-ability"), /Strength or Dexterity/);
  await assert.rejects(() => guardUses.command(actor, "nope", { confirmed: true }, "g09-cmd"), /Unknown Guard command/);
  await assert.rejects(() => guardUses.command(actor, "constructor", { confirmed: true }, "g09-proto"), /Unknown Guard command/, "prototype keys are not commands");
  assert.equal(actor.writes.length, 0, "every refusal happened before any write");
  assert.equal(aggression(actor).value, 4);

  // A well-formed miss-damage formula is stored verbatim and stays player-rolled.
  const ok = guard({ level: 15, aggression: 4 });
  countedRoll(7);
  await use(ok, "unrelentingAggression", { formula: "2d6" }, "g09-ok");
  const receipt = guardUses.receipt(ok, "g09-ok");
  assert.equal(receipt.formula, "2d6", "the supplied formula is kept exactly");
  assert.doesNotMatch(receipt.formula, /\+/, "without an appended ability modifier");
  assert.equal(receipt.status, "awaitingRoll", "the player starts the dice");
  assert.equal(rolls, 0);
});

/* ------------------------------------------------------------------ G10 */

test("G10_progression_preview_apply_keys: the progression engine exposes fields, honours the accepted key and demands re-preview after changes", async () => {
  baseWorld();
  const actor = guard({ level: 5 });
  const fields = inspectGuardFields(actor);
  for (const key of ["branch", "fightingStyle", "saves", "skills", "hp.1", "asi.4"]) {
    assert.ok(fields.some(f => f.key === key), `the entry must be able to expose the field ${key}`);
  }
  let plan = await previewGuardProgression(actor, levelChoices());
  await applyGuardProgression(actor, { confirmed: true, contextKey: plan.contextKey, ...levelChoices() });

  plan = await previewGuardProgression(actor, levelChoices());
  actor.system.attributes.hp.max += 1; // character data changed after the preview
  await assert.rejects(
    () => applyGuardProgression(actor, { confirmed: true, contextKey: plan.contextKey, ...levelChoices() }),
    /changed since the preview/,
    "a changed character requires a fresh preview"
  );
});

test("G10_progression_entry_apply_cancel: the owner-accessible controls expose a progression entry with a field preview and explicit Apply/Cancel", async () => {
  baseWorld();
  const actor = guard({ level: 5 });

  // AC10: an owner must be able to reach the existing base progression fields from
  // the sheet/controls. Today the controls markup offers no such entry at all.
  const seen = dialogHarness({ wait: [{ action: "close" }] });
  const { acts } = await openControls(actor, { seen });
  const content = String(seen[0].content);
  assert.match(content, /progression/i, "the Guard controls expose a base progression entry");
  assert.ok(acts.__progression, "the entry is a reachable control action");

  // Once present, it must preview the current fields and only Apply with the accepted key.
  const flow = dialogHarness({ wait: [{ action: "close" }, { action: "apply" }, { action: "use" }] });
  const withEntry = await openControls(actor, { seen: flow });
  withEntry.acts.__progression({ preventDefault() {} });
  await settle(() => flow.length >= 2, "the progression preview");
  assert.match(String(flow[1].content), /Fighting Style|fightingStyle/i, "the preview exposes the existing base fields");
  assert.ok(flow[1].buttons.some(b => /apply/i.test(b.label)), "with an explicit Apply");
  assert.ok(flow[1].buttons.some(b => /cancel/i.test(b.label)), "and an explicit Cancel");
});

/* ------------------------------------------------------------------ G11 */

test("G11_base_rules_agency: printed thresholds, recovery, costs, PB multipliers, warning overrides, clamping and the no-auto-roll rule are preserved", async () => {
  const { use } = baseWorld();

  // Printed pool thresholds (C3:1877-1879) and recovery (Short/Long Rest; Unrelenting per Long Rest).
  assert.deepEqual([aggressionMax(1), aggressionMax(7), aggressionMax(14), aggressionMax(20)], [4, 6, 8, 8]);
  assert.deepEqual([unrelentingMax(2), unrelentingMax(3), unrelentingMax(11)], [0, 1, 2]);
  const aggressionDef = getPoolDefinition("aggression");
  assert.deepEqual(aggressionDef.recovery.map(r => r.on).sort(), ["lr", "sr"], "Aggression recovers on both rest types (C3:1880-1881)");
  assert.deepEqual(getPoolDefinition("unrelenting").recovery.map(r => r.on), ["lr"], "Unrelenting returns on a Long Rest (C3:1902)");

  // Base costs multiply by the Proficiency Bonus (PB 3 here) (C3:1882-1892).
  const forestall = guard({ level: 5, aggression: 4 });
  assert.equal((await use(forestall, "forestall", { amount: 2 }, "g11-f")).acBonus, 6, "Forestall: 2 × PB");
  const smite = guard({ level: 5, aggression: 4 });
  assert.equal((await use(smite, "smite", { amount: 3 }, "g11-s")).damageBonus, 9, "Smite: 3 × PB");
  assert.equal((await use(smite, "smite", { amount: 3 }, "g11-s2").catch(() => null)) === null, true, "a repeat needs an override, never silently succeeds");
  const strike = guard({ level: 5, aggression: 4 });
  assert.equal((await use(strike, "strikeTrue", { amount: 1 }, "g11-t")).attackBonus, 3, "Strike True: 1 × PB");
  const miss = guard({ level: 15, aggression: 4 });
  assert.equal((await use(miss, "unrelentingAggression", { formula: "1d8" }, "g11-u")).aggressionSpent, 2, "Unrelenting Aggression costs 2 Aggression (C3:1949)");

  // Timing/prerequisite problems warn and allow a public override; overspending clamps at zero.
  const underleveled = guard({ level: 2, unrelenting: 1 });
  await assert.rejects(() => use(underleveled, "unrelenting", {}, "g11-lv"), error => error.name === "AK5eWarnings" && error.warnings.some(w => w.id === "level"), "the level-3 gate warns, never silently blocks");
  const overridden = await use(underleveled, "unrelenting", { overrides: ["level", "unrelenting"] }, "g11-lv-override");
  assert.ok(overridden, "every warning is publicly overridable by the player");

  const broke = guard({ level: 5, aggression: 0 });
  dialogHarness({ wait: [{ action: "use" }] });
  await runGuardUse(broke, "Press the Attack: Smite", "smite", { amount: 2 });
  assert.equal(aggression(broke).value, 0, "the overspend clamps at zero");
  const brokeReceipt = guardUses.uses(broke).at(-1);
  assert.match(JSON.stringify(guardUses.receipt(broke, brokeReceipt.id)), /short by 2/, "the shortfall is on the durable receipt");
  assert.match(String(game.messages.at(-1)?.content ?? ""), /Used anyway/, "the override is published on the card");

  // Feature workflows never start attack/damage/save dice themselves (WORKFLOW §3.2).
  const before = rolls;
  const rollActor = guard({ level: 5, aggression: 4 });
  await use(rollActor, "smite", { amount: 1 }, "g11-rolls");
  const rel = guard({ level: 18, aggression: 4, unrelenting: 2 });
  await use(rel, "unrelenting", {}, "g11-rolls-rel");
  assert.equal(guardUses.receipt(rel, "g11-rolls-rel").status, "awaitingRoll", "the Eternal Aggression path waits for the player's click");
  assert.equal(rolls, before, "no feature workflow evaluated a die");
});

/* ------------------------------------------------------------------ G12 */

test("G12_setup_receipts_undo: setup changes expose a receipt identifier, before-state, created IDs and a reachable undo", async () => {
  baseWorld();
  const actor = guard({ level: 3 });
  const preview = await previewGuardSetup(actor);
  const applied = await applyGuardSetup(actor, { confirmed: true, contextKey: preview.contextKey });

  // AC12: package-created changes must be reversible through an exposed receipt.
  assert.ok(applied.receiptId || applied.receipt, "an exposed receipt identifier for the setup changes");
  const setupApi = await import("../scripts/guard-setup.mjs");
  assert.ok(Object.keys(setupApi).some(k => /undo|revert/i.test(k)), "a reachable setup undo path exists");
  const receipt = guardUses.state(actor)?.setup ?? applied.receipt;
  assert.ok(receipt, "the receipt is retrievable");
  assert.ok(receipt.before, "it carries the Actor's before state");
  assert.ok(Array.isArray(receipt.createdIds) && receipt.createdIds.length === preview.creates.length, "it records the created document IDs");
});

test("G12_progression_receipts_undo: progression changes expose a receipt identifier, before-state, created IDs and a reachable undo", async () => {
  baseWorld();
  const actor = guard({ level: 5 });
  const choices = levelChoices({ hp: { 1: { mode: "fixed", roll: 10 } } });
  const plan = await previewGuardProgression(actor, choices);
  const applied = await applyGuardProgression(actor, { confirmed: true, contextKey: plan.contextKey, ...choices });

  assert.ok(applied.receiptId || applied.receipt, "the progression apply exposes a receipt identifier");
  const progressionApi = await import("../scripts/guard-progression.mjs");
  assert.ok(Object.keys(progressionApi).some(k => /undo|revert/i.test(k)), "a reachable progression undo path exists");
  // Created Items of an unchanged later operation must be removable, while authored
  // or edited documents are preserved with an explanation (AC12) — unreachable until
  // the receipt and undo path exist.
  const receipt = applied.receipt ?? guardUses.state(actor)?.progression;
  assert.ok(receipt?.before, "the receipt carries the Actor's before state");
  assert.ok(Array.isArray(receipt?.createdIds), "and the created document IDs");
});
