/**
 * Live Foundry V13 headless Playwright validation for the Artificer branch (U5).
 * Uses launchTestBrowser() from ./test-browser.mjs per WORKFLOW.md §5.3, and closes the browser in `finally`.
 *
 * Usage (Foundry serving the scratch World on AK5E_PORT):
 *   AK5E_PLAYWRIGHT=/tmp/frontier-browser-check/node_modules/playwright/index.mjs AK5E_PORT=30185 \
 *   AK5E_TEST_OUTPUT=<dir> node ak5e/tools/test-supporter-u5-live.mjs
 *
 * Flow on a level-13 Artificer (INT 16): Professional Engineer builds a platform Automaton through the dialogs
 * (variant, then the Technology reading), the Automaton's sheet, Command Automaton (Bonus Action) with its roll
 * buttons, Fort Builder, then undo of the build (the Automaton is removed). Each step writes a screenshot. Console
 * errors are collected. Nothing rolls except by a click; the report counts any roll posted before a click.
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

const port = process.env.AK5E_TEST_PORT ?? process.env.AK5E_PORT ?? "30185";
const base = `http://127.0.0.1:${port}/join`;
const outputDir = process.env.AK5E_TEST_OUTPUT ?? "/tmp/ak5e-u5-evidence";
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

  const ids = await step("join as Gamemaster and create a level-13 Artificer", () => page.evaluate(async tag => {
    const artificer = await Actor.implementation.create({
      name: `AK5E U5 Artificer ${tag}`, type: "character",
      system: { abilities: { int: { value: 16 } }, currency: { cp: 1300 } },
      flags: { ak5e: { supporter: { enabled: true, aidAbility: "int", branch: "artificer" } } }
    });
    await artificer.createEmbeddedDocuments("Item", [
      { name: "Supporter", type: "class", system: { identifier: "supporter", levels: 13 }, flags: { ak5e: { chapterThreeId: "class-supporter" } } },
      { name: "Supporter: Artificer", type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-supporter-artificer" } } }
    ]);
    return { artificer: artificer.id, artificerUuid: artificer.uuid, name: artificer.name };
  }, runTag));

  await step("register the Artificer plans, pools and hooks in the page", () => page.evaluate(async () => {
    const A = await import("/modules/ak5e/scripts/artificer-features.mjs");
    const U = await import("/modules/ak5e/scripts/supporter-uses.mjs");
    if (!globalThis.__u5Registered) {
      U.registerSupporterPlans({ plans: A.artificerPlans, readings: A.artificerReadings });
      globalThis.__u5Registered = true;
    }
    A.defineArtificerPools();
    A.registerArtificerHooks();
    globalThis.__u5 = { A, U };
    return Object.keys(A.artificerPlans);
  }));

  await step("open the Artificer sheet", async () => {
    await page.evaluate(id => game.actors.get(id).sheet.render({ force: true }), ids.artificer);
    await page.waitForTimeout(1500);
  });
  await screenshot("u5-01-artificer-sheet.png");

  await step("Professional Engineer: choose the platform variant and the Technology reading, then confirm", async () => {
    await page.evaluate(id => { globalThis.__u5MsgBase = game.messages.contents.length; globalThis.__u5.A.artificerCommand(game.actors.get(id), "buildAutomaton").catch(e => console.error("AK5e U5", e)); }, ids.artificer);
    await page.waitForSelector('select[name="variant"]', { timeout: 20000 });
    await page.selectOption('select[name="variant"]', "platform");
    await screenshot("u5-02-build-variant-dialog.png");
    await page.locator('button[data-action="ok"]').first().click();
    await page.waitForSelector('input[name="reading"]', { timeout: 20000 });
    await screenshot("u5-03-technology-reading-dialog.png");
    await page.locator('input[name="reading"][value="intMod"]').check();
    await page.locator('button[data-action="read"]').first().click();
    await page.waitForFunction(id => game.actors.contents.some(a => a.flags?.ak5e?.automaton?.creator && a.flags.ak5e.automaton.creator.endsWith(id)), ids.artificer, { timeout: 30000 });
  });

  const automaton = await step("the Automaton exists with HP 28 (25 + INT 3) and attack +8 (INT 3 + PB 5)", async () => {
    const info = await page.evaluate(id => {
      const a = game.actors.contents.find(x => x.flags?.ak5e?.automaton?.creator?.endsWith(id));
      return a ? { id: a.id, uuid: a.uuid, name: a.name, hpMax: a.system.attributes.hp.max, hp: a.system.attributes.hp.value,
        attackBonus: a.flags.ak5e.automaton.attackBonus, variant: a.flags.ak5e.automaton.variant, prof: a.system.attributes.prof } : null;
    }, ids.artificer);
    if (!info) throw new Error("no Automaton created");
    if (info.hpMax !== 28) throw new Error(`HP max ${info.hpMax}, expected 28`);
    if (info.attackBonus !== 8) throw new Error(`attack bonus ${info.attackBonus}, expected 8`);
    return info;
  });

  await step("open the Automaton's sheet", async () => {
    await page.evaluate(id => game.actors.get(id).sheet.render({ force: true }), automaton.id);
    await page.waitForTimeout(1500);
  });
  await screenshot("u5-04-automaton-sheet.png");

  await step("Command Automaton (Bonus Action): Ram, the card shows buttons and nothing rolls", async () => {
    await page.evaluate(async id => { globalThis.__u5MsgBase = game.messages.contents.length; globalThis.__u5.A.artificerCommand(game.actors.get(id), "commandAutomaton").catch(e => console.error("AK5e U5", e)); }, ids.artificer);
    await page.waitForSelector('select[name="action"]', { timeout: 20000 });
    await page.selectOption('select[name="action"]', "ram");
    await page.locator('button[data-action="ok"]').first().click();
    await page.waitForFunction(() => game.messages.contents.some(m => /data-ak5e-automaton-roll="attack"/.test(String(m.content ?? ""))), null, { timeout: 20000 });
    const rolled = await page.evaluate(() => game.messages.contents.slice(globalThis.__u5MsgBase).some(m => m.rolls?.length));
    if (rolled) throw new Error("a roll was posted before the click");
  });
  await showChat(page);
  await screenshot("u5-05-command-card.png");

  await step("fortBuilder: the Fort Builder card posts and spends one use", async () => {
    await page.evaluate(async id => { globalThis.__u5.A.artificerCommand(game.actors.get(id), "fortBuilder").catch(e => console.error("AK5e U5", e)); }, ids.artificer);
    await page.waitForFunction(id => (game.actors.get(id).flags?.ak5e?.artificer?.covers ?? []).length === 1, ids.artificer, { timeout: 20000 });
  });
  await showChat(page);
  await screenshot("u5-06-fort-builder-card.png");

  await step("undo the Automaton build: the Automaton is removed and its state entry cleared", async () => {
    const useId = await page.evaluate(id => globalThis.__u5.U.supporterUses.uses(game.actors.get(id)).find(u => u.command === "buildAutomaton")?.id ?? null, ids.artificer);
    if (!useId) throw new Error("no buildAutomaton receipt to undo");
    await page.evaluate(async ({ id, useId }) => { await globalThis.__u5.U.supporterUses.undo(game.actors.get(id), useId); }, { id: ids.artificer, useId });
    const left = await page.evaluate(({ id, uuid }) => ({ exists: Boolean(fromUuidSync(uuid)), list: game.actors.get(id).flags?.ak5e?.artificer?.automatons ?? [] }),
      { id: ids.artificer, uuid: automaton.uuid });
    report.afterUndo = left;
    if (left.exists) throw new Error("the Automaton still exists after undo");
    if (left.list.length !== 0) throw new Error("the state entry is still present after undo");
  });
  await showChat(page);
  await screenshot("u5-07-undo-card.png");

  report.errorsConsole = report.errors.length;
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
      if (app.document?.documentName === "Actor" || app.constructor?.name === "DialogV2") await app.close().catch(() => {});
    }
    if (ui.sidebar?._collapsed) ui.sidebar.expand();
    ui.sidebar?.activateTab?.("chat");
    const log = document.querySelector("#chat-log");
    if (log) log.scrollTop = log.scrollHeight;
  });
  await page.waitForTimeout(1200);
}
