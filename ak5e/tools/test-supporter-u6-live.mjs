/** Disposable Foundry 13 / D&D5e live check for Artificer Heavy Duty Upgrades (U6).
 * Joins as Gamemaster in the disposable `standard-test` World only, creates a level-17 Artificer (INT 16) and a turret
 * Automaton (plain NPC with the contract flag), installs Arbalest and Flamethrower, posts a Flamethrower use card,
 * confirms the card has a DEX save button and a roll button and that nothing was rolled, undoes the use, collects
 * console errors and screenshots each step.
 * Env: AK5E_PLAYWRIGHT (path to playwright index.mjs), AK5E_PORT (default 30186), AK5E_TEST_OUTPUT (screenshot dir),
 * AK5E_CHROMIUM (optional executable). Uses launchTestBrowser() from test-browser.mjs. */
import { mkdir, writeFile } from "node:fs/promises";
import { join as joinPath } from "node:path";
import { launchTestBrowser } from "./test-browser.mjs";

const { chromium } = await import(process.env.AK5E_PLAYWRIGHT ?? "playwright");
const browser = await launchTestBrowser(chromium, process.env.AK5E_CHROMIUM ? { executablePath: process.env.AK5E_CHROMIUM } : {});
const port = process.env.AK5E_PORT ?? "30186";
const outputDir = process.env.AK5E_TEST_OUTPUT ?? "/tmp/ak5e-supporter-u6-live";
const report = { world: "standard-test", port, errors: [], screenshots: [], checks: [], ids: {} };
await mkdir(outputDir, { recursive: true });

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function shot(page, key) {
  const path = joinPath(outputDir, `${key}.png`);
  await page.evaluate(() => { ui.sidebar?.activateTab?.("chat"); }).catch(() => {});
  await sleep(800);
  await page.screenshot({ path, fullPage: false });
  report.screenshots.push(path);
  return path;
}

async function check(name, task) {
  try {
    const detail = await task();
    report.checks.push({ name, ok: true, detail: detail ?? null });
    console.log(`PASS ${name}`);
  } catch (error) {
    report.checks.push({ name, ok: false, error: error.message });
    console.log(`FAIL ${name}: ${error.message}`);
  }
}

const context = await browser.newContext({ viewport: { width: 1600, height: 1050 } });
const page = await context.newPage();
page.setDefaultTimeout(25000);
page.on("pageerror", error => report.errors.push(`pageerror: ${error.stack ?? error.message}`));
page.on("console", message => { if (message.type() === "error") report.errors.push(`console: ${message.text()}`); });

