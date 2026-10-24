/**
 * Live Foundry V13 headless Playwright validation for the Bard branch composition (U11).
 * Uses launchTestBrowser() from ./test-browser.mjs per WORKFLOW.md §5.3, and closes the browser in `finally`.
 *
 * Usage (Foundry serving the scratch World on AK5E_PORT):
 *   AK5E_PLAYWRIGHT=/tmp/frontier-browser-check/node_modules/playwright/index.mjs AK5E_PORT=30187 \
 *   AK5E_TEST_OUTPUT=<dir> node ak5e/tools/test-supporter-u11-live.mjs
 *
 * The real module load registers the Bard branch: this script registers nothing in the page. It reads the branch
 * through the same module instance (supporter-branches.mjs) that ak5e.mjs loaded, to reach the command the Start
 * control would call (the Start button is not rendered until a Performance is composed).
 *
 * Flow on a level-13 Bard (CHA 16, equipped proficient Lute): the Supporter panel is shown with the Compose and Perform
 * controls; Compose Performances opens the picker, Continue opens the confirm, Cancel writes nothing; Put on a Performance
 * with no composed Performance is refused with a warning and writes nothing. Every step screenshots; console and page errors
 * are collected.
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

const port = process.env.AK5E_TEST_PORT ?? process.env.AK5E_PORT ?? "30187";
const base = `http://127.0.0.1:${port}/join`;
const outputDir = process.env.AK5E_TEST_OUTPUT ?? "/tmp/ak5e-u11-evidence";
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

  await step("the real module load registers the Bard branch (game.ak5e.supporter.branches.bard)", () => page.evaluate(() => {
    const api = game.ak5e?.supporter?.branches?.bard;
    if (!api) throw new Error("game.ak5e.supporter.branches.bard is missing: the Bard branch did not load");
    if (typeof api.perform?.start !== "function") throw new Error("the Bard API has no perform surface");
    return Object.keys(api);
  }));

  const ids = await step("create a level-13 Bard (CHA 16) with an equipped, proficient Lute", () => page.evaluate(async tag => {
    const bard = await Actor.implementation.create({
      name: `AK5E U11 Bard ${tag}`, type: "character",
      system: { abilities: { cha: { value: 16 } } },
      flags: { ak5e: { supporter: { enabled: true, aidAbility: "cha", branch: "bard" } } }
    });
    await bard.createEmbeddedDocuments("Item", [
      { name: "Supporter", type: "class", system: { identifier: "supporter", levels: 13 }, flags: { ak5e: { chapterThreeId: "class-supporter" } } },
      { name: "Supporter: Bard", type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-supporter-bard" } } },
      { name: "Lute", type: "tool", system: { equipped: true, proficient: 1 } }
    ]);
    return { bard: bard.id, bardUuid: bard.uuid };
  }, runTag));

  const before = await page.evaluate(id => {
    const bard = game.actors.get(id);
    return JSON.stringify({ bard: bard.getFlag("ak5e", "bard") ?? null, temp: bard.system.attributes.hp.temp ?? 0, pools: bard.getFlag("ak5e", "resourcePools") ?? null });
  }, ids.bard);

  await step("open the Bard sheet on the Features tab: the Supporter panel shows Compose and Perform controls", async () => {
    await page.evaluate(async id => {
      const sheet = game.actors.get(id).sheet;
      await sheet.render({ force: true });
      await new Promise(resolve => setTimeout(resolve, 800));
      if (typeof sheet.changeTab === "function") await sheet.changeTab("features", "primary");
    }, ids.bard);
    // An unrelated "Choose Skills" progression prompt opens over the sheet; close it with its window X (no choice made).
    const closeSkillPrompts = () => page.evaluate(() => {
      for (const app of [...foundry.applications.instances.values()]) {
        const title = String(app.options?.window?.title ?? app.title ?? "");
        if (title.startsWith("Choose Skills")) Promise.resolve(app.close()).catch(() => {});
      }
    });
    await page.waitForTimeout(1500);
    await closeSkillPrompts();
    await page.waitForTimeout(500);
    await page.waitForSelector('[data-supporter-cmd="composePerformances"]', { timeout: 20000 });
    await page.locator(".ak5e-supporter-sheet-panel").first().scrollIntoViewIfNeeded();
    for (const cmd of ["composePerformances", "bardSetup", "speakToTheSoul", "emergencyImprov", "bardStartPerformance"]) {
      const count = await page.locator(`[data-supporter-cmd="${cmd}"]`).count();
      if (count < 1 && cmd !== "bardStartPerformance") throw new Error(`no ${cmd} control on the sheet`);
    }
    if (await page.locator(".ak5e-bard-perform").count() < 1) throw new Error("no Perform section on the sheet");
  });
  await screenshot("u11-01-panel.png");

  await step("Compose Performances opens the picker; Continue opens the confirm; Cancel writes nothing", async () => {
    await page.locator('[data-supporter-cmd="composePerformances"]').first().click();
    await page.waitForSelector('input[name="aidDice"]', { timeout: 20000 });
    await page.fill('input[name="aidDice"]', "1");
    await page.fill('textarea[name="performances"]', "Bane, Aid, Bolster");
  });
  await screenshot("u11-02-compose-picker.png");

  await step("Continue, then Cancel at the confirm: no Performance, no Temporary HP, no Aid Die is spent", async () => {
    await page.locator('button[data-action="ok"]').first().click();
    await page.waitForSelector('button[data-action="cancel"]', { timeout: 20000 });
    await screenshot("u11-03-compose-confirm.png");
    await page.locator('button[data-action="cancel"]').first().click();
    await page.waitForFunction(() => !document.querySelector('.ak5e-supporter-confirm'), null, { timeout: 20000 }).catch(() => {});
    const after = await page.evaluate(id => {
      const bard = game.actors.get(id);
      return JSON.stringify({ bard: bard.getFlag("ak5e", "bard") ?? null, temp: bard.system.attributes.hp.temp ?? 0, pools: bard.getFlag("ak5e", "resourcePools") ?? null });
    }, ids.bard);
    const written = await page.evaluate(id => (game.actors.get(id).getFlag("ak5e", "bard")?.performances ?? []).length, ids.bard);
    if (written !== 0) throw new Error(`Cancel still wrote ${written} Performance(s)`);
    report.afterCancel = { changed: after !== before };
    const parsedAfter = JSON.parse(after), parsedBefore = JSON.parse(before);
    if (parsedAfter.temp !== parsedBefore.temp) throw new Error("Cancel changed Temporary HP");
    if (JSON.stringify(parsedAfter.pools) !== JSON.stringify(parsedBefore.pools)) throw new Error("Cancel changed the resource pools");
  });

  await step("Put on a Performance with no composed Performance is refused with a warning and writes nothing", async () => {
    const shown = await page.evaluate(() => (document.querySelector(".ak5e-bard-perform")?.textContent ?? "").replace(/\s+/g, " ").trim());
    report.performPanelText = shown;
    if (!/Compose a Performance first/.test(shown)) throw new Error(`the Perform section does not say to compose first: "${shown}"`);
    if (await page.locator('[data-supporter-cmd="bardStartPerformance"]').count() !== 0) throw new Error("a Start button is shown with no composed Performance");
    const warnings = await page.evaluate(async id => {
      // The module instance ak5e.mjs loaded (no registration): the same command the Start control would call.
      const { SUPPORTER_BRANCH_MODULES } = await import("/modules/ak5e/scripts/supporter-branches.mjs");
      const seen = [];
      const original = ui.notifications.warn;
      ui.notifications.warn = (message, options) => { seen.push(String(message)); return original.call(ui.notifications, message, options); };
      try {
        const result = await SUPPORTER_BRANCH_MODULES.get("bard").command(game.actors.get(id), "bardStartPerformance");
        if (result !== null) throw new Error(`the refusal returned ${String(result)}, not null`);
      } finally {
        ui.notifications.warn = original;
      }
      return seen;
    }, ids.bard);
    report.startWarnings = warnings;
    if (!warnings.some(text => /Compose a Performance first/.test(text))) throw new Error(`no refusal warning (saw ${JSON.stringify(warnings)})`);
    const state = await page.evaluate(id => {
      const flags = game.actors.get(id).getFlag("ak5e", "bard") ?? {};
      return { performances: (flags.performances ?? []).length, active: flags.active ?? null };
    }, ids.bard);
    if (state.performances !== 0 || state.active !== null) throw new Error(`the refusal wrote state: ${JSON.stringify(state)}`);
  });
  await screenshot("u11-04-start-refused.png");

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
