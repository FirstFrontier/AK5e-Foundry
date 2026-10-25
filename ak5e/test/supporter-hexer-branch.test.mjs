import test from "node:test";
import assert from "node:assert/strict";
import { setupFoundryGlobals, createTestActor } from "./base-classes-fixture.mjs";

setupFoundryGlobals();
const { SUPPORTER_BRANCH_MODULES, initSupporterBranches, supporterBranchApis } = await import("../scripts/supporter-branches.mjs");
await import("../scripts/supporter-branch-index.mjs");
const { supporterUses } = await import("../scripts/supporter-uses.mjs");
const { supporterPanelHtml } = await import("../scripts/supporter-sheet.mjs");

function hexer(level = 17) {
  return createTestActor({
    name: "Hexer", type: "character", level,
    items: [
      { name: "Supporter", type: "class", system: { levels: level }, flags: { ak5e: { chapterThreeId: "class-supporter" } } },
      { name: "Hexer", type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-supporter-hexer" } } }
    ],
    flags: { ak5e: { supporter: { enabled: true, branch: "hexer", aidAbility: "cha" } } }
  });
}

test("the branch index registers one Hexer module with the Arts and Hex plans composed", () => {
  const hexerModule = SUPPORTER_BRANCH_MODULES.get("hexer");
  assert.ok(hexerModule, "hexer branch registered");
  for (const plan of ["configureHexerArts", "potentHex", "cursemark", "ultimateHex", "ultimateHexPart"]) {
    assert.equal(typeof hexerModule.plans[plan], "function", plan);
  }
  assert.ok(supporterBranchApis().hexer?.arts, "the API exposes the Arts setup alongside the Hexes");
});

test("initSupporterBranches runs the Hexer pools and hooks once", () => {
  initSupporterBranches();
  assert.doesNotThrow(() => initSupporterBranches());
});

test("the sheet's branch slot shows the Arts setup and the Hexes", () => {
  initSupporterBranches();
  const html = supporterPanelHtml(hexer());
  assert.match(html, /data-supporter-cmd="configureHexerArts"/);
  assert.match(html, /data-supporter-cmd="potentHex"/);
});

test("branch command routing leaves unknown controls to the Supporter dispatcher", async () => {
  const command = SUPPORTER_BRANCH_MODULES.get("hexer").command;
  assert.equal(await command(hexer(), "not-a-hexer-control"), undefined);
});

test("composed plans run through the Supporter engine", () => {
  initSupporterBranches();
  // Reaching the Hex plan's own target check proves the engine found the composed plan (not "unknown command").
  assert.throws(() => supporterUses.plan(hexer(), "potentHex", { kind: "looping" }), /target creature for this Hex/);
});

/* ---- R1 rulings: Rupturing burst and Force rider dedupe, Art cast wording, Cursemark distance ---- */

const hexerHooks = async () => {
  const H = await import("../scripts/hexer-features.mjs");
  H.defineHexerPools();
  H.registerHexerHooks();
  return H;
};
const { emitAk5eEvent } = await import("../scripts/trigger-events.mjs");

/** Records every chat card the Hexer code posts (call restore in finally). */
function captureChat() {
  const posted = [];
  const create = ChatMessage.implementation.create;
  ChatMessage.implementation.create = async (data, opts) => { posted.push(data); return create(data, opts); };
  return { posted, restore: () => { ChatMessage.implementation.create = create; } };
}

/** One Hex effect (flags.ak5e.hex) on `target` from `source`. `ultimate` marks an Ultimate Hex part. */
async function hexOn(target, source, { kind = "looping", ultimate = false } = {}) {
  await target.createEmbeddedDocuments("ActiveEffect", [{
    name: `Hex ${kind}`, origin: source.uuid,
    flags: { ak5e: { hex: { source: source.uuid, kind, ultimate, expires: 160 } } }
  }]);
}

const foeFor = (name = "Foe") => createTestActor({ name, hp: { value: 0, max: 30, temp: 0 } });
const burstCards = posted => posted.filter(data => String(data.content ?? "").includes("Rupturing Hex</h3>"));
const riderCards = posted => posted.filter(data => String(data.content ?? "").includes("Hex rider</h3>"));

test("R1 burst: one Ultimate Hex (three effects) from one Hexer posts exactly one burst card on a kill", async () => {
  await hexerHooks();
  const hexerActor = hexer(17), foe = foeFor();
  for (const kind of ["abjuring", "looping", "voicethief"]) await hexOn(foe, hexerActor, { kind, ultimate: true });
  const chat = captureChat();
  try {
    await emitAk5eEvent("kill", { actorUuid: foe.uuid, eventId: "kill:r1-burst-one" });
    assert.equal(burstCards(chat.posted).length, 1, "one card per (Hexer, creature)");
    assert.equal((String(burstCards(chat.posted)[0].content).match(/data-ak5e-hexer-roll=/g) ?? []).length, 1, "one burst button");
  } finally { chat.restore(); }
});

test("R1 burst: two different Hexers each with an Ultimate Hex on the creature each get their own card", async () => {
  await hexerHooks();
  const first = hexer(17), second = hexer(17), foe = foeFor("Two Hexers");
  await hexOn(foe, first, { kind: "looping", ultimate: true });
  await hexOn(foe, second, { kind: "looping", ultimate: true });
  const chat = captureChat();
  try {
    await emitAk5eEvent("kill", { actorUuid: foe.uuid, eventId: "kill:r1-burst-two" });
    assert.equal(burstCards(chat.posted).length, 2);
  } finally { chat.restore(); }
});

test("R1 burst: each burst button carries its own once-key, so a later kill of the creature gets a fresh card", async () => {
  await hexerHooks();
  const hexerActor = hexer(17), foe = foeFor("Killed twice");
  await hexOn(foe, hexerActor, { kind: "looping", ultimate: true });
  const chat = captureChat();
  try {
    await emitAk5eEvent("kill", { actorUuid: foe.uuid, eventId: "kill:r1-once-a" });
    await emitAk5eEvent("kill", { actorUuid: foe.uuid, eventId: "kill:r1-once-b" });
    const keys = burstCards(chat.posted).map(data => /data-ak5e-hexer-once="([^"]+)"/.exec(String(data.content))?.[1]);
    assert.equal(keys.length, 2);
    assert.ok(keys.every(Boolean), "each burst button is keyed");
    assert.notEqual(keys[0], keys[1], "the keys are per card, not per creature");
  } finally { chat.restore(); }
});

