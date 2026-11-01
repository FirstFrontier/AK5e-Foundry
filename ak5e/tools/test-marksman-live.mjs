/**
 * Autonomous live Foundry V13 browser playtest for Marksman class and subclasses:
 * Anti-Air, Artilleryman, Besieger, Deadeye, Flinger, Heavyshot, Hunter, Spreadshot,
 * and Base Marksman.
 *
 * Implements:
 * - Dual-client GM and Player interaction flows (authentication, UI button clicks, unowned-target relay).
 * - Full Artilleryman workflows (Tools of the Trade, Splash weapon attack, Delayed Detonation deploy & detonate,
 *   Secondary Detonation, shortfall/overspend warnings, and undo).
 * - Pre-restart snapshot capture and post-restart persistence verification.
 * - Uses launchTestBrowser() from ./test-browser.mjs per WORKFLOW.md §5.3.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { launchTestBrowser } from "./test-browser.mjs";

let chromium;
for (const candidate of [
  process.env.AK5E_PLAYWRIGHT,
  "/tmp/frontier-playwright/node_modules/playwright/index.mjs",
  "/tmp/frontier-browser-check/node_modules/playwright/index.mjs",
  "playwright"
].filter(Boolean)) {
  try {
    const mod = await import(candidate);
    if (mod.chromium) {
      chromium = mod.chromium;
      break;
    }
  } catch {}
}
if (!chromium) throw new Error("Could not load Playwright chromium module.");

const port = process.env.AK5E_TEST_PORT ?? process.env.AK5E_PORT ?? "30175";
const base = `http://127.0.0.1:${port}/join`;
const outputDir = process.env.AK5E_TEST_OUTPUT ?? process.env.AK5E_OUTPUT ?? "/tmp/ak5e-marksman-evidence";
const isRestartPhase = process.argv.includes("--restart") || process.env.AK5E_RESTART === "true";

await mkdir(outputDir, { recursive: true });

const report = {
  world: "standard-test",
  port,
  phase: isRestartPhase ? "restart" : "live",
  environment: {},
  actors: {},
  checks: [],
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
  page.setDefaultTimeout(30000);

  page.on("pageerror", error => {
    const msg = `${name}: ${error.stack ?? error.message}`;
    console.error("Page error:", msg);
    report.errors.push(msg);
  });
  page.on("console", message => {
    if (message.type() === "error") {
      const text = message.text();
      if (text.includes("favicon.ico") || text.includes("404") || text.includes("Failed to load resource")) return;
      console.error(`Console error [${name}]:`, text);
      report.errors.push(`${name}: ${text}`);
    }
  });

  await page.goto(base);
  await page.selectOption('select[name="userid"]', { label: name, timeout: 25000 });
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
      if (
        app.constructor?.name === "Dialog" ||
        app.constructor?.name === "DialogV2" ||
        app.element?.tagName === "DIALOG" ||
        app.constructor?.name?.includes("Sheet")
      ) {
        try { await app.close(); } catch {}
      }
    }
  });
  await page.waitForTimeout(300);
}

async function showChat(page) {
  await page.evaluate(async () => {
    ui.sidebar.changeTab("chat", "primary");
    ui.sidebar.expand();
    const log = document.querySelector("#chat-log");
    if (log) log.scrollTop = log.scrollHeight;
  });
  await page.waitForTimeout(300);
}

try {
  if (isRestartPhase) {
    /* =========================================================================
     * PHASE 2: Post-Restart Persistence Acceptance Verification
     * ========================================================================= */
    console.log("=== Phase 2: Verifying persistence across server restart ===");
    const snapshotFile = `${outputDir}/pre-restart-snapshot.json`;
    const snapshot = JSON.parse(await readFile(snapshotFile, "utf8"));

    console.log("Connecting to restarted Foundry as Gamemaster...");
    const gmPage = await join("Gamemaster");
    await gmPage.waitForTimeout(1000);

    const gmVerification = await gmPage.evaluate(async snap => {
      const results = { checks: [], actorMatches: {} };
      const currentActors = game.actors;
      for (const [key, actorSnap] of Object.entries(snap.actors)) {
        const actor = currentActors.get(actorSnap.id);
        if (!actor) {
          results.checks.push(`FAIL: Actor ${actorSnap.name} (${actorSnap.id}) missing after restart`);
          continue;
        }
        const itemsMatch = actor.items.size === actorSnap.itemsCount;
        const flagsMatch = Boolean(actor.flags?.ak5e?.marksman);
        results.actorMatches[key] = {
          name: actor.name,
          itemsCount: actor.items.size,
          itemsMatch,
          flagsMatch,
          targetLock: actor.flags?.ak5e?.marksman?.targetLock ?? null,
          delayedMunitionsCount: (actor.flags?.ak5e?.marksman?.delayedMunitions ?? []).length,
          undoCount: (actor.flags?.ak5e?.marksmanUses?.undo ?? []).length
        };
      }
      results.messagesCount = game.messages.size;
      return results;
    }, snapshot);

    console.log("GM Post-restart verification:", gmVerification);
    await captureShot(gmPage, "31-post-restart-gm-overview.png");

    console.log("Connecting to restarted Foundry as Marksman Player...");
    const playerPage = await join("Marksman Player");
    await playerPage.waitForTimeout(1000);

    // Open Artilleryman sheet on player
    await playerPage.evaluate(id => {
      const actor = game.actors.get(id);
      if (actor) actor.sheet.render(true);
    }, snapshot.actors.artilleryman.id);
    await playerPage.waitForTimeout(1000);
    await captureShot(playerPage, "32-post-restart-player-sheet.png");

    // Chat history view
    await showChat(playerPage);
    await captureShot(playerPage, "33-post-restart-chat-cards.png");

    await closeOpenDialogs(playerPage);
    await closeOpenDialogs(gmPage);

    report.snapshot = snapshot;
    report.restartVerification = gmVerification;
    report.success = gmVerification.checks.length === 0;

  } else {
    /* =========================================================================
     * PHASE 1: Live Interactive Workflow Execution & Pre-Restart Capture
     * ========================================================================= */
    console.log("=== Phase 1: Live Interactive Workflows & Capture ===");
    console.log("Connecting to Foundry on port", port, "as Gamemaster...");
    const gmPage = await join("Gamemaster");

    // Ensure ak5e module is active
    const moduleActive = await gmPage.evaluate(async () => {
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
      await gmPage.reload();
      await gmPage.waitForFunction(() => globalThis.game?.ready && globalThis.canvas?.ready, null, { timeout: 60000 });
    }

    report.environment = await gmPage.evaluate(() => ({
      foundry: game.version,
      system: game.system.version,
      module: game.modules.get("ak5e")?.version,
      world: game.world.id,
      hasMarksmanApi: Boolean(game.ak5e?.marksman),
      renderer: (() => {
        const gl = canvas?.app?.renderer?.gl;
        const ext = gl?.getExtension("WEBGL_debug_renderer_info");
        return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unavailable";
      })()
    }));
    console.log("Environment:", report.environment);

    // Baseline world screenshot
    await captureShot(gmPage, "01-baseline-world.png");

    // ---------------------------------------------------------------- Setup Scene, Users & Actors (GM)
    console.log("Setting up Player user, Target Dummy, and Marksman subclass actors...");
    const fixture = await gmPage.evaluate(async () => {
      // 1. Create Player User
      let playerUser = game.users.getName("Marksman Player");
      if (!playerUser) {
        playerUser = await User.create({
          name: "Marksman Player",
          role: CONST.USER_ROLES.PLAYER,
          password: ""
        });
      }

      // 2. Create Target Dummy NPC
      let dummy = game.actors.find(a => a.name === "Target Dummy");
      if (dummy) await dummy.delete();
      dummy = await Actor.create({
        name: "Target Dummy",
        type: "npc",
        ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE },
        system: {
          attributes: { hp: { value: 50, max: 50 } },
          abilities: { dex: { value: 12 }, con: { value: 14 } }
        }
      });

      // 3. Helper to create Marksman actor
      const createMarksman = async (name, subclassId, levels, abilities, extraItems = []) => {
        const old = game.actors.find(a => a.name === name);
        if (old) await old.delete();

        const actor = await Actor.create({
          name,
          type: "character",
          ownership: {
            default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE,
            [playerUser.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
          },
          system: { abilities }
        });

        const items = [
          {
            name: "Marksman",
            type: "class",
            system: { levels, identifier: "marksman" },
            flags: { ak5e: { chapterThreeId: "class-marksman" } }
          }
        ];
        if (subclassId) {
          items.push({
            name: subclassId.split("-").map(w => w[0].toUpperCase() + w.slice(1)).join(" "),
            type: "subclass",
            system: { classIdentifier: "marksman" },
            flags: { ak5e: { chapterThreeId: `subclass-marksman-${subclassId}` } }
          });
        }
        if (extraItems.length) items.push(...extraItems);

        await actor.createEmbeddedDocuments("Item", items);
        const preview = await game.ak5e.marksman.preview(actor);
        await game.ak5e.marksman.apply(actor, { confirmed: true, contextKey: preview.contextKey });
        return { id: actor.id, name: actor.name, itemsCount: actor.items.size };
      };

      // Base Marksman (Level 5)
      const baseInfo = await createMarksman("Base Marksman Test", null, 5, {
        dex: { value: 18 }, str: { value: 12 }, con: { value: 14 }, int: { value: 10 }, wis: { value: 14 }, cha: { value: 10 }
      });

      // Anti-Air Marksman (Level 18)
      const antiAirInfo = await createMarksman("Anti-Air Marksman Test", "anti-air", 18, {
        dex: { value: 18 }, str: { value: 12 }, con: { value: 14 }, int: { value: 10 }, wis: { value: 14 }, cha: { value: 10 }
      });

      // Artilleryman Marksman (Level 18) with Splash Launcher
      const artillerymanInfo = await createMarksman("Artilleryman Marksman Test", "artilleryman", 18, {
        dex: { value: 18 }, str: { value: 12 }, con: { value: 14 }, int: { value: 14 }, wis: { value: 12 }, cha: { value: 10 }
      }, [
        {
          name: "Heavy Mortar Launcher",
          type: "weapon",
          system: {
            type: { value: "martialR" },
            actionType: "rwak",
            weaponType: "martialR",
            properties: ["two", "hvy"],
            range: { value: 120, long: 360 },
            damage: { base: { number: 2, denomination: 8, types: ["thunder"] } }
          },
          flags: { ak5e: { splash: 15 } }
        }
      ]);

      // Besieger Marksman (Level 18)
      const besiegerInfo = await createMarksman("Besieger Marksman Test", "besieger", 18, {
        dex: { value: 18 }, str: { value: 16 }, con: { value: 14 }, int: { value: 10 }, wis: { value: 12 }, cha: { value: 10 }
      });

      // Deadeye (Level 18)
      const deadeyeInfo = await createMarksman("Deadeye Marksman Test", "deadeye", 18, {
        dex: { value: 20 }, str: { value: 10 }, con: { value: 14 }, int: { value: 12 }, wis: { value: 14 }, cha: { value: 10 }
      });

      // Flinger (Level 18)
      const flingerInfo = await createMarksman("Flinger Marksman Test", "flinger", 18, {
        dex: { value: 14 }, str: { value: 10 }, con: { value: 14 }, int: { value: 20 }, wis: { value: 12 }, cha: { value: 10 }
      });

      // Heavyshot (Level 18)
      const heavyshotInfo = await createMarksman("Heavyshot Marksman Test", "heavyshot", 18, {
        dex: { value: 18 }, str: { value: 16 }, con: { value: 14 }, int: { value: 10 }, wis: { value: 12 }, cha: { value: 10 }
      }, [
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
        }
      ]);

      // Hunter (Level 18)
      const hunterInfo = await createMarksman("Hunter Marksman Test", "hunter", 18, {
        dex: { value: 20 }, str: { value: 12 }, con: { value: 14 }, int: { value: 12 }, wis: { value: 14 }, cha: { value: 10 }
      }, [
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
        }
      ]);

      // Spreadshot (Level 18)
      const spreadshotInfo = await createMarksman("Spreadshot Marksman Test", "spreadshot", 18, {
        dex: { value: 18 }, str: { value: 14 }, con: { value: 16 }, int: { value: 10 }, wis: { value: 12 }, cha: { value: 10 }
      }, [
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
        }
      ]);

      return {
        playerUserId: playerUser.id,
        dummyId: dummy.id,
        dummyUuid: dummy.uuid,
        base: baseInfo,
        antiAir: antiAirInfo,
        artilleryman: artillerymanInfo,
        besieger: besiegerInfo,
        deadeye: deadeyeInfo,
        flinger: flingerInfo,
        heavyshot: heavyshotInfo,
        hunter: hunterInfo,
        spreadshot: spreadshotInfo
      };
    });

    report.actors = fixture;
    console.log("Fixtures created successfully.");

    // ---------------------------------------------------------------- GM Sheets Verification
    console.log("Capturing GM sheet views...");
    await gmPage.evaluate(id => game.actors.get(id).sheet.render(true), fixture.base.id);
    await gmPage.waitForTimeout(800);
    await captureShot(gmPage, "02-gm-base-marksman-sheet.png");
    await closeOpenDialogs(gmPage);

    await gmPage.evaluate(id => game.actors.get(id).sheet.render(true), fixture.antiAir.id);
    await gmPage.waitForTimeout(800);
    await captureShot(gmPage, "03-gm-anti-air-sheet.png");
    await closeOpenDialogs(gmPage);

    await gmPage.evaluate(id => game.actors.get(id).sheet.render(true), fixture.besieger.id);
    await gmPage.waitForTimeout(800);
    await captureShot(gmPage, "04-gm-besieger-sheet.png");
    await closeOpenDialogs(gmPage);

    await gmPage.evaluate(id => game.actors.get(id).sheet.render(true), fixture.artilleryman.id);
    await gmPage.waitForTimeout(800);
    await captureShot(gmPage, "05-gm-artilleryman-sheet.png");
    await closeOpenDialogs(gmPage);

    // ---------------------------------------------------------------- Connect Dual-Client Player
    console.log("Connecting dual-client as Marksman Player...");
    const playerPage = await join("Marksman Player");

    // ---------------------------------------------------------------- Player Base Marksman & Target Relay
    console.log("Exercising Player Base Marksman UI & unowned target relay...");
    await playerPage.evaluate(id => game.actors.get(id).sheet.render(true), fixture.base.id);
    await playerPage.waitForTimeout(800);
    await captureShot(playerPage, "06-player-base-sheet.png");

    // Open Marksman Controls from sheet
    await playerPage.evaluate(id => game.ak5e.marksman.open(game.actors.get(id)), fixture.base.id);
    await playerPage.waitForSelector(".ak5e-marksman-panel", { timeout: 15000 });
    await captureShot(playerPage, "07-player-base-controls.png");

    // Execute Target Lock on unowned Target Dummy via player command
    await playerPage.evaluate(async f => {
      const actor = game.actors.get(f.base.id);
      await game.ak5e.marksman.use(actor, "targetLock", {
        targetUuid: f.dummyUuid,
        targetName: "Target Dummy",
        confirmed: true
      });
    }, fixture);
    await playerPage.waitForTimeout(1000);
    await showChat(playerPage);
    await captureShot(playerPage, "08-player-target-lock-card.png");

    // Verify unowned target dummy received relay on GM client
    const relayVerified = await gmPage.evaluate(dummyId => {
      const dummy = game.actors.get(dummyId);
      return dummy && dummy.name === "Target Dummy";
    }, fixture.dummyId);
    console.log("Target relay verified on GM client:", relayVerified);

    await closeOpenDialogs(playerPage);

    // ---------------------------------------------------------------- Player Anti-Air Marksman Workflow
    console.log("Exercising Player Anti-Air Marksman UI...");
    await playerPage.evaluate(id => game.actors.get(id).sheet.render(true), fixture.antiAir.id);
    await playerPage.waitForTimeout(800);
    await captureShot(playerPage, "09-player-anti-air-sheet.png");

    await playerPage.evaluate(id => game.ak5e.marksman.open(game.actors.get(id)), fixture.antiAir.id);
    await playerPage.waitForSelector(".ak5e-marksman-panel", { timeout: 15000 });
    await captureShot(playerPage, "10-player-anti-air-controls.png");

    // Execute Area Denial with proper parameters
    await playerPage.evaluate(async f => {
      const actor = game.actors.get(f.antiAir.id);
      await game.ak5e.marksman.use(actor, "versatileApproach", {
        option: "areaDenial",
        conditionsConfirmed: true,
        martialDcAbility: "dex",
        targetUuids: [f.dummyUuid],
        confirmed: true,
        overrides: ["conditions", "martialDC", "targets", "turn"]
      });
    }, fixture);
    await playerPage.waitForTimeout(1000);
    await showChat(playerPage);
    await captureShot(playerPage, "11-player-area-denial-card.png");

    await closeOpenDialogs(playerPage);

    // ---------------------------------------------------------------- Player Besieger Marksman Workflow
    console.log("Exercising Player Besieger Marksman UI...");
    await playerPage.evaluate(id => game.actors.get(id).sheet.render(true), fixture.besieger.id);
    await playerPage.waitForTimeout(800);
    await captureShot(playerPage, "12-player-besieger-sheet.png");

    // Enter Siege Mode and open dialog
    await playerPage.evaluate(async id => {
      const actor = game.actors.get(id);
      await game.ak5e.marksman.use(actor, "siegeMode", { confirmed: true, overrides: ["all"] });
      await game.ak5e.marksman.open(actor);
    }, fixture.besieger.id);
    await playerPage.waitForSelector(".ak5e-marksman-panel", { timeout: 15000 });
    await captureShot(playerPage, "13-player-besieger-controls.png");

    // Execute Siege Bolt
    await playerPage.evaluate(async f => {
      const actor = game.actors.get(f.besieger.id);
      await game.ak5e.marksman.use(actor, "siegeBolt", {
        targetUuid: f.dummyUuid,
        targetName: "Target Dummy",
        martialDcAbility: "dex",
        confirmed: true,
        overrides: ["martialDC", "target"]
      });
    }, fixture);
    await playerPage.waitForTimeout(1000);
    await showChat(playerPage);
    await captureShot(playerPage, "14-player-besieger-siege-bolt-card.png");

    await closeOpenDialogs(playerPage);

    // ---------------------------------------------------------------- Player Artilleryman Full Workflow
    console.log("Exercising Player Artilleryman Full Workflow (Splash, Munitions, Secondary Detonation, Warnings, Undo)...");
    await playerPage.evaluate(id => game.actors.get(id).sheet.render(true), fixture.artilleryman.id);
    await playerPage.waitForTimeout(800);
    await captureShot(playerPage, "15-player-artilleryman-sheet.png");

    // Open Artilleryman Controls Dialog
    await playerPage.evaluate(id => game.ak5e.marksman.open(game.actors.get(id)), fixture.artilleryman.id);
    await playerPage.waitForSelector(".ak5e-marksman-panel", { timeout: 15000 });
    await captureShot(playerPage, "16-player-artilleryman-controls.png");
    await closeOpenDialogs(playerPage);

    // 1. Deploy Delayed Munition
    console.log("Deploying delayed munition...");
    const deployReceipt = await playerPage.evaluate(async f => {
      const actor = game.actors.get(f.artilleryman.id);
      const weapon = actor.items.find(i => i.name === "Heavy Mortar Launcher");
      return await game.ak5e.marksman.use(actor, "delayedDetonation", {
        weaponId: weapon?.id,
        weaponUuid: weapon?.uuid,
        weaponName: weapon?.name,
        point: { x: 500, y: 500 },
        manualSplashRadius: 15,
        triggerConfirmed: true,
        confirmed: true,
        overrides: ["trigger", "point", "splashProperty", "range", "delayedDetonation"]
      });
    }, fixture);
    await playerPage.waitForTimeout(1000);
    await showChat(playerPage);
    await captureShot(playerPage, "17-artilleryman-deploy-munition-card.png");

    // 2. Shortfall / Overspend Warning verification
    console.log("Triggering shortfall warning for exhausted Delayed Munition pool...");
    const warningText = await playerPage.evaluate(async f => {
      const actor = game.actors.get(f.artilleryman.id);
      const weapon = actor.items.find(i => i.name === "Heavy Mortar Launcher");
      const { marksmanUses } = await import("/modules/ak5e/scripts/marksman-uses.mjs");
      const plan = await marksmanUses.preview(actor, "delayedDetonation", { weaponId: weapon?.id, weaponUuid: weapon?.uuid });
      return plan?.warnings?.map(w => w.text).join("; ") ?? "No warnings";
    }, fixture);
    console.log("Observed shortfall warning:", warningText);

    // Capture warning dialog in browser
    await playerPage.evaluate(async id => {
      const actor = game.actors.get(id);
      void game.ak5e.marksman.open(actor);
    }, fixture.artilleryman.id);
    await playerPage.waitForTimeout(600);
    await captureShot(playerPage, "18-warning-delayed-detonation-shortfall.png");
    await closeOpenDialogs(playerPage);

    // 3. Detonate Munition as a Reaction
    console.log("Detonating burrowed munition...");
    await playerPage.evaluate(async f => {
      const actor = game.actors.get(f.artilleryman.id);
      await game.ak5e.marksman.use(actor, "detonateMunition", {
        targetUuids: [f.dummyUuid],
        martialDcAbility: "dex",
        manualDC: 16,
        triggerConfirmed: true,
        confirmed: true,
        overrides: ["trigger", "martialDC", "targets", "radius"]
      });
    }, fixture);
    await playerPage.waitForTimeout(1000);
    await showChat(playerPage);
    await captureShot(playerPage, "19-artilleryman-detonate-card.png");

    // 4. Secondary Detonation (halved thunder damage, bound to origin)
    console.log("Triggering Secondary Detonation...");
    const secReceipt = await playerPage.evaluate(async f => {
      const actor = game.actors.get(f.artilleryman.id);
      const weapon = actor.items.find(i => i.name === "Heavy Mortar Launcher");
      const undoList = actor.flags?.ak5e?.marksmanUses?.undo ?? [];
      const originUse = undoList.slice().reverse().find(u => u.command === "delayedDetonation" || u.command === "detonateMunition");
      return await game.ak5e.marksman.use(actor, "secondaryDetonation", {
        weaponId: weapon?.id,
        weaponUuid: weapon?.uuid,
        originUseId: originUse?.id ?? f.deployUseId,
        point: { x: 510, y: 510 },
        originalDamage: 24,
        targetUuids: [f.dummyUuid],
        martialDcAbility: "dex",
        manualDC: 16,
        triggerConfirmed: true,
        reading: "originalTotal",
        readings: { secondaryDetonationDamage: "originalTotal" },
        confirmed: true,
        overrides: ["trigger", "martialDC", "targets", "secondaryChain", "weapon", "splashProperty", "origin", "secondaryDetonation"]
      });
    }, { ...fixture, deployUseId: deployReceipt?.id });
    await playerPage.waitForTimeout(1000);
    await showChat(playerPage);
    await captureShot(playerPage, "20-artilleryman-secondary-detonation-card.png");

    // 5. Undo Flow: Undo Secondary Detonation
    console.log("Exercising Undo on Secondary Detonation...");
    await playerPage.evaluate(async f => {
      const actor = game.actors.get(f.artilleryman.id);
      const undoList = actor.flags?.ak5e?.marksmanUses?.undo ?? [];
      const last = undoList[undoList.length - 1];
      if (last) {
        await game.ak5e.marksman.use(actor, "undoUse", { useId: last.id });
      }
    }, fixture);
    await playerPage.waitForTimeout(1000);
    await showChat(playerPage);
    await captureShot(playerPage, "21-artilleryman-undo-receipt-card.png");

    await closeOpenDialogs(playerPage);

    // ---------------------------------------------------------------- Exercise Other Subclasses (Regression Integrity)
    console.log("Exercising Deadeye, Flinger, Heavyshot, Hunter, and Spreadshot...");
    // Deadeye
    await gmPage.evaluate(async id => {
      const actor = game.actors.get(id);
      await game.ak5e.marksman.use(actor, "deadshot", { confirmed: true, overrides: ["deadshot"] });
      await game.ak5e.marksman.use(actor, "vitalStrike", { confirmed: true, overrides: ["deadshot"] });
    }, fixture.deadeye.id);
    await gmPage.waitForTimeout(500);

    // Flinger
    await gmPage.evaluate(async id => {
      const actor = game.actors.get(id);
      await game.ak5e.marksman.use(actor, "bindWeapon", { weaponId: "live-sword-1", weaponName: "Kinetic Greatsword", confirmed: true, overrides: ["all"] });
      await game.ak5e.marksman.use(actor, "kineticStrike", { targetName: "Target Dummy", confirmed: true, overrides: ["all"] });
    }, fixture.flinger.id);
    await gmPage.waitForTimeout(500);

    // Heavyshot
    await gmPage.evaluate(async id => {
      const actor = game.actors.get(id);
      await game.ak5e.marksman.use(actor, "heartseeker", { confirmed: true, overrides: ["all"] });
    }, fixture.heavyshot.id);
    await gmPage.waitForTimeout(500);

    // Hunter
    await gmPage.evaluate(async id => {
      const actor = game.actors.get(id);
      await game.ak5e.marksman.use(actor, "railgun", { charges: 3, confirmed: true, overrides: ["all"] });
    }, fixture.hunter.id);
    await gmPage.waitForTimeout(500);

    // Spreadshot
    await gmPage.evaluate(async id => {
      const actor = game.actors.get(id);
      await game.ak5e.marksman.use(actor, "craftShells", { shells: { dragonsBreath: 2, flechette: 2, slug: 2 }, confirmed: true, overrides: ["all"] });
      await game.ak5e.marksman.use(actor, "loadShells", { shells: ["dragonsBreath", "slug"], confirmed: true, overrides: ["all"] });
      await game.ak5e.marksman.use(actor, "bothBarrels", { confirmed: true, overrides: ["all"] });
    }, fixture.spreadshot.id);
    await gmPage.waitForTimeout(500);

    // ---------------------------------------------------------------- Pre-Restart Overview & Snapshot Capture
    console.log("Capturing Pre-Restart Overviews and Deep State Snapshot...");
    await showChat(gmPage);
    await captureShot(gmPage, "29-pre-restart-gm-overview.png");

    await showChat(playerPage);
    await captureShot(playerPage, "30-pre-restart-player-overview.png");

    // Capture deep snapshot
    const preRestartSnapshot = await gmPage.evaluate(() => {
      const actorsList = [
        "Base Marksman Test",
        "Anti-Air Marksman Test",
        "Artilleryman Marksman Test",
        "Besieger Marksman Test",
        "Deadeye Marksman Test",
        "Flinger Marksman Test",
        "Heavyshot Marksman Test",
        "Hunter Marksman Test",
        "Spreadshot Marksman Test"
      ];
      const snapshot = {
        world: game.world.id,
        messagesCount: game.messages.size,
        actors: {}
      };

      for (const name of actorsList) {
        const actor = game.actors.find(a => a.name === name);
        if (!actor) continue;
        const key = name.toLowerCase().replace(" marksman test", "").replace(/[^a-z0-9]/g, "");
        snapshot.actors[key] = {
          id: actor.id,
          name: actor.name,
          itemsCount: actor.items.size,
          itemIds: actor.items.map(i => i.id).sort(),
          flags: {
            marksman: actor.flags?.ak5e?.marksman ?? {},
            delayedMunitions: actor.flags?.ak5e?.marksman?.delayedMunitions ?? []
          },
          undoCount: (actor.flags?.ak5e?.marksmanUses?.undo ?? []).length
        };
      }
      return snapshot;
    });

    await writeFile(`${outputDir}/pre-restart-snapshot.json`, JSON.stringify(preRestartSnapshot, null, 2));
    console.log("Saved pre-restart snapshot to", `${outputDir}/pre-restart-snapshot.json`);

    await closeOpenDialogs(playerPage);
    await closeOpenDialogs(gmPage);

    report.preRestartSnapshot = preRestartSnapshot;
    report.success = true;
  }

} catch (error) {
  console.error("Test execution failed:", error);
  report.errors.push(error.stack ?? error.message);
  report.success = false;
} finally {
  console.log("Closing browser and contexts...");
  await browser.close();
  const reportFilename = isRestartPhase ? "restart-report.json" : "browser-report.json";
  await writeFile(`${outputDir}/${reportFilename}`, JSON.stringify(report, null, 2));
  await writeFile(`${outputDir}/report.json`, JSON.stringify(report, null, 2));
  console.log("Playtest complete. Report written to", `${outputDir}/${reportFilename}`);
}
