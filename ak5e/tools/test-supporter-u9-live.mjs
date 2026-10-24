/**
 * Disposable Foundry 13 / D&D5e live check for the composed Artificer branch (U9).
 * The module is loaded by Foundry's real module load (ak5e.mjs imports the branch index). Nothing is registered in the
 * page. Joins as Gamemaster in the disposable `standard-test` World only, asserts game.ak5e.supporter.branches.artificer,
 * creates a level-17 Artificer (INT 16), opens its sheet and screenshots the Supporter panel (Artificer and Heavy Duty
 * Upgrade buttons). Clicks Build Automaton, screenshots its confirm dialog and cancels (no Automaton is written). Then
 * then clicks Fort Builder, screenshots its confirm summary and cancels, checking that no cover is written. Console errors are collected.
 * Env: AK5E_PLAYWRIGHT (path to playwright index.mjs), AK5E_PORT (default 30185), AK5E_TEST_OUTPUT (screenshot dir),
 * AK5E_CHROMIUM (optional executable). Uses launchTestBrowser() from test-browser.mjs.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join as joinPath } from "node:path";
import { launchTestBrowser } from "./test-browser.mjs";

const { chromium } = await import(process.env.AK5E_PLAYWRIGHT ?? "playwright");
const browser = await launchTestBrowser(chromium, process.env.AK5E_CHROMIUM ? { executablePath: process.env.AK5E_CHROMIUM } : {});
const port = process.env.AK5E_PORT ?? "30185";
const outputDir = process.env.AK5E_TEST_OUTPUT ?? "/tmp/ak5e-supporter-u9-live";
const report = { world: "standard-test", port, errors: [], screenshots: [], checks: [], };
await mkdir(outputDir, { recursive: true });

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function shot(page, key, locator = null) {
  const path = joinPath(outputDir, `${key}.png`);
  if (locator) await locator.screenshot({ path });
  else await page.screenshot({ path, fullPage: false });
  report.screenshots.push(path);
  return path;
}

async function check(name, task) {
  try {
    const detail = await task();
    report.checks.push({ name, ok: true, detail: detail ?? null });
    console.log(`PASS ${name}`);
  } catch (error) {
    report.checks.push({ name, ok: false, error: error.message });
    console.log(`FAIL ${name}: ${error.message}`);
  }
}

const context = await browser.newContext({ viewport: { width: 1600, height: 1050 } });
const page = await context.newPage();
page.setDefaultTimeout(25000);
page.on("pageerror", error => report.errors.push(`pageerror: ${error.stack ?? error.message}`));
page.on("console", message => {
  if (message.type() === "error" && !message.text().includes("favicon.ico")) report.errors.push(`console: ${message.text()}`);
});

let fixtures = null;
try {
  await page.goto(`http://127.0.0.1:${port}/join`);
  await page.selectOption('select[name="userid"]', { label: "Gamemaster", timeout: 20000 });
  await page.click('button[name="join"]');
  await page.waitForFunction(() => globalThis.game?.ready === true, null, { timeout: 90000 });
  await page.evaluate(() => { for (const app of foundry.applications.instances.values()) if (/UserConfig/.test(app.constructor.name)) void app.close(); });

  const worldId = await page.evaluate(() => game.world.id);
  if (worldId !== "standard-test") throw new Error(`Refusing World ${worldId}; only the disposable standard-test World is allowed.`);

  await check("the real module load registers the artificer branch (no page-side registration)", () => page.evaluate(() => {
    if (game.modules.get("ak5e")?.active !== true) throw new Error("ak5e is not active");
    const branch = game.ak5e?.supporter?.branches?.artificer;
    if (!branch) throw new Error("game.ak5e.supporter.branches.artificer is missing");
    if (typeof branch.upgrades?.install !== "function") throw new Error("the artificer API has no upgrades.install");
    if (globalThis.__u9) throw new Error("the page registered something by hand");
    return { foundry: game.version, system: game.system.version };
  }));

  fixtures = await page.evaluate(async () => {
    const suffix = foundry.utils.randomID().slice(0, 6);
    const artificer = await Actor.implementation.create({
      name: `U9 Artificer ${suffix}`, type: "character",
      system: { abilities: { int: { value: 16 } }, currency: { cp: 1300 } },
      flags: { ak5e: { supporter: { enabled: true, aidAbility: "int", branch: "artificer" } } }
    });
    await artificer.createEmbeddedDocuments("Item", [
      { name: "Supporter", type: "class", system: { identifier: "supporter", levels: 17 }, flags: { ak5e: { chapterThreeId: "class-supporter" } } },
      { name: "Supporter: Artificer", type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-supporter-artificer" } } }
    ]);
    return { id: artificer.id, uuid: artificer.uuid, name: artificer.name };
  });

  await check("a level-17 Artificer's Supporter panel shows Artificer and Heavy Duty Upgrade buttons", async () => {
    await page.evaluate(async id => {
      const app = game.actors.get(id).sheet;
      await app.render({ force: true });
      app.changeTab?.("features", "primary");
    }, fixtures.id);
    const panel = page.locator(".ak5e-supporter-sheet-panel").first();
    await panel.waitFor({ state: "visible", timeout: 25000 });
    await sleep(800);
    const cmds = await panel.locator("[data-supporter-cmd]").evaluateAll(nodes => nodes.map(node => node.dataset.supporterCmd));
    for (const cmd of ["buildAutomaton", "fortBuilder", "artificerInstallUpgrade", "artificerUseUpgrade", "artificerPersonality"]) {
      if (!cmds.includes(cmd)) throw new Error(`no ${cmd} button in the Supporter panel (found ${cmds.join(", ")})`);
    }
    await shot(page, "u9-01-supporter-panel", panel);
    return { buttons: cmds.length };
  });

  await check("Build Automaton opens its confirm dialog; Cancel writes no Automaton", async () => {
    await page.locator('.ak5e-supporter-sheet-panel [data-supporter-cmd="buildAutomaton"]').click();
    await page.waitForSelector('select[name="variant"]', { timeout: 20000 });
    await sleep(600);
    await shot(page, "u9-02-build-automaton-confirm");
    await page.locator('button[data-action="cancel"]').first().click();
    await sleep(1200);
    const list = await page.evaluate(id => game.actors.get(id).flags?.ak5e?.artificer?.automatons ?? [], fixtures.id);
    if (list.length !== 0) throw new Error(`Cancel still wrote ${list.length} Automaton(s)`);
    return { automatons: 0 };
  });

  await check("Fort Builder shows its confirm summary; Cancel writes no cover and spends no use", async () => {
    await page.locator('.ak5e-supporter-sheet-panel [data-supporter-cmd="fortBuilder"]').click();
    const confirm = page.locator(".ak5e-supporter-confirm").first();
    await confirm.waitFor({ state: "visible", timeout: 20000 });
    await sleep(600);
    await shot(page, "u9-03-fort-builder-confirm");
    await page.locator('button[data-action="cancel"]').first().click();
    await sleep(1500);
    const after = await page.evaluate(id => ({
      covers: (game.actors.get(id).flags?.ak5e?.artificer?.covers ?? []).length
    }), fixtures.id);
    if (after.covers !== 0) throw new Error(`Cancel still wrote ${after.covers} cover(s)`);
    return after;
  });
  await shot(page, "u9-04-after-fort-builder");

  report.consoleErrors = report.errors.length;
} catch (error) {
  report.checks.push({ name: "run", ok: false, error: error.message });
  console.log(`FAIL run: ${error.message}`);
} finally {
  await writeFile(joinPath(outputDir, "u9-live-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ checks: report.checks, screenshots: report.screenshots, consoleErrors: report.errors }, null, 2));
  await browser.close();
  process.exitCode = report.checks.length && report.checks.every(c => c.ok) ? 0 : 1;
}
