/**
 * Live Foundry V13 headless Playwright validation for the Supporter shell (U2).
 * Uses launchTestBrowser() from ./test-browser.mjs per WORKFLOW.md §5.3, and closes the browser in `finally`.
 *
 * Usage (after Foundry is serving the scratch World on AK5E_PORT):
 *   AK5E_PLAYWRIGHT=/tmp/frontier-browser-check/node_modules/playwright/index.mjs AK5E_PORT=30182 \
 *   AK5E_TEST_OUTPUT=<dir> node ak5e/tools/test-supporter-live.mjs --scenario base
 *
 * Scenarios are registered in SCENARIOS so later units can add their own without changing the launcher.
 * Each scenario receives a context { page, report, screenshot, step } and must not rely on state from another.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { launchTestBrowser } from "./test-browser.mjs";

let chromium;
const candidatePlaywright = [
  process.env.AK5E_PLAYWRIGHT,
  "/tmp/frontier-browser-check/node_modules/playwright/index.mjs",
  "playwright"
].filter(Boolean);

for (const candidate of candidatePlaywright) {
  try {
    const mod = await import(candidate);
    if (mod.chromium) {
      chromium = mod.chromium;
      break;
    }
  } catch {
    // try the next candidate
  }
}

if (!chromium) {
  throw new Error("Could not load Playwright chromium module (set AK5E_PLAYWRIGHT).");
}

const port = process.env.AK5E_TEST_PORT ?? process.env.AK5E_PORT ?? "30182";
const base = `http://127.0.0.1:${port}/join`;
const outputDir = process.env.AK5E_TEST_OUTPUT ?? "/tmp/ak5e-supporter-evidence";
const runTag = Date.now().toString(36);

/** Each scenario: { description, run(ctx) }. Add new scenarios here. */
const SCENARIOS = {
  base: {
    description: "Join as GM, create a level-11 Supporter and an ally, Provide Aid through the confirm step, undo, collect errors.",
    run: runBaseScenario
  }
};

function parseArgs(argv) {
  const index = argv.indexOf("--scenario");
  const name = index >= 0 ? argv[index + 1] : "base";
  return { name };
}

const { name: scenarioName } = parseArgs(process.argv.slice(2));
const scenario = SCENARIOS[scenarioName];
if (!scenario) {
  console.error(`Unknown scenario "${scenarioName}". Available: ${Object.keys(SCENARIOS).join(", ")}`);
  process.exit(2);
}

await mkdir(outputDir, { recursive: true });

const report = {
  scenario: scenarioName,
  world: "standard-test",
  port,
  steps: [],
  errors: [],
  screenshots: [],
  renderer: null,
  passed: false
};

const browser = await launchTestBrowser(chromium, {
  ...(process.env.AK5E_CHROMIUM ? { executablePath: process.env.AK5E_CHROMIUM } : {})
});

let exitCode = 0;
try {
  const page = await joinAs("Gamemaster");
  const ctx = {
    page,
    report,
    runTag,
    screenshot: async filename => {
      const fullPath = `${outputDir}/${filename}`;
      await page.screenshot({ path: fullPath, fullPage: false });
      report.screenshots.push(fullPath);
      console.log(`Saved screenshot: ${fullPath}`);
      return fullPath;
    },
    step: async (name, fn) => {
      try {
        const value = await fn();
        report.steps.push({ name, ok: true });
        console.log(`PASS ${name}`);
        return value;
      } catch (error) {
        report.steps.push({ name, ok: false, error: error?.message ?? String(error) });
        console.error(`FAIL ${name}: ${error?.message ?? error}`);
        // Diagnostics for the failing state: UI notifications, open dialogs and a screenshot of the failure.
        try {
          report.diagnostics = report.diagnostics ?? {};
          report.diagnostics[name] = await page.evaluate(() => ({
            notes: globalThis.__ak5eNotes ?? [],
            messages: Array.from(game.messages?.contents ?? []).slice(-3).map(m => String(m.content ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200)),
            notifications: Array.from(document.querySelectorAll("#notifications li")).map(li => li.textContent.trim()),
            dialogs: Array.from(document.querySelectorAll(".application, dialog")).filter(el => el.offsetParent !== null)
              .map(el => el.textContent.replace(/\s+/g, " ").trim().slice(0, 240))
          }));
          await page.screenshot({ path: `${outputDir}/failure-${report.steps.length}.png`, fullPage: false });
          report.screenshots.push(`${outputDir}/failure-${report.steps.length}.png`);
        } catch (diagnosticError) {
          report.diagnostics = { ...(report.diagnostics ?? {}), diagnosticError: diagnosticError.message };
        }
        throw error;
      }
    }
  };
  await scenario.run(ctx);
  report.passed = report.steps.every(step => step.ok);
} catch (error) {
  report.errors.push(`scenario: ${error?.stack ?? error}`);
  exitCode = 1;
} finally {
  await writeFile(`${outputDir}/report.json`, JSON.stringify(report, null, 2));
  await browser.close().catch(() => {});
}
if (report.errors.length && exitCode === 0) exitCode = 1;
console.log(JSON.stringify({ scenario: scenarioName, passed: report.passed, steps: report.steps.length, errors: report.errors.length, screenshots: report.screenshots }, null, 2));
process.exit(exitCode);

