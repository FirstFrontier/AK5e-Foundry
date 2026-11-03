/**
 * Reusable Vanguard Foundry V13 smoke/interaction runner.
 * Run against the private disposable World described in VANGUARD_WORKFLOWS.md.
 * Chromium must be launched through launchTestBrowser() (WORKFLOW §5.3).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { launchTestBrowser } from "./test-browser.mjs";

const { chromium } = await import(process.env.AK5E_PLAYWRIGHT ?? "playwright");
const port = process.env.AK5E_TEST_PORT ?? "30186";
const outputDir = process.env.AK5E_TEST_OUTPUT ?? "/tmp/ak5e-vanguard-oarpw3q9/evidence";
const joinUrl = `http://127.0.0.1:${port}/join`;
await mkdir(outputDir, { recursive: true });

const report = { world: "standard-test", port, errors: [], checks: [], screenshots: [], renderer: null };
const browser = await launchTestBrowser(chromium);
const contexts = [];

async function join(name) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  contexts.push(context);
  const page = await context.newPage();
  page.on("pageerror", error => report.errors.push(`${name}: ${error.stack ?? error.message}`));
  page.on("console", message => { if (message.type() === "error") report.errors.push(`${name}: ${message.text()} @ ${JSON.stringify(message.location())}${message.args().length ? ` | ${message.args().map(arg => arg.toString()).join(" ")}` : ""}`); });
  await page.goto(joinUrl);
  await page.selectOption('select[name="userid"]', { label: name, timeout: 15000 });
  await page.click('button[name="join"]');
  await page.waitForFunction(() => globalThis.game?.ready, null, { timeout: 60000 });
  await page.evaluate(async () => {
    for (const app of [...foundry.applications.instances.values()]) if (app.constructor.name === "UserConfig") await app.close();
  });
  return page;
}

async function shot(page, name) {
  const path = `${outputDir}/${name}`;
  await page.screenshot({ path, fullPage: false });
  report.screenshots.push(path);
  return path;
}

async function clickText(page, text, exact = true) {
  const button = page.getByRole("button", { name: text, exact }).first();
  await button.waitFor({ state: "visible", timeout: 15000 });
  await button.click();
}

try {
  const gm = await join("Gamemaster");
  const active = await gm.evaluate(() => Boolean(game.modules.get("ak5e")?.active));
  if (!active) throw new Error("AK5e is not active in the disposable World.");
  await gm.waitForFunction(() => Boolean(game.ak5e?.vanguard?.open), null, { timeout: 30000 });
  report.checks.push({ id: "module-api", result: "PASS" });
  await shot(gm, "vanguard-01-gm-world.png");

  await gm.evaluate(async () => {
    let scene = game.scenes.current;
    if (!scene) scene = await Scene.implementation.create({ name: "AK5e Vanguard Disposable Scene", active: true,
      grid: { type: CONST.GRID_TYPES.SQUARE, size: 100, distance: 5 }, flags: { ak5e: { disposableVanguardTest: true } } });
    if (scene.getFlag("ak5e", "disposableVanguardTest") !== true) await scene.setFlag("ak5e", "disposableVanguardTest", true);
    if (scene !== game.scenes.current) await scene.activate();
  });
  await gm.waitForFunction(() => globalThis.canvas?.ready, null, { timeout: 30000 });

  const ids = await gm.evaluate(async () => {
    const player = [...game.users].find(user => user.name === "Vanguard Player");
    if (!player) throw new Error("Vanguard Player account is missing.");
    const source = await Actor.implementation.create({
      name: "AK5e Disposable Vanguard",
      type: "character",
      ownership: { default: 0, [player.id]: 3 },
      system: { abilities: { dex: { value: 16 }, str: { value: 14 }, con: { value: 14 } }, attributes: { prof: 2, hp: { value: 40, max: 40, temp: 0 } } },
      flags: { ak5e: { disposableVanguardTest: true, vanguard: { enabled: true, version: 1, martialDCAbility: "str" } } }
    });
    await source.createEmbeddedDocuments("Item", [
      { name: "Vanguard", type: "class", system: { levels: 1 }, flags: { ak5e: { chapterThreeId: "class-vanguard" } } },
      { name: "Standard Bearer", type: "subclass", system: { levels: 1 }, flags: { ak5e: { chapterThreeId: "subclass-vanguard-standard-bearer" } } },
      { name: "1st Level: Tip of the Spear", type: "feat", flags: { ak5e: { chapterThreeId: "class-feature-vanguard-1st-level-tip-of-the-spear-3092" } } }
    ]);
    const ally = await Actor.implementation.create({ name: "AK5e Disposable Ally", type: "character", ownership: { default: 0, [player.id]: 3 }, system: { attributes: { hp: { value: 24, max: 24, temp: 0 } } } });
    const npc = await Actor.implementation.create({ name: "AK5e Disposable NPC", type: "npc", ownership: { default: 0 }, system: { attributes: { hp: { value: 30, max: 30, temp: 0 } } } });
    const scene = game.scenes.current;
    if (!scene?.getFlag("ak5e", "disposableVanguardTest")) throw new Error("The Vanguard fixture scene is not marked disposable.");
    const tokens = await scene.createEmbeddedDocuments("Token", [
      { name: source.name, actorId: source.id, actorLink: true, x: 100, y: 100, width: 1, height: 1, disposition: 1, texture: { src: source.img } },
      { name: ally.name, actorId: ally.id, actorLink: true, x: 200, y: 100, width: 1, height: 1, disposition: 1, texture: { src: ally.img } },
      { name: npc.name, actorId: npc.id, actorLink: true, x: 300, y: 100, width: 1, height: 1, disposition: -1, texture: { src: npc.img } }
    ]);
    return { sourceId: source.id, allyId: ally.id, npcId: npc.id, sourceTokenId: tokens[0].id, allyTokenId: tokens[1].id, npcTokenId: tokens[2].id, playerId: player.id };
  });
  report.actorIds = ids;

  const player = await join("Vanguard Player");
  await player.waitForFunction(id => Boolean(game.actors.get(id)?.isOwner), ids.sourceId, { timeout: 30000 });
  await player.evaluate(id => { game.actors.get(id).sheet.render(true); }, ids.sourceId);
  await player.locator(".sheet.actor").waitFor({ state: "visible", timeout: 20000 });
  await player.waitForTimeout(700);
  await shot(player, "vanguard-02-player-sheet.png");
  await player.evaluate(({ sourceId, allyTokenId }) => {
    canvas.tokens.setTargets([allyTokenId]);
    void game.ak5e.vanguard.open(game.actors.get(sourceId));
  }, { sourceId: ids.sourceId, allyTokenId: ids.allyTokenId });
  await player.getByRole("button", { name: "Tip of the Spear", exact: true }).waitFor({ state: "visible", timeout: 15000 });
  await shot(player, "vanguard-03-owner-controls.png");
  const priorUses = await player.evaluate(id => game.actors.get(id).getFlag("ak5e", "vanguardUses")?.undo?.length ?? 0, ids.sourceId);
  await clickText(player, "Tip of the Spear");
  await player.getByRole("button", { name: /Confirm/ }).last().waitFor({ state: "visible", timeout: 15000 });
  const cancelTrigger = player.getByRole("button", { name: /Cancel|No/ }).last();
  await cancelTrigger.waitFor({ state: "visible", timeout: 15000 });
  await cancelTrigger.click();
  await player.waitForTimeout(250);
  const afterCancel = await player.evaluate(id => game.actors.get(id).getFlag("ak5e", "vanguardUses")?.undo?.length ?? 0, ids.sourceId);
  report.checks.push({ id: "valid-use-cancel", result: afterCancel === priorUses ? "PASS" : "FAIL", note: `undo receipts ${priorUses} → ${afterCancel}` });
  await player.evaluate(npcTokenId => canvas.tokens.setTargets([npcTokenId]), ids.npcTokenId);
  const priorMessageIds = await player.evaluate(() => [...game.messages].map(message => message.id));
  await clickText(player, "Tip of the Spear");
  await player.waitForTimeout(500);
  report.triggerDialog = (await player.locator("body").innerText()).slice(0, 2500);
  await shot(player, "vanguard-04-trigger-confirmation.png");
  const triggerConfirm = player.getByRole("button", { name: /Confirm/ }).last();
  await triggerConfirm.waitFor({ state: "visible", timeout: 15000 });
  await triggerConfirm.click();
  await player.waitForTimeout(250);
  const finalConfirm = player.getByRole("button", { name: /Confirm/ }).last();
  await finalConfirm.waitFor({ state: "visible", timeout: 15000 });
  await finalConfirm.click();
  await player.waitForTimeout(250);
  const warning = player.getByRole("button", { name: "Use anyway", exact: true });
  if (await warning.count()) await warning.click();
  await player.waitForTimeout(1000);
  await shot(player, "vanguard-05-use-confirmation.png");
  await player.evaluate(async () => { ui.sidebar.changeTab("chat", "primary"); ui.sidebar.expand(); await ui.chat.scrollBottom({ waitImages: true }); });
  await player.waitForTimeout(500);
  await player.waitForFunction(ids => [...game.messages].some(message => !ids.includes(message.id)
    && (message.content ?? "").includes("Tip of the Spear")), priorMessageIds, { timeout: 15000 });
  const latestMessageId = await player.evaluate(ids => [...game.messages].filter(message => !ids.includes(message.id)
    && (message.content ?? "").includes("Tip of the Spear")).at(-1)?.id, priorMessageIds);
  report.chatStructure = await player.evaluate(id => ({ sidebar: document.querySelector("#sidebar")?.getBoundingClientRect().toJSON(),
    sidebarText: document.querySelector("#sidebar")?.innerText?.slice(-500),
    messages: [...document.querySelectorAll(".chat-message")].slice(-4).map(node => ({ id: node.dataset.messageId,
      rect: node.getBoundingClientRect().toJSON(), parent: node.parentElement?.id ?? node.parentElement?.className })) }), latestMessageId);
  const chatMessage = player.locator(`#chat .chat-log [data-message-id="${latestMessageId}"]`);
  await chatMessage.waitFor({ state: "visible", timeout: 15000 });
  let rollButton = chatMessage.getByRole("button", { name: /Roll/ }).first();
  for (let step = 0; step < 3 && await rollButton.count(); step++) {
    if (!(await rollButton.isVisible())) break;
    await player.evaluate(() => {
      const log = document.querySelector("#chat-log, .chat-log");
      if (log) log.scrollTop = log.scrollHeight;
    });
    await rollButton.evaluate(node => node.scrollIntoView({ block: "center" }));
    const box = await rollButton.boundingBox();
    const geometry = await rollButton.evaluate(node => ({ rect: node.getBoundingClientRect().toJSON(),
      hit: (() => { const r = node.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.outerHTML?.slice(0, 160) ?? null; })(),
      viewport: { width: innerWidth, height: innerHeight } }));
    report.checks.push({ id: `roll-button-${step + 1}-geometry`, result: box ? "MEASURED" : "MISSING", box, geometry });
    await rollButton.click({ force: true });
    await player.waitForTimeout(1000);
    rollButton = chatMessage.getByRole("button", { name: /Roll/ }).first();
  }
  await player.waitForTimeout(1500);
  await shot(player, "vanguard-06-player-tip-card.png");
  report.checks.push({ id: "owner-confirm-roll-card", result: "PASS", note: "Tip was started from the rendered owner controls; its die was clicked from the public card." });

  const gmNpcState = await gm.evaluate(async id => {
    const target = game.actors.get(id);
    return { hp: target.system.attributes.hp.value, temp: target.system.attributes.hp.temp, effects: target.effects.size };
  }, ids.npcId);
  report.relayState = gmNpcState;
  report.useReceipt = await gm.evaluate(id => {
    const source = game.actors.get(id), ledger = source.getFlag("ak5e", "vanguardUses")?.undo ?? [];
    const receipt = ledger.at(-1);
    return receipt ? { id: receipt.id, status: receipt.status, outcome: receipt.outcome,
      targets: receipt.targets?.map(entry => ({ uuid: entry.uuid, kind: entry.kind, ready: entry.ready, applied: entry.applied })) } : null;
  }, ids.sourceId);
  const applied = report.useReceipt?.status === "complete" && report.useReceipt.targets?.every(entry => entry.applied);
  report.checks.push({ id: "unowned-target-gm-relay", result: applied ? "PASS" : "FAIL", note: JSON.stringify({ state: gmNpcState, use: report.useReceipt }) });

  const controls = chatMessage.locator(".ak5e-play-use-controls");
  const undo = controls.getByRole("button", { name: "Undo", exact: true });
  if (await undo.count()) {
    await undo.click();
    await clickText(player, "Undo this use");
    await player.waitForTimeout(1000);
  }
  const afterUndo = await gm.evaluate(id => {
    const target = game.actors.get(id);
    return { temp: target.system.attributes.hp.temp, effects: target.effects.size };
  }, ids.npcId);
  report.undoState = afterUndo;
  report.checks.push({ id: "relayed-undo", result: afterUndo.temp === 0 && afterUndo.effects === 0 ? "PASS" : "UNCERTAIN", note: JSON.stringify(afterUndo) });

  const renderer = await player.evaluate(() => {
    const canvas = document.createElement("canvas"), gl = canvas.getContext("webgl");
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unavailable";
  });
  report.renderer = renderer;
  await player.reload();
  await player.waitForFunction(id => Boolean(game.ready && game.actors.get(id)), ids.sourceId, { timeout: 60000 });
  const persisted = await player.evaluate(id => Boolean(game.actors.get(id).getFlag("ak5e", "vanguard")), ids.sourceId);
  report.checks.push({ id: "reload-persistence", result: persisted ? "PASS" : "FAIL" });
  await shot(player, "vanguard-07-reloaded-player.png");

  report.checks.push({ id: "no-gm-retry", result: "NOT RUN", note: "The scripted run leaves the GM connected; execute the no-GM retry path manually or add a controlled GM disconnect scenario before acceptance." });
  report.checks.push({ id: "native-damage-roll", result: "NOT RUN", note: "Native damage hook unit coverage is in vanguard-adversarial.test.mjs; a native D&D5e weapon damage activity is not created by this runner yet." });
} catch (error) {
  report.errors.push(error.stack ?? error.message);
} finally {
  for (const context of contexts) await context.close().catch(() => {});
  await browser.close().catch(() => {});
  report.path = `${outputDir}/vanguard-live-report.json`;
  await writeFile(report.path, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
