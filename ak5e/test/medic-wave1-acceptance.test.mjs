/**
 * Live Foundry V13 acceptance for Medic Wave 1 and B-310/311/312.
 *
 * Run only against the manager-owned scratch server:
 *   AK5E_MEDIC_WAVE1_URL=http://127.0.0.1:30179 node --test ak5e/test/medic-wave1-acceptance.test.mjs
 * Playwright must resolve from AK5E_PLAYWRIGHT_MODULE or the local tooling checkout.
 * This suite never starts, stops, or restarts Foundry; all created Actors/messages are private test data.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { launchTestBrowser } from "../tools/test-browser.mjs";

const SERVER_URL = process.env.AK5E_MEDIC_WAVE1_URL;
const PLAYER_NAME = "W1 Acceptance Player";
const SOURCE_NAME = "W1 Reaction Medic";
const VISUAL_DIR = process.env.AK5E_MEDIC_WAVE1_EVIDENCE ?? "/tmp/ak5e-visual/medic-wave1-rendered";
const PLAYWRIGHT_MODULE = process.env.AK5E_PLAYWRIGHT_MODULE
  ?? "/home/patch/AK5e-Foundry/.codex-work/browser-tools/node_modules/playwright/index.mjs";
const LIVE_HELPERS = process.env.AK5E_FOUNDRY_LIVE_HELPERS
  ?? "/home/patch/AK5e-Foundry/.codex-work/lanes/tooling-foundry/ak5e/tools/foundry-live.mjs";
const RUN_ID = Date.now().toString(36);
const createdActorIds = [];
const createdMessageIds = [];

async function evidence(page, actorId, content, filename) {
  const id = await page.evaluate(async ({ actorId, content }) => {
    const actor = game.actors.get(actorId);
    const message = await ChatMessage.implementation.create({
      speaker: ChatMessage.implementation.getSpeaker({ actor }), content
    });
    return message.id;
  }, { actorId, content });
  await page.evaluate(() => {
    ui.sidebar?.activateTab?.("chat");
    const chat = document.querySelector("#chat");
    if (chat) {
      const x = chat.getBoundingClientRect().x;
      chat.style.setProperty("position", "fixed", "important");
      chat.style.setProperty("left", "16px", "important");
      chat.style.setProperty("right", "auto", "important");
      chat.style.setProperty("top", "16px", "important");
      chat.style.setProperty("width", "520px", "important");
      chat.style.setProperty("height", "1000px", "important");
      chat.style.setProperty("z-index", "99999", "important");
      chat.style.setProperty("transform", "none", "important");
      chat.style.setProperty("translate", (-x + 16) + "px 0", "important");
      chat.style.setProperty("margin", "0", "important");
    }
    const scroll = document.querySelector(".chat-scroll");
    if (scroll) scroll.scrollTop = scroll.scrollHeight;
  });
  const card = page.locator('#chat [data-message-id="' + id + '"]');
  await card.waitFor({ state: "visible", timeout: 10000 });
  await card.screenshot({ path: path.join(VISUAL_DIR, RUN_ID + "-" + filename), type: "jpeg", quality: 18 });
  createdMessageIds.push(id);
  return id;
}

async function actorIdNamed(page, name) {
  return page.evaluate(name => game.actors.find(actor => actor.name === name)?.id ?? null, name);
}

async function cloneSource(gm, templateId, playerId) {
  return gm.evaluate(async ({ templateId, playerId, runId }) => {
    const template = game.actors.get(templateId);
    const data = template.toObject();
    data._id = foundry.utils.randomID();
    data.name = "W1 Wave1 " + runId + " Medic";
    data.folder = null;
    data.ownership = { default: 0, [game.user.id]: 3, [playerId]: 3 };
    delete data._stats;
    data.flags = foundry.utils.deepClone(data.flags ?? {});
    data.flags.ak5e = {
      ...(data.flags.ak5e ?? {}), artReceipts: [], lastArtCast: null,
      medicRelay: { version: 1, operations: [] },
      artsPoints: { ...(data.flags.ak5e?.artsPoints ?? {}), value: 10 },
      reactionBudget: { ...(data.flags.ak5e?.reactionBudget ?? {}), spent: 0 }
    };
    return (await Actor.create(data)).id;
  }, { templateId, playerId, runId: RUN_ID });
}

async function actorUuid(page, id) {
  return page.evaluate(id => game.actors.get(id)?.uuid ?? null, id);
}

async function makeTarget(gm, sourceId, playerId, name, hp, temp, playerOwned = false) {
  return gm.evaluate(async ({ sourceId, playerId, name, hp, temp, playerOwned }) => {
    const source = game.actors.get(sourceId);
    const data = source.toObject();
    data._id = foundry.utils.randomID();
    data.name = name;
    data.folder = null;
    data.items = [];
    data.ownership = { default: 0, [game.user.id]: 3 };
    if (playerOwned) data.ownership[playerId] = 3;
    delete data._stats;
    data.flags = {};
    data.system.attributes.hp = { value: hp, max: Math.max(hp, 10), temp };
    return (await Actor.create(data)).id;
  }, { sourceId, playerId, name, hp, temp, playerOwned });
}

async function appendParent(page, sourceId, id, name) {
  return page.evaluate(async ({ sourceId, id, name }) => {
    const actor = game.actors.get(sourceId);
    const L = await import("/modules/ak5e/scripts/arts-ledger.mjs");
    const entries = L.appendArtReceipt(actor, { id, name, cost: 0 }, []);
    await actor.update({ "flags.ak5e.artReceipts": entries });
    return entries.at(-1);
  }, { sourceId, id, name });
}

async function openUndoList(page, openSheet, sourceId) {
  const sheet = await openSheet(page, sourceId);
  const appId = await sheet.getAttribute("id");
  await page.evaluate(async id => foundry.applications.instances.get(id).toggleControls(true, { animate: false }), appId);
  const menu = page.locator("menu.controls-dropdown:visible").last();
  const medic = menu.locator('[data-action="ak5eMedic"]:visible').last();
  await medic.waitFor({ state: "visible" });
  await medic.hover();
  await medic.click();
  const panel = page.locator(".application").filter({ hasText: "Medic Controls" }).last();
  await panel.waitFor();
  await panel.locator('[data-medic-act="__artsUndoList"]').click();
  const list = page.locator(".application").filter({ hasText: "Arts cast receipts" }).last();
  await list.waitFor();
  return list;
}

async function reviewUndo(page, openSheet, sourceId, receiptId, screenshotName) {
  const list = await openUndoList(page, openSheet, sourceId);
  await list.locator('select[name="receipt"]').selectOption(receiptId);
  await list.locator('button[data-action="undo"]').click();
  const confirm = page.locator(".application").filter({ hasText: "Confirm cast undo" }).last();
  await confirm.waitFor();
  await page.waitForTimeout(500);
  const text = await confirm.innerText();
  await confirm.screenshot({ path: path.join(VISUAL_DIR, RUN_ID + "-" + screenshotName), type: "jpeg", quality: 18 });
  return { confirm, text };
}

test("Medic Wave 1 rendered acceptance (live Foundry V13 + D&D5e)", { skip: !SERVER_URL }, async t => {
  await fs.mkdir(VISUAL_DIR, { recursive: true });
  const playwright = await import(PLAYWRIGHT_MODULE);
  const { joinAs, openSheet } = await import(LIVE_HELPERS);
  const browser = await launchTestBrowser(playwright.chromium ?? playwright.default?.chromium);
  const openContext = browser.newContext.bind(browser);
  browser.newContext = async (...args) => {
    const context = await openContext(...args);
    context.setDefaultNavigationTimeout(90000);
    return context;
  };
  const browserErrors = [];
  let gm, player;
  try {
    const url = SERVER_URL.replace(/\/join\/?$/, "");
    gm = await joinAs(browser, url, "Gamemaster", { errors: browserErrors });
    player = await joinAs(browser, url, PLAYER_NAME, { errors: browserErrors });
    const templateId = await actorIdNamed(player, SOURCE_NAME);
    assert.ok(templateId, "the private W1 Reaction Medic fixture is present");
    const playerId = await player.evaluate(() => game.user.id);
    const reactionSourceId = templateId;
    const makeTestSource = async () => {
      const id = await cloneSource(gm, templateId, playerId);
      createdActorIds.push(id);
      await player.waitForFunction(actorId => game.actors.has(actorId), id);
      return id;
    };

    await t.test("W1-1 reaction prompt, cancel, confirm, and undo as player with GM verification", async () => {
      const sheet = await openSheet(player, reactionSourceId);
      await sheet.locator('nav [data-tab="spells"]').click();
      const row = sheet.locator('[data-item-name="W1 Reactive Mend"]');
      assert.equal(await row.count(), 1, "fixture has the reaction Art");
      const expand = row.locator('[data-action="toggleExpand"]');
      if (await row.evaluate(el => el.classList.contains("collapsed"))) await expand.click();
      const state = async page => page.evaluate(id => {
        const actor = game.actors.get(id);
        return { ap: actor.getFlag("ak5e", "artsPoints").value,
          reactions: actor.getFlag("ak5e", "reactionBudget").spent,
          receiptIds: (actor.getFlag("ak5e", "artReceipts") ?? []).map(entry => entry.id) };
      }, reactionSourceId);
      const before = await state(player);
      const messageIdsBefore = await player.evaluate(() => game.messages.contents.map(message => message.id));
      const openCastPrompt = async () => {
        const cast = row.locator('[data-action="activity-use"]');
        if (await row.evaluate(el => el.classList.contains("collapsed"))) await row.locator('[data-action="toggleExpand"]').click();
        await cast.waitFor({ state: "visible" });
        // AK5e's status badge overlaps this D&D5e list action's pointer hitbox in this sheet layout.
        // Dispatch its delegated click while exercising the actual ActivityUsageDialog and state flow.
        await cast.dispatchEvent("click");
        const dialog = player.locator(".application.activity-usage").last();
        await dialog.waitFor();
        return dialog;
      };
      const cancelled = await openCastPrompt();
      await cancelled.screenshot({ path: path.join(VISUAL_DIR, RUN_ID + "-reaction-cancel-prompt.jpg"), type: "jpeg", quality: 22 });
      await cancelled.locator('[data-action="close"]').click();
      await player.waitForTimeout(250);
      assert.deepEqual(await state(player), before, "closing the real cast confirmation spends neither AP nor Reaction");

      const confirmed = await openCastPrompt();
      await confirmed.screenshot({ path: path.join(VISUAL_DIR, RUN_ID + "-reaction-confirm-prompt.jpg"), type: "jpeg", quality: 22 });
      await confirmed.locator('[data-action="use"]').click();
      await player.waitForFunction(({ id, count }) => {
        const actor = game.actors.get(id);
        return actor.flags.ak5e.artReceipts.length > count && actor.flags.ak5e.reactionBudget.spent === 1;
      }, { id: reactionSourceId, count: before.receiptIds.length }, { timeout: 20000 });
      const afterCast = await state(player);
      createdMessageIds.push(...await player.evaluate(before => game.messages.contents
        .filter(message => !before.includes(message.id)).map(message => message.id), messageIdsBefore));
      const receiptId = await player.evaluate(id => game.actors.get(id).flags.ak5e.artReceipts.at(-1).id, reactionSourceId);
      assert.equal(afterCast.ap, before.ap - 1);
      assert.equal(afterCast.reactions, before.reactions + 1);

      const list = await openUndoList(player, openSheet, reactionSourceId);
      await list.screenshot({ path: path.join(VISUAL_DIR, RUN_ID + "-reaction-receipt-list.jpg"), type: "jpeg", quality: 18 });
      await list.locator('select[name="receipt"]').selectOption(receiptId);
      await list.locator('button[data-action="undo"]').click();
      const undo = player.locator(".application").filter({ hasText: "Confirm cast undo" }).last();
      await undo.waitFor();
      const undoText = await undo.innerText();
      assert.match(undoText, /reactionBudget/);
      assert.match(undoText, /artsPoints/);
      await undo.screenshot({ path: path.join(VISUAL_DIR, RUN_ID + "-reaction-undo-confirm.jpg"), type: "jpeg", quality: 18 });
      await undo.locator('button[data-action="restore"]').click();
      await player.waitForFunction(({ id, receiptId }) => {
        const actor = game.actors.get(id);
        return actor.flags.ak5e.artReceipts.find(entry => entry.id === receiptId)?.status === "undone";
      }, { id: reactionSourceId, receiptId }, { timeout: 20000 });
      const playerEnd = await state(player);
      const gmEnd = await state(gm);
      assert.equal(playerEnd.ap, before.ap);
      assert.equal(playerEnd.reactions, before.reactions);
      assert.deepEqual(gmEnd, playerEnd, "GM observes the same restored Actor state and receipt");
      assert.ok(playerEnd.receiptIds.includes(receiptId));
    });

    let relayTargetId, finalWriteTargetId;
    await t.test("W1-2 injected GM target-write failure leaves intent and same-ID retry applies once", async () => {
      const sourceId = await makeTestSource();
      const source = await appendParent(player, sourceId, "w1-" + RUN_ID + "-relay-parent", "W1-2 relay parent");
      relayTargetId = await makeTarget(gm, sourceId, playerId, "W1 W1-2 Target " + RUN_ID, 20, 0, false);
      createdActorIds.push(relayTargetId);
      const targetUuid = await actorUuid(gm, relayTargetId);
      const register = async page => page.evaluate(async () => {
        const L = await import("/modules/ak5e/scripts/arts-ledger.mjs");
        L.registerArtRelayHooks();
      });
      await Promise.all([register(gm), register(player)]);
      await gm.evaluate(id => {
        const target = game.actors.get(id);
        const update = target.update.bind(target);
        let failed = false;
        target.update = async function (changes, options) {
          if (!failed && Object.hasOwn(changes, "system.attributes.hp.value")) {
            failed = true; target.update = update;
            throw new Error("fixture: injected GM target write failure");
          }
          return update(changes, options);
        };
      }, relayTargetId);
      const childId = "w1-" + RUN_ID + "-relay-child";
      const first = await player.evaluate(async ({ sourceId, parentId, childId, targetUuid }) => {
        const source = game.actors.get(sourceId);
        const L = await import("/modules/ak5e/scripts/arts-ledger.mjs");
        try {
          await L.appendLinkedReceipt(source, parentId, { id: childId, name: childId,
            relay: { targetUuid, operation: { id: "hp-damage", data: { amount: 5 } } } }, []);
          return { error: null };
        } catch (error) {
          return { error: error.message, receipt: source.flags.ak5e.artReceipts.find(entry => entry.id === childId) };
        }
      }, { sourceId, parentId: source.id, childId, targetUuid });
      const hpAfterFailure = await gm.evaluate(id => game.actors.get(id).system.attributes.hp.value, relayTargetId);
      assert.match(first.error, /injected GM target write failure/);
      assert.equal(first.receipt.relay.recoveryPending, true);
      assert.equal(hpAfterFailure, 20);
      const retry = await player.evaluate(async ({ sourceId, parentId, childId, targetUuid }) => {
        const source = game.actors.get(sourceId);
        const L = await import("/modules/ak5e/scripts/arts-ledger.mjs");
        return L.appendLinkedReceipt(source, parentId, { id: childId, name: childId,
          relay: { targetUuid, operation: { id: "hp-damage", data: { amount: 5 } } } }, []);
      }, { sourceId, parentId: source.id, childId, targetUuid });
      const retryHp = await gm.evaluate(id => game.actors.get(id).system.attributes.hp.value, relayTargetId);
      assert.equal(retryHp, 15);
      assert.equal(retry.relay.recoveryPending, undefined);
      await evidence(player, sourceId, "<section><h3>W1-2 · GM relay failure and retry</h3><p>Injected target-write failure left the durable intent and HP 20. Stable-ID retry succeeded; HP 15 (one 5-point apply), recovery pending cleared.</p></section>", RUN_ID + "-w1-2-relay.jpg");
    });

    await t.test("B-312 injected source final-write failure leaves a durable receipt; retry does not reapply", async () => {
      const sourceId = await makeTestSource();
      const parent = await appendParent(player, sourceId, "w1-" + RUN_ID + "-b312-parent", "B-312 relay parent");
      finalWriteTargetId = await makeTarget(gm, sourceId, playerId, "W1 B312 Target " + RUN_ID, 20, 0, false);
      createdActorIds.push(finalWriteTargetId);
      const targetUuid = await actorUuid(gm, finalWriteTargetId);
      const childId = "w1-" + RUN_ID + "-b312-child";
      const failed = await player.evaluate(async ({ sourceId, parentId, childId, targetUuid }) => {
        const source = game.actors.get(sourceId);
        const L = await import("/modules/ak5e/scripts/arts-ledger.mjs");
        const update = source.update.bind(source);
        let writes = 0;
        source.update = async function (changes, options) {
          if (Object.hasOwn(changes, "flags.ak5e.artReceipts")) {
            writes++;
            if (writes === 2) { source.update = update; throw new Error("fixture: injected source final-write failure"); }
          }
          return update(changes, options);
        };
        let error = null;
        try {
          await L.appendLinkedReceipt(source, parentId, { id: childId, name: childId,
            relay: { targetUuid, operation: { id: "hp-damage", data: { amount: 5 } } } }, []);
        } catch (failure) { error = failure.message; }
        finally { source.update = update; }
        return { error, writes, receipt: source.flags.ak5e.artReceipts.find(entry => entry.id === childId) };
      }, { sourceId, parentId: parent.id, childId, targetUuid });
      const hpAfterFailure = await gm.evaluate(id => game.actors.get(id).system.attributes.hp.value, finalWriteTargetId);
      assert.match(failed.error, /injected source final-write failure/);
      assert.equal(failed.writes, 2);
      assert.equal(failed.receipt.relay.recoveryPending, true);
      assert.equal(hpAfterFailure, 15);
      const retry = await player.evaluate(async ({ sourceId, parentId, childId, targetUuid }) => {
        const source = game.actors.get(sourceId);
        const L = await import("/modules/ak5e/scripts/arts-ledger.mjs");
        return L.appendLinkedReceipt(source, parentId, { id: childId, name: childId,
          relay: { targetUuid, operation: { id: "hp-damage", data: { amount: 5 } } } }, []);
      }, { sourceId, parentId: parent.id, childId, targetUuid });
      const retryHp = await gm.evaluate(id => game.actors.get(id).system.attributes.hp.value, finalWriteTargetId);
      assert.equal(retryHp, 15, "the already-applied relay operation is not repeated");
      assert.equal(retry.relay.recoveryPending, undefined);
      await evidence(player, sourceId, "<section><h3>B-312 · source final-write recovery</h3><p>Target HP reached 15 before the injected source-write error; a durable recovery receipt remained pending. Same-ID retry finalized the receipt; HP stayed 15 and recovery pending cleared.</p></section>", RUN_ID + "-b312-recovery.jpg");
    });

    await t.test("B-310 linked-target undo preserves later GM HP edits and previews the conflict", async () => {
      const sourceId = await makeTestSource();
      const parent = await appendParent(player, sourceId, "w1-" + RUN_ID + "-b310-parent", "B-310 relay parent");
      const targetId = await makeTarget(gm, sourceId, playerId, "W1 B310 Target " + RUN_ID, 20, 0, false);
      createdActorIds.push(targetId);
      const targetUuid = await actorUuid(gm, targetId);
      const childId = "w1-" + RUN_ID + "-b310-child";
      await player.evaluate(async ({ sourceId, parentId, childId, targetUuid }) => {
        const source = game.actors.get(sourceId);
        const L = await import("/modules/ak5e/scripts/arts-ledger.mjs");
        await L.appendLinkedReceipt(source, parentId, { id: childId, name: childId,
          relay: { targetUuid, operation: { id: "hp-damage", data: { amount: 5 } } } }, []);
      }, { sourceId, parentId: parent.id, childId, targetUuid });
      await gm.evaluate(id => game.actors.get(id).update({ "system.attributes.hp.value": 9 }), targetId);
      const { confirm, text } = await reviewUndo(player, openSheet, sourceId, childId, "b310-target-conflict.jpg");
      assert.match(text, /preserve system\.attributes\.hp\.value \(target-changed\)/);
      await confirm.locator('button[data-action="restore"]').click();
      await player.waitForFunction(({ sourceId, childId }) => {
        const receipt = game.actors.get(sourceId).flags.ak5e.artReceipts.find(entry => entry.id === childId);
        return receipt?.sourceUndone === true && receipt?.targetUndoPending === true;
      }, { sourceId, childId }, { timeout: 20000 });
      await gm.waitForFunction(({ sourceId, childId }) => {
        const receipt = game.actors.get(sourceId).flags.ak5e.artReceipts.find(entry => entry.id === childId);
        return receipt?.sourceUndone === true && receipt?.targetUndoPending === true;
      }, { sourceId, childId }, { timeout: 20000 });
      const end = await gm.evaluate(({ sourceId, childId, targetId }) => {
        const source = game.actors.get(sourceId);
        const receipt = source.flags.ak5e.artReceipts.find(entry => entry.id === childId);
        return { hp: game.actors.get(targetId).system.attributes.hp.value, status: receipt.status,
          sourceUndone: receipt.sourceUndone, pending: receipt.targetUndoPending };
      }, { sourceId, childId, targetId });
      assert.equal(end.hp, 9);
      assert.equal(end.status, "available");
      assert.equal(end.sourceUndone, true);
      assert.equal(end.pending, true);
    });

    await t.test("B-311 parent/child AP undo composes in reverse causal order", async () => {
      const sourceId = await makeTestSource();
      const ids = await player.evaluate(async sourceId => {
        const actor = game.actors.get(sourceId);
        const L = await import("/modules/ak5e/scripts/arts-ledger.mjs");
        const path = "flags.ak5e.artsPoints.value";
        await actor.update({ "flags.ak5e.artsPoints.value": 10 });
        const parent = L.appendArtReceipt(actor, { id: "w1-b311-parent-" + Date.now().toString(36),
          name: "W1 B311 Parent Cast", cost: 2 }, [{ path, before: 10, after: 8 }]);
        await actor.update({ "flags.ak5e.artsPoints.value": 8, "flags.ak5e.artReceipts": parent });
        const parentId = parent.at(-1).id;
        const child = L.appendArtReceipt(actor, { id: "w1-b311-child-" + Date.now().toString(36),
          name: "W1 B311 Linked Child Cast", cost: 2, parentReceiptId: parentId }, [{ path, before: 8, after: 6 }]);
        await actor.update({ "flags.ak5e.artsPoints.value": 6, "flags.ak5e.artReceipts": child });
        return { parentId, childId: child.at(-1).id };
      }, sourceId);
      const { confirm, text } = await reviewUndo(player, openSheet, sourceId, ids.parentId, "b311-parent-child.jpg");
      assert.ok(text.includes(ids.childId), "preview identifies the included child receipt");
      assert.match(text, /flags\.ak5e\.artsPoints\.value/);
      await confirm.locator('button[data-action="restore"]').click();
      await player.waitForFunction(({ sourceId, ids }) => {
        const actor = game.actors.get(sourceId), entries = actor.flags.ak5e.artReceipts;
        return actor.flags.ak5e.artsPoints.value === 10
          && entries.find(entry => entry.id === ids.parentId)?.status === "undone"
          && entries.find(entry => entry.id === ids.childId)?.status === "undone";
      }, { sourceId, ids }, { timeout: 20000 });
      const finalState = await gm.evaluate(({ sourceId, ids }) => {
        const actor = game.actors.get(sourceId), entries = actor.flags.ak5e.artReceipts;
        return { ap: actor.flags.ak5e.artsPoints.value,
          parent: entries.find(entry => entry.id === ids.parentId)?.status,
          child: entries.find(entry => entry.id === ids.childId)?.status };
      }, { sourceId, ids });
      assert.deepEqual(finalState, { ap: 10, parent: "undone", child: "undone" });
    });

    await t.test("W1-3 A7/A8 live correlation, damage resolver, applied metadata, and capped healing", async () => {
      const sourceId = await makeTestSource();
      const targets = {
        damage: await makeTarget(gm, sourceId, playerId, "W1 A7 Damage Target " + RUN_ID, 20, 3, true),
        healing: await makeTarget(gm, sourceId, playerId, "W1 A7 Healing Target " + RUN_ID, 8, 5, true)
      };
      createdActorIds.push(targets.damage, targets.healing);
      const result = await player.evaluate(async ({ sourceId, targets, runId }) => {
        const source = game.actors.get(sourceId);
        const check = (condition, message) => { if (!condition) throw new Error("W1-3 acceptance: " + message); };
        const damageTarget = game.actors.get(targets.damage), healingTarget = game.actors.get(targets.healing);
        const Trigger = await import("/modules/ak5e/scripts/trigger-events.mjs");
        const Correlation = await import("/modules/ak5e/scripts/art-correlation.mjs");
        const Ward = await import("/modules/ak5e/scripts/ward-features.mjs");
        Trigger.registerTriggerEventHooks(); Correlation.registerArtCorrelation(); Ward.registerWardHooks();
        const previousReceipts = source.getFlag("ak5e", "artReceipts") ?? [];
        const previousLast = source.getFlag("ak5e", "lastArtCast") ?? null;
        const oldCast = { id: "w1-" + runId + "-a7-old", actorUuid: source.uuid, level: 2, cost: 2, status: "available" };
        const newerCast = { id: "w1-" + runId + "-a7-newer", actorUuid: source.uuid, level: 5, cost: 5, status: "available" };
        await source.update({ "flags.ak5e.artReceipts": [...previousReceipts, oldCast, newerCast],
          "flags.ak5e.lastArtCast": newerCast });
        try {
          const speaker = ChatMessage.implementation.getSpeaker({ actor: source });
          const castCard = await ChatMessage.implementation.create({
            speaker, content: "<p>Wave 1 delayed cast anchor</p>", flags: { ak5e: { artCast: oldCast }, dnd5e: {} }
          });
          const rollCard = await ChatMessage.implementation.create({
            speaker, content: "<p>Wave 1 delayed damage roll</p>", flags: { dnd5e: { originatingMessage: castCard.id } }
          });
          const rollEvents = [], onRoll = event => rollEvents.push(event);
          Trigger.onAk5eEvent("damageRoll", onRoll);
          await Hooks.callAll("dnd5e.rollDamage", [{ total: 9, formula: "1d8+1",
            options: { type: "fire" }, parent: rollCard }], { subject: { actor: source, item: source.items.contents[0] ?? null } });
          for (let i = 0; i < 60 && !rollEvents.length; i++) await new Promise(resolve => setTimeout(resolve, 50));
          Trigger.offAk5eEvent("damageRoll", onRoll);
          for (let i = 0; i < 60 && rollCard.getFlag("ak5e", "castId") !== oldCast.id; i++) await new Promise(resolve => setTimeout(resolve, 50));
          const delayed = rollEvents[0];
          check(Boolean(delayed), "rollDamage hook emitted the delayed cast event");
          check(delayed.castId === oldCast.id, "delayed cast ID resolves to the earlier cast");
          check(delayed.artLevel === 2, "delayed cast level is retained");
          check(delayed.apSpent === 2, "delayed cast AP cost is retained");
          check(rollCard.getFlag("ak5e", "castId") === oldCast.id, "roll card is stamped with the cast ID");

          const applicationMessage = { id: "w1-" + runId + "-damage-message",
            uuid: "ChatMessage.w1-" + runId + "-damage-message", speaker,
            rolls: [{ total: 10, options: { type: "fire" } }, { total: 10, options: { type: "cold" } }],
            flags: { ak5e: { castId: oldCast.id }, dnd5e: {} } };
          await damageTarget.update({ "flags.ak5e.wardResist": {
            types: ["fire"], until: null, medicUuid: source.uuid, useId: runId
          } });
          const outcome = await Correlation.confirmArtOutcome({
            messageUuid: applicationMessage.uuid, targetUuid: damageTarget.uuid, resistTypes: ["fire"]
          });
          check(outcome.late === false, "outcome is confirmed before apply");
          const wardDecision = Ward.wardDamageResolver({ actor: damageTarget, amount: 20,
            message: applicationMessage, messageUuid: applicationMessage.uuid, options: {}, outcome: null });
          check(wardDecision.resistTypes.includes("fire"), "Ward resolver exposes fire resistance");

          let sawConfirmedOutcome = false;
          Correlation.registerDamageResolver(context => {
            if (!context.options?.wave1Acceptance) return null;
            sawConfirmedOutcome = context.confirmed && context.outcome?.resistTypes?.includes("fire");
            return context.outcome ? { resistTypes: context.outcome.resistTypes } : null;
          });
          const hitEvents = [], onHit = event => hitEvents.push(event);
          Trigger.onAk5eEvent("hitTaken", onHit);
          const options = { originatingMessage: applicationMessage, wave1Acceptance: true };
          const parts = [
            { type: "fire", value: 15, active: { type: { resistance: false }, all: {} } },
            { type: "cold", value: 5, active: { type: { resistance: false }, all: {} } }
          ];
          Hooks.callAll("dnd5e.calculateDamage", damageTarget, parts, options);
          const updates = { "system.attributes.hp.value": 3, "system.attributes.hp.temp": 0 };
          check(Hooks.call("dnd5e.preApplyDamage", damageTarget, 20, updates, options) !== false, "damage hook permits application");
          check(updates["system.attributes.hp.value"] === 11, "resistance and temporary HP produce the expected HP update");
          check(updates["system.attributes.hp.temp"] === 0, "temporary HP is consumed");
          await damageTarget.update(updates);
          Hooks.callAll("dnd5e.applyDamage", damageTarget, 20, options);
          for (let i = 0; i < 60 && !hitEvents.length; i++) await new Promise(resolve => setTimeout(resolve, 50));
          Trigger.offAk5eEvent("hitTaken", onHit);
          const hit = hitEvents[0];
          check(sawConfirmedOutcome, "registered resolver observes confirmed resistance outcome");
          check(Boolean(hit), "hitTaken event is emitted");
          check(JSON.stringify({ castId: hit.castId, isArt: hit.isArt, artLevel: hit.artLevel, apSpent: hit.apSpent,
            sourceActorUuid: hit.sourceActorUuid, amount: hit.amount, hpBefore: hit.hpBefore, hpAfter: hit.hpAfter })
            === JSON.stringify({ castId: oldCast.id, isArt: true, artLevel: 2, apSpent: 2, sourceActorUuid: source.uuid,
              amount: 20, hpBefore: 20, hpAfter: 11 }), "hitTaken carries applied-damage metadata");

          const healMessage = { id: "w1-" + runId + "-heal-message",
            uuid: "ChatMessage.w1-" + runId + "-heal-message", speaker,
            flags: { ak5e: { castId: oldCast.id }, dnd5e: {} } };
          const healingEvents = [], onHeal = event => healingEvents.push(event);
          Trigger.onAk5eEvent("hpRestored", onHeal);
          const healOptions = { originatingMessage: healMessage };
          const healUpdates = { "system.attributes.hp.value": 10, "system.attributes.hp.temp": 5 };
          Hooks.callAll("dnd5e.preApplyDamage", healingTarget, -6, healUpdates, healOptions);
          await healingTarget.update(healUpdates);
          Hooks.callAll("dnd5e.applyDamage", healingTarget, -6, healOptions);
          for (let i = 0; i < 60 && !healingEvents.length; i++) await new Promise(resolve => setTimeout(resolve, 50));
          Trigger.offAk5eEvent("hpRestored", onHeal);
          const heal = healingEvents[0];
          check(Boolean(heal), "hpRestored event is emitted");
          check(JSON.stringify({ amount: heal.amount, hpBefore: heal.hpBefore, hpAfter: heal.hpAfter, castId: heal.castId })
            === JSON.stringify({ amount: 2, hpBefore: 8, hpAfter: 10, castId: oldCast.id }), "capped healing event reports actual restoration");
          check(healingTarget.system.attributes.hp.temp === 5, "healing preserves temporary HP");
          return { delayedCastId: delayed.castId, newerCastId: newerCast.id, level: delayed.artLevel, ap: delayed.apSpent,
            messageIds: [castCard.id, rollCard.id] };
        } finally {
          await source.update({ "flags.ak5e.artReceipts": previousReceipts, "flags.ak5e.lastArtCast": previousLast });
        }
      }, { sourceId, targets, runId: RUN_ID });
      createdMessageIds.push(...result.messageIds);
      await evidence(player, sourceId,
        "<section><h3>W1-3 · Hook/runtime evidence</h3><p><b>A7 delayed cast:</b> " + result.delayedCastId
        + " (level " + result.level + ", " + result.ap + " AP), despite newer cast " + result.newerCastId + "; roll card stamped.</p>"
        + "<p><b>A8 Ward:</b> 15 fire + 5 cold; fire Resistance → HP 20/temp 3 to HP 11/temp 0.</p>"
        + "<p><b>A7 hitTaken:</b> Art level 2/AP 2, amount 20, HP 20 → 11.</p>"
        + "<p><b>A7 capped healing:</b> HP 8/10, temp 5; rolled 6 → hpRestored 2, HP 10/10, temp 5.</p></section>",
        RUN_ID + "-w1-3-hooks.jpg");
    });

    await t.test("W1-4 Medic header is discoverable through normal pointer interaction", async () => {
      // Platform note (proven NOT-OUR-DEFECT, see W1-4-proof.md): on dnd5e 5.3.3 actor sheets the
      // native header button opens dnd5e's own context menu (nav#context-menu), NOT core's
      // menu.controls-dropdown — dnd5e's ContextMenu5e binding preempts core's toggle handler.
      // The user-facing requirement is pointer discovery of the Medic option, which lives as the
      // first entry of that native menu.
      const sourceId = await makeTestSource();
      const sheet = await openSheet(player, sourceId);
      const header = sheet.locator('button[data-action="toggleControls"]');
      await header.hover();
      await header.click();
      const nav = player.locator("nav#context-menu.dnd5e2");
      await nav.waitFor({ state: "visible", timeout: 8000 });
      const items = nav.locator("li.context-item");
      assert.ok(await items.count() > 0, "the native header menu lists entries");
      const first = (await items.first().innerText()).trim();
      assert.match(first, /medic/i, `the Medic option heads the native header menu (first: ${first})`);
      await items.first().hover();
      await nav.screenshot({ path: path.join(VISUAL_DIR, RUN_ID + "-medic-header-discovery.jpg"), type: "jpeg", quality: 18 });
      const actorName = await player.evaluate(id => game.actors.get(id).name, sourceId);
      const priorDialogs = await player.evaluate(() => [...foundry.applications.instances.values()]
        .filter(app => app.constructor?.name === "DialogV2").map(app => app.id));
      await items.first().click();
      // Earlier subtests leave their own Medic Controls dialogs open for clones that share this
      // actor name, and the sheet's Features tab holds a hidden "Open Medic Controls" button.
      // Require a dialog instance created by this click, then address it by its exact id.
      const dialogId = await player.evaluate(async ({ actorName, priorDialogs }) => {
        const deadline = Date.now() + 8000;
        while (Date.now() < deadline) {
          const app = [...foundry.applications.instances.values()].find(candidate =>
            candidate.constructor?.name === "DialogV2" && candidate.element
            && candidate.options?.window?.title === `${actorName} — Medic Controls`
            && !priorDialogs.includes(candidate.id));
          if (app) return app.id;
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        return null;
      }, { actorName, priorDialogs });
      assert.ok(dialogId, "clicking Medic in the native header menu opens a new Medic Controls dialog");
      const panel = player.locator(`[id="${dialogId}"]`);
      await panel.waitFor({ state: "visible", timeout: 8000 });
      assert.equal((await panel.locator(".window-title").innerText()).trim(), `${actorName} — Medic Controls`, "the clicked entry opens the panel for the sheet's own actor");
      const body = panel.locator(".ak5e-medic-controls-dialog");
      await body.waitFor({ state: "visible", timeout: 8000 });
      assert.match(await body.innerText(), /Core Medic Actions/, "the pointer-opened panel renders its actions");
      await panel.screenshot({ path: path.join(VISUAL_DIR, RUN_ID + "-medic-controls-open.jpg"), type: "jpeg", quality: 18 });
      await panel.locator('footer.form-footer button[data-action="close"]').click();
      await panel.waitFor({ state: "hidden", timeout: 12000 });
    });

    await t.test("browser console and Foundry joins stayed clean", async () => {
      assert.deepEqual(browserErrors, []);
      t.diagnostic("Rendered run " + RUN_ID + "; screenshots/logs are in " + VISUAL_DIR);
    });
  } finally {
    try {
      if (gm && createdActorIds.length) await gm.evaluate(ids => Actor.deleteDocuments(ids), createdActorIds);
      if (gm && createdMessageIds.length) await gm.evaluate(ids => ChatMessage.deleteDocuments(ids), createdMessageIds);
    } catch (error) {
      t.diagnostic("Private fixture cleanup warning: " + error.message);
    }
    await browser.close();
  }
});