test("R1 rider: three Hexes from one Hexer on a hit post exactly one rider card and record one rider", async () => {
  await hexerHooks();
  const hexerActor = hexer(9), foe = foeFor("Hexed");
  for (const kind of ["abjuring", "looping", "breaking"]) await hexOn(foe, hexerActor, { kind });
  const chat = captureChat();
  try {
    await emitAk5eEvent("hit", { targetUuid: foe.uuid, actorUuid: foeFor("Attacker").uuid, ac: 12, eventId: "hit:r1-rider-one" });
    assert.equal(riderCards(chat.posted).length, 1, "one rider card for one hit");
    assert.equal(hexerActor.getFlag("ak5e", "hexer")?.riderTaken?.[foe.uuid.replaceAll(".", "%2E")], true, "one rider recorded");
  } finally { chat.restore(); }
});

test("R1 rider: two Hexers each with a Hex on the creature each get one rider card", async () => {
  await hexerHooks();
  const first = hexer(9), second = hexer(9), foe = foeFor("Two riders");
  await hexOn(foe, first, { kind: "looping" });
  await hexOn(foe, second, { kind: "looping" });
  const chat = captureChat();
  try {
    await emitAk5eEvent("hit", { targetUuid: foe.uuid, actorUuid: foeFor("Attacker 2").uuid, ac: 12, eventId: "hit:r1-rider-two" });
    assert.equal(riderCards(chat.posted).length, 2);
  } finally { chat.restore(); }
});

test("R1 art cast: a cast with no Damage information posts neutral wording, never the Damage claim", async () => {
  await hexerHooks();
  const actor = hexer(5);
  const chat = captureChat();
  try {
    await emitAk5eEvent("artCast", { actorUuid: actor.uuid, operationId: "ac-neutral", amount: 1, level: 1, eventId: "artCast:r1-neutral" });
    const text = chat.posted.map(data => String(data.content ?? "")).join("\n");
    assert.doesNotMatch(text, /dealt Damage/i, "no Damage claim without damage in the event");
    assert.match(text, /Art cast: if the Art damaged a creature/, "neutral wording");
  } finally { chat.restore(); }
});

test("R1 art cast: a cast whose event says Damage was dealt keeps the Damage wording", async () => {
  await hexerHooks();
  const actor = hexer(5);
  const chat = captureChat();
  try {
    await emitAk5eEvent("artCast", { actorUuid: actor.uuid, operationId: "ac-damage", amount: 1, level: 1, damage: true, eventId: "artCast:r1-damage" });
    const text = chat.posted.map(data => String(data.content ?? "")).join("\n");
    assert.match(text, /You dealt Damage with an Art/);
  } finally { chat.restore(); }
});

test("R1 cursemark distance: the recorded grid distance sets feet per cell; an absent one falls back to 5 ft", async () => {
  const H = await import("../scripts/hexer-features.mjs");
  const point = { x: 0, y: 0 };
  const token = { uuid: "Actor.nearby", actor: { uuid: "Actor.nearby" }, x: 150, y: 0, sceneId: null };
  const base = { id: "m-grid", point, kind: "looping", radius: 10, gridSize: 100, expires: 160 };
  const tenFootGrid = createTestActor({ name: "Ten", level: 10, flags: { ak5e: { hexer: { cursemarks: [{ ...base, gridDistance: 10 }] } } } });
  const fallback = createTestActor({ name: "Fallback", level: 10, flags: { ak5e: { hexer: { cursemarks: [base] } } } });
  // 150 px on a 100 px cell is 1.5 cells: 15 ft on a 10 ft grid (outside 10 ft), 7.5 ft on the 5 ft fallback (inside).
  assert.deepEqual(H.cursemarkTargets(tenFootGrid, "m-grid", [token]), []);
  assert.equal(H.cursemarkTargets(fallback, "m-grid", [token]).length, 1);
});
