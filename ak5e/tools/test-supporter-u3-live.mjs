/**
 * Live Foundry V13 validation for the Hexer Arts setup (U3). Uses launchTestBrowser() from ./test-browser.mjs
 * (WORKFLOW.md §5.3) and closes the browser in `finally`.
 *
 * Usage (Foundry serving the scratch World on AK5E_PORT):
 *   AK5E_PLAYWRIGHT=/tmp/frontier-browser-check/node_modules/playwright/index.mjs AK5E_PORT=30183 \
 *   AK5E_TEST_OUTPUT=<dir> node ak5e/tools/test-supporter-u3-live.mjs
 *
 * Scenario: join as Gamemaster; create a level-11 Hexer; load hexer-arts.mjs into the page and register its plan with
 * the Supporter engine (the branch is not composed yet); run Configure Hexer Arts through its dialog (choose the
 * ability and a pool, Confirm, "Use anyway" for the missing second pool); screenshot; undo; collect console errors.
 * Nothing rolls: the setup has no dice.
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
    if (mod.chromium) { chromium = mod.chromium; break; }
  } catch {
    // try the next candidate
  }
}
if (!chromium) throw new Error("Could not load Playwright chromium module (set AK5E_PLAYWRIGHT).");

const port = process.env.AK5E_TEST_PORT ?? process.env.AK5E_PORT ?? "30183";
const base = `http://127.0.0.1:${port}/join`;
const outputDir = process.env.AK5E_TEST_OUTPUT ?? "/tmp/ak5e-u3-evidence";
const runTag = Date.now().toString(36);
/** Corrosion Arts: eleven of its 5th-level-or-less members resolve to AK5e records (see the unit test for the rest). */
const POOL = "standard-art-pool-corrosion-arts-407";

const report = { scenario: "hexer-arts-u3", world: "standard-test", port, steps: [], errors: [], screenshots: [], renderer: null, passed: false };

await mkdir(outputDir, { recursive: true });
const browser = await launchTestBrowser(chromium, { ...(process.env.AK5E_CHROMIUM ? { executablePath: process.env.AK5E_CHROMIUM } : {}) });

let exitCode = 0;
let page;
try {
  page = await joinAs("Gamemaster");
  await runScenario();
  report.passed = report.steps.length > 0 && report.steps.every(step => step.ok);
} catch (error) {
  report.errors.push(`scenario: ${error?.stack ?? error}`);
  exitCode = 1;
} finally {
  await writeFile(`${outputDir}/report.json`, JSON.stringify(report, null, 2));
  await browser.close().catch(() => {});
}
if (report.errors.length && exitCode === 0) exitCode = 1;
console.log(JSON.stringify({ passed: report.passed, steps: report.steps.length, errors: report.errors.length, screenshots: report.screenshots }, null, 2));
process.exit(exitCode);

async function step(name, fn) {
  try {
    const value = await fn();
    report.steps.push({ name, ok: true });
    console.log(`PASS ${name}`);
    return value;
  } catch (error) {
    report.steps.push({ name, ok: false, error: error?.message ?? String(error) });
    console.error(`FAIL ${name}: ${error?.message ?? error}`);
    throw error;
  }
}

async function screenshot(filename) {
  const fullPath = `${outputDir}/${filename}`;
  await page.screenshot({ path: fullPath, fullPage: false });
  report.screenshots.push(fullPath);
  console.log(`Saved screenshot: ${fullPath}`);
  return fullPath;
}

async function joinAs(name) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1050 } });
  const joined = await context.newPage();
  joined.on("pageerror", error => {
    const msg = `${name}: ${error.stack ?? error.message}`;
    console.error("Page error:", msg);
    report.errors.push(msg);
  });
  joined.on("console", message => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (text.includes("favicon.ico")) return;
    console.error(`Console error [${name}]:`, text);
    report.errors.push(`${name}: ${text}`);
  });
  await joined.goto(base);
  await joined.selectOption('select[name="userid"]', { label: name, timeout: 15000 });
  const password = joined.locator('input[name="password"]');
  if (await password.count() && await password.isVisible()) await password.fill(process.env.AK5E_TEST_PASSWORD ?? "");
  await joined.click('button[name="join"]');
  await joined.waitForFunction(() => globalThis.game?.ready && globalThis.canvas?.ready, null, { timeout: 60000 });
  await joined.evaluate(async () => {
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.constructor?.name === "UserConfig") await app.close();
    }
  });
  report.renderer = await joined.evaluate(() => {
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl") ?? canvas.getContext("experimental-webgl");
      const info = gl?.getExtension("WEBGL_debug_renderer_info");
      return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : "unavailable";
    } catch (error) {
      return `error: ${error.message}`;
    }
  });
  return joined;
}

