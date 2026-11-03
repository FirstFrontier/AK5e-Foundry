/**
 * Live Foundry V13 browser validation for Medic class and subclasses (Physician, Triage).
 * Uses launchTestBrowser() from ./test-browser.mjs per WORKFLOW.md §5.3.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { launchTestBrowser } from "./test-browser.mjs";

const { chromium } = await import(process.env.AK5E_PLAYWRIGHT ?? "playwright");
const port = process.env.AK5E_TEST_PORT ?? process.env.AK5E_PORT ?? "30175";
const base = `http://127.0.0.1:${port}/join`;
const outputDir = process.env.AK5E_TEST_OUTPUT ?? process.env.AK5E_MEDIC_OUTPUT ?? "/tmp/ak5e-medic-live";

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

  await page.waitForFunction(() => Boolean(globalThis.game?.ready && globalThis.game.ak5e?.medic), null, { timeout: 30000 });
  console.log("ak5e module verified active with game.ak5e.medic available.");

  // Baseline screenshot
  await screenshot(page, "01-baseline-world.png");

  // Setup test Medic and patient actors
  const actorIds = await page.evaluate(async () => {
    // 1. Physician Medic
    let kal = game.actors.find(a => a.name === "Doctor Kal (Physician)");
    if (!kal) {
      kal = await Actor.create({
        name: "Doctor Kal (Physician)",
        type: "character",
        system: {
          abilities: { int: { value: 18 }, con: { value: 14 }, wis: { value: 12 } },
          attributes: { hp: { value: 38, max: 38 } }
        }
      });
      await kal.createEmbeddedDocuments("Item", [
        { name: "Medic", type: "class", system: { levels: 5 }, flags: { ak5e: { chapterThreeId: "class-medic" } } },
        { name: "Medic: Physician", type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-medic-physician" } } }
      ]);
    }

    // 2. Triage Medic
    let silence = game.actors.find(a => a.name === "Silence (Triage)");
    if (!silence) {
      silence = await Actor.create({
        name: "Silence (Triage)",
        type: "character",
        system: {
          abilities: { wis: { value: 18 }, con: { value: 14 }, int: { value: 12 } },
          attributes: { hp: { value: 50, max: 50 } }
        }
      });
      await silence.createEmbeddedDocuments("Item", [
        { name: "Medic", type: "class", system: { levels: 7 }, flags: { ak5e: { chapterThreeId: "class-medic" } } },
        { name: "Medic: Triage", type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-medic-triage" } } }
      ]);
    }

    // 3. Injured Ally
    let patient = game.actors.find(a => a.name === "Injured Amiya");
    if (!patient) {
      patient = await Actor.create({
        name: "Injured Amiya",
        type: "character",
        system: {
          abilities: { con: { value: 12 } },
          attributes: { hp: { value: 10, max: 40 } }
        }
      });
    }

    // Initialize pools & progression
    await game.ak5e.medic.apply(kal, { confirmed: true, contextKey: (await game.ak5e.medic.preview(kal)).contextKey });
    await game.ak5e.medic.apply(silence, { confirmed: true, contextKey: (await game.ak5e.medic.preview(silence)).contextKey });

    return {
      kalId: kal.id,
      silenceId: silence.id,
      patientId: patient.id
    };
  });

  console.log("Created/verified test actors:", actorIds);

  // Exercise Touch Heal from Physician on Patient
  console.log("Exercising Touch Heal via game.ak5e.medic.use...");
  await page.evaluate(async ids => {
    const kal = game.actors.get(ids.kalId);
    const patient = game.actors.get(ids.patientId);
    await game.ak5e.medic.use(kal, "touchHeal", {
      confirmed: true,
      amount: 15,
      targetUuid: patient.uuid
    }, "live-th-1");
  }, actorIds);

  await page.waitForTimeout(1000);
  await screenshot(page, "02-touch-heal-executed.png");

  // Open Doctor Kal's sheet
  console.log("Opening Doctor Kal sheet...");
  await page.evaluate(id => {
    const actor = game.actors.get(id);
    actor.sheet.render(true);
  }, actorIds.kalId);

  await page.waitForSelector(".sheet.actor", { timeout: 10000 });
  await page.waitForTimeout(1000);
  await screenshot(page, "03-physician-sheet-opened.png");

  // Click Medic tab in Features
  console.log("Inspecting Medic sheet panel...");
  const tabBtn = page.locator('.sheet.actor [data-action="tab"][data-tab="features"], .sheet.actor .tabs [data-tab="features"], .sheet.actor a[data-tab="features"]').first();
  if (await tabBtn.count()) {
    await tabBtn.click();
    await page.waitForTimeout(500);
  }
  await screenshot(page, "04-physician-features-panel.png");

  // Open Medic Controls dialog
  console.log("Opening Medic Controls dialog...");
  await page.evaluate(id => {
    const actor = game.actors.get(id);
    game.ak5e.medic.open(actor);
  }, actorIds.kalId);

  await page.waitForSelector(".ak5e-medic-controls-dialog", { timeout: 10000 });
  await page.waitForTimeout(1000);
  await screenshot(page, "05-medic-controls-dialog.png");

  // Close dialog and exercise Triage Stop the Flow on dying patient
  console.log("Exercising Triage Stop the Flow...");
  await page.evaluate(async ids => {
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.element?.querySelector?.(".ak5e-medic-controls-dialog")) await app.close();
    }
    const silence = game.actors.get(ids.silenceId);
    const patient = game.actors.get(ids.patientId);
    // Set patient to 0 HP (Dying)
    await patient.update({ "system.attributes.hp.value": 0 });
    await game.ak5e.medic.use(silence, "stopTheFlow", {
      confirmed: true,
      targetUuid: patient.uuid
    }, "live-stf-1");
  }, actorIds);

  await page.waitForTimeout(1000);
  await screenshot(page, "06-stop-the-flow-card.png");

  // Scroll chat log to bottom and capture cards
  await page.evaluate(() => {
    const log = document.querySelector("#chat-log");
    if (log) log.scrollTop = log.scrollHeight;
  });
  await screenshot(page, "07-chat-log-cards.png");

  // Exercise undo on Stop the Flow to verify full lifecycle and undo state capture
  console.log("Exercising Stop the Flow Undo...");
  await page.evaluate(async ids => {
    const silence = game.actors.get(ids.silenceId);
    await game.ak5e.medic.use(silence, "undoUse", { useId: "live-stf-1" }, "live-stf-undo");
  }, actorIds);

  await page.waitForTimeout(1000);
  await screenshot(page, "08-stop-the-flow-undone.png");

  console.log("All live browser steps completed successfully!");
  await writeFile(`${outputDir}/report.json`, JSON.stringify(report, null, 2));
  await writeFile(`${outputDir}/browser-report.json`, JSON.stringify(report, null, 2));

} catch (err) {
  console.error("Test execution failed:", err);
  report.errors.push(err.stack ?? err.message);
  await writeFile(`${outputDir}/report.json`, JSON.stringify(report, null, 2)).catch(() => {});
  await writeFile(`${outputDir}/browser-report.json`, JSON.stringify(report, null, 2)).catch(() => {});
  throw err;
} finally {
  await browser.close();
}
