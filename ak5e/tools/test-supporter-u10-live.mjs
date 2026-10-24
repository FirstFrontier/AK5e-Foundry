/**
 * U10 live check (Foundry V13 + dnd5e, real module load): on the Supporter's Provide Aid warnings dialog, Cancel
 * posts no chat card and changes neither the Aid Die pool nor the recipient's effects; "Use anyway" applies the use.
 * Uses launchTestBrowser() from ./test-browser.mjs (WORKFLOW.md §5.3). Run against a throwaway data copy on port 30186.
 *
 * Env: AK5E_TEST_PORT (default 30186), AK5E_TEST_OUTPUT (screenshot dir, required), AK5E_PLAYWRIGHT (optional).
 */
import { mkdir } from "node:fs/promises";
import { launchTestBrowser } from "./test-browser.mjs";

let chromium;
for (const candidate of [process.env.AK5E_PLAYWRIGHT, "/tmp/frontier-browser-check/node_modules/playwright/index.mjs", "playwright"].filter(Boolean)) {
  try { const mod = await import(candidate); if (mod.chromium) { chromium = mod.chromium; break; } } catch { /* try next */ }
}
if (!chromium) throw new Error("Could not load Playwright chromium module.");

const port = process.env.AK5E_TEST_PORT ?? "30186";
const outputDir = process.env.AK5E_TEST_OUTPUT;
if (!outputDir) throw new Error("Set AK5E_TEST_OUTPUT to the screenshot directory.");
await mkdir(outputDir, { recursive: true });

const checks = [];
const check = (name, ok, detail = "") => { checks.push({ name, ok: Boolean(ok), detail }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`); };
const errors = [];

const browser = await launchTestBrowser(chromium, { ...(process.env.AK5E_CHROMIUM ? { executablePath: process.env.AK5E_CHROMIUM } : {}) });
const context = await browser.newContext({ viewport: { width: 1600, height: 1050 } });
const page = await context.newPage();
page.on("pageerror", error => errors.push(`pageerror: ${error.message}`));
page.on("console", message => { if (message.type() === "error" && !message.text().includes("favicon")) errors.push(`console: ${message.text()}`); });

const shot = async name => { const path = `${outputDir}/${name}`; await page.screenshot({ path }); console.log(`Saved ${path}`); return path; };

async function join(name) {
  await page.goto(`http://127.0.0.1:${port}/join`);
  await page.selectOption('select[name="userid"]', { label: name, timeout: 15000 });
  const password = page.locator('input[name="password"]');
  if (await password.count() && await password.isVisible()) await password.fill(process.env.AK5E_TEST_PASSWORD ?? "");
  await page.click('button[name="join"]');
  await page.waitForFunction(() => globalThis.game?.ready && globalThis.canvas?.ready, null, { timeout: 60000 });
  await page.evaluate(async () => {
    for (const app of [...foundry.applications.instances.values()]) if (app.constructor?.name === "UserConfig") await app.close();
  });
}

/** The open DialogV2 window whose title is exactly `title`. */
const dialogWindow = title => page.locator("section.application, .application").filter({ has: page.locator(".window-title", { hasText: new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) }) }).last();
async function waitDialog(title) {
  const win = dialogWindow(title);
  await win.waitFor({ state: "visible", timeout: 15000 });
  return win;
}

const state = () => page.evaluate(() => {
  const actor = game.actors.getName("U10 Supporter"), ally = game.actors.getName("U10 Ally");
  return {
    pool: actor?.getFlag("ak5e", "resourcePools")?.aidDie?.value ?? null,
    actorEffects: actor?.effects.size ?? null,
    allyAidEffects: ally?.effects.filter(effect => effect.getFlag("ak5e", "supporterUsesEffect")?.aidDie === true).length ?? null,
    messages: game.messages.size,
    provideAidCards: game.messages.filter(message => /Provide Aid/.test(message.content ?? "")).length
  };
});

