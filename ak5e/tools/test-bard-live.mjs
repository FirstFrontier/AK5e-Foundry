/**
 * Live Foundry V13 headless Playwright validation for the U5 Bard fixes (compose, perform, Emergency Improv insert, the end flow).
 * Uses launchTestBrowser() from ./test-browser.mjs per WORKFLOW.md section 5.3, and closes the browser in `finally`.
 *
 * Usage (a scratch copy of the test World served on AK5E_PORT; never a real World):
 *   AK5E_PLAYWRIGHT=/tmp/frontier-playwright/node_modules/playwright/index.mjs AK5E_PORT=30195 \
 *   AK5E_TEST_OUTPUT=<dir> node ak5e/tools/test-bard-live.mjs
 *
 * Joins as Gamemaster and as a created Player who owns a level-13 Bard (CHA 16, Lute, Bless / Healing Word / Heroism).
 *   1. compose a Performance (Muse roll by click), start it, cast the next Art over a Turn change;
 *   2. Emergency Improv: insert an Art before the cursor (the cursor keeps pointing at the Art not yet cast), then undo it;
 *   3. combat end (the GM client drives it, the Player is asked): Cancel keeps the Performance; a second end confirms,
 *      ends it with the Rising Crescendo, and the end is undone;
 *   4. a turn end with no Art cast asks the Player before the Performance ends;
 *   5. a Long Rest ends the Performance and drops the unperformed Performances.
 * Console and page errors are collected; the run fails on any. Screenshots are written next to browser-report.json.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { launchTestBrowser } from "./test-browser.mjs";

let chromium;
for (const candidate of [process.env.AK5E_PLAYWRIGHT, "/tmp/frontier-playwright/node_modules/playwright/index.mjs", "/tmp/frontier-browser-check/node_modules/playwright/index.mjs", "playwright"].filter(Boolean)) {
  try {
    const mod = await import(candidate);
    if (mod.chromium) { chromium = mod.chromium; break; }
  } catch {
    // try the next candidate
  }
}
if (!chromium) throw new Error("Could not load Playwright chromium module (set AK5E_PLAYWRIGHT).");

const port = process.env.AK5E_TEST_PORT ?? process.env.AK5E_PORT ?? "30195";
const joinUrl = `http://127.0.0.1:${port}/join`;
const outputDir = process.env.AK5E_TEST_OUTPUT ?? "/tmp/ak5e-u5-evidence";
const tag = Date.now().toString(36);
const PLAYER_NAME = `AK5e U5 Player ${tag}`;
const report = { world: null, port, steps: [], errors: [], screenshots: [], passed: false };

await mkdir(outputDir, { recursive: true });
const browser = await launchTestBrowser(chromium, process.env.AK5E_CHROMIUM ? { executablePath: process.env.AK5E_CHROMIUM } : {});

async function join(name) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1050 } });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("pageerror", error => report.errors.push(`${name}: ${error.stack ?? error.message}`));
  page.on("console", message => {
    if (message.type() !== "error" || message.text().includes("favicon.ico")) return;
    report.errors.push(`${name}: ${message.text()} @ ${JSON.stringify(message.location())}`);
  });
  await page.goto(joinUrl);
  await page.selectOption('select[name="userid"]', { label: name, timeout: 20000 });
  await page.click('button[name="join"]');
  await page.waitForFunction(() => globalThis.game?.ready && globalThis.canvas?.ready, null, { timeout: 90000 });
  await page.evaluate(async () => {
    for (const app of [...foundry.applications.instances.values()]) if (/UserConfig/.test(app.constructor?.name)) await app.close();
  });
  const safety = await page.evaluate(() => ({ world: game.world.id, system: game.system.id, isGM: game.user.isGM }));
  if (safety.system !== "dnd5e" || !/test/.test(safety.world)) throw new Error(`Refusing non-test runtime: ${JSON.stringify(safety)}`);
  report.world = safety.world;
  return page;
}

/** In-page setup, run on every client: the Bard plans, pools and hooks (the branch module registers them in production). */
const SETUP = async () => {
  const B = await import("/modules/ak5e/scripts/bard-perform.mjs");
  const C = await import("/modules/ak5e/scripts/bard-compose.mjs");
  const U = await import("/modules/ak5e/scripts/supporter-uses.mjs");
  const F = await import("/modules/ak5e/scripts/supporter-features.mjs");
  for (const plans of [B.bardPerformPlans, C.bardComposePlans]) {
    try { U.registerSupporterPlans({ plans, readings: {} }); } catch (error) { if (!/already registered/.test(error?.message ?? "")) throw error; }
  }
  for (const define of [F.defineSupporterPools, C.defineBardComposePools, B.defineBardPerformPools]) {
    try { define(); } catch (error) { if (!/already|exists|defined/i.test(error?.message ?? "")) console.warn("AK5e pool define", error?.message); }
  }
  if (!globalThis.__u5Hooks) { B.registerBardPerformHooks(); C.registerBardComposeHooks(); globalThis.__u5Hooks = true; }
  globalThis.__u5 = { B, C, U };
  globalThis.__u5Notes = [];
  for (const kind of ["warn", "error", "info"]) {
    const original = ui.notifications[kind].bind(ui.notifications);
    ui.notifications[kind] = (message, options) => { globalThis.__u5Notes.push(`${kind}: ${message}`); return original(message, options); };
  }
};

