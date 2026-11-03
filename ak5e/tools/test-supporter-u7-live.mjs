/**
 * Live Foundry V13 headless Playwright validation for the Bard composing unit (U7).
 * Uses launchTestBrowser() from ./test-browser.mjs per WORKFLOW.md §5.3, and closes the browser in `finally`.
 *
 * Usage (Foundry serving the scratch World on AK5E_PORT):
 *   AK5E_PLAYWRIGHT=/tmp/frontier-browser-check/node_modules/playwright/index.mjs AK5E_PORT=30187 \
 *   AK5E_TEST_OUTPUT=<dir> node ak5e/tools/test-supporter-u7-live.mjs
 *
 * Flow on a level-13 Bard (CHA 16): a long rest is recorded, composePerformances is run with 2 Aid Dice through the
 * dialog and confirm, the card's roll button (rendered by the Supporter engine) is clicked, the Performances and Temporary HP are read back, then the use
 * is undone. Every step writes a screenshot; console and page errors are collected.
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
const outputDir = process.env.AK5E_TEST_OUTPUT ?? "/tmp/ak5e-u7-evidence";
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

  const ids = await step("join as Gamemaster and create a level-13 Bard (CHA 16)", () => page.evaluate(async tag => {
    const bard = await Actor.implementation.create({
      name: `AK5E U7 Bard ${tag}`, type: "character",
      system: { abilities: { cha: { value: 16 } } },
      flags: { ak5e: { supporter: { enabled: true, aidAbility: "cha", branch: "bard" } } }
    });
    await bard.createEmbeddedDocuments("Item", [
      { name: "Supporter", type: "class", system: { identifier: "supporter", levels: 13 }, flags: { ak5e: { chapterThreeId: "class-supporter" } } },
      { name: "Supporter: Bard", type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-supporter-bard" } } }
    ]);
    return { bard: bard.id, bardUuid: bard.uuid };
  }, runTag));

  await step("register the Bard plans, pools and hooks in the page, then record a Long Rest", () => page.evaluate(async bardId => {
    const B = await import("/modules/ak5e/scripts/bard-compose.mjs");
    const U = await import("/modules/ak5e/scripts/supporter-uses.mjs");
    if (!globalThis.__u7Registered) {
      U.registerSupporterPlans({ plans: B.bardComposePlans });
      globalThis.__u7Registered = true;
    }
    B.defineBardComposePools();
    B.registerBardComposeHooks();
    globalThis.__u7 = { B, U };
    const bard = game.actors.get(bardId);
    Hooks.callAll("dnd5e.restCompleted", bard, { type: "long" }, { type: "long" });
    await new Promise(resolve => setTimeout(resolve, 800));
    const flags = bard.getFlag("ak5e", "bardRest");
    if (!flags?.open) throw new Error("the Long Rest did not reopen composition");
  }, ids.bard));

  const hpBefore = await page.evaluate(id => game.actors.get(id).system.attributes.hp.temp ?? 0, ids.bard);
  report.hpTempBefore = hpBefore;

  await step("open Compose Performances: the dialog asks for 2 Aid Dice and the Performances", async () => {
    await page.evaluate(id => {
      globalThis.__u7MsgBase = game.messages.contents.length;
      globalThis.__u7.B.bardComposeCommand(game.actors.get(id), "composePerformances").catch(error => console.error("AK5e U7", error));
    }, ids.bard);
    await page.waitForSelector('input[name="aidDice"]', { timeout: 20000 });
    await page.fill('input[name="aidDice"]', "2");
    await page.fill('textarea[name="performances"]', "Bane, Aid, Bolster\nHeroism, Sleep, Warding Bond");
  });
  await screenshot("u7-01-compose-dialog.png");

  await step("Continue, then confirm: the card posts one roll button and nothing rolls", async () => {
    await page.locator('button[data-action="ok"]').first().click();
    await page.waitForSelector('[data-action="confirm"]', { timeout: 20000 });
    await screenshot("u7-02-confirm.png");
    await page.locator('button[data-action="confirm"]').first().click();
    await page.waitForSelector('.ak5e-play-use-controls[data-ns="supporterUses"] button', { timeout: 20000 });
    const rolled = await page.evaluate(() => game.messages.contents.slice(globalThis.__u7MsgBase).some(m => m.rolls?.length));
    if (rolled) throw new Error("a roll was posted before the click");
    const written = await page.evaluate(id => (game.actors.get(id).getFlag("ak5e", "bard")?.performances ?? []).length, ids.bard);
    if (written !== 0) throw new Error(`Performances were written before the roll click (${written})`);
  });
  await showChat(page);
  await screenshot("u7-03-roll-card.png");

  const useId = await step("click the roll button: the Performances are composed and the leftover Muse is Temporary HP", async () => {
    // The card can sit outside the chat sidebar viewport; a DOM click runs the same handler as a user click.
    await page.evaluate(() => {
      // The control box holds "Roll <formula> ..." then "Undo"; click the roll.
      const roll = [...document.querySelectorAll('.ak5e-play-use-controls[data-ns="supporterUses"] button')].find(b => /^Roll /.test(b.textContent.trim()));
      if (!roll) throw new Error("no roll button on the Supporter card");
      roll.click();
    });
    await page.waitForFunction(id => (game.actors.get(id).getFlag("ak5e", "bard")?.performances ?? []).length === 2, ids.bard, { timeout: 20000 });
    const result = await page.evaluate(id => {
      const bard = game.actors.get(id);
      const flagState = bard.getFlag("ak5e", "bard");
      const use = globalThis.__u7.U.supporterUses.uses(bard).find(item => item.command === "composePerformances");
      const receipt = use ? globalThis.__u7.U.supporterUses.receipt(bard, use.id) : null;
      return {
        useId: use?.id ?? null,
        roll: receipt?.roll ?? null,
        performances: flagState.performances.map(item => item.arts.map(art => art.name)),
        museTHP: flagState.museTHP,
        hpTemp: bard.system.attributes.hp.temp ?? 0,
        aidDice: bard.getFlag("ak5e", "resourcePools")?.aidDie?.value ?? null
      };
    }, ids.bard);
    report.afterRoll = result;
    if (result.roll === null) throw new Error("the roll was not recorded on the receipt");
    const expectedTHP = Math.max(0, result.roll - (6 + 7));
    if (result.museTHP !== expectedTHP) throw new Error(`museTHP ${result.museTHP}, expected ${expectedTHP} from roll ${result.roll}`);
    if (result.hpTemp !== Math.max(hpBefore, expectedTHP)) throw new Error(`hp.temp ${result.hpTemp}, expected ${Math.max(hpBefore, expectedTHP)}`);
    return result.useId;
  });
  await showChat(page);
  await screenshot("u7-04-performances-and-thp.png");

  await step("undo the composition: Performances, Temporary HP and Aid Dice are restored exactly", async () => {
    await page.evaluate(async ({ bardId, useId }) => {
      await globalThis.__u7.U.supporterUses.undo(game.actors.get(bardId), useId);
    }, { bardId: ids.bard, useId });
    const restored = await page.evaluate(id => {
      const bard = game.actors.get(id);
      return { performances: (bard.getFlag("ak5e", "bard")?.performances ?? []).length, hpTemp: bard.system.attributes.hp.temp ?? 0 };
    }, ids.bard);
    report.afterUndo = restored;
    if (restored.performances !== 0) throw new Error(`undo left ${restored.performances} Performance(s)`);
    if (restored.hpTemp !== hpBefore) throw new Error(`undo left Temporary HP ${restored.hpTemp}, expected ${hpBefore}`);
  });
  await showChat(page);
  await screenshot("u7-05-undo-card.png");

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
    if (ui.sidebar?._collapsed) ui.sidebar.expand();
    ui.sidebar?.activateTab?.("chat");
    const log = document.querySelector("#chat-log");
    if (log) log.scrollTop = log.scrollHeight;
  });
  await page.waitForTimeout(1200);
}