async function setup() {
  await page.evaluate(async () => {
    for (const name of ["U10 Supporter", "U10 Ally"]) { const old = game.actors.getName(name); if (old) await old.delete(); }
    const actor = await Actor.create({ name: "U10 Supporter", type: "character", ownership: { default: 3 } });
    await actor.createEmbeddedDocuments("Item", [{ name: "Supporter", type: "class", system: { levels: 1 }, flags: { ak5e: { chapterThreeId: "class-supporter" } } }]);
    await actor.setFlag("ak5e", "supporter", { enabled: true, configured: true, aidAbility: "cha" });
    await actor.update({ "flags.ak5e.resourcePools.aidDie.value": 0 });
    await Actor.create({ name: "U10 Ally", type: "character", ownership: { default: 3 } });
  });
}

async function openFeatures() {
  await page.evaluate(() => { game.actors.getName("U10 Supporter").sheet.render(true, { focus: true }); });
  await page.waitForTimeout(1500);
  // Activate the tab that holds the Supporter panel (the tab control, not the tab section).
  await page.evaluate(() => {
    const btn = document.querySelector('[data-supporter-cmd="provideAid"]');
    const tab = btn?.closest("[data-tab]")?.dataset.tab;
    const app = btn?.closest(".application");
    const control = tab ? Array.from(app?.querySelectorAll(`[data-tab="${tab}"]`) ?? []).find(el => el.tagName !== "SECTION") : null;
    control?.click();
  });
  await page.locator('[data-supporter-cmd="provideAid"]').first().waitFor({ state: "visible", timeout: 20000 });
}

async function runProvideAid() {
  await page.locator('[data-supporter-cmd="provideAid"]').first().click();
  const ally = await waitDialog("Provide Aid: recipient");
  const allyUuid = await page.evaluate(() => game.actors.getName("U10 Ally").uuid);
  await ally.locator('select[name="target"]').selectOption(allyUuid);
  await ally.locator('button[data-action="ok"]').click();
  const confirm = await waitDialog("Provide Aid");
  await confirm.locator('button[data-action="confirm"]').click();
  const warn = await waitDialog("Provide Aid: check before use");
  const text = await warn.innerText();
  check("warnings dialog shows the empty Aid Dice pool", /Aid Dice pool is empty/.test(text), text.replace(/\s+/g, " ").slice(0, 160));
  return warn;
}

try {
  await join("Gamemaster");
  await setup();
  await openFeatures();
  const before = await state();
  await shot("01-before-provide-aid.png");

  // 1. Cancel on the warnings dialog: nothing is posted, nothing changes.
  const warn1 = await runProvideAid();
  await shot("02-warnings-dialog.png");
  await warn1.locator('button[data-action="cancel"]').click();
  await warn1.waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const afterCancel = await state();
  await shot("03-after-cancel.png");
  check("Cancel posts no chat card", afterCancel.messages === before.messages && afterCancel.provideAidCards === before.provideAidCards, `messages ${before.messages}->${afterCancel.messages}`);
  check("Cancel leaves the Aid Die pool unchanged", afterCancel.pool === before.pool, `pool ${before.pool}->${afterCancel.pool}`);
  check("Cancel leaves the recipient's Aid Die effects unchanged", afterCancel.allyAidEffects === before.allyAidEffects && afterCancel.actorEffects === before.actorEffects, `ally effects ${before.allyAidEffects}->${afterCancel.allyAidEffects}`);

  // 2. Use anyway: the same attempt resubmits with the warning overridden and applies.
  await openFeatures();
  const warn2 = await runProvideAid();
  await warn2.locator('button[data-action="anyway"]').click();
  await page.waitForTimeout(3000);
  const afterUse = await state();
  await shot("04-after-use-anyway.png");
  check("Use anyway posts one Provide Aid chat card", afterUse.provideAidCards === before.provideAidCards + 1, `cards ${before.provideAidCards}->${afterUse.provideAidCards}`);
  check("Use anyway applies the Aid Die effect to the recipient", afterUse.allyAidEffects === (before.allyAidEffects ?? 0) + 1, `ally aid effects ${before.allyAidEffects}->${afterUse.allyAidEffects}`);

  check("no page or console errors", errors.length === 0, errors.slice(0, 3).join(" | "));
} catch (error) {
  check("live run completed", false, error.stack ?? error.message);
  await shot("99-failure.png").catch(() => {});
} finally {
  await browser.close();
}

const failed = checks.filter(c => !c.ok);
console.log(JSON.stringify({ checks: checks.length, failed: failed.length, screenshots: outputDir }, null, 2));
if (failed.length) process.exitCode = 1;
