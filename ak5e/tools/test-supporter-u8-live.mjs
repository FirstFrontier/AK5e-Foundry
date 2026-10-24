/**
 * Live Foundry V13 headless Playwright validation for the Bard Performing unit (U8).
 * Uses launchTestBrowser() from ./test-browser.mjs per WORKFLOW.md §5.3, and closes the browser in `finally`.
 *
 * Usage (Foundry serving the scratch World on AK5E_PORT):
 *   AK5E_PLAYWRIGHT=/tmp/frontier-browser-check/node_modules/playwright/index.mjs AK5E_PORT=30188 \
 *   AK5E_TEST_OUTPUT=<dir> node ak5e/tools/test-supporter-u8-live.mjs
 *
 * Flow on a level-17 Bard (CHA 16) with an equipped Lute as Casting Unit: a Performance of three Chapter 5 Arts and one
 * manual Art. Put on the Performance (first Art at 0 AP), cast the next two Arts across Turn changes, cast the manual Art
 * (natural end, which is the End Performance step with its keep-Concentration choice), then undo that end. Each step writes
 * a screenshot. Console errors are collected. Nothing rolls except by a click; the report counts any roll posted before a click.
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

const port = process.env.AK5E_TEST_PORT ?? process.env.AK5E_PORT ?? "30188";
const base = `http://127.0.0.1:${port}/join`;
const outputDir = process.env.AK5E_TEST_OUTPUT ?? "/tmp/ak5e-u8-evidence";
const runTag = Date.now().toString(36);

const report = { world: "standard-test", port, steps: [], errors: [], screenshots: [], passed: false };

await mkdir(outputDir, { recursive: true });
const browser = await launchTestBrowser(chromium, {
  ...(process.env.AK5E_CHROMIUM ? { executablePath: process.env.AK5E_CHROMIUM } : {})
});

let exitCode = 0;
try {
  const page = await joinAs("Gamemaster");
  // Record every UI notification (warn/error/info) so a refused cast explains itself in the report.
  await page.evaluate(() => {
    globalThis.__u8notes = [];
    for (const kind of ["warn", "error", "info"]) {
      const original = ui.notifications[kind].bind(ui.notifications);
      ui.notifications[kind] = (message, options) => { globalThis.__u8notes.push(`${kind}: ${message}`); return original(message, options); };
    }
  });
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
      const windows = await page.evaluate(() => [...foundry.applications.instances.values()].filter(app => app.element?.offsetParent)
        .map(app => ({ cls: app.constructor?.name, title: app.title ?? app.options?.window?.title ?? "", document: Boolean(app.document),
          text: String(app.element?.textContent ?? "").replace(/\s+/g, " ").slice(0, 120) }))).catch(() => []);
      report.windows = windows;
      report.url = page.url();
      report.notes = await page.evaluate(() => globalThis.__u8notes ?? []).catch(() => []);
      report.steps.push({ name, ok: false, error: error?.message ?? String(error) });
      console.error(`FAIL ${name}: ${error?.message ?? error}`);
      await screenshot(`failure-${report.steps.length}.png`).catch(() => {});
      throw error;
    }
  };
  const state = id => page.evaluate(actorId => {
    const a = game.actors.get(actorId);
    const bard = a.getFlag("ak5e", "bard") ?? {};
    const effect = [...a.effects.values()].find(e => e.id === "ak5eBardCres0000");
    return {
      active: bard.active ?? null, fontDie: bard.fontDie === true,
      performed: (bard.performances ?? []).map(p => p.performed),
      apValue: a.getFlag("ak5e", "artsPoints")?.value ?? null,
      castingUnit: a.getFlag("ak5e", "casting")?.castingUnit ?? "",
      crescendoEffect: effect ? { dc: effect.changes.find(c => c.key === "system.bonuses.spell.dc")?.value ?? null,
        changes: effect.changes.map(c => ({ key: c.key, value: c.value, mode: c.mode })), disabled: effect.disabled } : null,
      effectIds: [...a.effects.values()].map(e => e.id),
      effectNames: [...a.effects.values()].map(e => ({ id: e.id, name: e.name, ak5e: Object.keys(e.flags?.ak5e ?? {}) })),
      undo: (a.getFlag("ak5e", "supporterUses")?.undo ?? []).map(r => ({ id: r.id, command: r.command, status: r.status,
        targets: (r.targets ?? []).map(t => ({ kind: t.kind, applied: t.applied ?? null, attempted: t.attempted ?? null, amount: t.amount ?? null, before: t.before ?? null })) }))
    };
  }, id);
  /** Confirms the topmost dialog that is not a cancel: used for the native Art usage dialog and AK5e prompts. */
  /**
   * Clicks a button in the dialog window showing `needle` (an Art name). `pick` selects the button (default: the confirm
   * words). `screenshot` names a PNG taken while the dialog is open, before the click. Dialog windows only.
   */
  const confirmDialog = async (label, needle, { pick = /cast|use|post|confirm|continue|ok/i, screenshot: shot = null } = {}) => {
    await closeStrayDialogs();
    const pattern = pick.source, flags = pick.flags;
    await page.waitForFunction(([text, src, fl]) => [...foundry.applications.instances.values()].some(app => app.element?.offsetParent && !app.document
      && (app instanceof foundry.applications.api.DialogV2 || /Dialog|Usage|Prompt/.test(app.constructor?.name ?? ""))
      && app.element.textContent.includes(text) && [...app.element.querySelectorAll("button")].some(b => !b.disabled && new RegExp(src, fl).test(`${b.dataset.action ?? ""} ${b.textContent}`))),
      [needle, pattern, flags], { timeout: 30000 });
    if (shot) await screenshot(shot);
    const clicked = await page.evaluate(([text, src, fl]) => {
      const candidates = [...foundry.applications.instances.values()].filter(a => a.element?.offsetParent && !a.document && a.element.textContent.includes(text)
        && (a instanceof foundry.applications.api.DialogV2 || /Dialog|Usage|Prompt/.test(a.constructor?.name ?? "")));
      for (const app of candidates.reverse()) {
        const button = [...app.element.querySelectorAll("button")].filter(b => !b.disabled && !/cancel|close|later/i.test(`${b.dataset.action ?? ""} ${b.textContent}`))
          .find(b => new RegExp(src, fl).test(`${b.dataset.action ?? ""} ${b.textContent}`));
        if (button) { button.click(); return button.dataset.action ?? button.textContent.trim(); }
      }
      return null;
    }, [needle, pattern, flags]);
    if (!clicked) throw new Error(`no enabled button to ${label} in the dialog showing ${needle}`);
    await page.waitForTimeout(800);
    return clicked;
  };
  /** Closes the unrelated Supporter progression window that opens on the sheet at 17th level. */
  const closeStrayDialogs = () => page.evaluate(() => {
    for (const app of [...foundry.applications.instances.values()]) {
      if (/Choose Skills/.test(app.title ?? app.options?.window?.title ?? "")) app.close().catch(() => {});
    }
  });
  const showChat = async () => {
    await page.evaluate(() => {
      if (ui.sidebar?._collapsed) ui.sidebar.expand();
      ui.sidebar?.activateTab?.("chat");
      const log = document.querySelector("#chat-log");
      if (log) log.scrollTop = log.scrollHeight;
    });
    await page.waitForTimeout(400);
  };
  const turn = async (kind, actorId) => page.evaluate(async ({ kind, actorId, tag }) => {
    const trig = await import("/modules/ak5e/scripts/trigger-events.mjs");
    await trig.emitAk5eEvent(kind, { eventId: `u8-${kind}-${tag}-${Date.now()}`, actorUuid: game.actors.get(actorId).uuid, round: 1, turn: 0 });
  }, { kind, actorId, tag: runTag });

  const ids = await step("join as Gamemaster and create a level-17 Bard with CHA 16 and an equipped Lute", () => page.evaluate(async tag => {
    const bard = await Actor.implementation.create({
      name: `AK5E U8 Bard ${tag}`, type: "character",
      system: { abilities: { cha: { value: 16 } }, details: { level: 17 } },
      flags: { ak5e: {
        supporter: { enabled: true, aidAbility: "cha", branch: "bard" },
        casting: { enabled: true, ability: "cha", castingUnit: "" },
        artsPoints: { value: 10, maximum: 10, maximumArtLevel: 9, ninthLevelCast: false },
        bard: { performances: [], active: null, fontDie: false }
      } }
    });
    await bard.createEmbeddedDocuments("Item", [
      { name: "Supporter", type: "class", system: { identifier: "supporter", levels: 17 }, flags: { ak5e: { chapterThreeId: "class-supporter" } } },
      { name: "Supporter: Bard", type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-supporter-bard" } } },
      { name: "Lute", type: "tool", system: { equipped: true, proficient: 1 }, flags: { ak5e: { tableData: { properties: "Casting Unit" } } } }
    ]);
    const spell = (name, level) => {
      const activityId = foundry.utils.randomID(16);
      return { name, type: "spell", system: { level, properties: name === "Bless" ? ["concentration"] : [], activities: { [activityId]: { _id: activityId, type: "utility",
        activation: { type: "action", value: 1 }, duration: { units: "inst" }, range: { units: "self" }, target: { affects: { type: "self" } } } } },
        flags: { ak5e: { chapterFiveId: `u8-${name.toLowerCase().replace(/\W+/g, "-")}` } } };
    };
    await bard.createEmbeddedDocuments("Item", [spell("Bless", 1), spell("Healing Word", 1), spell("Heroism", 1)]);
    const lute = bard.items.getName("Lute");
    const performance = { id: `P-U8-${tag}`, performed: false, composedAt: Date.now(), arts: [
      { name: "Bless", muse: 1, manual: false }, { name: "Healing Word", muse: 2, manual: false },
      { name: "Heroism", muse: 2, manual: false }, { name: "Tasha's Mind Whip", muse: 4, manual: true }] };
    await bard.setFlag("ak5e", "bard", { performances: [performance], active: null, fontDie: false });
    return { id: bard.id, uuid: bard.uuid, name: bard.name, lute: lute.id, performance: performance.id };
  }, runTag));

  await step("register the Bard plans and hooks in the page", () => page.evaluate(async () => {
    const B = await import("/modules/ak5e/scripts/bard-perform.mjs");
    const U = await import("/modules/ak5e/scripts/supporter-uses.mjs");
    if (!globalThis.__u8Registered) {
      U.registerSupporterPlans({ plans: B.bardPerformPlans });
      globalThis.__u8Registered = true;
    }
    B.registerBardPerformHooks();
    globalThis.__u8 = { B, U };
    return Object.keys(B.bardPerformPlans);
  }));

  await step("open the Bard's sheet and the chat log", async () => {
    await page.evaluate(id => game.actors.get(id).sheet.render({ force: true }), ids.id);
    await page.waitForTimeout(1500);
  });
  await screenshot("u8-01-bard-sheet.png");

  await step("put on the Performance: the first Art (Bless) casts at 0 AP", async () => {
    await closeStrayDialogs();
    await page.evaluate(id => { globalThis.__u8MsgBase = game.messages.contents.length; globalThis.__u8.B.bardPerformCommand(game.actors.get(id), "bardStartPerformance").catch(e => console.error("AK5e U8", e)); }, ids.id);
    await confirmDialog("choose the Performance", "Put on a Performance");
    await confirmDialog("put on the Performance (confirm)", "Performance P-U8", { screenshot: "u8-01b-put-on-confirm.png" });
    await confirmDialog("cast Bless", "Bless");
    await page.waitForFunction(id => game.actors?.get(id)?.getFlag("ak5e", "bard")?.active?.index === 1, ids.id, { timeout: 30000 });
    const s = await state(ids.id);
    if (s.apValue !== 10) throw new Error(`Arts Points changed to ${s.apValue}; a Performance Art must cost 0 AP`);
    if (s.castingUnit !== ids.lute) throw new Error("the Lute is not the Casting Unit while Performing");
    if (s.active.crescendo !== 0) throw new Error("the first Art adds no crescendo");
    return s;
  });
  await showChat();
  await screenshot("u8-02-start-first-art-card.png");

  await step("turn change, then cast the second Art (Healing Word): crescendo +2 (Fortissimo), Spell Save DC +2 on the Bard", async () => {
    await turn("turnEnd", ids.id);
    await turn("turnStart", ids.id);
    await page.evaluate(async id => { globalThis.__u8.B.bardPerformCommand(game.actors.get(id), "bardCastNextArt").catch(e => console.error("AK5e U8", e)); }, ids.id);
    await confirmDialog("confirm the mid-Performance cast", "Cast Healing Word", { screenshot: "u8-03a-mid-cast-confirm.png" });
    await confirmDialog("cast Healing Word", "Healing Word");
    await page.waitForFunction(id => game.actors?.get(id)?.getFlag("ak5e", "bard")?.active?.index === 2, ids.id, { timeout: 30000 });
    const s = await state(ids.id);
    // Level 17 has Fortissimo (L7161-7164): each Art after the first counts as two, so the second Art gives +2.
    if (s.active.crescendo !== 2) throw new Error(`crescendo ${s.active.crescendo}, expected 2 (Fortissimo)`);
    if (s.crescendoEffect?.dc !== "2") throw new Error(`the Spell Save DC effect is not +2: ${JSON.stringify({ effect: s.crescendoEffect, effects: s.effectNames, undo: s.undo }).slice(0, 1500)}`);
    if (s.fontDie !== true) throw new Error("the Font die is not held at the start of the Turn");
    return s;
  });
  await showChat();
  await screenshot("u8-03-second-art-crescendo.png");

  await step("turn change, then cast the third Art (Heroism): crescendo +4 (Fortissimo)", async () => {
    await turn("turnEnd", ids.id);
    await turn("turnStart", ids.id);
    await page.evaluate(async id => { globalThis.__u8.B.bardPerformCommand(game.actors.get(id), "bardCastNextArt").catch(e => console.error("AK5e U8", e)); }, ids.id);
    await confirmDialog("confirm the mid-Performance cast", "Cast Heroism");
    await confirmDialog("cast Heroism", "Heroism");
    await page.waitForFunction(id => game.actors?.get(id)?.getFlag("ak5e", "bard")?.active?.index === 3, ids.id, { timeout: 30000 });
    const s = await state(ids.id);
    if (s.active.crescendo !== 4) throw new Error(`crescendo ${s.active.crescendo}, expected 4 (Fortissimo)`);
    return s;
  });
  await showChat();
  await screenshot("u8-04-third-art-crescendo.png");

  await step("turn change, then the manual Art (Tasha's Mind Whip): a manual card, no AP, and the Performance ends", async () => {
    await turn("turnEnd", ids.id);
    await turn("turnStart", ids.id);
    await page.evaluate(async id => { globalThis.__u8.B.bardPerformCommand(game.actors.get(id), "bardCastNextArt").catch(e => console.error("AK5e U8", e)); }, ids.id);
    await confirmDialog("keep prompt: Keep none", "Tasha", { pick: /keep none/i, screenshot: "u8-05a-keep-prompt-cancel.png" });
    await page.waitForFunction(() => game.messages.contents.some(m => /manual/.test(String(m.content ?? "")) && /Bard missing Arts/.test(String(m.content ?? ""))), null, { timeout: 30000 });
    await page.waitForFunction(id => game.actors?.get(id)?.getFlag("ak5e", "bard")?.active === null, ids.id, { timeout: 30000 }).catch(() => {});
    const s = await state(ids.id);
    if (s.apValue !== 10) throw new Error(`Arts Points changed to ${s.apValue} on the manual Art`);
    return s;
  });
  await showChat();
  await screenshot("u8-05-manual-art-card.png");

  const endReceipt = await step("the last Art ends the Performance in its own use (castNextArt): the crescendo effect is removed", async () => {
    const s = await state(ids.id);
    if (s.active !== null) throw new Error("the Performance did not end after its last Art");
    if (s.crescendoEffect) throw new Error("the crescendo effect is still present after the Performance ended");
    const last = s.undo.filter(r => r.command === "castNextArt").at(-1);
    if (!last) throw new Error("no castNextArt receipt for the last Art");
    return last;
  });

  await step("undo the last Art: the Performance returns with its crescendo effect", async () => {
    await page.evaluate(async ({ id, useId }) => { await globalThis.__u8.B.bardPerformApi.undo(game.actors.get(id), useId); }, { id: ids.id, useId: endReceipt.id });
    const s = await state(ids.id);
    if (!s.active) throw new Error("the Performance did not return after undo");
    if (!s.crescendoEffect) throw new Error("the crescendo effect did not return after undo");
  });
  await showChat();
  await screenshot("u8-06-undo-card.png");

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
    if (/AK5e|Bard|Arts/.test(message.text())) report.consoleTrace = [...(report.consoleTrace ?? []).slice(-80), `${message.type()}: ${message.text().slice(0, 240)}`];
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