/** Closes every dialog window (including progression prompts that open when a class Item is added). Actor sheets stay open. */
async function closeDialogs() {
  await page.evaluate(async () => {
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.constructor?.name === "DialogV2" || app.element?.classList?.contains("dialog") || app.element?.querySelector?.(".ak5e-hexer-arts-form, .ak5e-hexer-arts-panel, .ak5e-supporter-confirm, .ak5e-play-use")) {
        await app.close().catch(() => {});
      }
    }
  });
  await page.waitForTimeout(300);
}

/** A control inside the dialog that contains `marker`, so a stray dialog can never receive the click. */
function inDialog(marker, selector) {
  return page.locator(`dialog:has(${marker}) ${selector}`);
}

async function openSheet(actorId) {
  await page.evaluate(id => game.actors.get(id).sheet.render(true), actorId);
  await page.waitForSelector(".ak5e-supporter-sheet-panel", { state: "attached", timeout: 20000 });
  await page.waitForTimeout(800);
  await closeDialogs();
}

/** Chat messages are read from game.messages (authoritative) because the sidebar may be collapsed. */
async function waitForChatMessage(pattern, timeout) {
  await page.waitForFunction(source => Array.from(game.messages?.contents ?? []).some(message => new RegExp(source).test(String(message.content ?? ""))),
    pattern.source, { timeout });
}

async function chatText(pattern) {
  return page.evaluate(source => {
    const message = Array.from(game.messages?.contents ?? []).reverse().find(entry => new RegExp(source).test(String(entry.content ?? "")));
    return message ? String(message.content).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "";
  }, pattern.source);
}

