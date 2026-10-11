/**
 * Live Foundry V13 browser validation for Guard class, Centurion, Crusher, and Instructor.
 * Uses launchTestBrowser() from ./test-browser.mjs per WORKFLOW.md §5.3.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { launchTestBrowser } from "./test-browser.mjs";

const { chromium } = await import(process.env.AK5E_PLAYWRIGHT ?? "playwright");
const port = process.env.AK5E_PORT ?? "30171";
const base = `http://127.0.0.1:${port}/join`;
const outputDir = process.env.AK5E_GUARD_OUTPUT ?? "/tmp/ak5e-guard-live";

await mkdir(outputDir, { recursive: true });

const report = {
  world: "standard-test",
  port,
  errors: [],
  screenshots: []
};

const browser = await launchTestBrowser(chromium, {
  ...(process.env.AK5E_CHROMIUM ? { executablePath: process.env.AK5E_CHROMIUM } : {})
});

const contexts = [];

async function join(name) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1050 } });
  contexts.push(context);
  const page = await context.newPage();
  page.on("pageerror", error => report.errors.push(`${name}: ${error.stack ?? error.message}`));
  page.on("console", message => {
    if (message.type() === "error") report.errors.push(`${name}: ${message.text()}`);
  });
  await page.goto(base);
  await page.selectOption('select[name="userid"]', { label: name, timeout: 15000 });
  await page.click('button[name="join"]');
  await page.waitForFunction(() => globalThis.game?.ready && globalThis.canvas?.ready, null, { timeout: 60000 });
  // Close initial user config windows if present
  await page.evaluate(async () => {
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.constructor.name === "UserConfig") await app.close();
    }
  });
  return page;
}

async function screenshot(page, filename) {
  const fullPath = `${outputDir}/${filename}`;
  await page.screenshot({ path: fullPath, fullPage: false });
  report.screenshots.push(fullPath);
  console.log(`Saved screenshot: ${fullPath}`);
}

try {
  console.log("Connecting to Foundry as Gamemaster...");
  const page = await join("Gamemaster");

  // Ensure ak5e module is active
  const isActive = await page.evaluate(() => Boolean(game.modules.get("ak5e")?.active));
  console.log("ak5e active status:", isActive);
  if (!isActive) {
    console.log("Activating ak5e module and reloading...");
    await page.evaluate(async () => {
      await game.settings.set("core", "moduleConfiguration", { ak5e: true });
    });
    await page.reload();
    await page.waitForFunction(() => globalThis.game?.ready && globalThis.canvas?.ready, null, { timeout: 60000 });
  }

  await page.waitForFunction(() => Boolean(globalThis.game?.ready && globalThis.game.ak5e?.guard), null, { timeout: 30000 });
  console.log("ak5e module verified active with game.ak5e.guard available.");

  // Setup test Guard actors
  const actorIds = await page.evaluate(async () => {
    // 1. Crusher Guard
    let crusher = game.actors.find(a => a.name === "Hoederer (Crusher)");
    if (!crusher) {
      crusher = await Actor.create({
        name: "Hoederer (Crusher)",
        type: "character",
        system: {
          abilities: { str: { value: 18 }, con: { value: 16 } },
          attributes: { hp: { value: 50, max: 50 } }
        }
      });
      await crusher.createEmbeddedDocuments("Item", [
        { name: "Guard", type: "class", system: { levels: 5 }, flags: { ak5e: { chapterThreeId: "class-guard" } } },
        { name: "Guard: Crusher", type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-guard-crusher" } } }
      ]);
    }
    // Initialize guard state
    await crusher.update({
      "flags.ak5e.guard": { enabled: true, version: 1 },
      "flags.ak5e.resourcePools.aggression": { value: 4, max: 4 },
      "flags.ak5e.resourcePools.unrelenting": { value: 1, max: 1 },
      "flags.ak5e.resourcePools.foecrusher": { value: 3, max: 3 }
    });

    // 2. Centurion Guard
    let centurion = game.actors.find(a => a.name === "Gavial (Centurion)");
    if (!centurion) {
      centurion = await Actor.create({
        name: "Gavial (Centurion)",
        type: "character",
        system: {
          abilities: { str: { value: 16 }, cha: { value: 14 } },
          skills: { itm: { value: 1, total: 4, mod: 4 } }
        }
      });
      await centurion.createEmbeddedDocuments("Item", [
        { name: "Guard", type: "class", system: { levels: 5 }, flags: { ak5e: { chapterThreeId: "class-guard" } } },
        { name: "Guard: Centurion", type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-guard-centurion" } } }
      ]);
    }
    await centurion.update({
      "flags.ak5e.guard": { enabled: true, version: 1 },
      "flags.ak5e.resourcePools.aggression": { value: 4, max: 4 },
      "flags.ak5e.resourcePools.unrelenting": { value: 1, max: 1 },
      "flags.ak5e.resourcePools.ferociousFling": { value: 1, max: 1 }
    });

    // 3. Instructor Guard
    let instructor = game.actors.find(a => a.name === "Dobermann (Instructor)");
    if (!instructor) {
      instructor = await Actor.create({
        name: "Dobermann (Instructor)",
        type: "character",
        system: {
          abilities: { str: { value: 14 }, cha: { value: 16 } }
        }
      });
      await instructor.createEmbeddedDocuments("Item", [
        { name: "Guard", type: "class", system: { levels: 5 }, flags: { ak5e: { chapterThreeId: "class-guard" } } },
        { name: "Guard: Instructor", type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-guard-instructor" } } }
      ]);
    }
    await instructor.update({
      "flags.ak5e.guard": { enabled: true, version: 1 },
      "flags.ak5e.resourcePools.aggression": { value: 4, max: 4 },
      "flags.ak5e.resourcePools.unrelenting": { value: 1, max: 1 },
      "flags.ak5e.resourcePools.instructionDice": { value: 4, max: 4 }
    });

    return {
      crusherId: crusher.id,
      centurionId: centurion.id,
      instructorId: instructor.id
    };
  });

  console.log("Actors configured:", actorIds);

  async function closeAllGuardDialogs() {
    await page.evaluate(async () => {
      for (const app of [...foundry.applications.instances.values()]) {
        if (app.element?.querySelector?.(".ak5e-guard-dialog") || app.title?.includes?.("Guard Controls")) {
          await app.close();
        }
      }
    });
    await page.waitForTimeout(300);
  }

  // 1. Open Crusher sheet and verify panel
  console.log("Opening Crusher sheet...");
  await page.evaluate(id => {
    const actor = game.actors.get(id);
    actor.sheet.render(true);
  }, actorIds.crusherId);

  await page.waitForSelector(".sheet.actor", { timeout: 15000 });
  // Navigate to features tab if available
  const featuresTab = page.locator('.tabs [data-tab="features"]');
  if (await featuresTab.isVisible()) {
    await featuresTab.click();
    await page.waitForTimeout(500);
  }
  await screenshot(page, "01-crusher-sheet-features-tab.png");

  // 2. Open Guard Controls Dialog on Crusher
  console.log("Opening Guard Controls dialog on Crusher...");
  await page.evaluate(id => {
    game.ak5e.guard.open(game.actors.get(id));
  }, actorIds.crusherId);

  await page.waitForSelector(".ak5e-guard-dialog", { timeout: 10000 });
  await screenshot(page, "02-crusher-guard-controls-dialog.png");

  // 3. Open Foecrusher strike prompt
  console.log("Clicking Foecrusher button...");
  await page.click('button[data-guard-cmd="foecrusher"]');
  await page.waitForSelector('select[name="rider"]', { timeout: 10000 });
  await screenshot(page, "03-foecrusher-rider-prompt.png");

  // Select Renewing strike and confirm
  await page.selectOption('select[name="rider"]', "renewing");
  await page.locator('dialog:has(select[name="rider"]) button[data-action="ok"]').click();
  await page.waitForTimeout(1000);

  // Switch to chat tab and ensure sidebar is expanded and scrolled
  await page.evaluate(() => {
    if (ui.sidebar?._collapsed) ui.sidebar.expand();
    ui.sidebar?.activateTab?.("chat");
    const log = document.querySelector("#chat-log");
    if (log) log.scrollTop = log.scrollHeight;
  });

  // 4. Inspect Chat message card for Foecrusher (Renewing Strike)
  await screenshot(page, "04-foecrusher-chat-card-awaiting-roll.png");

  // Click Roll button on the chat card
  console.log("Clicking Roll button on Foecrusher card...");
  const rollBtn = page.locator(".ak5e-play-use-controls button", { hasText: "Roll" }).last();
  await rollBtn.waitFor({ state: "attached", timeout: 10000 });
  await rollBtn.evaluate(b => b.click());
  await page.waitForTimeout(1000);
  await screenshot(page, "05-foecrusher-card-rolled.png");

  // 5. Open Centurion Guard Controls Dialog
  console.log("Opening Centurion Controls dialog...");
  await closeAllGuardDialogs();
  await page.evaluate(id => {
    game.ak5e.guard.open(game.actors.get(id));
  }, actorIds.centurionId);
  await page.waitForSelector(".ak5e-guard-dialog", { timeout: 10000 });
  await screenshot(page, "06-centurion-guard-controls-dialog.png");

  // 6. Open Instructor Guard Controls Dialog
  console.log("Opening Instructor Controls dialog...");
  await closeAllGuardDialogs();
  await page.evaluate(id => {
    game.ak5e.guard.open(game.actors.get(id));
  }, actorIds.instructorId);
  await page.waitForSelector(".ak5e-guard-dialog", { timeout: 10000 });
  await screenshot(page, "07-instructor-guard-controls-dialog.png");

  // Click Issue Instruction button
  console.log("Clicking Issue Instruction button...");
  await page.locator('button[data-guard-cmd="instruction"]').evaluate(b => b.click());
  await page.waitForSelector('select[name="instruction"]', { timeout: 10000 });
  await screenshot(page, "08-issue-instruction-prompt.png");

  // Submit Instruction (Defend Yourself)
  await page.locator('dialog:has(select[name="instruction"]) button[data-action="ok"]').evaluate(b => b.click());
  await page.waitForTimeout(1000);
  await screenshot(page, "09-instruction-chat-card.png");

  // 7. Test Undo Flow on Crusher
  console.log("Testing Undo flow...");
  await closeAllGuardDialogs();
  await page.evaluate(id => {
    game.ak5e.guard.open(game.actors.get(id));
  }, actorIds.crusherId);
  await page.waitForSelector('button[data-guard-act="__undo"]', { timeout: 10000 });
  await page.locator('button[data-guard-act="__undo"]').evaluate(b => b.click());
  await page.waitForSelector(".ak5e-play-use-choice", { timeout: 10000 });
  await screenshot(page, "10-undo-list-dialog.png");

  // Review and confirm undo
  await page.locator('dialog:has(.ak5e-play-use-choice) button[data-action="choose"]').evaluate(b => b.click());
  await page.waitForTimeout(500);
  await screenshot(page, "11-undo-review-dialog.png");

  const undoConfirmBtn = page.locator('dialog button[data-action="undo"]');
  await undoConfirmBtn.waitFor({ state: "attached", timeout: 10000 });
  await undoConfirmBtn.evaluate(b => b.click());
  await page.waitForTimeout(1000);
  await screenshot(page, "12-undo-completed-card.png");

  console.log("All live browser steps completed successfully!");
  await writeFile(`${outputDir}/report.json`, JSON.stringify(report, null, 2));

} catch (err) {
  console.error("Test execution failed:", err);
  report.errors.push(err.stack ?? err.message);
  await writeFile(`${outputDir}/report.json`, JSON.stringify(report, null, 2)).catch(() => {});
  throw err;
} finally {
  await browser.close();
}

