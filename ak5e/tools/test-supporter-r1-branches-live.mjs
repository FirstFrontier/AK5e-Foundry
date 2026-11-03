/**
 * Live Foundry V13 headless Playwright validation for the Supporter branch rulings R1 (F-R1, F-R4a, F-R4b).
 * Uses launchTestBrowser() from ./test-browser.mjs per WORKFLOW.md §5.3, and closes the browser in `finally`.
 *
 * Usage (Foundry serving the scratch World on AK5E_PORT):
 *   AK5E_PLAYWRIGHT=/tmp/frontier-browser-check/node_modules/playwright/index.mjs AK5E_PORT=30192 \
 *   AK5E_TEST_OUTPUT=<dir> node ak5e/tools/test-supporter-r1-branches-live.mjs
 *
 * Scenarios, all as the GM:
 *  1. A level-17 Hexer's Ultimate Hex (three Ultimate effects) on a creature; a kill posts exactly one burst card.
 *  2. A creature carrying three Hexes from one Hexer; a hit posts exactly one rider card.
 *  3. A level-9 Bard grants the Font of Inspiration Aid Die; its Active Effect carries a 600 s time expiry.
 * Console errors are collected; a screenshot is written for each card.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { launchTestBrowser } from "./test-browser.mjs";

let chromium;
for (const candidate of [process.env.AK5E_PLAYWRIGHT, "/tmp/frontier-browser-check/node_modules/playwright/index.mjs", "playwright"].filter(Boolean)) {
  try {
    const mod = await import(candidate);
    if (mod.chromium) { chromium = mod.chromium; break; }
  } catch {
    // try the next candidate
  }
}
if (!chromium) throw new Error("Could not load Playwright chromium module (set AK5E_PLAYWRIGHT).");

const port = process.env.AK5E_TEST_PORT ?? process.env.AK5E_PORT ?? "30192";
const base = `http://127.0.0.1:${port}/join`;
const outputDir = process.env.AK5E_TEST_OUTPUT ?? "/tmp/ak5e-r1-branches-evidence";
const runTag = Date.now().toString(36);

const report = { world: "standard-test", port, steps: [], errors: [], screenshots: [], passed: false };

await mkdir(outputDir, { recursive: true });
const browser = await launchTestBrowser(chromium, {
  ...(process.env.AK5E_CHROMIUM ? { executablePath: process.env.AK5E_CHROMIUM } : {})
});

let exitCode = 0;
try {
  const page = await joinAs("Gamemaster");
  const screenshot = async name => {
    const path = `${outputDir}/${name}`;
    await page.screenshot({ path, fullPage: false });
    report.screenshots.push(path);
    return path;
  };
  const step = async (name, fn) => {
    try {
      const value = await fn();
      report.steps.push({ name, ok: true });
      console.log(`PASS ${name}`);
      return value;
    } catch (error) {
      report.steps.push({ name, ok: false, error: error?.message ?? String(error) });
      console.error(`FAIL ${name}: ${error?.message ?? error}`);
      await screenshot(`failure-${report.steps.length}.png`).catch(() => {});
      throw error;
    }
  };

  const ids = await step("create a level-17 Hexer, a level-9 Bard, and two creatures", () => page.evaluate(async tag => {
    const hexer = await Actor.implementation.create({
      name: `R1 Hexer ${tag}`, type: "character",
      system: { abilities: { cha: { value: 16 } } },
      flags: { ak5e: { supporter: { enabled: true, aidAbility: "cha", branch: "hexer" } } }
    });
    await hexer.createEmbeddedDocuments("Item", [
      { name: "Supporter", type: "class", system: { identifier: "supporter", levels: 17 }, flags: { ak5e: { chapterThreeId: "class-supporter" } } },
      { name: "Supporter: Hexer", type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-supporter-hexer" } } }
    ]);
    const bard = await Actor.implementation.create({
      name: `R1 Bard ${tag}`, type: "character",
      system: { abilities: { cha: { value: 16 } } },
      flags: { ak5e: { supporter: { enabled: true, aidAbility: "cha", branch: "bard" }, bard: { fontDie: true } } }
    });
    await bard.createEmbeddedDocuments("Item", [
      { name: "Supporter", type: "class", system: { identifier: "supporter", levels: 9 }, flags: { ak5e: { chapterThreeId: "class-supporter" } } },
      { name: "Supporter: Bard", type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-supporter-bard" } } },
      { name: "Font of Inspiration", type: "feat", flags: { ak5e: { chapterThreeId: "subclass-feature-supporter-bard-4th-level-font-of-inspiration-3945" } } }
    ]);
    const killed = await Actor.implementation.create({ name: `R1 Goblin ${tag}`, type: "npc", system: { attributes: { hp: { value: 0, max: 12 } } } });
    const hexed = await Actor.implementation.create({ name: `R1 Hexed ${tag}`, type: "npc", system: { attributes: { hp: { value: 30, max: 30 } } } });
    const attacker = await Actor.implementation.create({ name: `R1 Attacker ${tag}`, type: "npc" });
    return { hexer: hexer.id, hexerUuid: hexer.uuid, bard: bard.id, bardUuid: bard.uuid, killed: killed.uuid, hexed: hexed.uuid, attacker: attacker.uuid };
  }, runTag));

  await step("register Hexer and Bard plans, pools and hooks in the page", () => page.evaluate(async () => {
    const H = await import("/modules/ak5e/scripts/hexer-features.mjs");
    const B = await import("/modules/ak5e/scripts/bard-perform.mjs");
    const U = await import("/modules/ak5e/scripts/supporter-uses.mjs");
    // The branch index registers the Hexer and Bard plans when the module loads; registering them again throws.
    if (!U.supporterUses.plan) throw new Error("supporter engine missing");
    H.defineHexerPools();
    H.registerHexerHooks();
    globalThis.__r1 = { H, B, U };
  }));

  /** Chat messages posted since `from` whose content contains `marker`. */
  const cardCount = (from, marker) => page.evaluate(({ from, marker }) =>
    game.messages.contents.slice(from).filter(m => String(m.content ?? "").includes(marker)).length, { from, marker });

  await step("scenario 1: one Ultimate Hex with three effects, then a kill, posts exactly one burst card", async () => {
    await page.evaluate(async ({ hexerUuid, killed }) => {
      const target = await fromUuid(killed);
      const source = await fromUuid(hexerUuid);
      const expires = game.time.worldTime + 60;
      await target.createEmbeddedDocuments("ActiveEffect", ["abjuring", "looping", "voicethief"].map(kind => ({
        name: `AK5e Hex: ${kind}`, origin: source.uuid,
        flags: { ak5e: { hex: { source: source.uuid, kind, ultimate: true, expires } } }
      })));
    }, { hexerUuid: ids.hexerUuid, killed: ids.killed });
    const from = await page.evaluate(() => game.messages.contents.length);
    await page.evaluate(async killed => {
      const T = await import("/modules/ak5e/scripts/trigger-events.mjs");
      await T.emitAk5eEvent("kill", { actorUuid: killed, eventId: `kill:r1:${Date.now()}` });
    }, ids.killed);
    await page.waitForFunction(from => game.messages.contents.slice(from).some(m => String(m.content ?? "").includes("Rupturing Hex</h3>")),
      from, { timeout: 20000 });
    const burst = await cardCount(from, "Rupturing Hex</h3>");
    report.burstCards = burst;
    if (burst !== 1) throw new Error(`expected one burst card, got ${burst}`);
  });
  await showChat(page);
  await screenshot("r1-01-burst-card.png");

  await step("scenario 2: three Hexes from one Hexer, then a hit, posts exactly one rider card", async () => {
    await page.evaluate(async ({ hexerUuid, hexed }) => {
      const target = await fromUuid(hexed);
      const source = await fromUuid(hexerUuid);
      const expires = game.time.worldTime + 60;
      await target.createEmbeddedDocuments("ActiveEffect", ["abjuring", "looping", "breaking"].map(kind => ({
        name: `AK5e Hex: ${kind}`, origin: source.uuid,
        flags: { ak5e: { hex: { source: source.uuid, kind, ultimate: false, expires } } }
      })));
    }, { hexerUuid: ids.hexerUuid, hexed: ids.hexed });
    const from = await page.evaluate(() => game.messages.contents.length);
    await page.evaluate(async ({ hexed, attacker }) => {
      const T = await import("/modules/ak5e/scripts/trigger-events.mjs");
      await T.emitAk5eEvent("hit", { targetUuid: hexed, actorUuid: attacker, ac: 10, eventId: `hit:r1:${Date.now()}` });
    }, { hexed: ids.hexed, attacker: ids.attacker });
    await page.waitForFunction(from => game.messages.contents.slice(from).some(m => String(m.content ?? "").includes("Hex rider</h3>")),
      from, { timeout: 20000 });
    await page.waitForTimeout(800);
    const riders = await cardCount(from, "Hex rider</h3>");
    report.riderCards = riders;
    if (riders !== 1) throw new Error(`expected one rider card, got ${riders}`);
  });
  await showChat(page);
  await screenshot("r1-02-rider-card.png");

  await step("scenario 3: a Bard grants the Font of Inspiration Aid Die; its effect has a 600 s time expiry", async () => {
    const result = await page.evaluate(async ({ bardId, bardUuid, hexed }) => {
      const { U } = globalThis.__r1;
      const bard = game.actors.get(bardId);
      const target = await fromUuid(hexed);
      const opId = `r1-font-${Date.now()}`;
      let executeError = null;
      try {
        await U.supporterUses.execute(bard, "fontProvideAid", { targetUuid: target.uuid, targetName: target.name, confirmed: true }, opId);
      } catch (error) {
        executeError = error?.message ?? String(error);
      }
      if (executeError) return { found: false, executeError };
      const receipt = U.supporterUses.receipt(bard, opId);
      if (!receipt) return { found: false, executeError: "no receipt recorded" };
      const receiptInfo = { status: receipt.status, targets: receipt.targets?.length ?? 0 };
      // With the Font feature item present, the tag is stored as temporaryTag (expiry object); otherwise as featureTag.
      // The Aid Die effect carries the use's effect flag with font: true (meta), whichever branch built it.
      const effect = [...target.effects.values()].find(e => e.flags?.ak5e?.[U.supporterUses.effectFlag]?.font === true);
      if (!effect) return { found: false, receiptInfo };
      const tag = effect.flags.ak5e.temporaryTag ?? effect.flags.ak5e.featureTag;
      return { found: true, receiptInfo, trigger: tag.expiry?.trigger ?? tag.trigger, seconds: tag.seconds ?? null,
        duration: effect.duration?.seconds ?? null, startTime: effect.duration?.startTime ?? null,
        fontDieLeft: bard.getFlag("ak5e", "bard")?.fontDie ?? null };
    }, { bardId: ids.bard, bardUuid: ids.bardUuid, hexed: ids.hexed });
    report.fontGrant = result;
    if (!result.found) throw new Error("no Font Aid Die effect was granted");
    if (result.trigger !== "time") throw new Error(`Font tag expiry trigger is ${result.trigger}, expected time`);
    if (result.duration !== 600) throw new Error(`Font effect duration is ${result.duration}, expected 600`);
  });
  await showChat(page);
  await screenshot("r1-03-font-grant.png");

  report.consoleErrors = report.errors.length;
  report.passed = report.steps.every(s => s.ok) && report.errors.length === 0;
} catch (error) {
  report.errors.push(`scenario: ${error?.stack ?? error}`);
  exitCode = 1;
} finally {
  await writeFile(`${outputDir}/report.json`, JSON.stringify(report, null, 2));
  await browser.close().catch(() => {});
}
console.log(JSON.stringify({ passed: report.passed, steps: report.steps.length, errors: report.errors.length, screenshots: report.screenshots }, null, 2));
process.exit(exitCode || (report.passed ? 0 : 1));