async function joinAs(name) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1050 } });
  const page = await context.newPage();

  page.on("pageerror", error => {
    const msg = `${name}: ${error.stack ?? error.message}`;
    console.error("Page error:", msg);
    report.errors.push(msg);
  });
  page.on("console", message => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (text.includes("favicon.ico")) return;
    console.error(`Console error [${name}]:`, text);
    report.errors.push(`${name}: ${text}`);
  });

  await page.goto(base);
  await page.selectOption('select[name="userid"]', { label: name, timeout: 15000 });
  const password = page.locator('input[name="password"]');
  if (await password.count() && await password.isVisible()) {
    await password.fill(process.env.AK5E_TEST_PASSWORD ?? "");
  }
  await page.click('button[name="join"]');
  await page.waitForFunction(() => globalThis.game?.ready && globalThis.canvas?.ready, null, { timeout: 60000 });
  await page.evaluate(async () => {
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.constructor?.name === "UserConfig") await app.close();
    }
  });
  // Keep a record of every UI notification so a failed use can be diagnosed after the toast has faded.
  await page.evaluate(() => {
    globalThis.__ak5eNotes = [];
    for (const level of ["info", "warn", "error"]) {
      const original = ui.notifications[level]?.bind(ui.notifications);
      ui.notifications[level] = (message, options) => {
        globalThis.__ak5eNotes.push({ level, message: String(message) });
        return original?.(message, options);
      };
    }
  });
  report.renderer = await page.evaluate(() => {
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl") ?? canvas.getContext("experimental-webgl");
      const info = gl?.getExtension("WEBGL_debug_renderer_info");
      return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : "unavailable";
    } catch (error) {
      return `error: ${error.message}`;
    }
  });
  return page;
}

/** Render the Supporter sheet on its Features tab (the panel lives there), dismissing the Operator chooser that opens over it. */
async function openSheet(page, actorId) {
  await page.evaluate(id => game.actors.get(id).sheet.render(true), actorId);
  await page.waitForSelector(".ak5e-supporter-sheet-panel", { state: "attached", timeout: 20000 });
  await page.waitForTimeout(800);
  await closeDialogs(page);
  const tabResult = await page.evaluate(id => {
    const sheet = game.actors.get(id)?.sheet;
    if (typeof sheet?.changeTab !== "function") return "no changeTab";
    sheet.changeTab("features", "primary");
    return "ok";
  }, actorId);
  if (tabResult !== "ok") throw new Error(`could not activate the Features tab (${tabResult})`);
  await page.waitForTimeout(600);
}

/** Chat messages are read from game.messages (authoritative) because the sidebar may be collapsed. */
async function waitForChatMessage(page, pattern, timeout) {
  await page.waitForFunction(source => Array.from(game.messages?.contents ?? []).some(message => new RegExp(source).test(String(message.content ?? ""))),
    pattern.source, { timeout });
}

async function chatText(page, pattern) {
  return page.evaluate(source => {
    const message = Array.from(game.messages?.contents ?? []).reverse().find(entry => new RegExp(source).test(String(entry.content ?? "")));
    return message ? String(message.content).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "";
  }, pattern.source);
}

/** Close actor sheets and dialogs, then show the chat sidebar fully expanded so the card is readable. */
async function showChat(page) {
  await closeDialogs(page);
  await page.evaluate(async () => {
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.document?.documentName === "Actor") await app.close().catch(() => {});
    }
    if (ui.sidebar?._collapsed) ui.sidebar.expand();
    ui.sidebar?.activateTab?.("chat");
    const log = document.querySelector("#chat-log");
    if (log) log.scrollTop = log.scrollHeight;
  });
  await page.waitForTimeout(1500);
}