async function showChat() {
  await closeDialogs();
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

async function runScenario() {
  const ids = await step("create a level-11 Hexer and load its Arts module", async () => page.evaluate(async tag => {
    const actor = await Actor.implementation.create({
      name: `AK5E U3 Hexer ${tag}`,
      type: "character",
      system: { abilities: { int: { value: 12 }, wis: { value: 14 }, cha: { value: 16 } } },
      flags: { ak5e: { supporter: { enabled: true, branch: "hexer", aidAbility: "cha" } } }
    });
    await actor.createEmbeddedDocuments("Item", [
      { name: "Supporter", type: "class", system: { identifier: "supporter", levels: 11 }, flags: { ak5e: { chapterThreeId: "class-supporter" } } },
      { name: "Supporter: Hexer", type: "subclass", system: { identifier: "hexer" }, flags: { ak5e: { chapterThreeId: "subclass-supporter-hexer" } } }
    ]);
    const hexer = await import("/modules/ak5e/scripts/hexer-arts.mjs");
    const engine = await import("/modules/ak5e/scripts/supporter-uses.mjs");
    try {
      engine.registerSupporterPlans({ plans: hexer.hexerArtsPlans, readings: {} });
    } catch (error) {
      // The branch index may already have composed this plan; only a different failure is an error.
      if (!/already registered/.test(String(error?.message))) throw error;
    }
    hexer.registerHexerArtsHooks();
    globalThis.__u3 = { hexer, engine };
    return { id: actor.id, name: actor.name, plans: Object.keys(hexer.hexerArtsPlans), hasUse: typeof game.ak5e?.supporter?.use === "function" };
  }, runTag));
  if (!ids.hasUse) throw new Error("game.ak5e.supporter.use is missing");

  await step("Configure Hexer Arts opens the ability and pool form", async () => {
    await closeDialogs();
    await page.evaluate(id => {
      globalThis.__u3Result = undefined;
      globalThis.__u3Run = __u3.hexer.runHexerArtsCommand(game.actors.get(id), "configureHexerArts")
        .then(result => { globalThis.__u3Result = result ?? null; }, error => { globalThis.__u3Error = error?.message ?? String(error); });
    }, ids.id);
    await page.locator(".ak5e-hexer-arts-form select[name='ability']").waitFor({ timeout: 15000 });
  });
  await screenshot("u3-configure-dialog.png");

  await step("choose Charisma and Corrosion Arts, then Continue to the confirm step", async () => {
    await inDialog(".ak5e-hexer-arts-form", "select[name='ability']").selectOption("cha");
    await inDialog(".ak5e-hexer-arts-form", "select[name='pool1']").selectOption(POOL);
    await inDialog(".ak5e-hexer-arts-form", '[data-action="ok"]').click();
    await inDialog(".ak5e-supporter-confirm", '[data-action="confirm"]').waitFor({ timeout: 15000 });
  });
  await screenshot("u3-confirm.png");

  await step("Confirm reaches the warning for the missing second pool (Use anyway)", async () => {
    await inDialog(".ak5e-supporter-confirm", '[data-action="confirm"]').click();
    await inDialog(".ak5e-play-use", '[data-action="anyway"]').waitFor({ timeout: 15000 });
    const text = await inDialog(".ak5e-play-use", "").innerText().catch(() => "");
    if (!/additional Standard Arts Pool/i.test(text)) throw new Error(`warning dialog does not name the second pool: ${text.slice(0, 200)}`);
  });
  await screenshot("u3-warning.png");

  await step("Use anyway applies the setup and posts the chat card", async () => {
    await inDialog(".ak5e-play-use", '[data-action="anyway"]').click();
    await waitForChatMessage(/Configure Hexer Arts/, 30000);
    await page.waitForFunction(() => globalThis.__u3Result !== undefined || globalThis.__u3Error !== undefined, null, { timeout: 30000 });
    const error = await page.evaluate(() => globalThis.__u3Error ?? null);
    if (error) throw new Error(`configure failed: ${error}`);
    const card = await chatText(/Configure Hexer Arts/);
    if (!/11 Arts granted/.test(card)) throw new Error(`card does not report the granted Arts: ${card.slice(0, 240)}`);
    if (/\brolled\b/i.test(card)) throw new Error("the setup card shows a roll");
    report.card = card.slice(0, 400);
  });

  const state = await step("the actor holds the AP maximum, Art level and the granted Prepared Arts", async () => page.evaluate(id => {
    const actor = game.actors.get(id);
    const ap = actor.getFlag("ak5e", "artsPoints") ?? {};
    const spells = actor.items.filter(item => item.type === "spell");
    const prepared = spells.every(item => item.system.prepared === 2);
    const pools = spells.map(item => item.getFlag?.("ak5e", "supporterArts")?.pool).filter(Boolean);
    const out = { maximum: ap.maximum, maximumArtLevel: ap.maximumArtLevel, value: ap.value, ability: actor.getFlag("ak5e", "casting")?.ability,
      spells: spells.length, prepared, pools: [...new Set(pools)], names: spells.map(item => item.name).sort() };
    if (out.maximum !== 11 || out.maximumArtLevel !== 3) throw new Error(`AP ${out.maximum} / Art level ${out.maximumArtLevel}: expected 11 / 3`);
    if (out.ability !== "cha") throw new Error(`casting ability ${out.ability}: expected cha`);
    if (out.spells < 1 || !prepared) throw new Error("no Prepared Arts were granted");
    if (out.pools.some(pool => pool !== "standard-art-pool-corrosion-arts-407")) throw new Error("an Art carries the wrong pool tag");
    return out;
  }, ids.id));
  report.setup = state;

  await step("the sheet opens with the Supporter panel", async () => {
    await openSheet(ids.id);
  });
  await screenshot("u3-sheet.png");

  await step("the Hexer panel fragment renders (injected: the branch sheetPanel is not composed yet)", async () => {
    await page.evaluate(id => {
      globalThis.__u3Panel = foundry.applications.api.DialogV2.wait({
        window: { title: "Hexer Arts panel (injected)" }, rejectClose: false,
        content: __u3.hexer.hexerArtsPanel(game.actors.get(id)),
        buttons: [{ action: "close", label: "Close", default: true }]
      });
    }, ids.id);
    await page.locator(".ak5e-hexer-arts-panel").first().waitFor({ timeout: 15000 });
    const text = await page.locator(".ak5e-hexer-arts-panel").first().innerText();
    if (!/Charisma/.test(text) || !/11 \/ 11/.test(text)) throw new Error(`panel text unexpected: ${text.slice(0, 200)}`);
  });
  await screenshot("u3-panel.png");
  await closeDialogs();

  await step("undo reverses the setup: Arts removed, flags restored", async () => {
    const useId = await page.evaluate(id => {
      const uses = game.ak5e.supporter.uses(game.actors.get(id));
      return uses.find(use => use.command === "configureHexerArts" && use.status === "complete")?.id ?? null;
    }, ids.id);
    if (!useId) throw new Error("no completed configureHexerArts use to undo");
    await page.evaluate(([id, use]) => game.ak5e.supporter.use(game.actors.get(id), "undoUse", { useId: use }, foundry.utils.randomID()), [ids.id, useId]);
    await waitForChatMessage(/Undone/, 30000);
    const after = await page.evaluate(id => {
      const actor = game.actors.get(id);
      return { spells: actor.items.filter(item => item.type === "spell").length, ap: actor.getFlag("ak5e", "artsPoints") ?? null,
        casting: actor.getFlag("ak5e", "casting") ?? null };
    }, ids.id);
    if (after.spells !== 0) throw new Error(`${after.spells} Arts remain after undo`);
    if (after.ap !== null) throw new Error("AP flags were not restored after undo");
  });
  await showChat();
  await screenshot("u3-undo-card.png");

  await step("no unexpected console or page errors", async () => {
    const relevant = report.errors.filter(error => /supporter|hexer|arts|ak5e/i.test(error));
    if (relevant.length) throw new Error(`console or page errors: ${relevant.slice(0, 3).join(" | ")}`);
  });

  await closeDialogs();
}
