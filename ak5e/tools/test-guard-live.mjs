/**
 * Live Foundry V13 browser validation for Guard class and all subclasses
 * (Centurion, Crusher, Instructor, Artsblade, Brawler, Duellist, Liberator, Lord).
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

    // 4. Artsblade Guard
    let artsblade = game.actors.find(a => a.name === "Ch'en (Artsblade)");
    if (!artsblade) {
      artsblade = await Actor.create({
        name: "Ch'en (Artsblade)",
        type: "character",
        system: {
          abilities: { str: { value: 16 }, dex: { value: 14 }, int: { value: 12 }, con: { value: 14 } },
          attributes: { hp: { value: 45, max: 45 } }
        }
      });
      await artsblade.createEmbeddedDocuments("Item", [
        { name: "Guard", type: "class", system: { levels: 5 }, flags: { ak5e: { chapterThreeId: "class-guard" } } },
        { name: "Guard: Artsblade", type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-guard-artsblade" } } }
      ]);
    }
    await artsblade.update({
      "flags.ak5e.guard": { enabled: true, version: 1 },
      "flags.ak5e.resourcePools.aggression": { value: 4, max: 4 },
      "flags.ak5e.resourcePools.unrelenting": { value: 1, max: 1 },
      "flags.ak5e.resourcePools.spellswordPoints": { value: 1, max: 1 },
      "flags.ak5e.resourcePools.cutThroughChaos": { value: 3, max: 3 }
    });

    // 5. Brawler Guard
    let brawler = game.actors.find(a => a.name === "Mountain (Brawler)");
    if (!brawler) {
      brawler = await Actor.create({
        name: "Mountain (Brawler)",
        type: "character",
        system: {
          abilities: { str: { value: 18 }, dex: { value: 14 }, con: { value: 16 } },
          attributes: { hp: { value: 55, max: 55 } }
        }
      });
      await brawler.createEmbeddedDocuments("Item", [
        { name: "Guard", type: "class", system: { levels: 5 }, flags: { ak5e: { chapterThreeId: "class-guard" } } },
        { name: "Guard: Brawler", type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-guard-brawler" } } }
      ]);
    }
    await brawler.update({
      "flags.ak5e.guard": { enabled: true, version: 1 },
      "flags.ak5e.resourcePools.aggression": { value: 4, max: 4 },
      "flags.ak5e.resourcePools.unrelenting": { value: 1, max: 1 }
    });

    // 6. Duellist Guard
    let duellist = game.actors.find(a => a.name === "Irene (Duellist)");
    if (!duellist) {
      duellist = await Actor.create({
        name: "Irene (Duellist)",
        type: "character",
        system: {
          abilities: { str: { value: 12 }, dex: { value: 18 }, con: { value: 14 } },
          attributes: { hp: { value: 45, max: 45 } }
        }
      });
      await duellist.createEmbeddedDocuments("Item", [
        { name: "Guard", type: "class", system: { levels: 5 }, flags: { ak5e: { chapterThreeId: "class-guard" } } },
        { name: "Guard: Duellist", type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-guard-duellist" } } },
        { name: "Rapier", type: "weapon", system: { equipped: true, actionType: "mwak", weaponType: "martialM", properties: ["fin"] } },
        { name: "Greatsword", type: "weapon", system: { equipped: false, actionType: "mwak", weaponType: "martialM", properties: ["hvy", "two"] } }
      ]);
    }
    await duellist.update({
      "flags.ak5e.guard": { enabled: true, version: 1 },
      "flags.ak5e.resourcePools.aggression": { value: 4, max: 4 },
      "flags.ak5e.resourcePools.unrelenting": { value: 1, max: 1 },
      "flags.ak5e.resourcePools.duellistPoints": { value: 3, max: 10 }
    });

    // 7. Liberator Guard
    let liberator = game.actors.find(a => a.name === "Tequila (Liberator)");
    if (!liberator) {
      liberator = await Actor.create({
        name: "Tequila (Liberator)",
        type: "character",
        system: {
          abilities: { str: { value: 16 }, con: { value: 14 }, cha: { value: 16 } },
          attributes: { hp: { value: 45, max: 45 } }
        }
      });
      await liberator.createEmbeddedDocuments("Item", [
        { name: "Guard", type: "class", system: { levels: 5 }, flags: { ak5e: { chapterThreeId: "class-guard" } } },
        { name: "Guard: Liberator", type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-guard-liberator" } } }
      ]);
    }
    await liberator.update({
      "flags.ak5e.guard": { enabled: true, version: 1 },
      "flags.ak5e.resourcePools.aggression": { value: 4, max: 4 },
      "flags.ak5e.resourcePools.unrelenting": { value: 1, max: 1 },
      "flags.ak5e.resourcePools.liberty": { value: 3, max: 6 }
    });

    // 8. Lord Guard
    let lord = game.actors.find(a => a.name === "SilverAsh (Lord)");
    if (!lord) {
      lord = await Actor.create({
        name: "SilverAsh (Lord)",
        type: "character",
        system: {
          abilities: { str: { value: 18 }, con: { value: 14 }, cha: { value: 16 } },
          attributes: { hp: { value: 50, max: 50 } }
        }
      });
      await lord.createEmbeddedDocuments("Item", [
        { name: "Guard", type: "class", system: { levels: 5 }, flags: { ak5e: { chapterThreeId: "class-guard" } } },
        { name: "Guard: Lord", type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-guard-lord" } } }
      ]);
    }
    await lord.update({
      "flags.ak5e.guard": { enabled: true, version: 1 },
      "flags.ak5e.lord.hasAuthority": true,
      "flags.ak5e.guard.lord.hasAuthority": true,
      "flags.ak5e.resourcePools.aggression": { value: 4, max: 4 },
      "flags.ak5e.resourcePools.unrelenting": { value: 1, max: 1 },
      "flags.ak5e.resourcePools.manifestation": { value: 3, max: 3 }
    });

    // 9. Musha Guard
    let musha = game.actors.find(a => a.name === "Hellagur (Musha)");
    if (musha) await musha.delete();
    musha = await Actor.create({
      name: "Hellagur (Musha)",
      type: "character",
      system: {
        abilities: { str: { value: 16 }, dex: { value: 14 }, con: { value: 16 }, wis: { value: 14 } },
        attributes: { hp: { value: 30, max: 70 } }
      }
    });
    await musha.createEmbeddedDocuments("Item", [
      { name: "Guard", type: "class", system: { levels: 13 }, flags: { ak5e: { chapterThreeId: "class-guard" } } },
      { name: "Guard: Musha", type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-guard-musha" } } },
      { name: "Katana", type: "weapon", system: { equipped: true, actionType: "mwak", weaponType: "martialM" } }
    ]);
    await musha.update({
      "flags.ak5e.guard": { enabled: true, version: 1 },
      "flags.ak5e.resourcePools.aggression": { value: 5, max: 5 },
      "flags.ak5e.resourcePools.unrelenting": { value: 2, max: 2 },
      "flags.ak5e.guard.musha.notYetDC": 10
    });

    // 10. Reaper Guard
    let reaper = game.actors.find(a => a.name === "La Pluma (Reaper)");
    if (reaper) await reaper.delete();
    reaper = await Actor.create({
      name: "La Pluma (Reaper)",
      type: "character",
      system: {
        abilities: { str: { value: 14 }, dex: { value: 18 }, con: { value: 14 } },
        attributes: { hp: { value: 60, max: 60 } }
      }
    });
    await reaper.createEmbeddedDocuments("Item", [
      { name: "Guard", type: "class", system: { levels: 13 }, flags: { ak5e: { chapterThreeId: "class-guard" } } },
      { name: "Guard: Reaper", type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-guard-reaper" } } },
      { name: "Scythe", type: "weapon", system: { equipped: true, actionType: "mwak", weaponType: "martialM" } }
    ]);
    await reaper.update({
      "flags.ak5e.guard": { enabled: true, version: 1 },
      "flags.ak5e.resourcePools.aggression": { value: 5, max: 5 },
      "flags.ak5e.resourcePools.unrelenting": { value: 2, max: 2 },
      "flags.ak5e.resourcePools.reaperRuin": { value: 4, max: 10 }
    });

    // 11. Weaponmaster Guard
    let weaponmaster = game.actors.find(a => a.name === "Degenbrecher (Weaponmaster)");
    if (weaponmaster) await weaponmaster.delete();
    weaponmaster = await Actor.create({
      name: "Degenbrecher (Weaponmaster)",
      type: "character",
      system: {
        abilities: { str: { value: 18 }, dex: { value: 14 }, con: { value: 16 } },
        attributes: { hp: { value: 65, max: 65 } }
      }
    });
    const createdItems = await weaponmaster.createEmbeddedDocuments("Item", [
      { name: "Guard", type: "class", system: { levels: 13 }, flags: { ak5e: { chapterThreeId: "class-guard" } } },
      { name: "Guard: Weaponmaster", type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-guard-weaponmaster" } } },
      { name: "Longsword", type: "weapon", system: { equipped: true, actionType: "mwak", weaponType: "martialM", properties: ["ver"] } },
      { name: "Greatsword", type: "weapon", system: { equipped: false, actionType: "mwak", weaponType: "martialM", properties: ["hvy", "two"] } }
    ]);
    const sword = createdItems.find(i => i.name === "Longsword");
    await weaponmaster.update({
      "flags.ak5e.guard": { enabled: true, version: 1 },
      "flags.ak5e.resourcePools.aggression": { value: 5, max: 5 },
      "flags.ak5e.resourcePools.unrelenting": { value: 2, max: 2 },
      "flags.ak5e.resourcePools.judgementCut": { value: 1, max: 1 },
      "flags.ak5e.resourcePools.untouchable": { value: 2, max: 2 },
      "flags.ak5e.weaponmaster.signatureWeaponUuid": sword?.uuid,
      "flags.ak5e.weaponmaster.signatureWeaponName": "Longsword"
    });

    return {
      crusherId: crusher.id,
      centurionId: centurion.id,
      instructorId: instructor.id,
      artsbladeId: artsblade.id,
      brawlerId: brawler.id,
      duellistId: duellist.id,
      liberatorId: liberator.id,
      lordId: lord.id,
      mushaId: musha.id,
      reaperId: reaper.id,
      weaponmasterId: weaponmaster.id
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

  async function closeAllActorSheets() {
    await page.evaluate(async () => {
      for (const app of [...foundry.applications.instances.values()]) {
        if (app.document?.documentName === "Actor") {
          await app.close();
        }
      }
    });
    await page.waitForTimeout(300);
  }

  // 1. Open Crusher sheet and verify panel
  console.log("Opening Crusher sheet...");
  await closeAllActorSheets();
  await page.evaluate(id => {
    const actor = game.actors.get(id);
    actor.sheet.render(true);
  }, actorIds.crusherId);

  await page.waitForSelector(".sheet.actor", { timeout: 15000 });
  // Navigate to features tab if available
  const featuresTab = page.locator('.sheet.actor .tabs [data-tab="features"]').last();
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

  // 7. Open Artsblade sheet and verify panel
  console.log("Opening Artsblade sheet...");
  await closeAllGuardDialogs();
  await closeAllActorSheets();
  await page.evaluate(id => {
    const actor = game.actors.get(id);
    actor.sheet.render(true);
  }, actorIds.artsbladeId);
  await page.waitForSelector(".sheet.actor", { timeout: 15000 });
  const artsbladeFeaturesTab = page.locator('.sheet.actor .tabs [data-tab="features"]').last();
  if (await artsbladeFeaturesTab.isVisible()) {
    await artsbladeFeaturesTab.click();
    await page.waitForTimeout(500);
  }
  await screenshot(page, "10-artsblade-sheet-features-tab.png");

  // 8. Open Guard Controls on Artsblade
  console.log("Opening Artsblade Controls dialog...");
  await page.evaluate(id => {
    game.ak5e.guard.open(game.actors.get(id));
  }, actorIds.artsbladeId);
  await page.waitForSelector(".ak5e-guard-dialog", { timeout: 10000 });
  await screenshot(page, "11-artsblade-guard-controls-dialog.png");

  // Click Blade Art button
  console.log("Clicking Blade Art button...");
  await page.locator('button[data-guard-cmd="bladeArt"]').evaluate(b => b.click());
  await page.waitForSelector('select[name="artPool"]', { timeout: 10000 });
  await screenshot(page, "12-artsblade-blade-art-prompt.png");

  // Select Flame and confirm
  await page.selectOption('select[name="artPool"]', "flame");
  await page.locator('dialog:has(select[name="artPool"]) button[data-action="ok"]').evaluate(b => b.click());
  await page.waitForTimeout(1000);
  await screenshot(page, "13-artsblade-blade-art-card-awaiting-roll.png");

  // Roll Blade Art damage
  console.log("Rolling Blade Art damage...");
  const bladeArtRollBtn = page.locator(".ak5e-play-use-controls button", { hasText: "Roll" }).last();
  await bladeArtRollBtn.waitFor({ state: "attached", timeout: 10000 });
  await bladeArtRollBtn.evaluate(b => b.click());
  await page.waitForTimeout(1000);
  await screenshot(page, "14-artsblade-blade-art-card-rolled.png");

  // Click Cast Spellsword Art
  console.log("Clicking Cast Spellsword Art button...");
  await closeAllGuardDialogs();
  await page.evaluate(id => {
    game.ak5e.guard.open(game.actors.get(id));
  }, actorIds.artsbladeId);
  await page.waitForSelector(".ak5e-guard-dialog", { timeout: 10000 });
  await page.locator('button[data-guard-cmd="castSpellswordArt"]').evaluate(b => b.click());
  await page.waitForSelector('input[name="artName"]', { timeout: 10000 });
  await screenshot(page, "15-artsblade-cast-spellsword-art-prompt.png");

  // Submit Spellsword Art
  await page.locator('dialog:has(input[name="artName"]) button[data-action="ok"]').evaluate(b => b.click());
  await page.waitForTimeout(1000);
  await screenshot(page, "16-artsblade-spellsword-art-chat-card.png");

  // 9. Open Brawler sheet and verify panel
  console.log("Opening Brawler sheet...");
  await closeAllGuardDialogs();
  await closeAllActorSheets();
  await page.evaluate(id => {
    const actor = game.actors.get(id);
    actor.sheet.render(true);
  }, actorIds.brawlerId);
  await page.waitForSelector(".sheet.actor", { timeout: 15000 });
  const brawlerFeaturesTab = page.locator('.sheet.actor .tabs [data-tab="features"]').last();
  if (await brawlerFeaturesTab.isVisible()) {
    await brawlerFeaturesTab.click();
    await page.waitForTimeout(500);
  }
  await screenshot(page, "17-brawler-sheet-features-tab.png");

  // 10. Open Guard Controls on Brawler
  console.log("Opening Brawler Controls dialog...");
  await page.evaluate(id => {
    game.ak5e.guard.open(game.actors.get(id));
  }, actorIds.brawlerId);
  await page.waitForSelector(".ak5e-guard-dialog", { timeout: 10000 });
  await screenshot(page, "18-brawler-guard-controls-dialog.png");

  // Click Body Check
  console.log("Clicking Body Check...");
  await page.locator('button[data-guard-cmd="bodyCheck"]').evaluate(b => b.click());
  await page.waitForTimeout(1000);
  await screenshot(page, "19-brawler-body-check-card.png");

  // Click Cross Counter
  console.log("Clicking Cross Counter...");
  await closeAllGuardDialogs();
  await page.evaluate(id => {
    game.ak5e.guard.open(game.actors.get(id));
  }, actorIds.brawlerId);
  await page.waitForSelector(".ak5e-guard-dialog", { timeout: 10000 });
  await page.locator('button[data-guard-cmd="crossCounter"]').evaluate(b => b.click());
  await page.waitForTimeout(1000);
  await screenshot(page, "20-brawler-cross-counter-card.png");

  // 11. Test Undo Flow on Crusher
  console.log("Testing Undo flow...");
  await closeAllGuardDialogs();
  await page.evaluate(id => {
    game.ak5e.guard.open(game.actors.get(id));
  }, actorIds.crusherId);
  await page.waitForSelector('button[data-guard-act="__undo"]', { timeout: 10000 });
  await page.locator('button[data-guard-act="__undo"]').evaluate(b => b.click());
  await page.waitForSelector(".ak5e-play-use-choice", { timeout: 10000 });
  await screenshot(page, "21-undo-list-dialog.png");

  // Review and confirm undo
  await page.locator('dialog:has(.ak5e-play-use-choice) button[data-action="choose"]').evaluate(b => b.click());
  await page.waitForTimeout(500);
  await screenshot(page, "22-undo-review-dialog.png");

  const undoConfirmBtn = page.locator('dialog button[data-action="undo"]');
  await undoConfirmBtn.waitFor({ state: "attached", timeout: 10000 });
  await undoConfirmBtn.evaluate(b => b.click());
  await page.waitForTimeout(1000);
  await screenshot(page, "23-undo-completed-card.png");

  // 12. Open Duellist sheet and verify Features tab
  console.log("Opening Duellist sheet...");
  await closeAllGuardDialogs();
  await closeAllActorSheets();
  await page.evaluate(id => {
    const actor = game.actors.get(id);
    actor.sheet.render(true);
  }, actorIds.duellistId);
  await page.waitForSelector(".sheet.actor", { timeout: 15000 });
  const duellistFeaturesTab = page.locator('.sheet.actor .tabs [data-tab="features"]').last();
  if (await duellistFeaturesTab.isVisible()) {
    await duellistFeaturesTab.click();
    await page.waitForTimeout(500);
  }
  await screenshot(page, "24-duellist-sheet-features-tab.png");

  // 13. Open Guard Controls on Duellist
  console.log("Opening Duellist Controls dialog...");
  await page.evaluate(id => {
    game.ak5e.guard.open(game.actors.get(id));
  }, actorIds.duellistId);
  await page.waitForSelector(".ak5e-guard-dialog", { timeout: 10000 });
  await screenshot(page, "25-duellist-guard-controls-dialog.png");

  // Click Engagement button
  console.log("Clicking Engagement button...");
  await page.locator('button[data-guard-cmd="openEngagement"]').evaluate(b => b.click());
  await page.waitForSelector('select[name="engagement"]', { timeout: 10000 });
  await screenshot(page, "26-duellist-engagement-prompt.png");

  // Confirm Engagement (Balestra)
  console.log("Confirming Balestra engagement...");
  await page.selectOption('select[name="engagement"]', "balestra");
  await page.locator('dialog:has(select[name="engagement"]) button[data-action="ok"]').evaluate(b => b.click());
  await page.waitForTimeout(1000);

  // Switch to chat tab and ensure sidebar is expanded and scrolled
  await page.evaluate(() => {
    if (ui.sidebar?._collapsed) ui.sidebar.expand();
    ui.sidebar?.activateTab?.("chat");
    const log = document.querySelector("#chat-log");
    if (log) log.scrollTop = log.scrollHeight;
  });
  await screenshot(page, "27-duellist-engagement-chat-card.png");

  // 14. Open Liberator sheet and verify Features tab
  console.log("Opening Liberator sheet...");
  await closeAllGuardDialogs();
  await closeAllActorSheets();
  await page.evaluate(id => {
    const actor = game.actors.get(id);
    actor.sheet.render(true);
  }, actorIds.liberatorId);
  await page.waitForSelector(".sheet.actor", { timeout: 15000 });
  const liberatorFeaturesTab = page.locator('.sheet.actor .tabs [data-tab="features"]').last();
  if (await liberatorFeaturesTab.isVisible()) {
    await liberatorFeaturesTab.click();
    await page.waitForTimeout(500);
  }
  await screenshot(page, "28-liberator-sheet-features-tab.png");

  // 15. Open Guard Controls on Liberator
  console.log("Opening Liberator Controls dialog...");
  await page.evaluate(id => {
    game.ak5e.guard.open(game.actors.get(id));
  }, actorIds.liberatorId);
  await page.waitForSelector(".ak5e-guard-dialog", { timeout: 10000 });
  await screenshot(page, "29-liberator-guard-controls-dialog.png");

  // Click Guide the Masses
  console.log("Clicking Guide the Masses button...");
  await page.locator('button[data-guard-cmd="guideTheMasses"]').evaluate(b => b.click());
  await page.waitForSelector('select[name="mode"]', { timeout: 10000 });
  await screenshot(page, "30-liberator-guide-the-masses-prompt.png");

  // Confirm Guide the Masses
  console.log("Confirming Guide the Masses (Advocate)...");
  await page.locator('dialog:has(select[name="mode"]) button[data-action="ok"]').evaluate(b => b.click());
  await page.waitForTimeout(1000);

  await page.evaluate(() => {
    if (ui.sidebar?._collapsed) ui.sidebar.expand();
    ui.sidebar?.activateTab?.("chat");
    const log = document.querySelector("#chat-log");
    if (log) log.scrollTop = log.scrollHeight;
  });
  await screenshot(page, "31-liberator-guide-the-masses-chat-card.png");

  // Trigger Flash of Anger
  console.log("Opening Guard Controls on Liberator for Flash of Anger...");
  await closeAllGuardDialogs();
  await page.evaluate(id => {
    game.ak5e.guard.open(game.actors.get(id));
  }, actorIds.liberatorId);
  await page.waitForSelector(".ak5e-guard-dialog", { timeout: 10000 });

  console.log("Clicking Flash of Anger button...");
  await page.locator('button[data-guard-cmd="flashOfAnger"]').evaluate(b => b.click());
  await page.waitForSelector('input[name="liberty"]', { timeout: 10000 });
  await page.locator('dialog:has(input[name="liberty"]) button[data-action="ok"]').evaluate(b => b.click());
  await page.waitForTimeout(1000);

  await page.evaluate(() => {
    if (ui.sidebar?._collapsed) ui.sidebar.expand();
    ui.sidebar?.activateTab?.("chat");
    const log = document.querySelector("#chat-log");
    if (log) log.scrollTop = log.scrollHeight;
  });
  await screenshot(page, "32-liberator-flash-of-anger-card-awaiting-roll.png");

  // Click Roll button on Flash of Anger card
  console.log("Rolling Flash of Anger damage...");
  const flashRollBtn = page.locator(".ak5e-play-use-controls button", { hasText: "Roll" }).last();
  await flashRollBtn.waitFor({ state: "attached", timeout: 10000 });
  await flashRollBtn.evaluate(b => b.click());
  await page.waitForTimeout(1000);
  await screenshot(page, "33-liberator-flash-of-anger-card-rolled.png");

  // 16. Open Lord sheet and verify Features tab
  console.log("Opening Lord sheet...");
  await closeAllGuardDialogs();
  await closeAllActorSheets();
  await page.evaluate(id => {
    const actor = game.actors.get(id);
    actor.sheet.render(true);
  }, actorIds.lordId);
  await page.waitForSelector(".sheet.actor", { timeout: 15000 });
  const lordFeaturesTab = page.locator('.sheet.actor .tabs [data-tab="features"]').last();
  if (await lordFeaturesTab.isVisible()) {
    await lordFeaturesTab.click();
    await page.waitForTimeout(500);
  }
  await screenshot(page, "34-lord-sheet-features-tab.png");

  // 17. Open Guard Controls on Lord
  console.log("Opening Lord Controls dialog...");
  await page.evaluate(id => {
    game.ak5e.guard.open(game.actors.get(id));
  }, actorIds.lordId);
  await page.waitForSelector(".ak5e-guard-dialog", { timeout: 10000 });
  await screenshot(page, "35-lord-guard-controls-dialog.png");

  // Trigger Manifest Will dialog (King's Domain mode prompt)
  console.log("Clicking Manifest Will button...");
  await page.locator('button[data-guard-cmd="manifestWill"]').evaluate(b => b.click());
  await page.waitForSelector('select[name="mode"]', { timeout: 10000 });
  await screenshot(page, "36-lord-manifest-will-dialog.png");

  // Confirm Manifest Will (Castle Doctrine)
  console.log("Confirming Manifest Will (Castle Doctrine)...");
  await page.locator('dialog:has(select[name="mode"]) button[data-action="ok"]').evaluate(b => b.click());
  await page.waitForTimeout(1000);

  await page.evaluate(() => {
    if (ui.sidebar?._collapsed) ui.sidebar.expand();
    ui.sidebar?.activateTab?.("chat");
    const log = document.querySelector("#chat-log");
    if (log) log.scrollTop = log.scrollHeight;
  });
  await screenshot(page, "37-lord-manifest-will-chat-card.png");

  // Trigger Make It So
  console.log("Opening Guard Controls on Lord for Make It So...");
  await closeAllGuardDialogs();
  await page.evaluate(id => {
    game.ak5e.guard.open(game.actors.get(id));
  }, actorIds.lordId);
  await page.waitForSelector(".ak5e-guard-dialog", { timeout: 10000 });

  console.log("Clicking Make It So button...");
  await page.locator('button[data-guard-cmd="makeItSo"]').evaluate(b => b.click());
  await page.waitForSelector('select[name="rollType"]', { timeout: 10000 });
  await screenshot(page, "38-lord-make-it-so-prompt.png");

  // Confirm Make It So
  console.log("Confirming Make It So...");
  await page.locator('dialog:has(select[name="rollType"]) button[data-action="ok"]').evaluate(b => b.click());
  await page.waitForTimeout(500);

  // If warning prompt appears due to level 5 ("Make It So is a Lord level 10 feature"), accept "Use anyway" per WORKFLOW §3.2 table-play philosophy
  const anywayBtn = page.locator('dialog button[data-action="anyway"]');
  if (await anywayBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log("Accepting level warning for Make It So (Use anyway)...");
    await anywayBtn.evaluate(b => b.click());
  }
  await page.waitForTimeout(1000);

  await page.evaluate(() => {
    if (ui.sidebar?._collapsed) ui.sidebar.expand();
    ui.sidebar?.activateTab?.("chat");
    const log = document.querySelector("#chat-log");
    if (log) log.scrollTop = log.scrollHeight;
  });
  await screenshot(page, "39-lord-make-it-so-chat-card.png");

  // 18. Subclasses Undo Flow
  console.log("Testing Subclasses Undo flow on Lord Make It So card...");
  const undoCardBtn = page.locator(".ak5e-play-use-controls button", { hasText: "Undo" }).last();
  await undoCardBtn.waitFor({ state: "attached", timeout: 10000 });
  await undoCardBtn.evaluate(b => b.click());
  await page.waitForSelector('dialog button[data-action="undo"]', { timeout: 10000 });

  // Confirm undo
  console.log("Confirming undo in dialog...");
  await page.locator('dialog button[data-action="undo"]').evaluate(b => b.click());
  await page.waitForTimeout(1000);

  // Verify state reverted
  const undoVerification = await page.evaluate(id => {
    const actor = game.actors.get(id);
    const uses = game.ak5e.guard.uses(actor);
    const makeItSoUse = uses.find(u => u.title === "Make It So") ?? uses[0];
    const pool = game.ak5e.resourcePools.getPool(actor, "manifestation");
    return {
      title: makeItSoUse?.title,
      status: makeItSoUse?.status,
      manifestationValue: pool?.value
    };
  }, actorIds.lordId);
  console.log("Undo verified on Lord:", undoVerification);
  if (undoVerification.status !== "undone") {
    throw new Error(`Undo verification failed: expected status undone, got ${JSON.stringify(undoVerification)}`);
  }

  await page.evaluate(() => {
    const log = document.querySelector("#chat-log");
    if (log) log.scrollTop = log.scrollHeight;
  });
  await screenshot(page, "40-guard-subclasses-undo-flow.png");

  // ==========================================
  // BATCH 2: Musha, Reaper, Weaponmaster
  // ==========================================

  // 19. Open Musha sheet and verify Features tab
  console.log("Opening Musha sheet...");
  await closeAllGuardDialogs();
  await closeAllActorSheets();
  await page.evaluate(id => {
    const actor = game.actors.get(id);
    actor.sheet.render(true);
  }, actorIds.mushaId);
  await page.waitForSelector(".sheet.actor", { timeout: 15000 });
  const mushaFeaturesTab = page.locator('.sheet.actor .tabs [data-tab="features"]').last();
  if (await mushaFeaturesTab.isVisible()) {
    await mushaFeaturesTab.click();
    await page.waitForTimeout(500);
  }
  await screenshot(page, "41-musha-sheet-features-tab.png");

  // 20. Open Guard Controls on Musha
  console.log("Opening Musha Controls dialog...");
  await page.evaluate(id => {
    game.ak5e.guard.open(game.actors.get(id));
  }, actorIds.mushaId);
  await page.waitForSelector(".ak5e-guard-dialog", { timeout: 10000 });
  await screenshot(page, "42-musha-guard-controls-dialog.png");

  // 21. Musha Blood Price prompt
  console.log("Clicking Blood Price button...");
  const bloodPriceBtn = page.locator('button[data-guard-cmd="mushaBloodPrice"]');
  await bloodPriceBtn.waitFor({ state: "attached", timeout: 10000 });
  await bloodPriceBtn.evaluate(b => b.click());
  await page.waitForSelector('select[name="option"]', { timeout: 10000 });
  await screenshot(page, "43-musha-blood-price-prompt.png");

  // Confirm Blood Price (Center Oneself)
  console.log("Confirming Blood Price...");
  const bpOkBtn = page.locator('dialog:has(select[name="option"]) button[data-action="ok"]');
  await bpOkBtn.waitFor({ state: "attached", timeout: 10000 });
  await bpOkBtn.evaluate(b => b.click());
  await page.waitForTimeout(1000);

  await page.evaluate(() => {
    if (ui.sidebar?._collapsed) ui.sidebar.expand();
    ui.sidebar?.activateTab?.("chat");
    const log = document.querySelector("#chat-log");
    if (log) log.scrollTop = log.scrollHeight;
  });
  await screenshot(page, "44-musha-blood-price-card.png");

  // 22. Musha Soloblade
  console.log("Opening Guard Controls on Musha for Soloblade...");
  await closeAllGuardDialogs();
  await page.evaluate(id => {
    game.ak5e.guard.open(game.actors.get(id));
  }, actorIds.mushaId);
  await page.waitForSelector(".ak5e-guard-dialog", { timeout: 10000 });

  console.log("Clicking Soloblade button...");
  await page.locator('button[data-guard-cmd="mushaSoloblade"]').evaluate(b => b.click());
  await page.waitForSelector('input[name="targetName"]', { timeout: 10000 });
  await page.locator('dialog:has(input[name="targetName"]) button[data-action="ok"]').evaluate(b => b.click());
  await page.waitForTimeout(1000);

  await page.evaluate(() => {
    if (ui.sidebar?._collapsed) ui.sidebar.expand();
    ui.sidebar?.activateTab?.("chat");
    const log = document.querySelector("#chat-log");
    if (log) log.scrollTop = log.scrollHeight;
  });

  // Soloblade chat card awaits manual roll per WORKFLOW §3.2 table-play philosophy
  console.log("Rolling Soloblade healing on chat card...");
  const solobladeRollBtn = page.locator(".ak5e-play-use-controls button", { hasText: "Roll" }).last();
  await solobladeRollBtn.waitFor({ state: "attached", timeout: 10000 });
  await solobladeRollBtn.evaluate(b => b.click());
  await page.waitForTimeout(1000);
  await screenshot(page, "45-musha-soloblade-card.png");

  // 23. Open Reaper sheet and verify Features tab
  console.log("Opening Reaper sheet...");
  await closeAllGuardDialogs();
  await closeAllActorSheets();
  await page.evaluate(id => {
    const actor = game.actors.get(id);
    actor.sheet.render(true);
  }, actorIds.reaperId);
  await page.waitForSelector(".sheet.actor", { timeout: 15000 });
  const reaperFeaturesTab = page.locator('.sheet.actor .tabs [data-tab="features"]').last();
  if (await reaperFeaturesTab.isVisible()) {
    await reaperFeaturesTab.click();
    await page.waitForTimeout(500);
  }
  await screenshot(page, "46-reaper-sheet-features-tab.png");

  // 24. Open Guard Controls on Reaper
  console.log("Opening Reaper Controls dialog...");
  await page.evaluate(id => {
    game.ak5e.guard.open(game.actors.get(id));
  }, actorIds.reaperId);
  await page.waitForSelector(".ak5e-guard-dialog", { timeout: 10000 });
  await screenshot(page, "47-reaper-guard-controls-dialog.png");

  // 25. Reaper Reap prompt
  console.log("Clicking Reap button...");
  await page.locator('button[data-guard-cmd="reaperReap"]').evaluate(b => b.click());
  await page.waitForSelector('input[name="weaponName"]', { timeout: 10000 });
  await screenshot(page, "48-reaper-reap-prompt.png");

  // Confirm Reap
  console.log("Confirming Reap...");
  await page.locator('dialog:has(input[name="weaponName"]) button[data-action="ok"]').evaluate(b => b.click());
  await page.waitForTimeout(1000);

  await page.evaluate(() => {
    if (ui.sidebar?._collapsed) ui.sidebar.expand();
    ui.sidebar?.activateTab?.("chat");
    const log = document.querySelector("#chat-log");
    if (log) log.scrollTop = log.scrollHeight;
  });
  await screenshot(page, "49-reaper-reap-card.png");

  // 26. Reaper Curtainfall
  console.log("Opening Guard Controls on Reaper for Curtainfall...");
  await closeAllGuardDialogs();
  await page.evaluate(id => {
    game.ak5e.guard.open(game.actors.get(id));
  }, actorIds.reaperId);
  await page.waitForSelector(".ak5e-guard-dialog", { timeout: 10000 });

  console.log("Clicking Curtainfall button...");
  await page.locator('button[data-guard-cmd="reaperCurtainfall"]').evaluate(b => b.click());
  await page.waitForSelector('input[name="targetName"]', { timeout: 10000 });
  await page.locator('dialog:has(input[name="targetName"]) button[data-action="ok"]').evaluate(b => b.click());
  await page.waitForTimeout(1000);

  await page.evaluate(() => {
    if (ui.sidebar?._collapsed) ui.sidebar.expand();
    ui.sidebar?.activateTab?.("chat");
    const log = document.querySelector("#chat-log");
    if (log) log.scrollTop = log.scrollHeight;
  });

  // Curtainfall chat card awaits manual roll (+4d6 Ruin damage)
  console.log("Rolling Curtainfall damage on chat card...");
  const curtainfallRollBtn = page.locator(".ak5e-play-use-controls button", { hasText: "Roll" }).last();
  await curtainfallRollBtn.waitFor({ state: "attached", timeout: 10000 });
  await curtainfallRollBtn.evaluate(b => b.click());
  await page.waitForTimeout(1000);
  await screenshot(page, "50-reaper-curtainfall-card.png");

  // 27. Open Weaponmaster sheet and verify Features tab
  console.log("Opening Weaponmaster sheet...");
  await closeAllGuardDialogs();
  await closeAllActorSheets();
  await page.evaluate(id => {
    const actor = game.actors.get(id);
    actor.sheet.render(true);
  }, actorIds.weaponmasterId);
  await page.waitForSelector(".sheet.actor", { timeout: 15000 });
  const weaponmasterFeaturesTab = page.locator('.sheet.actor .tabs [data-tab="features"]').last();
  if (await weaponmasterFeaturesTab.isVisible()) {
    await weaponmasterFeaturesTab.click();
    await page.waitForTimeout(500);
  }
  await screenshot(page, "51-weaponmaster-sheet-features-tab.png");

  // 28. Open Guard Controls on Weaponmaster
  console.log("Opening Weaponmaster Controls dialog...");
  await page.evaluate(id => {
    game.ak5e.guard.open(game.actors.get(id));
  }, actorIds.weaponmasterId);
  await page.waitForSelector(".ak5e-guard-dialog", { timeout: 10000 });
  await screenshot(page, "52-weaponmaster-guard-controls-dialog.png");

  // 29. Weaponmaster Judgement Cut
  console.log("Clicking Judgement Cut button...");
  await page.locator('button[data-guard-cmd="weaponmasterJudgementCut"]').evaluate(b => b.click());
  await page.waitForSelector('input[name="targetName"]', { timeout: 10000 });
  await page.locator('dialog:has(input[name="targetName"]) button[data-action="ok"]').evaluate(b => b.click());
  await page.waitForTimeout(1000);

  await page.evaluate(() => {
    if (ui.sidebar?._collapsed) ui.sidebar.expand();
    ui.sidebar?.activateTab?.("chat");
    const log = document.querySelector("#chat-log");
    if (log) log.scrollTop = log.scrollHeight;
  });
  await screenshot(page, "53-weaponmaster-judgement-cut-card.png");

  // 30. Weaponmaster Every Part of the Weapon
  console.log("Opening Guard Controls on Weaponmaster for Every Part of the Weapon...");
  await closeAllGuardDialogs();
  await page.evaluate(id => {
    game.ak5e.guard.open(game.actors.get(id));
  }, actorIds.weaponmasterId);
  await page.waitForSelector(".ak5e-guard-dialog", { timeout: 10000 });

  console.log("Clicking Every Part of the Weapon button...");
  await page.locator('button[data-guard-cmd="weaponmasterEveryPartOfTheWeapon"]').evaluate(b => b.click());
  await page.waitForSelector('select[name="propertyKey"]', { timeout: 10000 });
  await page.selectOption('select[name="propertyKey"]', "executioner");
  await page.locator('dialog:has(select[name="propertyKey"]) button[data-action="ok"]').evaluate(b => b.click());
  await page.waitForTimeout(1000);

  await page.evaluate(() => {
    if (ui.sidebar?._collapsed) ui.sidebar.expand();
    ui.sidebar?.activateTab?.("chat");
    const log = document.querySelector("#chat-log");
    if (log) log.scrollTop = log.scrollHeight;
  });
  await screenshot(page, "54-weaponmaster-every-part-card.png");

  // 31. Weaponmaster Untouchable
  console.log("Opening Guard Controls on Weaponmaster for Untouchable...");
  await closeAllGuardDialogs();
  await page.evaluate(id => {
    game.ak5e.guard.open(game.actors.get(id));
  }, actorIds.weaponmasterId);
  await page.waitForSelector(".ak5e-guard-dialog", { timeout: 10000 });

  console.log("Clicking Untouchable button...");
  await page.locator('button[data-guard-cmd="weaponmasterUntouchable"]').evaluate(b => b.click());
  await page.waitForTimeout(1000);

  await page.evaluate(() => {
    if (ui.sidebar?._collapsed) ui.sidebar.expand();
    ui.sidebar?.activateTab?.("chat");
    const log = document.querySelector("#chat-log");
    if (log) log.scrollTop = log.scrollHeight;
  });
  await screenshot(page, "55-weaponmaster-untouchable-card.png");

  // 32. Batch 2 Undo Flow
  console.log("Testing Batch 2 Undo flow on Untouchable card...");
  const batch2UndoBtn = page.locator(".ak5e-play-use-controls button", { hasText: "Undo" }).last();
  await batch2UndoBtn.waitFor({ state: "attached", timeout: 10000 });
  await batch2UndoBtn.evaluate(b => b.click());
  await page.waitForSelector('dialog button[data-action="undo"]', { timeout: 10000 });

  // Confirm undo
  console.log("Confirming Batch 2 undo in dialog...");
  await page.locator('dialog button[data-action="undo"]').evaluate(b => b.click());
  await page.waitForTimeout(1000);

  // Verify state reverted
  const batch2UndoVerification = await page.evaluate(id => {
    const actor = game.actors.get(id);
    const uses = game.ak5e.guard.uses(actor);
    const untouchableUse = uses.find(u => u.title === "Untouchable") ?? uses[0];
    const pool = game.ak5e.resourcePools.getPool(actor, "untouchable");
    return {
      title: untouchableUse?.title,
      status: untouchableUse?.status,
      untouchableValue: pool?.value
    };
  }, actorIds.weaponmasterId);
  console.log("Undo verified on Weaponmaster:", batch2UndoVerification);
  if (batch2UndoVerification.status !== "undone") {
    throw new Error(`Batch 2 undo verification failed: expected status undone, got ${JSON.stringify(batch2UndoVerification)}`);
  }

  await page.evaluate(() => {
    const log = document.querySelector("#chat-log");
    if (log) log.scrollTop = log.scrollHeight;
  });
  await screenshot(page, "56-batch2-undo-flow.png");

  // 33. Weaponmaster Steelwind (Dualstrike)
  console.log("Opening Guard Controls on Weaponmaster for Steelwind...");
  await closeAllGuardDialogs();
  await page.evaluate(id => {
    game.ak5e.guard.open(game.actors.get(id));
  }, actorIds.weaponmasterId);
  await page.waitForSelector(".ak5e-guard-dialog", { timeout: 10000 });

  console.log("Clicking Steelwind button...");
  await page.locator('button[data-guard-cmd="weaponmasterSteelwind"]').evaluate(b => b.click());
  await page.waitForTimeout(1000);

  await page.evaluate(() => {
    const log = document.querySelector("#chat-log");
    if (log) log.scrollTop = log.scrollHeight;
  });
  await screenshot(page, "57-weaponmaster-steelwind-card.png");

  // 34. Weaponmaster Swap Fighting Style (Art of War)
  console.log("Opening Guard Controls on Weaponmaster for Swap Fighting Style...");
  await closeAllGuardDialogs();
  await page.evaluate(id => {
    game.ak5e.guard.open(game.actors.get(id));
  }, actorIds.weaponmasterId);
  await page.waitForSelector(".ak5e-guard-dialog", { timeout: 10000 });

  console.log("Clicking Exchange Fighting Style button...");
  await page.locator('button[data-guard-cmd="weaponmasterSwapFightingStyle"]').evaluate(b => b.click());
  await page.waitForSelector('select[name="styleKey"]', { timeout: 10000 });
  await page.selectOption('select[name="styleKey"]', "closeAndPersonal");
  await page.locator('dialog:has(select[name="styleKey"]) button[data-action="ok"]').evaluate(b => b.click());
  await page.waitForTimeout(1000);

  await page.evaluate(() => {
    const log = document.querySelector("#chat-log");
    if (log) log.scrollTop = log.scrollHeight;
  });
  await screenshot(page, "58-weaponmaster-swap-style-card.png");

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

