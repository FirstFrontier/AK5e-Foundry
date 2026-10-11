/**
 * Autonomous live Foundry V13 browser playtest for Marksman subclasses:
 * Anti-Air, Besieger, Deadeye, and Flinger.
 * Uses launchTestBrowser() from ./test-browser.mjs per WORKFLOW.md §5.3.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { launchTestBrowser } from "./test-browser.mjs";

const playwrightPath = process.env.AK5E_PLAYWRIGHT ?? "/tmp/frontier-browser-check/node_modules/playwright/index.mjs";
const { chromium } = await import(playwrightPath);
const port = process.env.AK5E_PORT ?? "30175";
const base = `http://127.0.0.1:${port}/join`;
const outputDir = process.env.AK5E_OUTPUT ?? "/tmp/ak5e-marksman-live";

await mkdir(outputDir, { recursive: true });

const report = {
  world: "standard-test",
  port,
  environment: {},
  actors: {},
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
  await page.selectOption('select[name="userid"]', { label: name, timeout: 20000 });
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

async function captureShot(page, filename) {
  const fullPath = `${outputDir}/${filename}`;
  await page.mouse.move(20, 950);
  await page.screenshot({ path: fullPath, fullPage: false });
  report.screenshots.push(fullPath);
  console.log(`Saved screenshot: ${fullPath}`);
}

async function closeOpenDialogs(page) {
  await page.evaluate(async () => {
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.constructor.name === "Dialog" || app.element?.tagName === "DIALOG" || app.constructor.name.includes("Sheet")) {
        try { await app.close(); } catch {}
      }
    }
  });
  await page.waitForTimeout(300);
}

try {
  console.log("Connecting to Foundry on port", port, "as Gamemaster...");
  const page = await join("Gamemaster");

  // Ensure ak5e module is active
  const moduleActive = await page.evaluate(async () => {
    const mod = game.modules.get("ak5e");
    if (!mod?.active) {
      await game.settings.set("core", "moduleConfiguration", {
        ...game.settings.get("core", "moduleConfiguration"),
        ak5e: true
      });
      return false;
    }
    return true;
  });

  if (!moduleActive) {
    console.log("Enabled ak5e module; reloading page...");
    await page.reload();
    await page.waitForFunction(() => globalThis.game?.ready && globalThis.canvas?.ready, null, { timeout: 60000 });
  }

  report.environment = await page.evaluate(() => ({
    foundry: game.version,
    system: game.system.version,
    module: game.modules.get("ak5e")?.version,
    world: game.world.id,
    hasMarksmanApi: Boolean(game.ak5e?.marksman)
  }));
  console.log("Environment:", report.environment);

  // ---------------------------------------------------------------- Anti-Air Marksman Test
  console.log("Testing Anti-Air Marksman...");
  const antiAirInfo = await page.evaluate(async () => {
    const old = game.actors.find(a => a.name === "Anti-Air Marksman Test");
    if (old) await old.delete();

    const actor = await Actor.create({
      name: "Anti-Air Marksman Test",
      type: "character",
      system: {
        abilities: {
          dex: { value: 18 },
          str: { value: 12 },
          con: { value: 14 },
          int: { value: 10 },
          wis: { value: 14 },
          cha: { value: 10 }
        }
      }
    });

    await actor.createEmbeddedDocuments("Item", [
      {
        name: "Marksman",
        type: "class",
        system: { levels: 18, identifier: "marksman" },
        flags: { ak5e: { chapterThreeId: "class-marksman" } }
      },
      {
        name: "Anti-Air",
        type: "subclass",
        system: { classIdentifier: "marksman" },
        flags: { ak5e: { chapterThreeId: "subclass-marksman-anti-air" } }
      }
    ]);

    const preview = await game.ak5e.marksman.preview(actor);
    await game.ak5e.marksman.apply(actor, { confirmed: true, contextKey: preview.contextKey });

    return { id: actor.id, name: actor.name, itemsCount: actor.items.size };
  });

  // Open sheet & capture screenshot
  await page.evaluate(async id => {
    const actor = game.actors.get(id);
    actor.sheet.render(true);
  }, antiAirInfo.id);
  await page.waitForTimeout(1000);
  await captureShot(page, "01-anti-air-sheet.png");

  // Open Marksman Controls Dialog
  await page.evaluate(async id => {
    const actor = game.actors.get(id);
    await game.ak5e.marksman.open(actor);
  }, antiAirInfo.id);
  await page.waitForTimeout(1000);
  await captureShot(page, "02-anti-air-dialog.png");

  // Execute Area Denial via guided command
  await page.evaluate(async id => {
    const actor = game.actors.get(id);
    await game.ak5e.marksman.use(actor, "versatileApproach", { option: "areaDenial", confirmed: true, overrides: ["all"] });
  }, antiAirInfo.id);
  await page.waitForTimeout(1000);
  await captureShot(page, "03-anti-air-area-denial-card.png");

  await closeOpenDialogs(page);

  // ---------------------------------------------------------------- Besieger Marksman Test
  console.log("Testing Besieger Marksman...");
  const besiegerInfo = await page.evaluate(async () => {
    const old = game.actors.find(a => a.name === "Besieger Marksman Test");
    if (old) await old.delete();

    const actor = await Actor.create({
      name: "Besieger Marksman Test",
      type: "character",
      system: {
        abilities: {
          dex: { value: 18 },
          str: { value: 16 },
          con: { value: 14 },
          int: { value: 10 },
          wis: { value: 12 },
          cha: { value: 10 }
        }
      }
    });

    await actor.createEmbeddedDocuments("Item", [
      {
        name: "Marksman",
        type: "class",
        system: { levels: 18, identifier: "marksman" },
        flags: { ak5e: { chapterThreeId: "class-marksman" } }
      },
      {
        name: "Besieger",
        type: "subclass",
        system: { classIdentifier: "marksman" },
        flags: { ak5e: { chapterThreeId: "subclass-marksman-besieger" } }
      }
    ]);

    const preview = await game.ak5e.marksman.preview(actor);
    await game.ak5e.marksman.apply(actor, { confirmed: true, contextKey: preview.contextKey });
    return { id: actor.id, name: actor.name, itemsCount: actor.items.size };
  });

  await page.evaluate(async id => {
    const actor = game.actors.get(id);
    actor.sheet.render(true);
  }, besiegerInfo.id);
  await page.waitForTimeout(1000);
  await captureShot(page, "04-besieger-sheet.png");

  // Enter Siege Mode and open dialog
  await page.evaluate(async id => {
    const actor = game.actors.get(id);
    await game.ak5e.marksman.use(actor, "siegeMode", { confirmed: true, overrides: ["all"] });
    await game.ak5e.marksman.open(actor);
  }, besiegerInfo.id);
  await page.waitForTimeout(1000);
  await captureShot(page, "05-besieger-dialog.png");

  // Execute Siege Bolt
  await page.evaluate(async id => {
    const actor = game.actors.get(id);
    await game.ak5e.marksman.use(actor, "siegeBolt", { targetName: "Iron Giant", confirmed: true, overrides: ["all"] });
  }, besiegerInfo.id);
  await page.waitForTimeout(1000);
  await captureShot(page, "06-besieger-siege-bolt-card.png");

  await closeOpenDialogs(page);

  // ---------------------------------------------------------------- Deadeye Marksman Test
  console.log("Testing Deadeye Marksman...");
  const deadeyeInfo = await page.evaluate(async () => {
    const old = game.actors.find(a => a.name === "Deadeye Marksman Test");
    if (old) await old.delete();

    const actor = await Actor.create({
      name: "Deadeye Marksman Test",
      type: "character",
      system: {
        abilities: {
          dex: { value: 20 },
          str: { value: 10 },
          con: { value: 14 },
          int: { value: 12 },
          wis: { value: 14 },
          cha: { value: 10 }
        }
      }
    });

    await actor.createEmbeddedDocuments("Item", [
      {
        name: "Marksman",
        type: "class",
        system: { levels: 18, identifier: "marksman" },
        flags: { ak5e: { chapterThreeId: "class-marksman" } }
      },
      {
        name: "Deadeye",
        type: "subclass",
        system: { classIdentifier: "marksman" },
        flags: { ak5e: { chapterThreeId: "subclass-marksman-deadeye" } }
      }
    ]);

    const preview = await game.ak5e.marksman.preview(actor);
    await game.ak5e.marksman.apply(actor, { confirmed: true, contextKey: preview.contextKey });
    return { id: actor.id, name: actor.name, itemsCount: actor.items.size };
  });

  await page.evaluate(async id => {
    const actor = game.actors.get(id);
    actor.sheet.render(true);
  }, deadeyeInfo.id);
  await page.waitForTimeout(1000);
  await captureShot(page, "07-deadeye-sheet.png");

  // Enter Deadshot state and open dialog
  await page.evaluate(async id => {
    const actor = game.actors.get(id);
    await game.ak5e.marksman.use(actor, "deadshot", { confirmed: true, overrides: ["all"] });
    await game.ak5e.marksman.open(actor);
  }, deadeyeInfo.id);
  await page.waitForTimeout(1000);
  await captureShot(page, "08-deadeye-dialog.png");

  // Execute Vital Strike
  await page.evaluate(async id => {
    const actor = game.actors.get(id);
    await game.ak5e.marksman.use(actor, "vitalStrike", { confirmed: true, overrides: ["all"] });
  }, deadeyeInfo.id);
  await page.waitForTimeout(1000);
  await captureShot(page, "09-deadeye-vital-strike-card.png");

  await closeOpenDialogs(page);

  // ---------------------------------------------------------------- Flinger Marksman Test
  console.log("Testing Flinger Marksman...");
  const flingerInfo = await page.evaluate(async () => {
    const old = game.actors.find(a => a.name === "Flinger Marksman Test");
    if (old) await old.delete();

    const actor = await Actor.create({
      name: "Flinger Marksman Test",
      type: "character",
      system: {
        abilities: {
          dex: { value: 14 },
          str: { value: 10 },
          con: { value: 14 },
          int: { value: 20 },
          wis: { value: 12 },
          cha: { value: 10 }
        }
      }
    });

    await actor.createEmbeddedDocuments("Item", [
      {
        name: "Marksman",
        type: "class",
        system: { levels: 18, identifier: "marksman" },
        flags: { ak5e: { chapterThreeId: "class-marksman" } }
      },
      {
        name: "Flinger",
        type: "subclass",
        system: { classIdentifier: "marksman" },
        flags: { ak5e: { chapterThreeId: "subclass-marksman-flinger" } }
      }
    ]);

    const preview = await game.ak5e.marksman.preview(actor);
    await game.ak5e.marksman.apply(actor, { confirmed: true, contextKey: preview.contextKey });
    return { id: actor.id, name: actor.name, itemsCount: actor.items.size };
  });

  await page.evaluate(async id => {
    const actor = game.actors.get(id);
    actor.sheet.render(true);
  }, flingerInfo.id);
  await page.waitForTimeout(1000);
  await captureShot(page, "10-flinger-sheet.png");

  // Bind Greatsword, command bound weapons, and open dialog
  await page.evaluate(async id => {
    const actor = game.actors.get(id);
    await game.ak5e.marksman.use(actor, "bindWeapon", { weaponId: "live-sword-1", weaponName: "Kinetic Greatsword", confirmed: true, overrides: ["all"] });
    await game.ak5e.marksman.open(actor);
  }, flingerInfo.id);
  await page.waitForTimeout(1000);
  await captureShot(page, "11-flinger-dialog.png");

  // Execute Kinetic Strike
  await page.evaluate(async id => {
    const actor = game.actors.get(id);
    await game.ak5e.marksman.use(actor, "kineticStrike", { targetName: "Originium Colossus", confirmed: true, overrides: ["all"] });
  }, flingerInfo.id);
  await page.waitForTimeout(1000);
  await captureShot(page, "12-flinger-kinetic-strike-card.png");

  await closeOpenDialogs(page);

  // ---------------------------------------------------------------- Heavyshot Marksman Test
  console.log("Testing Heavyshot Marksman...");
  const heavyshotInfo = await page.evaluate(async () => {
    const old = game.actors.find(a => a.name === "Heavyshot Marksman Test");
    if (old) await old.delete();

    const actor = await Actor.create({
      name: "Heavyshot Marksman Test",
      type: "character",
      system: {
        abilities: {
          dex: { value: 18 },
          str: { value: 16 },
          con: { value: 14 },
          int: { value: 10 },
          wis: { value: 12 },
          cha: { value: 10 }
        }
      }
    });

    const [crossbow] = await actor.createEmbeddedDocuments("Item", [
      {
        name: "Heavy Crossbow",
        type: "weapon",
        system: {
          type: { value: "martialR" },
          actionType: "rwak",
          weaponType: "martialR",
          properties: ["hvy", "lod", "two"],
          range: { value: 100, long: 400 },
          damage: { base: { number: 1, denomination: 10, types: ["piercing"] } }
        }
      },
      {
        name: "Marksman",
        type: "class",
        system: { levels: 18, identifier: "marksman" },
        flags: { ak5e: { chapterThreeId: "class-marksman" } }
      },
      {
        name: "Heavyshot",
        type: "subclass",
        system: { classIdentifier: "marksman" },
        flags: { ak5e: { chapterThreeId: "subclass-marksman-heavyshot" } }
      }
    ]);

    const preview = await game.ak5e.marksman.preview(actor);
    await game.ak5e.marksman.apply(actor, { confirmed: true, contextKey: preview.contextKey });

    // Tune Heavy Crossbow into Custom Job
    await game.ak5e.marksman.use(actor, "tuneWeapon", { weaponId: crossbow.id, confirmed: true, overrides: ["all"] });

    return { id: actor.id, name: actor.name, itemsCount: actor.items.size };
  });

  await page.evaluate(async id => {
    const actor = game.actors.get(id);
    actor.sheet.render(true);
  }, heavyshotInfo.id);
  await page.waitForTimeout(1000);
  await captureShot(page, "13-heavyshot-sheet.png");

  // Open Heavyshot Controls Dialog
  await page.evaluate(async id => {
    const actor = game.actors.get(id);
    await game.ak5e.marksman.open(actor);
  }, heavyshotInfo.id);
  await page.waitForTimeout(1000);
  await captureShot(page, "14-heavyshot-dialog.png");

  // Activate Heartseeker
  await page.evaluate(async id => {
    const actor = game.actors.get(id);
    await game.ak5e.marksman.use(actor, "heartseeker", { confirmed: true, overrides: ["all"] });
  }, heavyshotInfo.id);
  await page.waitForTimeout(1000);
  await captureShot(page, "15-heavyshot-heartseeker-card.png");

  await closeOpenDialogs(page);

  // ---------------------------------------------------------------- Hunter Marksman Test
  console.log("Testing Hunter Marksman...");
  const hunterInfo = await page.evaluate(async () => {
    const old = game.actors.find(a => a.name === "Hunter Marksman Test");
    if (old) await old.delete();

    const actor = await Actor.create({
      name: "Hunter Marksman Test",
      type: "character",
      system: {
        abilities: {
          dex: { value: 20 },
          str: { value: 12 },
          con: { value: 14 },
          int: { value: 12 },
          wis: { value: 14 },
          cha: { value: 10 }
        }
      }
    });

    await actor.createEmbeddedDocuments("Item", [
      {
        name: "Longbow",
        type: "weapon",
        system: {
          type: { value: "martialR" },
          actionType: "rwak",
          weaponType: "martialR",
          properties: ["two"],
          range: { value: 150, long: 600 },
          damage: { base: { number: 1, denomination: 8, types: ["piercing"] } }
        }
      },
      {
        name: "Marksman",
        type: "class",
        system: { levels: 18, identifier: "marksman" },
        flags: { ak5e: { chapterThreeId: "class-marksman" } }
      },
      {
        name: "Hunter",
        type: "subclass",
        system: { classIdentifier: "marksman" },
        flags: { ak5e: { chapterThreeId: "subclass-marksman-hunter" } }
      }
    ]);

    const preview = await game.ak5e.marksman.preview(actor);
    await game.ak5e.marksman.apply(actor, { confirmed: true, contextKey: preview.contextKey });

    return { id: actor.id, name: actor.name, itemsCount: actor.items.size };
  });

  await page.evaluate(async id => {
    const actor = game.actors.get(id);
    actor.sheet.render(true);
  }, hunterInfo.id);
  await page.waitForTimeout(1000);
  await captureShot(page, "16-hunter-sheet.png");

  // Open Hunter Controls Dialog
  await page.evaluate(async id => {
    const actor = game.actors.get(id);
    await game.ak5e.marksman.open(actor);
  }, hunterInfo.id);
  await page.waitForTimeout(1000);
  await captureShot(page, "17-hunter-dialog.png");

  // Fire Railgun with 3 charges
  await page.evaluate(async id => {
    const actor = game.actors.get(id);
    await game.ak5e.marksman.use(actor, "railgun", { charges: 3, confirmed: true, overrides: ["all"] });
  }, hunterInfo.id);
  await page.waitForTimeout(1000);
  await captureShot(page, "18-hunter-railgun-card.png");

  await closeOpenDialogs(page);

  // ---------------------------------------------------------------- Spreadshot Marksman Test
  console.log("Testing Spreadshot Marksman...");
  const spreadshotInfo = await page.evaluate(async () => {
    const old = game.actors.find(a => a.name === "Spreadshot Marksman Test");
    if (old) await old.delete();

    const actor = await Actor.create({
      name: "Spreadshot Marksman Test",
      type: "character",
      system: {
        abilities: {
          dex: { value: 18 },
          str: { value: 14 },
          con: { value: 16 },
          int: { value: 10 },
          wis: { value: 12 },
          cha: { value: 10 }
        }
      }
    });

    await actor.createEmbeddedDocuments("Item", [
      {
        name: "Combat Shotgun",
        type: "weapon",
        system: {
          type: { value: "martialR" },
          actionType: "rwak",
          weaponType: "martialR",
          properties: ["two"],
          range: { value: 30, long: 90 },
          damage: { base: { number: 2, denomination: 8, types: ["piercing"] } }
        },
        flags: { ak5e: { spread: true } }
      },
      {
        name: "Marksman",
        type: "class",
        system: { levels: 18, identifier: "marksman" },
        flags: { ak5e: { chapterThreeId: "class-marksman" } }
      },
      {
        name: "Spreadshot",
        type: "subclass",
        system: { classIdentifier: "marksman" },
        flags: { ak5e: { chapterThreeId: "subclass-marksman-spreadshot" } }
      }
    ]);

    const preview = await game.ak5e.marksman.preview(actor);
    await game.ak5e.marksman.apply(actor, { confirmed: true, contextKey: preview.contextKey });

    // Craft and Load Shells
    await game.ak5e.marksman.use(actor, "craftShells", { shells: { dragonsBreath: 2, flechette: 2, slug: 2 }, confirmed: true, overrides: ["all"] });
    await game.ak5e.marksman.use(actor, "loadShells", { shells: ["dragonsBreath", "slug"], confirmed: true, overrides: ["all"] });

    return { id: actor.id, name: actor.name, itemsCount: actor.items.size };
  });

  await page.evaluate(async id => {
    const actor = game.actors.get(id);
    actor.sheet.render(true);
  }, spreadshotInfo.id);
  await page.waitForTimeout(1000);
  await captureShot(page, "19-spreadshot-sheet.png");

  // Open Spreadshot Controls Dialog
  await page.evaluate(async id => {
    const actor = game.actors.get(id);
    await game.ak5e.marksman.open(actor);
  }, spreadshotInfo.id);
  await page.waitForTimeout(1000);
  await captureShot(page, "20-spreadshot-dialog.png");

  // Fire Both Barrels
  await page.evaluate(async id => {
    const actor = game.actors.get(id);
    await game.ak5e.marksman.use(actor, "bothBarrels", { confirmed: true, overrides: ["all"] });
  }, spreadshotInfo.id);
  await page.waitForTimeout(1000);
  await captureShot(page, "21-spreadshot-both-barrels-card.png");

  await closeOpenDialogs(page);

  report.actors = {
    antiAir: antiAirInfo,
    besieger: besiegerInfo,
    deadeye: deadeyeInfo,
    flinger: flingerInfo,
    heavyshot: heavyshotInfo,
    hunter: hunterInfo,
    spreadshot: spreadshotInfo
  };

  report.success = true;
} catch (error) {
  console.error("Playtest failed:", error);
  report.errors.push(error.stack ?? error.message);
  report.success = false;
} finally {
  await browser.close();
  await writeFile(`${outputDir}/report.json`, JSON.stringify(report, null, 2));
  console.log("Playtest complete. Report written to", `${outputDir}/report.json`);
}

