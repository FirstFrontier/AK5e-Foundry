/**
 * Live Foundry V13 headless Playwright validation for the Hexer branch (U4).
 * Uses launchTestBrowser() from ./test-browser.mjs per WORKFLOW.md §5.3, and closes the browser in `finally`.
 *
 * Usage (Foundry serving the scratch World on AK5E_PORT):
 *   AK5E_PLAYWRIGHT=/tmp/frontier-browser-check/node_modules/playwright/index.mjs AK5E_PORT=30184 \
 *   AK5E_TEST_OUTPUT=<dir> node ak5e/tools/test-supporter-u4-live.mjs
 *
 * Flow on a level-17 Hexer against a targeted creature: Potent Hex (Binding) through confirm, the roll button,
 * the target's speed effect, a hit that raises the Force rider card, then undo. Every step writes a screenshot.
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

const port = process.env.AK5E_TEST_PORT ?? process.env.AK5E_PORT ?? "30184";
const base = `http://127.0.0.1:${port}/join`;
const outputDir = process.env.AK5E_TEST_OUTPUT ?? "/tmp/ak5e-u4-evidence";
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

  const ids = await step("join as Gamemaster and create a level-17 Hexer and a target", () => page.evaluate(async tag => {
    const hexer = await Actor.implementation.create({
      name: `AK5E U4 Hexer ${tag}`, type: "character",
      system: { abilities: { cha: { value: 16 } } },
      flags: { ak5e: { supporter: { enabled: true, aidAbility: "cha", branch: "hexer" } } }
    });
    await hexer.createEmbeddedDocuments("Item", [
      { name: "Supporter", type: "class", system: { identifier: "supporter", levels: 17 }, flags: { ak5e: { chapterThreeId: "class-supporter" } } },
      { name: "Supporter: Hexer", type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-supporter-hexer" } } }
    ]);
    const goblin = await Actor.implementation.create({ name: `AK5E U4 Goblin ${tag}`, type: "npc",
      system: { attributes: { movement: { walk: 30 } } } });
    return { hexer: hexer.id, goblin: goblin.id, goblinUuid: goblin.uuid, hexerUuid: hexer.uuid, goblinName: goblin.name };
  }, runTag));

  await step("register Hexer plans, pools and hooks in the page", () => page.evaluate(async () => {
    const H = await import("/modules/ak5e/scripts/hexer-features.mjs");
    const U = await import("/modules/ak5e/scripts/supporter-uses.mjs");
    if (!Object.keys(U.supporterUses.readings?.() ?? {}).length && !globalThis.__u4Registered) {
      U.registerSupporterPlans({ plans: H.hexerPlans });
      globalThis.__u4Registered = true;
    }
    H.defineHexerPools();
    H.registerHexerHooks();
    globalThis.__u4 = { H, U };
  }));

  await step("target the creature on the scene", () => page.evaluate(async goblinId => {
    const scene = game.scenes.active ?? game.scenes.find(s => s.active) ?? game.scenes.contents[0];
    if (!scene) throw new Error("no scene in the world");
    if (!game.scenes.active) await scene.activate();
    const actor = game.actors.get(goblinId);
    const [token] = await scene.createEmbeddedDocuments("Token", [{ name: actor.name, actorId: actor.id, actorLink: true,
      x: 400, y: 400, width: 1, height: 1 }]);
    await new Promise(resolve => setTimeout(resolve, 800));
    const placeable = canvas.tokens.get(token.id);
    placeable?.setTarget(true, { user: game.user, releaseOthers: true, groupSelection: false });
    return { targets: game.user.targets.size };
  }, ids.goblin)).then(result => {
    if (result.targets !== 1) throw new Error(`expected one target, got ${result.targets}`);
  });

  await step("open the Potent Hex confirm dialog", async () => {
    await page.evaluate(async hexerId => {
      globalThis.__u4MsgBase = game.messages.contents.length;
      const hexer = game.actors.get(hexerId);
      globalThis.__u4.H.hexerCommand(hexer, "potentHex").catch(error => console.error("AK5e U4", error));
    }, ids.hexer);
    await page.waitForSelector('select[name="kind"]', { timeout: 20000 });
    await page.selectOption('select[name="kind"]', "binding");
  });
  await screenshot("u4-01-potent-hex-confirm.png");

  await step("confirm posts the roll card without rolling", async () => {
    await page.locator('button[data-action="apply"]').first().click();
    await page.waitForFunction(() => game.messages.contents.some(m => /data-ak5e-aid-roll/.test(String(m.content ?? ""))), null, { timeout: 20000 });
    const rolled = await page.evaluate(() => game.messages.contents.slice(globalThis.__u4MsgBase).some(m => m.rolls?.length));
    if (rolled) throw new Error("a roll was posted before the click");
    const hasEffect = await page.evaluate(id => [...game.actors.get(id).effects.values()].some(e => e.flags?.ak5e?.hex), ids.goblin);
    if (hasEffect) throw new Error("the Hex was applied before the roll click");
  });
  await showChat(page);
  await screenshot("u4-02-roll-card.png");

  await step("click the roll button and the Binding Hex lowers Speed", async () => {
    await page.evaluate(() => { const buttons = [...document.querySelectorAll("button[data-ak5e-aid-roll]")]; buttons.at(-1).click(); });
    try {
      await page.waitForFunction(id => {
        const goblin = game.actors.get(id);
        return [...goblin.effects.values()].some(e => e.flags?.ak5e?.hex?.kind === "binding");
      }, ids.goblin, { timeout: 20000 });
    } catch (error) {
      report.diagnostics = await page.evaluate(id => ({
        uses: globalThis.__u4.U.supporterUses.uses(game.actors.get(id)).slice(0, 2),
        notes: globalThis.__ak5eNotes ?? [],
        messages: game.messages.contents.slice(-4).map(m => String(m.content ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 240))
      }), ids.hexer);
      throw error;
    }
    const walk = await page.evaluate(id => game.actors.get(id).system.attributes.movement.walk, ids.goblin);
    report.goblinWalkAfterBinding = walk;
    if (!(walk < 30)) throw new Error(`Speed did not drop (walk ${walk})`);
  });
  await showChat(page);
  await screenshot("u4-03-binding-result.png");

  await step("a hit raises the Force rider card for the hexer", async () => {
    const before = await page.evaluate(() => game.messages.contents.length);
    await page.evaluate(async ({ goblinUuid }) => {
      const T = await import("/modules/ak5e/scripts/trigger-events.mjs");
      await T.emitAk5eEvent("hit", { targetUuid: goblinUuid, actorUuid: goblinUuid, ac: 10, eventId: `hit:u4:${Date.now()}` });
    }, { goblinUuid: ids.goblinUuid });
    await page.waitForFunction(() => game.messages.contents.some(m => /data-ak5e-hexer-roll/.test(String(m.content ?? ""))), null, { timeout: 20000 });
    const after = await page.evaluate(() => game.messages.contents.length);
    if (after <= before) throw new Error("no rider card posted");
  });
  await showChat(page);
  await screenshot("u4-04-force-rider-card.png");

  await step("undo the Potent Hex: the effect and Speed are restored", async () => {
    const useId = await page.evaluate(id => {
      const hexer = game.actors.get(id);
      return globalThis.__u4.U.supporterUses.uses(hexer).find(u => u.command === "potentHex")?.id ?? null;
    }, ids.hexer);
    if (!useId) throw new Error("no Potent Hex receipt to undo");
    await page.evaluate(async ({ hexerId, useId }) => {
      await globalThis.__u4.U.supporterUses.undo(game.actors.get(hexerId), useId);
    }, { hexerId: ids.hexer, useId });
    const restored = await page.evaluate(id => {
      const goblin = game.actors.get(id);
      return { walk: goblin.system.attributes.movement.walk, hexes: [...goblin.effects.values()].filter(e => e.flags?.ak5e?.hex).length };
    }, ids.goblin);
    report.afterUndo = restored;
    if (restored.hexes !== 0 || restored.walk !== 30) throw new Error(`undo incomplete: ${JSON.stringify(restored)}`);
  });
  await showChat(page);
  await screenshot("u4-05-undo-card.png");

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
