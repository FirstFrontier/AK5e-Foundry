/**
 * Live Foundry V13 headless Playwright check for the Supporter r1-base rulings (F-R1, F-R3, F-R5).
 * Uses launchTestBrowser() from ./test-browser.mjs (WORKFLOW.md §5.3) and closes the browser in `finally`.
 *
 * Usage (Foundry serving the scratch World on AK5E_PORT; never port 30000):
 *   AK5E_PLAYWRIGHT=/tmp/frontier-browser-check/node_modules/playwright/index.mjs AK5E_PORT=30191 \
 *   AK5E_TEST_OUTPUT=<dir> node ak5e/tools/test-supporter-r1-base-live.mjs
 *
 * Checks: Provide Aid gives a 600 s effect; the card's Temp HP button confirms (Cancel changes nothing, Confirm sets
 * it) and undo restores it; a Supporter with no stored Aid ability shows the warning line and its chooser.
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

const port = process.env.AK5E_TEST_PORT ?? process.env.AK5E_PORT ?? "30191";
const base = `http://127.0.0.1:${port}/join`;
const outputDir = process.env.AK5E_TEST_OUTPUT ?? "/tmp/ak5e-r1-base-evidence";
const runTag = Date.now().toString(36);
const report = { world: "standard-test", port, steps: [], errors: [], screenshots: [], passed: false };

await mkdir(outputDir, { recursive: true });
const browser = await launchTestBrowser(chromium, {
  ...(process.env.AK5E_CHROMIUM ? { executablePath: process.env.AK5E_CHROMIUM } : {})
});

let exitCode = 0;
try {
  const page = await joinAs("Gamemaster");
  const screenshot = async filename => {
    const fullPath = `${outputDir}/${filename}`;
    await page.screenshot({ path: fullPath, fullPage: false });
    report.screenshots.push(fullPath);
    return fullPath;
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
  await runScenario({ page, screenshot, step });
  report.passed = report.steps.every(entry => entry.ok);
} catch (error) {
  report.errors.push(`scenario: ${error?.stack ?? error}`);
  exitCode = 1;
} finally {
  await writeFile(`${outputDir}/report.json`, JSON.stringify(report, null, 2));
  await browser.close().catch(() => {});
}
console.log(JSON.stringify({ passed: report.passed, steps: report.steps.length, errors: report.errors.length, screenshots: report.screenshots }, null, 2));
process.exit(report.errors.length ? 1 : exitCode);

async function joinAs(name) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1050 } });
  const page = await context.newPage();
  page.on("pageerror", error => report.errors.push(`${name}: ${error.stack ?? error.message}`));
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

async function openSheetFeatures(page, actorId) {
  await page.evaluate(id => game.actors.get(id).sheet.render(true), actorId);
  await page.waitForSelector(".ak5e-supporter-sheet-panel", { state: "attached", timeout: 20000 });
  await page.waitForTimeout(800);
  await page.evaluate(id => game.actors.get(id).sheet.changeTab("features", "primary"), actorId);
  await page.waitForTimeout(600);
}

async function closeDialogs(page) {
  await page.evaluate(async () => {
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.constructor?.name === "DialogV2") await app.close().catch(() => {});
    }
  });
  await page.waitForTimeout(300);
}

async function runScenario({ page, screenshot, step }) {
  const ids = await step("create a level-5 Supporter, an ally and a Supporter with no Aid ability stored", async () => page.evaluate(async tag => {
    const supporter = await Actor.implementation.create({
      name: `R1 Supporter ${tag}`, type: "character",
      system: { abilities: { cha: { value: 16 } } },
      flags: { ak5e: { supporter: { enabled: true, aidAbility: "cha" } } }
    });
    await supporter.createEmbeddedDocuments("Item", [{ name: "Supporter", type: "class", system: { identifier: "supporter", levels: 5 },
      flags: { ak5e: { chapterThreeId: "class-supporter" } } }]);
    const ally = await Actor.implementation.create({ name: `R1 Ally ${tag}`, type: "character" });
    const noFlag = await Actor.implementation.create({
      name: `R1 No Flag ${tag}`, type: "character", system: { abilities: { int: { value: 18 }, cha: { value: 10 }, wis: { value: 12 } } },
      flags: { ak5e: { supporter: { enabled: true } } }
    });
    await noFlag.createEmbeddedDocuments("Item", [{ name: "Supporter", type: "class", system: { identifier: "supporter", levels: 5 },
      flags: { ak5e: { chapterThreeId: "class-supporter" } } }]);
    return { supporter: supporter.id, ally: ally.id, allyName: ally.name, noFlag: noFlag.id };
  }, runTag));

  await step("Provide Aid through the UI: the recipient effect lasts 600 s", async () => {
    await openSheetFeatures(page, ids.supporter);
    await page.locator('[data-supporter-cmd="provideAid"]').click();
    await page.locator('select[name="target"]').waitFor({ timeout: 15000 });
    await page.locator('select[name="target"]').selectOption({ label: ids.allyName }).catch(() => {});
    await page.locator('[data-action="ok"]').first().click();
    await page.locator('[data-action="confirm"]').first().waitFor({ timeout: 15000 });
    await page.locator('[data-action="confirm"]').first().click();
    await page.waitForFunction(id => Array.from(game.actors.get(id)?.effects ?? []).length > 0, ids.ally, { timeout: 20000 });
    const effect = await page.evaluate(id => {
      const effect = Array.from(game.actors.get(id).effects)[0];
      return { seconds: effect.duration?.seconds, trigger: effect.flags?.ak5e?.temporaryTag?.expiry?.trigger ?? null };
    }, ids.ally);
    if (effect.seconds !== 600) throw new Error(`expected a 600 s Aid Die effect, got ${JSON.stringify(effect)}`);
  });
  await closeDialogs(page);
  await screenshot("r1-sheet-after-provide-aid.png");

  await step("the holder expends the Aid Die on a save and rolls it from the card", async () => page.evaluate(async ally => {
    const { supporterUses } = await import("/modules/ak5e/scripts/supporter-uses.mjs");
    const actor = game.actors.get(ally);
    await supporterUses.execute(actor, "useAidDie", { rollType: "save", dieSize: "d8" }, `r1-expend-${Date.now()}`);
  }, ids.ally));
  await step("the card's Roll Aid Die button rolls on click", async () => {
    await closeDialogs(page);
    const cards = await page.evaluate(() => Array.from(game.messages.contents).filter(m => /ak5e-aid-roll/.test(String(m.content))).length);
    if (!cards) throw new Error("no Aid Die card was posted to the chat");
    await page.evaluate(() => {
      for (const app of [...foundry.applications.instances.values()]) if (app.document?.documentName === "Actor") app.close().catch(() => {});
      document.querySelector("#sidebar")?.classList.remove("collapsed");
      ui.sidebar?.activateTab?.("chat");
    });
    await page.waitForTimeout(1500);
    const probe = () => page.evaluate(() => ({
      chatLog: !!document.querySelector("#chat-log"), buttons: document.querySelectorAll("[data-ak5e-aid-roll]").length,
      sidebarActive: ui.sidebar?.activeTab ?? null, expanded: ui.sidebar?.expanded ?? null
    }));
    await page.waitForSelector('[data-ak5e-aid-roll]', { state: "attached", timeout: 20000 }).catch(async error => {
      throw new Error(`${error.message.split("\n")[0]}; probe ${JSON.stringify(await probe())}`);
    });
    await page.locator('[data-ak5e-aid-roll]').last().dispatchEvent("click");
    await page.waitForSelector('[data-ak5e-rider="tempHP"]', { state: "attached", timeout: 20000 });
  });

  const hpTemp = () => page.evaluate(id => Number(game.actors.get(id).system.attributes.hp.temp ?? 0), ids.ally);
  const before = await hpTemp();

  await step("Temp HP asks to confirm; Cancel changes nothing", async () => {
    await page.locator('[data-ak5e-rider="tempHP"]').last().dispatchEvent("click");
    await page.locator('[data-action="confirm"]').first().waitFor({ timeout: 15000 });
    await screenshot("r1-temp-hp-confirm.png");
    await page.locator('[data-action="cancel"]').first().click();
    await page.waitForTimeout(1200);
    const after = await hpTemp();
    if (after !== before) throw new Error(`Cancel changed Temp HP from ${before} to ${after}`);
  });

  await step("Temp HP Confirm sets the Temporary HP", async () => {
    await page.locator('[data-ak5e-rider="tempHP"]').last().dispatchEvent("click");
    await page.locator('[data-action="confirm"]').first().waitFor({ timeout: 15000 });
    await page.locator('[data-action="confirm"]').first().click();
    await page.waitForFunction(([id, was]) => Number(game.actors.get(id).system.attributes.hp.temp ?? 0) > was, [ids.ally, before], { timeout: 20000 });
  });
  await screenshot("r1-temp-hp-applied.png");

  await step("undo restores the Temporary HP", async () => {
    const restored = await page.evaluate(async ([id, was]) => {
      const { supporterUses } = await import("/modules/ak5e/scripts/supporter-uses.mjs");
      const actor = game.actors.get(id);
      const use = supporterUses.uses(actor).find(entry => entry.command === "aidTempHP" && entry.status !== "undone");
      if (!use) throw new Error("no Temp HP use recorded");
      await supporterUses.undo(actor, use.id);
      return Number(actor.system.attributes.hp.temp ?? 0) === was;
    }, [ids.ally, before]);
    if (!restored) throw new Error("undo did not restore Temporary HP");
  });

  await step("a Supporter with no stored Aid ability shows the warning line and the chooser", async () => {
    await openSheetFeatures(page, ids.noFlag);
    const text = await page.locator(".ak5e-supporter-aid-ability").first().innerText();
    if (!/Aid ability not chosen — using INT/.test(text)) throw new Error(`warning text was "${text}"`);
    await page.locator('.ak5e-supporter-aid-ability button', { hasText: "Choose Aid ability" }).first().waitFor({ timeout: 10000 });
  });
  await screenshot("r1-aid-ability-warning.png");
}