async function joinAs(name) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1050 } });
  const page = await context.newPage();
  page.on("pageerror", error => { report.errors.push(`${name}: ${error.stack ?? error.message}`); });
  page.on("console", message => {
    if (message.type() !== "error" || message.text().includes("favicon.ico")) return;
    report.errors.push(`${name}: ${message.text()}`);
  });
  await page.goto(base);
  await page.selectOption('select[name="userid"]', { label: name, timeout: 15000 });
  const password = page.locator('input[name="password"]');
  if (await password.count() && await password.isVisible()) await password.fill(process.env.AK5E_TEST_PASSWORD ?? "");
  await page.click('button[name="join"]');
  await page.waitForFunction(() => globalThis.game?.ready && globalThis.canvas?.ready, null, { timeout: 60000 });
  await page.evaluate(async () => {
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.constructor?.name === "UserConfig") await app.close();
    }
  });
  return page;
}

async function showChat(page) {
  await page.evaluate(async () => {
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.constructor?.name === "DialogV2") await app.close().catch(() => {});
    }
    if (ui.sidebar?._collapsed) ui.sidebar.expand();
    ui.sidebar?.activateTab?.("chat");
    const log = document.querySelector("#chat-log");
    if (log) log.scrollTop = log.scrollHeight;
  });
  await page.waitForTimeout(1200);
}