async function closeDialogs(page) {
  await page.evaluate(async () => {
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.constructor?.name === "DialogV2" || app.element?.querySelector?.(".ak5e-supporter-controls-dialog, .ak5e-skill-choices")) {
        await app.close().catch(() => {});
      }
    }
  });
  await page.waitForTimeout(300);
}

async function runBaseScenario({ page, report: rep, screenshot, step, runTag: tag }) {
  await step("ak5e supporter API is published", async () => {
    const ok = await page.evaluate(() => Boolean(globalThis.game?.ak5e?.supporter && typeof globalThis.game.ak5e.supporter.open === "function"));
    if (!ok) throw new Error("game.ak5e.supporter is missing");
  });

  const ids = await step("create level-11 Supporter and an ally", async () => page.evaluate(async tag => {
    const supporter = await Actor.implementation.create({
      name: `AK5E U2 Supporter ${tag}`,
      type: "character",
      system: { abilities: { cha: { value: 16 } } },
      flags: { ak5e: { supporter: { enabled: true, aidAbility: "cha", branch: "hexer" } } }
    });
    await supporter.createEmbeddedDocuments("Item", [{
      name: "Supporter",
      type: "class",
      system: { identifier: "supporter", levels: 11 },
      flags: { ak5e: { chapterThreeId: "class-supporter" } }
    }]);
    const ally = await Actor.implementation.create({ name: `AK5E U2 Ally ${tag}`, type: "character" });
    return { supporter: supporter.id, ally: ally.id, allyName: ally.name };
  }, tag));

  await step("sheet panel renders for the Supporter", async () => {
    await openSheet(page, ids.supporter);
  });
  await screenshot("u2-sheet.png");

  await step("open Supporter controls and see the Aid Die pool", async () => {
    await page.locator(".ak5e-supporter-sheet-panel button", { hasText: "Open Supporter Controls" }).first().click();
    await page.waitForSelector(".ak5e-supporter-controls-dialog", { timeout: 15000 });
    const text = await page.locator(".ak5e-supporter-controls-dialog").innerText();
    if (!/Aid Dice:/.test(text) && !/Aid Dice/.test(text)) throw new Error("controls dialog does not show Aid Dice");
  });
  await screenshot("u2-controls-dialog.png");

  await step("Provide Aid reaches the recipient prompt and the confirm dialog", async () => {
    await page.locator('[data-supporter-cmd="provideAid"]').click();
    const select = page.locator('select[name="target"]');
    await select.waitFor({ timeout: 15000 });
    await select.selectOption({ label: ids.allyName });
    await page.locator('[data-action="ok"]').first().click();
    await page.locator('[data-action="confirm"]').first().waitFor({ timeout: 15000 });
  });
  await screenshot("u2-provide-aid-confirm.png");

  await step("confirming Provide Aid posts the chat card", async () => {
    await page.locator('[data-action="confirm"]').first().click();
    await waitForChatMessage(page, /Provide Aid/, 20000);
    const card = await chatText(page, /Provide Aid/);
    if (/\b(\d+d\d+)\b.*\brolled\b/i.test(card)) throw new Error("Provide Aid card shows an automatic roll");
    rep.card = card.slice(0, 300);
  });
  await showChat(page);
  await screenshot("u2-provide-aid-card.png");

  await step("undo the Provide Aid use from the controls", async () => {
    await closeDialogs(page);
    await openSheet(page, ids.supporter);
    await page.locator(".ak5e-supporter-sheet-panel button", { hasText: "Open Supporter Controls" }).first().click();
    await page.waitForSelector(".ak5e-supporter-controls-dialog", { timeout: 15000 });
    await page.locator('[data-supporter-cmd="undo"]').click();
    await page.locator('[data-action="choose"]').first().waitFor({ timeout: 15000 });
    await page.locator('[data-action="choose"]').first().click();
    await page.locator('[data-action="undo"]').first().waitFor({ timeout: 15000 });
    await page.locator('[data-action="undo"]').first().click();
    await waitForChatMessage(page, /Undone/, 20000);
    // Let the undo dialog finish closing before the capture, so the chat card is shown, not a fading dialog.
    await page.waitForTimeout(1200);
  });
  await showChat(page);
  await screenshot("u2-undo-card.png");

  await step("no unexpected console or page errors", async () => {
    const relevant = rep.errors.filter(error => /supporter|Supporter|AK5e|ak5e/i.test(error));
    if (relevant.length) throw new Error(`console or page errors: ${relevant.slice(0, 3).join(" | ")}`);
  });

  await closeDialogs(page);
}
