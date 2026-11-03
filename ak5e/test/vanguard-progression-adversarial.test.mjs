import test from "node:test";
import assert from "node:assert/strict";
import {
  previewVanguardProgression, applyVanguardProgression
} from "../scripts/vanguard-progression.mjs";
import { openVanguardProgression } from "../scripts/vanguard-sheet.mjs";
import { VANGUARD_CLASS_ID } from "../scripts/vanguard-rules.mjs";
import {
  setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem
} from "./base-classes-fixture.mjs";

let originalCSSDescriptor;
test.beforeEach(() => {
  setupFoundryGlobals();
  originalCSSDescriptor = Object.getOwnPropertyDescriptor(globalThis, "CSS");
  if (typeof globalThis.CSS?.escape !== "function") {
    globalThis.CSS = { ...globalThis.CSS, escape: value => String(value) };
  }
});
test.afterEach(() => {
  teardownFoundryGlobals();
  if (originalCSSDescriptor) Object.defineProperty(globalThis, "CSS", originalCSSDescriptor);
  else delete globalThis.CSS;
});

function createActor(level = 1, options = {}) {
  const vClass = createTestItem({
    name: "Vanguard", type: "class", system: { levels: level },
    flags: { ak5e: { chapterThreeId: VANGUARD_CLASS_ID } }
  });
  return createTestActor({
    items: [vClass],
    system: {
      attributes: { hp: { value: 10, max: 10, temp: 0 }, prof: 2 },
      abilities: {
        str: { value: 12, mod: 1, proficient: 0 },
        dex: { value: 16, mod: 3, proficient: 0 },
        con: { value: 14, mod: 2, proficient: 0 },
        int: { value: 10, mod: 0, proficient: 0 },
        wis: { value: 10, mod: 0, proficient: 0 },
        cha: { value: 12, mod: 1, proficient: 0 }
      },
      skills: { acr: { value: 0 }, ath: { value: 0 }, prc: { value: 0 }, per: { value: 0 }, ste: { value: 0 }, ak5ewilderness: { value: 0 } },
      traits: { saves: { value: ["custom-save"] }, armorProf: { value: [] }, weaponProf: { value: [] }, toolProf: { value: [] } },
      currency: { cp: 0 },
      ...options.system
    },
    flags: options.flags ?? {}
  });
}

const choices = save => ({
  branch: "subclass-vanguard-agent", martialDCAbility: "dex", saves: [save],
  skills: ["acr", "ath", "ste"], tool: "Messenger Kit",
  startingEquipment: { mode: "existing" }, hp: { 1: { mode: "fixed" } }
});

test("Vanguard saving throw proficiency uses native ability fields and preserves other values", async () => {
  for (const selected of ["str", "cha"]) {
    const actor = createActor(1, { system: { abilities: {
      dex: { value: 16, mod: 3, proficient: 0 },
      str: { value: 12, mod: 1, proficient: selected === "str" ? 0 : 2 },
      cha: { value: 12, mod: 1, proficient: selected === "cha" ? 0 : 1 },
      wis: { value: 10, mod: 0, proficient: 2 }
    } } });
    const plan = await previewVanguardProgression(actor, choices(selected));
    assert.equal(plan.writes["system.abilities.dex.proficient"], 1);
    assert.equal(plan.writes[`system.abilities.${selected}.proficient`], 1);
    assert.equal(plan.writes["system.traits.saves.value"], undefined);
    await applyVanguardProgression(actor, { confirmed: true, contextKey: plan.contextKey, choices: choices(selected) });
    assert.equal(actor.system.abilities.dex.proficient, 1);
    assert.equal(actor.system.abilities[selected].proficient, 1);
    assert.equal(actor.system.abilities[selected === "str" ? "cha" : "str"].proficient, selected === "str" ? 1 : 2);
    assert.equal(actor.system.abilities.wis.proficient, 2, "custom proficiency values on unrelated abilities survive");
    assert.deepEqual(actor.system.traits.saves.value, ["custom-save"], "obsolete save list remains untouched");
  }
});

test("stale Vanguard progression previews are rejected without changing Actor state", async () => {
  const actor = createActor();
  const selected = choices("str");
  const plan = await previewVanguardProgression(actor, selected);
  const before = structuredClone(actor.toObject());
  await actor.update({ "system.abilities.int.value": 11 });
  const changed = structuredClone(actor.toObject());
  await assert.rejects(() => applyVanguardProgression(actor, {
    confirmed: true, contextKey: plan.contextKey, choices: selected
  }));
  assert.deepEqual(actor.toObject(), changed, "rejecting a stale plan causes no further writes");
  assert.notDeepEqual(changed, before, "fixture mutation makes the preview stale");
});

test("replaying an approved Vanguard progression does not double grant and preserves custom Actor state", async () => {
  const actor = createActor();
  const selected = choices("cha");
  const first = await previewVanguardProgression(actor, selected);
  await applyVanguardProgression(actor, { confirmed: true, contextKey: first.contextKey, choices: selected });
  await actor.update({ "flags.ak5e.customMarker": { authored: true }, "system.abilities.wis.proficient": 2 });
  const afterFirst = structuredClone(actor.toObject());
  const replay = await previewVanguardProgression(actor, selected);
  await applyVanguardProgression(actor, { confirmed: true, contextKey: replay.contextKey, choices: replay.choices });
  assert.equal(actor.system.abilities.dex.proficient, 1);
  assert.equal(actor.system.abilities.cha.proficient, 1);
  assert.equal(actor.system.attributes.hp.max, afterFirst.system.attributes.hp.max);
  assert.deepEqual(actor.getFlag("ak5e", "customMarker"), { authored: true });
  assert.equal(actor.system.abilities.wis.proficient, 2);
  assert.equal(actor.items.size, afterFirst.items.length, "replay does not create duplicate progression Items");
});

function mockDialogSequence(plays) {
  const calls = [];
  foundry.applications ??= {};
  foundry.applications.api ??= {};
  foundry.applications.api.DialogV2 = { async wait(config) {
    const play = plays.shift();
    assert.ok(play, "unexpected dialog after cancellation");
    calls.push(config);
    const button = play.action === "close"
      ? null
      : config.buttons.find(entry => play.cancel
        ? entry.action === "cancel" || /cancel/i.test(entry.label)
        : entry.action !== "cancel" && !/cancel/i.test(entry.label));
    assert.ok(play.action === "close" || button, "dialog exposes the expected cancel or continue action");
    if (play.action === "close") return null;
    // DialogV2 resolves a nullish callback result to the truthy action name.
    const result = await button.callback?.(null, { form: { elements: {}, querySelectorAll: () => [] } });
    return result ?? button.action;
  } };
  return calls;
}

for (const stage of ["choices", "review"]) {
  for (const ending of ["cancel", "close"]) {
    test(`openVanguardProgression: ${ending} from ${stage} stops without writes or another action`, async () => {
      const actor = createActor();
      const before = structuredClone(actor.toObject());
      const plays = stage === "choices"
        ? [{ action: ending, cancel: ending === "cancel" }]
        : [{ action: "continue" }, { action: ending, cancel: ending === "cancel" }];
      const dialogs = mockDialogSequence(plays);
      const result = await openVanguardProgression(actor, choices("str"));
      assert.notEqual(result, true, "cancellation must not be treated as the truthy action name");
      assert.deepEqual(actor.toObject(), before, "cancel/close leaves all Actor state unchanged");
      assert.equal(dialogs.length, stage === "choices" ? 1 : 2, "no later preview/apply dialog follows cancellation");
      assert.equal(plays.length, 0);
    });
  }
}
