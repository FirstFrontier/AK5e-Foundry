/**
 * Live Foundry V13 headless Playwright browser validation for Specialist class and
 * subclasses (Executor, Hookmaster, Infuser, Skyranger, Dollkeeper, Trapmaster).
 * Uses launchTestBrowser() from ./test-browser.mjs per WORKFLOW.md §5.3.
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
    // continue trying candidates
  }
}

if (!chromium) {
  throw new Error("Could not load Playwright chromium module.");
}

const port = process.env.AK5E_TEST_PORT ?? process.env.AK5E_PORT ?? "30175";
const base = `http://127.0.0.1:${port}/join`;
const outputDir = process.env.AK5E_TEST_OUTPUT ?? "/tmp/ak5e-specialist-evidence";

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

  page.on("pageerror", error => {
    const msg = `${name}: ${error.stack ?? error.message}`;
    console.error("Page error:", msg);
    report.errors.push(msg);
  });

  page.on("console", message => {
    if (message.type() === "error") {
      const text = message.text();
      // Ignore favicon and trivial missing asset 404s
      if (text.includes("favicon.ico")) return;
      console.error(`Console error [${name}]:`, text);
      report.errors.push(`${name}: ${text}`);
    }
  });

  await page.goto(base);
  await page.selectOption('select[name="userid"]', { label: name, timeout: 15000 });
  const password = page.locator('input[name="password"]');
  if (await password.count() && await password.isVisible()) {
    await password.fill(process.env.AK5E_TEST_PASSWORD ?? "");
  }
  await page.click('button[name="join"]');
  await page.waitForFunction(() => globalThis.game?.ready && globalThis.canvas?.ready, null, { timeout: 60000 });

  // Close initial user config windows if present
  await page.evaluate(async () => {
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.constructor?.name === "UserConfig") await app.close();
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

async function closeAllDialogs(page) {
  await page.evaluate(async () => {
    for (const app of [...foundry.applications.instances.values()]) {
      if (
        app.element?.querySelector?.(".ak5e-specialist-controls-dialog") ||
        app.title?.includes?.("Specialist Controls") ||
        app.title?.includes?.("Play Use") ||
        app.element?.querySelector?.(".ak5e-play-use-choice") ||
        app.constructor?.name === "DialogV2" ||
        app.constructor?.name === "Dialog"
      ) {
        await app.close();
      }
    }
  });
  await page.waitForTimeout(300);
}

async function closeAllActorSheets(page) {
  await page.evaluate(async () => {
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.document?.documentName === "Actor") {
        await app.close();
      }
    }
  });
  await page.waitForTimeout(300);
}

async function scrollToBottomOfChat(page) {
  await page.evaluate(() => {
    if (ui.sidebar?._collapsed) ui.sidebar.expand();
    ui.sidebar?.activateTab?.("chat");
    const log = document.querySelector("#chat-log");
    if (log) log.scrollTop = log.scrollHeight;
  });
  await page.waitForTimeout(600);
}

try {
  console.log("Connecting to Foundry V13 as Gamemaster on port", port, "...");
  const page = await join("Gamemaster");

  // Verify and activate ak5e module if needed
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

  await page.waitForFunction(
    () => Boolean(globalThis.game?.ready && globalThis.game.ak5e?.specialist),
    null,
    { timeout: 30000 }
  );
  console.log("ak5e module verified active with game.ak5e.specialist available.");

  // 01. 01-baseline-world.png: Baseline canvas ready
  console.log("Capturing 01-baseline-world.png...");
  await screenshot(page, "01-baseline-world.png");

  // Setup test actors: Specialist (Base), Executor (Hunter), Hookmaster, Infuser, Target Dummy
  console.log("Setting up test actors...");
  const actorIds = await page.evaluate(async () => {
    // Helper to delete existing actor by name
    const cleanupActor = async name => {
      const existing = game.actors.find(a => a.name === name);
      if (existing) await existing.delete();
    };

    await cleanupActor("Specialist (Base)");
    await cleanupActor("Executor (Hunter)");
    await cleanupActor("Hookmaster");
    await cleanupActor("Infuser");
    await cleanupActor("Target Dummy");
    await cleanupActor("Inventor");
    await cleanupActor("Skyranger");
    await cleanupActor("Dollkeeper");
    await cleanupActor("Dollkeeper's Living Doll");
    await cleanupActor("Trapmaster");

    // 1. Specialist (Base): Level 5, Prowess pool 3, starting equipment
    const baseSpecialist = await Actor.create({
      name: "Specialist (Base)",
      type: "character",
      system: {
        abilities: {
          str: { value: 12 },
          dex: { value: 16 },
          con: { value: 14 },
          int: { value: 10 },
          wis: { value: 12 },
          cha: { value: 10 }
        },
        attributes: {
          hp: { value: 38, max: 38 },
          prof: 3
        }
      }
    });

    await baseSpecialist.createEmbeddedDocuments("Item", [
      {
        name: "Specialist",
        type: "class",
        system: { levels: 5 },
        flags: { ak5e: { chapterThreeId: "class-specialist" } }
      },
      {
        name: "Shortsword",
        type: "weapon",
        system: {
          equipped: true,
          actionType: "mwak",
          weaponType: "martialM",
          properties: ["fin", "lgt"]
        }
      },
      {
        name: "Light Crossbow",
        type: "weapon",
        system: {
          equipped: false,
          actionType: "rwak",
          weaponType: "simpleR",
          properties: ["two", "amm"]
        }
      },
      {
        name: "Leather Armor",
        type: "equipment",
        system: {
          equipped: true,
          armor: { value: 11, type: "light" }
        }
      }
    ]);

    await baseSpecialist.update({
      "flags.ak5e.specialist": {
        enabled: true,
        version: 1,
        weaponCategory: "melee",
        fightingStyle: "dueling"
      },
      "flags.ak5e.resourcePools.prowess": { value: 3, max: 3 }
    });

    // 2. Executor (Hunter): Level 5, Executor subclass (Hunter path), Deathmark state, Sweeper, Smokescreen
    const executor = await Actor.create({
      name: "Executor (Hunter)",
      type: "character",
      system: {
        abilities: {
          str: { value: 12 },
          dex: { value: 18 },
          con: { value: 14 },
          int: { value: 10 },
          wis: { value: 12 },
          cha: { value: 10 }
        },
        attributes: {
          hp: { value: 38, max: 38 },
          prof: 3
        },
        skills: {
          ste: { value: 2, total: 7, mod: 7 }
        }
      }
    });

    await executor.createEmbeddedDocuments("Item", [
      {
        name: "Specialist",
        type: "class",
        system: { levels: 5 },
        flags: { ak5e: { chapterThreeId: "class-specialist" } }
      },
      {
        name: "Specialist: Executor",
        type: "subclass",
        flags: {
          ak5e: {
            chapterThreeId: "subclass-specialist-executor",
            executorPath: "hunter"
          }
        }
      },
      {
        name: "Shortsword",
        type: "weapon",
        system: {
          equipped: true,
          actionType: "mwak",
          weaponType: "martialM",
          properties: ["fin", "lgt"]
        }
      }
    ]);

    await executor.update({
      "flags.ak5e.specialist": {
        enabled: true,
        version: 1,
        branch: "executor"
      },
      "flags.ak5e.executor": {
        path: "hunter",
        deathmark: {
          held: true,
          holder: "self",
          targetUuid: null,
          targetName: null
        }
      },
      "flags.ak5e.resourcePools.prowess": { value: 3, max: 3 },
      "flags.ak5e.resourcePools.mortalBlow": { value: 1, max: 1 }
    });

    // 3. Hookmaster: Level 5, Hookmaster subclass, equipped Hooked Weapon, Big Boot, King of the Urban Jungle, Bound in Rope
    const hookmaster = await Actor.create({
      name: "Hookmaster",
      type: "character",
      system: {
        abilities: {
          str: { value: 18 },
          dex: { value: 14 },
          con: { value: 14 },
          int: { value: 10 },
          wis: { value: 12 },
          cha: { value: 10 }
        },
        attributes: {
          hp: { value: 38, max: 38 },
          prof: 3
        }
      }
    });

    const hookItems = await hookmaster.createEmbeddedDocuments("Item", [
      {
        name: "Specialist",
        type: "class",
        system: { levels: 5 },
        flags: { ak5e: { chapterThreeId: "class-specialist" } }
      },
      {
        name: "Specialist: Hookmaster",
        type: "subclass",
        flags: { ak5e: { chapterThreeId: "subclass-specialist-hookmaster" } }
      },
      {
        name: "Hooked Scythe",
        type: "weapon",
        system: {
          equipped: true,
          actionType: "mwak",
          weaponType: "martialM",
          properties: ["two", "thr"],
          range: { value: 30, units: "ft" }
        },
        flags: {
          ak5e: {
            hookmaster: { isHooked: true },
            isHooked: true
          }
        }
      }
    ]);

    const hookedWeapon = hookItems.find(i => i.name === "Hooked Scythe");

    await hookmaster.update({
      "flags.ak5e.specialist": {
        enabled: true,
        version: 1,
        branch: "hookmaster"
      },
      "flags.ak5e.hookmaster": {
        hookedWeapon: { name: "Hooked Scythe", id: hookedWeapon.id },
        grappledTarget: null,
        wranglerTarget: null
      },
      "flags.ak5e.resourcePools.prowess": { value: 3, max: 3 },
      "flags.ak5e.resourcePools.mightyPush": { value: 3, max: 3 }
    });

    // 4. Infuser: Level 5, Infuser subclass, Pharmacology Kit, Alchemical Infusions pool (6/6), Double-Blind Trial, 8 Infusions
    const infuser = await Actor.create({
      name: "Infuser",
      type: "character",
      system: {
        abilities: {
          str: { value: 10 },
          dex: { value: 14 },
          con: { value: 14 },
          int: { value: 16 },
          wis: { value: 12 },
          cha: { value: 10 }
        },
        attributes: {
          hp: { value: 38, max: 38 },
          prof: 3
        }
      }
    });

    await infuser.createEmbeddedDocuments("Item", [
      {
        name: "Specialist",
        type: "class",
        system: { levels: 5 },
        flags: { ak5e: { chapterThreeId: "class-specialist" } }
      },
      {
        name: "Specialist: Infuser",
        type: "subclass",
        flags: { ak5e: { chapterThreeId: "subclass-specialist-infuser" } }
      },
      {
        name: "Pharmacology Kit",
        type: "tool",
        system: { proficient: 1 },
        flags: { ak5e: { chapterFourId: "tool-pharmacology-kit-4" } }
      },
      {
        name: "Dagger",
        type: "weapon",
        system: {
          equipped: true,
          actionType: "mwak",
          weaponType: "simpleM",
          properties: ["fin", "lgt", "thr"]
        }
      }
    ]);

    await infuser.update({
      "flags.ak5e.specialist": {
        enabled: true,
        version: 1,
        branch: "infusion"
      },
      "flags.ak5e.resourcePools.prowess": { value: 3, max: 3 },
      "flags.ak5e.resourcePools.alchemicalInfusions": { value: 6, max: 6 }
    });

    // 5. Target Dummy: Friendly/neutral actor to receive Deathmark, Hook pull, Alchemical Infusions, and test GM relay
    const dummy = await Actor.create({
      name: "Target Dummy",
      type: "character",
      system: {
        abilities: {
          str: { value: 10 },
          dex: { value: 10 },
          con: { value: 12 },
          int: { value: 10 },
          wis: { value: 10 },
          cha: { value: 10 }
        },
        attributes: {
          hp: { value: 50, max: 50 }
        }
      }
    });

    // 6. Skyranger: Level 5 Specialist, Skyranger subclass, Flight Suit equipped, Air Superiority doctrine, Fuel 3/3, Prowess 3/3
    const skyranger = await Actor.create({
      name: "Skyranger",
      type: "character",
      system: {
        abilities: {
          str: { value: 12 },
          dex: { value: 16 },
          con: { value: 14 },
          int: { value: 12 },
          wis: { value: 12 },
          cha: { value: 10 }
        },
        attributes: {
          hp: { value: 38, max: 38 },
          prof: 3
        }
      }
    });

    await skyranger.createEmbeddedDocuments("Item", [
      {
        name: "Specialist",
        type: "class",
        system: { levels: 5 },
        flags: { ak5e: { chapterThreeId: "class-specialist" } }
      },
      {
        name: "Specialist: Skyranger",
        type: "subclass",
        flags: { ak5e: { chapterThreeId: "subclass-specialist-skyranger" } }
      },
      {
        name: "Flight Suit",
        type: "equipment",
        system: {
          equipped: true,
          armor: { value: 12, type: "light" }
        },
        flags: { ak5e: { chapterThreeId: "equipment-flight-suit-6158" } }
      }
    ]);

    await skyranger.update({
      "flags.ak5e.specialist": {
        enabled: true,
        version: 1,
        branch: "skyranger"
      },
      "flags.ak5e.skyranger": {
        doctrine: "airSuperiority"
      },
      "flags.ak5e.resourcePools.prowess": { value: 3, max: 3 },
      "flags.ak5e.resourcePools.fuel": { value: 3, max: 3 }
    });

    // 7. Dollkeeper: Level 5 Specialist, Dollkeeper subclass, Living Doll companion construct, Prowess 3/3
    const dollkeeper = await Actor.create({
      name: "Dollkeeper",
      type: "character",
      system: {
        abilities: {
          str: { value: 12 },
          dex: { value: 16 },
          con: { value: 14 },
          int: { value: 12 },
          wis: { value: 12 },
          cha: { value: 10 }
        },
        attributes: {
          hp: { value: 38, max: 38 },
          prof: 3
        }
      }
    });

    await dollkeeper.createEmbeddedDocuments("Item", [
      {
        name: "Specialist",
        type: "class",
        system: { levels: 5 },
        flags: { ak5e: { chapterThreeId: "class-specialist" } }
      },
      {
        name: "Specialist: Dollkeeper",
        type: "subclass",
        flags: { ak5e: { chapterThreeId: "subclass-specialist-dollkeeper" } }
      }
    ]);

    const dollCompanion = await Actor.create({
      name: "Dollkeeper's Living Doll",
      type: "npc",
      system: {
        details: {
          alignment: "Neutral",
          type: { value: "construct" },
          creatureType: "construct"
        },
        attributes: {
          hp: { value: 38, max: 38 },
          movement: { walk: 30 }
        },
        abilities: {
          str: { value: 16 },
          dex: { value: 16 },
          con: { value: 14 },
          int: { value: 1 },
          wis: { value: 10 },
          cha: { value: 4 }
        }
      }
    });

    await dollkeeper.update({
      "flags.ak5e.specialist": {
        enabled: true,
        version: 1,
        branch: "dollkeeper"
      },
      "flags.ak5e.dollkeeper": {
        dollState: "active",
        dollId: dollCompanion.id,
        dollUuid: dollCompanion.uuid
      },
      "flags.ak5e.resourcePools.prowess": { value: 3, max: 3 }
    });

    // 8. Trapmaster: Level 5 Specialist, Trapmaster subclass, Traps 6/6, Prowess 3/3, Sleight of Hand Expertise
    const trapmaster = await Actor.create({
      name: "Trapmaster",
      type: "character",
      system: {
        abilities: {
          str: { value: 10 },
          dex: { value: 16 },
          con: { value: 14 },
          int: { value: 16 },
          wis: { value: 12 },
          cha: { value: 10 }
        },
        attributes: {
          hp: { value: 38, max: 38 },
          prof: 3
        },
        skills: {
          slt: { value: 2, total: 9, mod: 6 }
        }
      }
    });

    await trapmaster.createEmbeddedDocuments("Item", [
      {
        name: "Specialist",
        type: "class",
        system: { levels: 5 },
        flags: { ak5e: { chapterThreeId: "class-specialist" } }
      },
      {
        name: "Specialist: Trapmaster",
        type: "subclass",
        flags: { ak5e: { chapterThreeId: "subclass-specialist-trapmaster" } }
      }
    ]);

    await trapmaster.update({
      "flags.ak5e.specialist": {
        enabled: true,
        version: 1,
        branch: "trapmaster"
      },
      "flags.ak5e.resourcePools.prowess": { value: 3, max: 3 },
      "flags.ak5e.resourcePools.traps": { value: 6, max: 6 }
    });

    return {
      baseSpecialistId: baseSpecialist.id,
      executorId: executor.id,
      hookmasterId: hookmaster.id,
      infuserId: infuser.id,
      dummyId: dummy.id,
      skyrangerId: skyranger.id,
      dollkeeperId: dollkeeper.id,
      dollId: dollCompanion.id,
      trapmasterId: trapmaster.id
    };
  });

  console.log("Actors successfully created/initialized:", actorIds);

  // ---------------------------------------------------------------------------
  // Step 2 & 3: Base Specialist Sheet & Specialist Controls
  // ---------------------------------------------------------------------------
  console.log("Opening Base Specialist sheet...");
  await closeAllActorSheets(page);
  await closeAllDialogs(page);

  await page.evaluate(id => {
    const actor = game.actors.get(id);
    actor.sheet.render(true);
  }, actorIds.baseSpecialistId);

  await page.waitForSelector(".sheet.actor", { timeout: 15000 });
  const featuresTab = page.locator('.sheet.actor [data-action="tab"][data-tab="features"], .sheet.actor .tabs [data-tab="features"], .sheet.actor a[data-tab="features"]').first();
  if (await featuresTab.count()) {
    await featuresTab.click();
    await page.waitForTimeout(600);
  }

  // 02. 02-base-specialist-sheet.png: Base Specialist sheet showing .ak5e-specialist-badge with Prowess pool
  console.log("Capturing 02-base-specialist-sheet.png...");
  await screenshot(page, "02-base-specialist-sheet.png");

  // Open Specialist Controls dialog
  console.log("Opening Specialist Controls dialog from sheet button...");
  const controlsBtn = page.locator(".sheet.actor .ak5e-specialist-controls-btn").first();
  if (await controlsBtn.count() && await controlsBtn.isVisible()) {
    await controlsBtn.click();
  } else {
    await page.evaluate(id => {
      game.ak5e.specialist.open(game.actors.get(id));
    }, actorIds.baseSpecialistId);
  }

  await page.waitForSelector(".ak5e-specialist-controls-dialog", { timeout: 10000 });
  await page.waitForTimeout(600);

  // 03. 03-base-specialist-controls.png: Specialist Controls dialog opened from sheet button
  console.log("Capturing 03-base-specialist-controls.png...");
  await screenshot(page, "03-base-specialist-controls.png");

  // ---------------------------------------------------------------------------
  // Step 4: Mark of a Specialist active ability
  // ---------------------------------------------------------------------------
  console.log("Executing Mark of a Specialist...");
  await closeAllDialogs(page);

  await page.evaluate(async id => {
    const actor = game.actors.get(id);
    await game.ak5e.specialist.use(actor, "markOfASpecialist", { confirmed: true }, "live-mos-1");
  }, actorIds.baseSpecialistId);

  await scrollToBottomOfChat(page);

  // 04. 04-mark-of-specialist-card.png: Mark of a Specialist active ability chat card
  console.log("Capturing 04-mark-of-specialist-card.png...");
  await screenshot(page, "04-mark-of-specialist-card.png");

  // ---------------------------------------------------------------------------
  // Step 5 & 6: Executor Sheet & Controls
  // ---------------------------------------------------------------------------
  console.log("Opening Executor sheet...");
  await closeAllActorSheets(page);
  await closeAllDialogs(page);

  await page.evaluate(id => {
    const actor = game.actors.get(id);
    actor.sheet.render(true);
  }, actorIds.executorId);

  await page.waitForSelector(".sheet.actor", { timeout: 15000 });
  const execFeaturesTab = page.locator('.sheet.actor [data-action="tab"][data-tab="features"], .sheet.actor .tabs [data-tab="features"], .sheet.actor a[data-tab="features"]').first();
  if (await execFeaturesTab.count()) {
    await execFeaturesTab.click();
    await page.waitForTimeout(600);
  }

  // 05. 05-executor-sheet.png: Executor sheet showing Deathmark: Held [Hunter] badge
  console.log("Capturing 05-executor-sheet.png...");
  await screenshot(page, "05-executor-sheet.png");

  // Open Executor Controls
  console.log("Opening Executor Controls dialog...");
  await page.evaluate(id => {
    game.ak5e.specialist.open(game.actors.get(id));
  }, actorIds.executorId);

  await page.waitForSelector(".ak5e-specialist-controls-dialog", { timeout: 10000 });
  await page.waitForTimeout(600);

  // 06. 06-executor-controls.png: Executor Controls dialog displaying Deathmark & path actions
  console.log("Capturing 06-executor-controls.png...");
  await screenshot(page, "06-executor-controls.png");

  // ---------------------------------------------------------------------------
  // Step 7: Transfer Deathmark executed onto Target Dummy
  // ---------------------------------------------------------------------------
  console.log("Transferring Deathmark onto Target Dummy...");
  await closeAllDialogs(page);

  await page.evaluate(async ids => {
    const executor = game.actors.get(ids.executorId);
    const dummy = game.actors.get(ids.dummyId);
    await game.ak5e.specialist.use(
      executor,
      "transferDeathmark",
      {
        confirmed: true,
        targetUuid: dummy.uuid,
        targetName: dummy.name
      },
      "live-tdm-1"
    );
    // Re-render sheet to show updated badge
    executor.sheet.render(true);
  }, actorIds);

  await page.waitForTimeout(800);

  // 07. 07-deathmark-transferred.png: Transfer Deathmark badge updates to Marked (Target Dummy) [Hunter]
  console.log("Capturing 07-deathmark-transferred.png...");
  await screenshot(page, "07-deathmark-transferred.png");

  // ---------------------------------------------------------------------------
  // Step 8: Mortal Blow chat card rendered with interactive 10d8 roll button
  // ---------------------------------------------------------------------------
  console.log("Executing Mortal Blow on Target Dummy...");
  await closeAllActorSheets(page);

  await page.evaluate(async ids => {
    const executor = game.actors.get(ids.executorId);
    const dummy = game.actors.get(ids.dummyId);
    await game.ak5e.specialist.use(
      executor,
      "mortalBlow",
      {
        confirmed: true,
        overrides: ["level", "shortfall", "path"],
        targetUuid: dummy.uuid,
        targetName: dummy.name
      },
      "live-mb-1"
    );
  }, actorIds);

  await scrollToBottomOfChat(page);

  // 08. 08-executor-mortal-blow-card.png: Mortal Blow chat card rendered with interactive 10d8 roll button
  console.log("Capturing 08-executor-mortal-blow-card.png...");
  await screenshot(page, "08-executor-mortal-blow-card.png");

  // ---------------------------------------------------------------------------
  // Step 9 & 10: Hookmaster Sheet & Controls
  // ---------------------------------------------------------------------------
  console.log("Opening Hookmaster sheet...");
  await closeAllDialogs(page);
  await closeAllActorSheets(page);

  await page.evaluate(id => {
    const actor = game.actors.get(id);
    actor.sheet.render(true);
  }, actorIds.hookmasterId);

  await page.waitForSelector(".sheet.actor", { timeout: 15000 });
  const hmFeaturesTab = page.locator('.sheet.actor [data-action="tab"][data-tab="features"], .sheet.actor .tabs [data-tab="features"], .sheet.actor a[data-tab="features"]').first();
  if (await hmFeaturesTab.count()) {
    await hmFeaturesTab.click();
    await page.waitForTimeout(600);
  }

  // 09. 09-hookmaster-sheet.png: Hookmaster sheet showing Hooked Weapon badge
  console.log("Capturing 09-hookmaster-sheet.png...");
  await screenshot(page, "09-hookmaster-sheet.png");

  // Open Hookmaster Controls dialog
  console.log("Opening Hookmaster Controls dialog...");
  await page.evaluate(id => {
    game.ak5e.specialist.open(game.actors.get(id));
  }, actorIds.hookmasterId);

  await page.waitForSelector(".ak5e-specialist-controls-dialog", { timeout: 10000 });
  await page.waitForTimeout(600);

  // 10. 10-hookmaster-controls.png: Hookmaster Controls dialog displaying Hooked Weapon & movement actions
  console.log("Capturing 10-hookmaster-controls.png...");
  await screenshot(page, "10-hookmaster-controls.png");

  // ---------------------------------------------------------------------------
  // Step 11: Mighty Push chat card rendered with interactive 8d6 damage roll button
  // ---------------------------------------------------------------------------
  console.log("Executing Mighty Push on Target Dummy...");
  await closeAllDialogs(page);
  await closeAllActorSheets(page);

  await page.evaluate(async ids => {
    const hookmaster = game.actors.get(ids.hookmasterId);
    const dummy = game.actors.get(ids.dummyId);
    await game.ak5e.specialist.use(
      hookmaster,
      "mightyPush",
      {
        confirmed: true,
        overrides: ["level", "shortfall", "distance"],
        targetUuid: dummy.uuid,
        targetName: dummy.name
      },
      "live-mp-1"
    );
  }, actorIds);

  await scrollToBottomOfChat(page);

  // 11. 11-hookmaster-mighty-push-card.png: Mighty Push chat card rendered with interactive 8d6 damage roll button
  console.log("Capturing 11-hookmaster-mighty-push-card.png...");
  await screenshot(page, "11-hookmaster-mighty-push-card.png");

  // ---------------------------------------------------------------------------
  // Step 12: Bound in Rope executed on Target Dummy, grappling target and locking Hook
  // ---------------------------------------------------------------------------
  console.log("Executing Bound in Rope on Target Dummy...");
  await page.evaluate(async ids => {
    const hookmaster = game.actors.get(ids.hookmasterId);
    const dummy = game.actors.get(ids.dummyId);
    await game.ak5e.specialist.use(
      hookmaster,
      "boundInRope",
      {
        confirmed: true,
        overrides: ["level", "shortfall", "distance", "hook", "size"],
        targetUuid: dummy.uuid,
        targetName: dummy.name
      },
      "live-bir-1"
    );
  }, actorIds);

  await scrollToBottomOfChat(page);

  // 12. 12-hookmaster-bound-in-rope-card.png: Bound in Rope executed on Target Dummy, grappling target
  console.log("Capturing 12-hookmaster-bound-in-rope-card.png...");
  await screenshot(page, "12-hookmaster-bound-in-rope-card.png");

  // ---------------------------------------------------------------------------
  // Step 13 & 14: Infuser Sheet & Controls
  // ---------------------------------------------------------------------------
  console.log("Opening Infuser sheet...");
  await closeAllDialogs(page);
  await closeAllActorSheets(page);

  await page.evaluate(id => {
    const actor = game.actors.get(id);
    actor.sheet.render(true);
  }, actorIds.infuserId);

  await page.waitForSelector(".sheet.actor", { timeout: 15000 });
  const infFeaturesTab = page.locator('.sheet.actor [data-action="tab"][data-tab="features"], .sheet.actor .tabs [data-tab="features"], .sheet.actor a[data-tab="features"]').first();
  if (await infFeaturesTab.count()) {
    await infFeaturesTab.click();
    await page.waitForTimeout(600);
  }

  // 13. 13-infuser-sheet.png: Infuser sheet showing Infusion badges and Infuser DC 20 - INT - PB
  console.log("Capturing 13-infuser-sheet.png...");
  await screenshot(page, "13-infuser-sheet.png");

  // Open Infuser Controls dialog
  console.log("Opening Infuser Controls dialog...");
  await page.evaluate(id => {
    game.ak5e.specialist.open(game.actors.get(id));
  }, actorIds.infuserId);

  await page.waitForSelector(".ak5e-specialist-controls-dialog", { timeout: 10000 });
  await page.waitForTimeout(600);

  // 14. 14-infuser-controls.png: Infuser Controls dialog displaying 8 Alchemical Infusions & Double-Blind Trial
  console.log("Capturing 14-infuser-controls.png...");
  await screenshot(page, "14-infuser-controls.png");

  // ---------------------------------------------------------------------------
  // Step 15: Apply Infusion (Muscle Strengthener) executed on Target Dummy
  // ---------------------------------------------------------------------------
  console.log("Applying Infusion (Muscle Strengthener) on Target Dummy...");
  await closeAllDialogs(page);
  await closeAllActorSheets(page);

  await page.evaluate(async ids => {
    const infuser = game.actors.get(ids.infuserId);
    const dummy = game.actors.get(ids.dummyId);
    await game.ak5e.specialist.use(
      infuser,
      "applyInfusion",
      {
        confirmed: true,
        overrides: ["level", "shortfall", "range", "creatureType"],
        targetUuid: dummy.uuid,
        targetName: dummy.name,
        infusionType: "muscleStrengthener"
      },
      "live-inf-1"
    );
  }, actorIds);

  await scrollToBottomOfChat(page);

  // 15. 15-infuser-applied-card.png: Apply Infusion chat card rendered
  console.log("Capturing 15-infuser-applied-card.png...");
  await screenshot(page, "15-infuser-applied-card.png");

  // ---------------------------------------------------------------------------
  // Step 16: Double-Blind Trial executed with interactive 1d6 Toxin roll button
  // ---------------------------------------------------------------------------
  console.log("Executing Double-Blind Trial...");
  await page.evaluate(async ids => {
    const infuser = game.actors.get(ids.infuserId);
    await game.ak5e.specialist.use(
      infuser,
      "doubleBlindTrial",
      {
        confirmed: true,
        overrides: ["level", "shortfall", "tool", "toxin"],
        hasPharmacologyKit: true
      },
      "live-dbt-1"
    );
  }, actorIds);

  await scrollToBottomOfChat(page);

  // 16. 16-infuser-double-blind-card.png: Double-Blind Trial interactive 1d6 Toxin roll card
  console.log("Capturing 16-infuser-double-blind-card.png...");
  await screenshot(page, "16-infuser-double-blind-card.png");

  // ---------------------------------------------------------------------------
  // Step 17: Undo executed on Apply Infusion, refunding infusion and restoring target
  // ---------------------------------------------------------------------------
  console.log("Executing Undo on Apply Infusion...");
  await page.evaluate(async ids => {
    const infuser = game.actors.get(ids.infuserId);
    await game.ak5e.specialist.use(
      infuser,
      "undoUse",
      { useId: "live-inf-1" },
      "live-inf-undo"
    );
  }, actorIds);

  await scrollToBottomOfChat(page);

  // 17. 17-undo-executed.png: Undo executed on Apply Infusion card
  console.log("Capturing 17-undo-executed.png...");
  await screenshot(page, "17-undo-executed.png");

  // ---------------------------------------------------------------------------
  // Step 18: Skyranger Sheet on Features Tab
  // ---------------------------------------------------------------------------
  console.log("Opening Skyranger sheet...");
  await closeAllDialogs(page);
  await closeAllActorSheets(page);

  await page.evaluate(id => {
    const actor = game.actors.get(id);
    actor.sheet.render(true);
  }, actorIds.skyrangerId);

  await page.waitForSelector(".sheet.actor", { timeout: 15000 });
  const skyFeaturesTab = page.locator('.sheet.actor [data-action="tab"][data-tab="features"], .sheet.actor .tabs [data-tab="features"], .sheet.actor a[data-tab="features"]').first();
  if (await skyFeaturesTab.count()) {
    await skyFeaturesTab.click();
    await page.waitForTimeout(600);
  }

  // Verify badges: Fuel: 3 / 3 and Doctrine: Air Superiority
  const badgeFuelEl = page.locator(".sheet.actor .ak5e-specialist-badge-fuel");
  const badgeDoctrineEl = page.locator(".sheet.actor .ak5e-specialist-badge-doctrine");

  await badgeFuelEl.waitFor({ state: "visible", timeout: 10000 });
  const badgeFuel = await badgeFuelEl.innerText();
  const badgeDoctrine = await badgeDoctrineEl.innerText();

  console.log("Skyranger badges verified:", { badgeFuel, badgeDoctrine });
  if (!badgeFuel.includes("Fuel: 3 / 3")) {
    throw new Error(`Expected Fuel: 3 / 3, got: ${badgeFuel}`);
  }
  if (!badgeDoctrine.includes("Doctrine: Air Superiority")) {
    throw new Error(`Expected Doctrine: Air Superiority, got: ${badgeDoctrine}`);
  }

  // 18. 18-skyranger-sheet.png: Skyranger sheet features tab with badges
  console.log("Capturing 18-skyranger-sheet.png...");
  await screenshot(page, "18-skyranger-sheet.png");

  // ---------------------------------------------------------------------------
  // Step 19: Skyranger Take Off & AA Missile Interactive Chat Cards
  // ---------------------------------------------------------------------------
  console.log("Triggering Take Off and AA Missile for Skyranger...");
  await closeAllActorSheets(page);

  // 1. Take Off
  await page.evaluate(async ids => {
    const skyranger = game.actors.get(ids.skyrangerId);
    await game.ak5e.specialist.use(
      skyranger,
      "takeOff",
      { confirmed: true },
      "live-sky-takeoff-1"
    );
  }, actorIds);

  // 2. AA Missile on Target Dummy
  await page.evaluate(async ids => {
    const skyranger = game.actors.get(ids.skyrangerId);
    const dummy = game.actors.get(ids.dummyId);
    await game.ak5e.specialist.use(
      skyranger,
      "aaMissile",
      {
        confirmed: true,
        targetUuid: dummy.uuid,
        targetName: dummy.name
      },
      "live-sky-aamissile-1"
    );
  }, actorIds);

  await scrollToBottomOfChat(page);

  // Verify interactive roll / save buttons on chat card
  const aaRollButton = page.locator(".ak5e-play-use-controls button", { hasText: "Roll" }).last();
  await aaRollButton.waitFor({ state: "attached", timeout: 10000 });
  await aaRollButton.scrollIntoViewIfNeeded().catch(() => {});
  const aaRollText = await aaRollButton.innerText();
  console.log("Verified interactive AA Missile button:", aaRollText);

  // 19. 19-skyranger-takeoff-card.png: Skyranger Take Off & AA Missile cards with roll buttons
  console.log("Capturing 19-skyranger-takeoff-card.png...");
  await screenshot(page, "19-skyranger-takeoff-card.png");

  // Revert Skyranger uses via undo
  const skyRevert = await page.evaluate(async ids => {
    const skyranger = game.actors.get(ids.skyrangerId);
    await game.ak5e.specialist.use(
      skyranger,
      "undoUse",
      { useId: "live-sky-aamissile-1" },
      "live-sky-undo-1"
    );
    await game.ak5e.specialist.use(
      skyranger,
      "undoUse",
      { useId: "live-sky-takeoff-1" },
      "live-sky-undo-2"
    );
    const fuel = (game.ak5e.resourcePools?.getPool?.(skyranger, "fuel") ?? skyranger.flags?.ak5e?.resourcePools?.fuel)?.value;
    const isFlying = Boolean(skyranger.flags?.ak5e?.skyranger?.isFlying);
    return { fuel, isFlying };
  }, actorIds);

  console.log("Skyranger state reversion verified:", skyRevert);
  if (skyRevert.fuel !== 3 || skyRevert.isFlying !== false) {
    throw new Error(`Expected Fuel reverted to 3 and isFlying false, got: ${JSON.stringify(skyRevert)}`);
  }

  // ---------------------------------------------------------------------------
  // Step 20: Dollkeeper Sheet on Features Tab
  // ---------------------------------------------------------------------------
  console.log("Opening Dollkeeper sheet...");
  await closeAllDialogs(page);
  await closeAllActorSheets(page);

  await page.evaluate(id => {
    const actor = game.actors.get(id);
    actor.sheet.render(true);
  }, actorIds.dollkeeperId);

  await page.waitForSelector(".sheet.actor", { timeout: 15000 });
  const dollFeaturesTab = page.locator('.sheet.actor [data-action="tab"][data-tab="features"], .sheet.actor .tabs [data-tab="features"], .sheet.actor a[data-tab="features"]').first();
  if (await dollFeaturesTab.count()) {
    await dollFeaturesTab.click();
    await page.waitForTimeout(600);
  }

  // Verify Doll status badge
  const badgeDollEl = page.locator(".sheet.actor .ak5e-specialist-badge-doll");
  await badgeDollEl.waitFor({ state: "visible", timeout: 10000 });
  const badgeDoll = await badgeDollEl.innerText();
  console.log("Dollkeeper badges verified:", { badgeDoll });
  if (!badgeDoll.includes("Doll: Active")) {
    throw new Error(`Expected Doll: Active, got: ${badgeDoll}`);
  }

  // 20. 20-dollkeeper-sheet.png: Dollkeeper sheet features tab with Doll status badge
  console.log("Capturing 20-dollkeeper-sheet.png...");
  await screenshot(page, "20-dollkeeper-sheet.png");

  // ---------------------------------------------------------------------------
  // Step 21: Dollkeeper Command Doll & Musical Chairs Chat Cards
  // ---------------------------------------------------------------------------
  console.log("Triggering Command Doll and Musical Chairs for Dollkeeper...");
  await closeAllActorSheets(page);

  // 1. Command Doll (strike on dummy)
  await page.evaluate(async ids => {
    const dollkeeper = game.actors.get(ids.dollkeeperId);
    const dummy = game.actors.get(ids.dummyId);
    await game.ak5e.specialist.use(
      dollkeeper,
      "commandDoll",
      {
        confirmed: true,
        command: "strike",
        targetUuid: dummy.uuid,
        targetName: dummy.name
      },
      "live-doll-cmd-1"
    );
  }, actorIds);

  // 2. Musical Chairs (position swap, 1 Prowess)
  await page.evaluate(async ids => {
    const dollkeeper = game.actors.get(ids.dollkeeperId);
    await game.ak5e.specialist.use(
      dollkeeper,
      "musicalChairs",
      { confirmed: true },
      "live-doll-mc-1"
    );
  }, actorIds);

  await scrollToBottomOfChat(page);

  // 21. 21-dollkeeper-command-card.png: Dollkeeper Command Doll & Musical Chairs cards
  console.log("Capturing 21-dollkeeper-command-card.png...");
  await screenshot(page, "21-dollkeeper-command-card.png");

  // Execute encounter-window undo on Musical Chairs
  const dollRevert = await page.evaluate(async ids => {
    const dollkeeper = game.actors.get(ids.dollkeeperId);
    await game.ak5e.specialist.use(
      dollkeeper,
      "undoUse",
      { useId: "live-doll-mc-1" },
      "live-doll-undo-1"
    );
    const prowess = (game.ak5e.resourcePools?.getPool?.(dollkeeper, "prowess") ?? dollkeeper.flags?.ak5e?.resourcePools?.prowess)?.value;
    return { prowess };
  }, actorIds);
  console.log("Dollkeeper Musical Chairs undo verified, prowess restored:", dollRevert.prowess);
  if (dollRevert.prowess !== 3) {
    throw new Error(`Expected Prowess restored to 3, got: ${dollRevert.prowess}`);
  }

  // ---------------------------------------------------------------------------
  // Step 22: Trapmaster Sheet on Features Tab
  // ---------------------------------------------------------------------------
  console.log("Opening Trapmaster sheet...");
  await closeAllDialogs(page);
  await closeAllActorSheets(page);

  await page.evaluate(id => {
    const actor = game.actors.get(id);
    actor.sheet.render(true);
  }, actorIds.trapmasterId);

  await page.waitForSelector(".sheet.actor", { timeout: 15000 });
  const trapFeaturesTab = page.locator('.sheet.actor [data-action="tab"][data-tab="features"], .sheet.actor .tabs [data-tab="features"], .sheet.actor a[data-tab="features"]').first();
  if (await trapFeaturesTab.count()) {
    await trapFeaturesTab.click();
    await page.waitForTimeout(600);
  }

  // Verify badges: Traps: 6 / 6 and Trap DC: 14
  const badgeTrapsEl = page.locator(".sheet.actor .ak5e-specialist-badge-traps");
  const badgeTrapDcEl = page.locator(".sheet.actor .ak5e-specialist-badge-trap-dc");

  await badgeTrapsEl.waitFor({ state: "visible", timeout: 10000 });
  const badgeTraps = await badgeTrapsEl.innerText();
  const badgeTrapDc = await badgeTrapDcEl.innerText();

  console.log("Trapmaster badges verified:", { badgeTraps, badgeTrapDc });
  if (!badgeTraps.includes("Traps: 6 / 6")) {
    throw new Error(`Expected Traps: 6 / 6, got: ${badgeTraps}`);
  }
  if (!badgeTrapDc.includes("Trap DC: 14")) {
    throw new Error(`Expected Trap DC: 14, got: ${badgeTrapDc}`);
  }

  // 22. 22-trapmaster-sheet.png: Trapmaster sheet features tab with badges
  console.log("Capturing 22-trapmaster-sheet.png...");
  await screenshot(page, "22-trapmaster-sheet.png");

  // ---------------------------------------------------------------------------
  // Step 23: Trapmaster Plant Trap & Warning Point Chat Cards
  // ---------------------------------------------------------------------------
  console.log("Triggering Plant Trap and Warning Point for Trapmaster...");
  await closeAllActorSheets(page);

  // 1. Plant Trap (Explosive Trap)
  await page.evaluate(async ids => {
    const trapmaster = game.actors.get(ids.trapmasterId);
    await game.ak5e.specialist.use(
      trapmaster,
      "placeTrap",
      {
        confirmed: true,
        trapId: "explosive"
      },
      "live-trap-plant-1"
    );
  }, actorIds);

  // 2. Warning Point on Target Dummy
  await page.evaluate(async ids => {
    const trapmaster = game.actors.get(ids.trapmasterId);
    const dummy = game.actors.get(ids.dummyId);
    await game.ak5e.specialist.use(
      trapmaster,
      "warningPoint",
      {
        confirmed: true,
        targetUuid: dummy.uuid,
        targetName: dummy.name
      },
      "live-trap-wp-1"
    );
  }, actorIds);

  await scrollToBottomOfChat(page);

  // 23. 23-trapmaster-plant-trap-card.png: Trapmaster Plant Trap & Warning Point chat cards
  console.log("Capturing 23-trapmaster-plant-trap-card.png...");
  await screenshot(page, "23-trapmaster-plant-trap-card.png");

  // ---------------------------------------------------------------------------
  // Step 24: Encounter-Window Undo Executed and State Reversion Verified
  // ---------------------------------------------------------------------------
  console.log("Executing undoUse on Plant Trap...");
  const trapUndoResult = await page.evaluate(async ids => {
    const trapmaster = game.actors.get(ids.trapmasterId);
    await game.ak5e.specialist.use(
      trapmaster,
      "undoUse",
      { useId: "live-trap-plant-1" },
      "live-trap-undo-1"
    );

    const pool = (game.ak5e.resourcePools?.getPool?.(trapmaster, "traps") ?? trapmaster.flags?.ak5e?.resourcePools?.traps);
    return {
      poolValue: pool?.value
    };
  }, actorIds);

  console.log("Trapmaster undoUse result:", trapUndoResult);
  if (trapUndoResult.poolValue !== 6) {
    throw new Error(`Expected Traps pool refunded to 6, got: ${trapUndoResult.poolValue}`);
  }

  await scrollToBottomOfChat(page);

  // 24. 24-specialist-undo-executed.png: Undo executed chat card showing state reversion
  console.log("Capturing 24-specialist-undo-executed.png...");
  await screenshot(page, "24-specialist-undo-executed.png");

  console.log("All 24 live browser steps completed successfully!");
  console.log("Total errors captured:", report.errors.length);
  console.log("Total screenshots captured:", report.screenshots.length);

  if (report.screenshots.length !== 24) {
    throw new Error(`Expected 24 screenshots, got ${report.screenshots.length}`);
  }

  await writeFile(`${outputDir}/report.json`, JSON.stringify(report, null, 2));
  await writeFile(`${outputDir}/browser-report.json`, JSON.stringify(report, null, 2));

  if (report.errors.length > 0) {
    throw new Error(`Browser reported ${report.errors.length} errors: ${report.errors.join("; ")}`);
  }

} catch (err) {
  console.error("Test execution failed:", err);
  report.errors.push(err.stack ?? err.message);
  await writeFile(`${outputDir}/report.json`, JSON.stringify(report, null, 2)).catch(() => {});
  await writeFile(`${outputDir}/browser-report.json`, JSON.stringify(report, null, 2)).catch(() => {});
  throw err;
} finally {
  console.log("Closing browser and contexts...");
  try {
    for (const ctx of contexts) {
      await ctx.close().catch(() => {});
    }
  } catch {}
  try {
    await browser.close().catch(() => {});
  } catch {}
}