let exitCode = 0;
let gm = null, player = null;
try {
  gm = await join("Gamemaster");
  const shot = async (page, name) => {
    const path = `${outputDir}/${name}`;
    await page.screenshot({ path, fullPage: false });
    report.screenshots.push(path);
  };
  const step = async (name, fn) => {
    try {
      const value = await fn();
      report.steps.push({ name, ok: true });
      console.log(`PASS ${name}`);
      return value;
    } catch (error) {
      report.steps.push({ name, ok: false, error: error?.message ?? String(error) });
      report.notes = {
        gm: await gm.evaluate(() => globalThis.__u5Notes ?? []).catch(() => []),
        player: player ? await player.evaluate(() => globalThis.__u5Notes ?? []).catch(() => []) : []
      };
      console.error(`FAIL ${name}: ${error?.message ?? error}`);
      await shot(gm, `failure-${report.steps.length}-gm.png`).catch(() => {});
      if (player) await shot(player, `failure-${report.steps.length}-player.png`).catch(() => {});
      throw error;
    }
  };
  const showChat = async page => {
    await page.evaluate(() => { ui.sidebar?.expand?.(); ui.sidebar?.changeTab?.("chat", "primary"); });
    await page.waitForTimeout(500);
  };
  const stateOf = (page, actorId) => page.evaluate(id => {
    const actor = game.actors.get(id);
    const bard = actor.getFlag("ak5e", "bard") ?? {};
    const effect = [...actor.effects.values()].find(item => item.id === "ak5eBardCres0000");
    return {
      active: bard.active ?? null,
      performances: (bard.performances ?? []).map(item => ({ id: item.id, performed: item.performed, arts: item.arts.map(art => art.name + (art.skipped ? "*" : "")), expired: item.expired === true })),
      crescendoEffect: Boolean(effect), uses: (actor.getFlag("ak5e", "supporterUses")?.undo ?? []).map(entry => ({ id: entry.id, command: entry.command, status: entry.status })),
      prf: actor.system.skills?.prf?.value ?? null
    };
  }, actorId);
  const waitState = (page, actorId, predicate, timeout = 30000) => page.waitForFunction(([id, src]) => {
    const actor = game.actors.get(id);
    const bard = actor?.getFlag("ak5e", "bard") ?? {};
    return new Function("bard", "actor", `return (${src})(bard, actor)`)(bard, actor);
  }, [actorId, predicate], { timeout });

  /** Waits for a visible dialog that shows `needle`, then clicks the button matching `pick` (cancel included when asked). */
  const clickDialog = async (page, needle, pick, { shotName = null } = {}) => {
    await page.waitForFunction(([text, src]) => [...foundry.applications.instances.values()].some(app => app.element?.offsetParent && !app.document
      && app.element.textContent.includes(text) && [...app.element.querySelectorAll("button")].some(b => !b.disabled && new RegExp(src, "i").test(`${b.dataset.action ?? ""} ${b.textContent}`))),
    [needle, pick], { timeout: 30000 });
    if (shotName) await shot(page, shotName);
    const clicked = await page.evaluate(([text, src]) => {
      for (const app of [...foundry.applications.instances.values()].reverse()) {
        if (!app.element?.offsetParent || app.document || !app.element.textContent.includes(text)) continue;
        const button = [...app.element.querySelectorAll("button")].filter(b => !b.disabled).find(b => new RegExp(src, "i").test(`${b.dataset.action ?? ""} ${b.textContent}`));
        if (button) { button.click(); return button.dataset.action ?? button.textContent.trim(); }
      }
      return null;
    }, [needle, pick]);
    if (!clicked) throw new Error(`no button matching ${pick} in the dialog showing ${needle}`);
    await page.waitForTimeout(800);
    return clicked;
  };
  const noDialogs = async (page, needle) => {
    const open = await page.evaluate(text => [...foundry.applications.instances.values()].filter(app => app.element?.offsetParent && !app.document && app.element.textContent.includes(text)).length, needle);
    if (open) throw new Error(`an unexpected dialog showing ${needle} is open`);
  };
  const command = (page, actorId, cmd) => page.evaluate(([id, name]) => {
    globalThis.__u5.B.bardPerformCommand(game.actors.get(id), name).catch(error => console.warn("AK5e U5 command", error?.message));
  }, [actorId, cmd]);
  const turn = (kind, actorId) => gm.evaluate(async ([name, id, stamp]) => {
    const trig = await import("/modules/ak5e/scripts/trigger-events.mjs");
    await trig.emitAk5eEvent(name, { eventId: `u5-${name}-${stamp}-${Date.now()}`, actorUuid: game.actors.get(id).uuid, round: 1, turn: 0 });
  }, [kind, actorId, tag]);

  await gm.evaluate(SETUP);

  const ids = await step("create a Player user and a level-13 Bard they own, with a Lute and Bless / Healing Word / Heroism / Aid", () => gm.evaluate(async ([stamp, playerName]) => {
    const user = await User.create({ name: playerName, role: CONST.USER_ROLES.PLAYER });
    const bard = await Actor.implementation.create({
      name: `AK5E U5 Bard ${stamp}`, type: "character",
      system: { abilities: { cha: { value: 16 }, int: { value: 12 } }, details: { level: 13 }, skills: { prf: { value: 1 } } },
      ownership: { default: 0, [user.id]: 3 },
      flags: { ak5e: {
        supporter: { enabled: true, aidAbility: "cha", branch: "bard" },
        casting: { enabled: true, ability: "cha", castingUnit: "" },
        artsPoints: { value: 10, maximum: 10, maximumArtLevel: 9, ninthLevelCast: false },
        bardSetup: { done: true, instruments: ["Lute", "Flute", "Drum"], performance: "proficient" },
        bardRest: { open: true, type: "long", at: new Date().toISOString() },
        bard: { performances: [], active: null, fontDie: false, museTHP: 0 }
      } }
    });
    await bard.createEmbeddedDocuments("Item", [
      { name: "Supporter", type: "class", system: { identifier: "supporter", levels: 13 }, flags: { ak5e: { chapterThreeId: "class-supporter" } } },
      { name: "Supporter: Bard", type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-supporter-bard" } } },
      { name: "Lute", type: "tool", system: { equipped: true, proficient: 1 }, flags: { ak5e: { tableData: { properties: "Casting Unit" } } } }
    ]);
    const spell = (name, level) => {
      const activityId = foundry.utils.randomID(16);
      return { name, type: "spell", system: { level, properties: name === "Heroism" ? ["concentration"] : [], activities: { [activityId]: { _id: activityId, type: "utility",
        activation: { type: "action", value: 1 }, duration: { units: "inst" }, range: { units: "self" }, target: { affects: { type: "self" } } } } },
      flags: { ak5e: { chapterFiveId: `u5-${name.toLowerCase().replace(/\W+/g, "-")}` } } };
    };
    await bard.createEmbeddedDocuments("Item", [spell("Bless", 1), spell("Healing Word", 1), spell("Heroism", 1), spell("Aid", 2), spell("Bane", 1)]);
    return { id: bard.id, uuid: bard.uuid, userId: user.id };
  }, [tag, PLAYER_NAME]));

  player = await join(PLAYER_NAME);
  await player.evaluate(SETUP);

  await step("compose a Performance of three Arts: nothing rolls until the click, then the Muse roll is clicked", async () => {
    const before = await gm.evaluate(id => game.messages.contents.length, ids.id);
    await gm.evaluate(async ([id, stamp]) => {
      await globalThis.__u5.U.supporterUses.command(game.actors.get(id), "composePerformances",
        { confirmed: true, aidDice: 1, performances: [["Bless", "Healing Word", "Heroism"]] }, `u5-compose-${stamp}`);
    }, [ids.id, tag]);
    const rolledEarly = await gm.evaluate(([id, stamp]) => game.actors.get(id).getFlag("ak5e", "bard").performances.length, [ids.id, tag]);
    if (rolledEarly !== 0) throw new Error("the Performance was written before the Muse roll was clicked");
    await gm.evaluate(async ([id, stamp]) => {
      await globalThis.__u5.U.supporterUses.command(game.actors.get(id), "useRoll", { useId: `u5-compose-${stamp}` }, `u5-compose-roll-${stamp}`);
    }, [ids.id, tag]);
    const s = await stateOf(gm, ids.id);
    if (s.performances.length !== 1) throw new Error(`expected one Performance, got ${JSON.stringify(s.performances)}`);
    if (!(await gm.evaluate(count => game.messages.contents.length > count, before))) throw new Error("no chat card was posted");
    ids.performanceId = s.performances[0].id;
    return s;
  });
  await showChat(gm);
  await shot(gm, "u5-01-composed-card.png");

  await step("the Player puts on the Performance: the first Art (Bless) casts and the cursor moves to 1", async () => {
    await command(player, ids.id, "bardStartPerformance");
    await clickDialog(player, "Put on a Performance", "continue", { shotName: "u5-02-picker-player.png" });
    await clickDialog(player, "Put on", "confirm|put|continue|ok");
    await clickDialog(player, "Bless", "cast|use|confirm|continue|ok");
    await waitState(player, ids.id, "bard => bard.active?.index === 1");
    return stateOf(player, ids.id);
  });
  await showChat(player);
  await shot(player, "u5-03-after-first-art-player.png");

  await step("a Turn change, then the Player casts the next Art (Healing Word)", async () => {
    await turn("turnEnd", ids.id);
    await turn("turnStart", ids.id);
    await command(player, ids.id, "bardCastNextArt");
    await clickDialog(player, "Cast Healing Word", "cast|use|confirm|continue|ok");
    await clickDialog(player, "Healing Word", "cast|use|confirm|continue|ok");
    await waitState(player, ids.id, "bard => bard.active?.index === 2");
    const s = await stateOf(player, ids.id);
    if (!s.crescendoEffect) throw new Error("the second Art left no Rising Crescendo effect");
    return s;
  });

  await step("Emergency Improv inserts an Art before the cursor: the cursor shifts with it, the inserted Art is skipped, and undo restores both", async () => {
    const run = (page, name, data, useId) => page.evaluate(async ([id, cmd, payload, use]) => {
      try { await globalThis.__u5.U.supporterUses.command(game.actors.get(id), cmd, payload, use); return null; } catch (error) { return error?.message ?? String(error); }
    }, [ids.id, name, data, useId]);
    const checkId = `u5-ei-${tag}`;
    let error = await run(gm, "emergencyImprov", { confirmed: true }, checkId);
    if (error) throw new Error(`emergencyImprov: ${error}`);
    error = await run(gm, "useRoll", { useId: checkId }, `${checkId}-roll`);
    if (error) throw new Error(`check roll: ${error}`);
    const followId = `u5-ei-ins-${tag}`;
    error = await run(gm, "emergencyImprovAid", { confirmed: true, mode: "insert", art: "Bane", index: 1, checkUseId: checkId, overrides: ["checkFailed", "beforeCursor", "consecutive"] }, followId);
    if (error) throw new Error(`insert: ${error}`);
    error = await run(gm, "useRoll", { useId: followId }, `${followId}-roll`);
    if (error) throw new Error(`insert roll: ${error}`);
    const s = await stateOf(gm, ids.id);
    const live = s.performances.find(item => item.id === ids.performanceId);
    if (live.arts.join(",") !== "Bless,Bane*,Healing Word,Heroism") throw new Error(`Arts after the insert: ${live.arts.join(",")}`);
    if (s.active.index !== 3) throw new Error(`the cursor is ${s.active.index}, expected 3 (still on Heroism)`);
    await showChat(gm);
    await shot(gm, "u5-04-improv-insert-card.png");
    error = await gm.evaluate(async ([id, useId]) => { try { await globalThis.__u5.U.supporterUses.undo(game.actors.get(id), useId); return null; } catch (e) { return e.message; } }, [ids.id, followId]);
    if (error) throw new Error(`undo of the insert: ${error}`);
    const undone = await stateOf(gm, ids.id);
    const after = undone.performances.find(item => item.id === ids.performanceId);
    if (after.arts.join(",") !== "Bless,Healing Word,Heroism") throw new Error(`Arts after undo: ${after.arts.join(",")}`);
    if (undone.active.index !== 2) throw new Error(`the cursor after undo is ${undone.active.index}, expected 2`);
    return undone;
  });

  await step("combat end (GM client): the Player is asked; Cancel keeps the Performance", async () => {
    await gm.evaluate(async ([id, stamp]) => {
      const trig = await import("/modules/ak5e/scripts/trigger-events.mjs");
      void trig.emitAk5eEvent("combatEnd", { eventId: `u5-combatEnd-${stamp}-1`, combatUuid: `Combat.u5-${stamp}`, round: 2, turn: null, actorUuids: [game.actors.get(id).uuid] });
    }, [ids.id, tag]);
    await clickDialog(player, "Performance ends", "cancel", { shotName: "u5-05-combat-end-prompt-player.png" });
    await gm.waitForTimeout(1500);
    const s = await stateOf(gm, ids.id);
    if (!s.active) throw new Error("Cancel did not keep the Performance");
    return s;
  });

  await step("combat end again: the Player confirms; the Performance and its Rising Crescendo end, and undo returns them", async () => {
    await gm.evaluate(async ([id, stamp]) => {
      const trig = await import("/modules/ak5e/scripts/trigger-events.mjs");
      void trig.emitAk5eEvent("combatEnd", { eventId: `u5-combatEnd-${stamp}-2`, combatUuid: `Combat.u5-${stamp}-b`, round: 3, turn: null, actorUuids: [game.actors.get(id).uuid] });
    }, [ids.id, tag]);
    // Heroism has not been cast yet, so no Art holds Concentration: the prompt is the plain confirm.
    await clickDialog(player, "Performance ends", "confirm|end|none", { shotName: "u5-06-combat-end-confirm-player.png" });
    await waitState(player, ids.id, "bard => bard.active === null");
    const s = await stateOf(gm, ids.id);
    if (s.crescendoEffect) throw new Error("the Rising Crescendo outlived the Performance");
    const endUse = s.uses.filter(entry => entry.command === "endPerformance").at(-1);
    if (!endUse) throw new Error("the end was not recorded as a use");
    await showChat(gm);
    await shot(gm, "u5-07-combat-end-card.png");
    const error = await gm.evaluate(async ([id, useId]) => { try { await globalThis.__u5.U.supporterUses.undo(game.actors.get(id), useId); return null; } catch (e) { return e.message; } }, [ids.id, endUse.id]);
    if (error) throw new Error(`undo of the end: ${error}`);
    const undone = await stateOf(gm, ids.id);
    if (!undone.active) throw new Error("undo did not return the Performance");
    if (!undone.crescendoEffect) throw new Error("undo did not return the Rising Crescendo");
    return undone;
  });

  await step("a Turn end with no Art cast asks the Player first; Cancel keeps the Performance, Keep none ends it", async () => {
    await turn("turnStart", ids.id);
    await turn("turnEnd", ids.id);
    await clickDialog(player, "Performance ends", "cancel", { shotName: "u5-08-turn-end-prompt-player.png" });
    await gm.waitForTimeout(1200);
    if (!(await stateOf(gm, ids.id)).active) throw new Error("Cancel at the turn end did not keep the Performance");
    await turn("turnStart", ids.id);
    await turn("turnEnd", ids.id);
    await clickDialog(player, "Performance ends", "confirm|end|none");
    await waitState(player, ids.id, "bard => bard.active === null");
    const s = await stateOf(gm, ids.id);
    if (!s.performances.find(item => item.id === ids.performanceId)?.performed) throw new Error("the ended Performance is not marked performed (No Encore)");
    return s;
  });

  await step("a Long Rest drops the unperformed Performances; a running Performance ends with it", async () => {
    // A second Performance, started and running, plus one still unperformed.
    await gm.evaluate(async ([id, stamp]) => {
      const actor = game.actors.get(id);
      const bard = foundry.utils.deepClone(actor.getFlag("ak5e", "bard"));
      const make = (pid, performed) => ({ id: pid, performed, composedAt: Date.now(), arts: ["Bless", "Healing Word", "Aid"].map(name => ({ name, muse: 1, manual: false })) });
      bard.performances.push(make(`P-run-${stamp}`, true), make(`P-unperformed-${stamp}`, false));
      bard.active = { performanceId: `P-run-${stamp}`, index: 1, crescendo: 0, castsThisTurn: 1 };
      await actor.setFlag("ak5e", "bard", bard);
    }, [ids.id, tag]);
    await player.evaluate(id => { void game.actors.get(id).longRest({ dialog: false, chat: true, newDay: false }); }, ids.id);
    await clickDialog(player, "Performance ends", "confirm|end|none", { shotName: "u5-09-long-rest-prompt-player.png" });
    await waitState(player, ids.id, "bard => bard.active === null");
    await gm.waitForTimeout(1500);
    const s = await stateOf(gm, ids.id);
    if (s.performances.some(item => item.id.startsWith("P-unperformed"))) throw new Error("the unperformed Performance survived the Long Rest");
    if (!s.performances.some(item => item.id.startsWith("P-run"))) throw new Error("the performed Performance was dropped");
    return s;
  });
  await showChat(gm);
  await shot(gm, "u5-10-long-rest-chat-gm.png");
  await player.evaluate(id => game.actors.get(id).sheet.render({ force: true }), ids.id);
  await player.waitForTimeout(1500);
  await shot(player, "u5-11-bard-sheet-player.png");

  report.passed = report.steps.every(item => item.ok) && report.errors.length === 0;
} catch (error) {
  report.errors.push(`scenario: ${error?.stack ?? error}`);
  exitCode = 1;
} finally {
  await writeFile(`${outputDir}/browser-report.json`, JSON.stringify(report, null, 2));
  await browser.close().catch(() => {});
}
console.log(JSON.stringify({ passed: report.passed, steps: report.steps.length, errors: report.errors.length, screenshots: report.screenshots }, null, 2));
process.exit(exitCode || (report.passed ? 0 : 1));