try {
  await page.goto(`http://127.0.0.1:${port}/join`);
  await page.selectOption('select[name="userid"]', { label: "Gamemaster", timeout: 20000 });
  await page.click('button[name="join"]');
  await page.waitForFunction(() => globalThis.game?.ready === true, null, { timeout: 90000 });
  await page.evaluate(() => { for (const app of foundry.applications.instances.values()) if (/UserConfig/.test(app.constructor.name)) void app.close(); });

  const worldId = await page.evaluate(() => game.world.id);
  if (worldId !== "standard-test") throw new Error(`Refusing World ${worldId}; only the disposable standard-test World is allowed.`);
  await check("join: module ak5e is active and the World is standard-test", () => page.evaluate(() => {
    if (game.modules.get("ak5e")?.active !== true) throw new Error("ak5e is not active");
    return { foundry: game.version, system: game.system.version };
  }));

  // Fixtures: a level-17 Artificer with INT 16, and a turret Automaton carrying the contract flag.
  const fixtures = await page.evaluate(async () => {
    const suffix = foundry.utils.randomID().slice(0, 6);
    const artificer = await Actor.implementation.create({
      name: `U6 Artificer ${suffix}`, type: "character",
      system: { abilities: { int: { value: 16 } } },
      items: [
        { name: "Supporter", type: "class", system: { levels: 17 }, flags: { ak5e: { chapterThreeId: "class-supporter" } } },
        { name: "Artificer", type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-supporter-artificer" } } }
      ],
      flags: { ak5e: { supporter: { enabled: true, branch: "artificer", aidAbility: "int" } } }
    });
    const automaton = await Actor.implementation.create({
      name: `U6 Turret ${suffix}`, type: "npc",
      flags: { ak5e: { automaton: { creator: artificer.uuid, variant: "turret", upgrades: [], personality: null, destroyed: false } } }
    });
    await artificer.update({ "flags.ak5e.artificer": { automatons: [automaton.uuid], covers: [] } });
    const goblin = await Actor.implementation.create({ name: `U6 Goblin ${suffix}`, type: "npc" });
    return { artificerId: artificer.id, artificerUuid: artificer.uuid, automatonId: automaton.id, automatonUuid: automaton.uuid, goblinUuid: goblin.uuid, suffix };
  });
  report.ids = fixtures;

  // Load the U6 module into the page and register its plans, as the branch module will at ready.
  await page.evaluate(async () => {
    const Engine = await import("/modules/ak5e/scripts/supporter-uses.mjs");
    const Upgrades = await import("/modules/ak5e/scripts/artificer-upgrades.mjs");
    Engine.registerSupporterPlans({ plans: Upgrades.artificerUpgradePlans });
    Upgrades.defineArtificerUpgradePools();
    Upgrades.registerArtificerUpgradeHooks();
    globalThis.__u6 = { Engine, Upgrades };
  });
  await shot(page, "01-fixtures");

  await check("install: Flamethrower and Arbalest install on the turret, and the Automaton flags show them", () => page.evaluate(async ({ artificerUuid, automatonUuid, automatonId }) => {
    const { Engine } = globalThis.__u6;
    const artificer = game.actors.get(artificerUuid.split(".").pop());
    const automaton = game.actors.get(automatonId);
    await Engine.supporterUses.execute(artificer, "installUpgrade", { automatonUuid, upgradeId: "flamethrower", timing: "creation" }, "u6-live-install-1");
    await Engine.supporterUses.execute(artificer, "installUpgrade", { automatonUuid, upgradeId: "arbalest", timing: "creation" }, "u6-live-install-2");
    const flags = automaton.getFlag("ak5e", "automaton");
    if (JSON.stringify(flags.upgrades) !== JSON.stringify(["flamethrower", "arbalest"])) throw new Error(`upgrades are ${JSON.stringify(flags.upgrades)}`);
    return flags;
  }, fixtures));
  await shot(page, "02-installed");

  const before = await page.evaluate(() => game.messages.size);
  await check("use: Flamethrower posts a card with a DEX save button and a roll button; nothing is rolled", () => page.evaluate(async ({ artificerUuid, automatonUuid, goblinUuid, automatonId }) => {
    const { Engine } = globalThis.__u6;
    const artificer = game.actors.get(artificerUuid.split(".").pop());
    await Engine.supporterUses.execute(artificer, "useUpgrade", { automatonUuid, upgradeId: "flamethrower", targets: [goblinUuid] }, "u6-live-use-1");
    const automaton = game.actors.get(automatonId);
    const spent = automaton.getFlag("ak5e", "automaton").upgradeUses?.flamethrower?.used;
    if (spent !== 1) throw new Error(`Flamethrower uses used = ${spent}, expected 1`);
    return { useId: "u6-live-use-1" };
  }, fixtures).then(async detail => {
    const cards = await page.evaluate(({ before }) => {
      const all = Array.from(game.messages.values?.() ?? game.messages.contents ?? []);
      return all.slice(before).map(m => ({ content: m.content ?? "", rolls: (m.rolls ?? []).length }));
    }, { before });
    const card = cards.find(c => /data-ak5e-upgrade-save="dex"/.test(c.content));
    if (!card) throw new Error("no DEX save button on the card");
    if (!/data-ak5e-upgrade-roll="3d12"/.test(card.content)) throw new Error("no 3d12 roll button on the card");
    const rolled = cards.reduce((sum, c) => sum + c.rolls, 0);
    if (rolled !== 0) throw new Error(`${rolled} roll(s) were posted when the card was created`);
    return { ...detail, cardMessages: cards.length, rollsPosted: rolled };
  }));
  await shot(page, "03-flamethrower-card");

  await check("undo: undoing the Flamethrower use restores its use", () => page.evaluate(async ({ artificerUuid, automatonId }) => {
    const { Engine } = globalThis.__u6;
    const artificer = game.actors.get(artificerUuid.split(".").pop());
    await Engine.supporterUses.undo(artificer, "u6-live-use-1");
    const automaton = game.actors.get(automatonId);
    const used = automaton.getFlag("ak5e", "automaton").upgradeUses?.flamethrower?.used ?? 0;
    if (used !== 0) throw new Error(`used = ${used} after undo`);
    return { used };
  }, fixtures));
  await shot(page, "04-undone");

  await page.evaluate(id => { game.actors.get(id).sheet.render(true); }, fixtures.automatonId).catch(() => {});
  await sleep(2500);
  await shot(page, "05-automaton-sheet");

  report.consoleErrors = report.errors.length;
} catch (error) {
  report.checks.push({ name: "run", ok: false, error: error.message });
  console.log(`FAIL run: ${error.message}`);
} finally {
  await writeFile(joinPath(outputDir, "u6-live-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ checks: report.checks, screenshots: report.screenshots, consoleErrors: report.errors }, null, 2));
  await browser.close();
  process.exitCode = report.checks.length && report.checks.every(c => c.ok) ? 0 : 1;
}
