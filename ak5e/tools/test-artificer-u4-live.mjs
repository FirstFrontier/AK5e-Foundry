/**
 * Live Foundry V13 headless Playwright validation for the Supporter base class and Artificer fixes (U4, Sonnet pass).
 * Uses launchTestBrowser() from ./test-browser.mjs per WORKFLOW.md §5.3, and closes the browser in `finally`.
 *
 * Usage (Foundry serving the scratch World on AK5E_PORT):
 *   AK5E_PLAYWRIGHT=/tmp/frontier-browser-check/node_modules/playwright/index.mjs AK5E_PORT=30194 \
 *   AK5E_TEST_OUTPUT=<dir> node ak5e/tools/test-artificer-u4-live.mjs
 *
 * A Gamemaster client and a Player client are both connected, so the relay runs for real. The Player owns a level-13
 * Artificer; the creatures it changes are not owned by the Player.
 *   1. Build Automaton as the Player (confirmed): the GM client creates it with HP 25 + the INT reading.
 *   2. A forged build request asking for 9999 HP creates an Automaton with the recomputed HP.
 *   3. A forged receipt that points a revert at an unowned creature is refused and writes nothing.
 *   4. Expend an Aid Die on a Healing Roll, click-roll it, grant Temporary HP to an unowned creature (relayed), undo it.
 *   5. The GM-side relay refuses a Temporary HP grant above what the Aid Die rolled.
 *   6. Undo of the build removes the Automaton (relayed).
 * Every step writes a screenshot. Console and page errors are collected; the run passes only with none.
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

const port = process.env.AK5E_TEST_PORT ?? process.env.AK5E_PORT ?? "30194";
const base = `http://127.0.0.1:${port}/join`;
const outputDir = process.env.AK5E_TEST_OUTPUT ?? "/tmp/ak5e-u4-evidence";
const runTag = Date.now().toString(36);
const playerName = `U4 Player ${runTag}`;

const report = { port, steps: [], errors: [], screenshots: [], passed: false };

await mkdir(outputDir, { recursive: true });
const browser = await launchTestBrowser(chromium, {
  ...(process.env.AK5E_CHROMIUM ? { executablePath: process.env.AK5E_CHROMIUM } : {})
});

let exitCode = 0;
try {
  const gm = await joinAs("Gamemaster", "gm");
  const shot = async (page, name) => {
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
      await shot(gm, `failure-${report.steps.length}.png`).catch(() => {});
      throw error;
    }
  };

  const ids = await step("GM creates a Player user, an Artificer the Player owns, and two creatures it does not own", () => gm.evaluate(async ({ tag, playerName }) => {
    const user = await User.implementation.create({ name: playerName, role: CONST.USER_ROLES.PLAYER });
    const art = await Actor.implementation.create({
      name: `U4 Artificer ${tag}`, type: "character", ownership: { default: 0, [user.id]: 3 },
      system: { abilities: { int: { value: 16 }, con: { value: 10 } }, attributes: { hp: { value: 30, max: 30 } } },
      flags: { ak5e: { supporter: { enabled: true, aidAbility: "int", branch: "artificer" } } }
    });
    await art.createEmbeddedDocuments("Item", [
      { name: "Supporter", type: "class", system: { identifier: "supporter", levels: 13 }, flags: { ak5e: { chapterThreeId: "class-supporter" } } },
      { name: "Supporter: Artificer", type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-supporter-artificer" } } }
    ]);
    const foe = await Actor.implementation.create({ name: `U4 Foe ${tag}`, type: "npc", system: { attributes: { hp: { value: 30, max: 30, temp: 0 } } } });
    const hurt = await Actor.implementation.create({ name: `U4 Hurt ${tag}`, type: "npc", system: { attributes: { hp: { value: 5, max: 30, temp: 0 } } } });
    return { userId: user.id, art: art.id, artUuid: art.uuid, foe: foe.uuid, hurt: hurt.uuid };
  }, { tag: runTag, playerName }));

  const player = await joinAs(playerName, "player");

  await step("Player: Build Automaton (confirmed) relays to the GM client; HP is 25 + the INT modifier", async () => {
    const result = await player.evaluate(async ({ art }) => {
      const U = await import("/modules/ak5e/scripts/supporter-uses.mjs");
      const actor = game.actors.get(art);
      const opId = `u4-build-${Date.now()}`;
      await U.supporterUses.execute(actor, "buildAutomaton", { variant: "platform", technologyModifier: "intMod", confirmed: true }, opId);
      const receipt = U.supporterUses.receipt(actor, opId);
      const target = receipt.targets.find(entry => entry.kind === "artificerAutomaton");
      const created = await fromUuid(target.uuid);
      return { opId, uuid: target.uuid, hpMax: created?.system?.attributes?.hp?.max ?? null, exists: Boolean(created) };
    }, { art: ids.art });
    report.build = result;
    if (!result.exists) throw new Error("the Automaton was not created");
    if (result.hpMax !== 25 + 3) throw new Error(`expected 28 HP, got ${result.hpMax}`);
    ids.buildOp = result.opId; ids.automaton = result.uuid;
  });
  await showChat(player);
  await shot(player, "u4-01-player-build.png");

  await step("a forged build request asking for 9999 HP creates an Automaton with the recomputed HP", async () => {
    const result = await player.evaluate(async ({ art }) => {
      const A = await import("/modules/ak5e/scripts/artificer-features.mjs");
      const actor = game.actors.get(art);
      const automatonId = foundry.utils.randomID();
      await A.artificerRelay.submit(actor, "createAutomaton", { confirmation: true, variant: "platform", automatonId,
        stats: { technologyModifier: "intMod", hpMax: 9999, pb: 99, attackBonus: 99 } }, `u4-forged-${Date.now()}`);
      const created = game.actors.get(automatonId);
      return { exists: Boolean(created), hpMax: created?.system?.attributes?.hp?.max ?? null };
    }, { art: ids.art });
    report.forgedStats = result;
    if (!result.exists) throw new Error("the relay did not create the Automaton");
    if (result.hpMax !== 28) throw new Error(`the client's 9999 HP was trusted: ${result.hpMax}`);
  });

  await step("a forged receipt cannot make the GM revert hit points on an unowned creature", async () => {
    const result = await player.evaluate(async ({ art, foe }) => {
      const U = await import("/modules/ak5e/scripts/supporter-uses.mjs");
      const actor = game.actors.get(art);
      const state = U.supporterUses.state(actor);
      state.undo.push({ id: "u4-forged-revert", command: "rebuildAutomaton", status: "complete", createdAt: Date.now(), summary: "forged", userId: game.user.id,
        targets: [{ kind: "artificerFields", uuid: foe, name: "Foe", applied: true, ready: true,
          set: { "system.attributes.hp.value": 25 }, before: { "system.attributes.hp.value": 1 } }] });
      await actor.update({ "flags.ak5e.supporterUses": state });
      let error = null;
      try { await U.supporterUses.undo(actor, "u4-forged-revert"); } catch (caught) { error = caught?.message ?? String(caught); }
      const target = await fromUuid(foe);
      return { error, hp: target.system.attributes.hp.value };
    }, { art: ids.art, foe: ids.foe });
    report.forgedRevert = result;
    if (!result.error) throw new Error("the forged revert was accepted");
    if (result.hp !== 30) throw new Error(`the unowned creature's hit points changed to ${result.hp}`);
  });

  await step("Player: Aid Die on a Healing Roll, click-roll, Temporary HP to an unowned creature (relayed), then undo", async () => {
    const result = await player.evaluate(async ({ art, hurt }) => {
      const U = await import("/modules/ak5e/scripts/supporter-uses.mjs");
      const actor = game.actors.get(art);
      const useId = `u4-aid-${Date.now()}`;
      await U.supporterUses.execute(actor, "useAidDie", { rollType: "healing", dieSize: "d10", confirmed: true, overrides: ["noAidDie", "emptyPool", "shortfall"] }, useId);
      const rolled = foundry.utils.randomID();
      await U.supporterUses.command(actor, "useRoll", { useId }, rolled);
      const roll = U.supporterUses.receipt(actor, useId).roll;
      const tempOp = `u4-temp-${Date.now()}`;
      const target = await fromUuid(hurt);
      await U.supporterUses.execute(actor, "aidTempHP", { targetUuid: target.uuid, targetName: target.name, amount: Number(roll), useId, confirmed: true }, tempOp);
      const granted = (await fromUuid(hurt)).system.attributes.hp.temp;
      await U.supporterUses.undo(actor, tempOp);
      const restored = (await fromUuid(hurt)).system.attributes.hp.temp;
      return { useId, roll, granted, restored };
    }, { art: ids.art, hurt: ids.hurt });
    report.tempHP = result;
    ids.aidUse = result.useId; ids.aidRoll = result.roll;
    if (!(result.roll >= 1)) throw new Error(`no Aid Die roll recorded: ${JSON.stringify(result)}`);
    if (result.granted !== result.roll) throw new Error(`Temporary HP ${result.granted} does not match the roll ${result.roll}`);
    if (result.restored !== 0) throw new Error(`undo left Temporary HP ${result.restored}`);
  });
  await showChat(player);
  await shot(player, "u4-02-player-temp-hp.png");

  await step("GM relay refuses a Temporary HP grant above what the Aid Die rolled, and writes nothing", async () => {
    const result = await gm.evaluate(async ({ artUuid, hurt, aidUse, aidRoll }) => {
      const U = await import("/modules/ak5e/scripts/supporter-uses.mjs");
      const actor = await fromUuid(artUuid);
      const amount = Math.min(18, Number(aidRoll) + 5);
      const state = U.supporterUses.state(actor);
      state.undo.push({ id: "u4-forged-temp", command: "aidTempHP", status: "complete", createdAt: Date.now(), summary: "forged", userId: game.user.id,
        parentUseId: aidUse, result: { amount },
        targets: [{ kind: "tempHP", uuid: hurt, name: "Hurt", amount, mode: "replace", ready: true }] });
      await actor.update({ "flags.ak5e.supporterUses": state });
      let error = null;
      try { await U.supporterUses.relayedTargetChange(actor, "apply", { useId: "u4-forged-temp", targetUuid: hurt }, game.user); }
      catch (caught) { error = caught?.message ?? String(caught); }
      return { error, temp: (await fromUuid(hurt)).system.attributes.hp.temp };
    }, { artUuid: ids.artUuid, hurt: ids.hurt, aidUse: ids.aidUse, aidRoll: ids.aidRoll });
    report.forgedTemp = result;
    if (!result.error) throw new Error("the oversized grant was accepted");
    if (result.temp !== 0) throw new Error(`Temporary HP changed to ${result.temp}`);
  });
  await showChat(gm);
  await shot(gm, "u4-03-gm-chat.png");

  await step("Player: undo of the build removes the Automaton (relayed)", async () => {
    const result = await player.evaluate(async ({ art, buildOp, automaton }) => {
      const U = await import("/modules/ak5e/scripts/supporter-uses.mjs");
      const actor = game.actors.get(art);
      await U.supporterUses.undo(actor, buildOp);
      return { exists: Boolean(await fromUuid(automaton)) };
    }, { art: ids.art, buildOp: ids.buildOp, automaton: ids.automaton });
    if (result.exists) throw new Error("the Automaton still exists after undo");
  });
  await showChat(player);
  await shot(player, "u4-04-player-undo.png");

  report.consoleErrors = report.errors.length;
  report.passed = report.steps.every(s => s.ok) && report.errors.length === 0;
} catch (error) {
  report.errors.push(`scenario: ${error?.stack ?? error}`);
  exitCode = 1;
} finally {
  await writeFile(`${outputDir}/browser-report.json`, JSON.stringify(report, null, 2));
  await browser.close().catch(() => {});
}
console.log(JSON.stringify({ passed: report.passed, steps: report.steps.length, errors: report.errors.length, screenshots: report.screenshots }, null, 2));
process.exit(exitCode || (report.passed ? 0 : 1));

async function joinAs(name, label) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1050 } });
  const page = await context.newPage();
  page.on("pageerror", error => { report.errors.push(`${label}: ${error.stack ?? error.message}`); });
  page.on("console", message => {
    if (message.type() !== "error" || message.text().includes("favicon.ico")) return;
    report.errors.push(`${label}: ${message.text()}`);
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
      if (app.constructor?.name === "DialogV2") await app.close().catch(() => {});
    }
    if (ui.sidebar?._collapsed) ui.sidebar.expand();
    ui.sidebar?.activateTab?.("chat");
    const log = document.querySelector("#chat-log");
    if (log) log.scrollTop = log.scrollHeight;
  });
  await page.waitForTimeout(1200);
}
