/** Optional browser regression. Only touches the disposable skill-choice-test World on port 30134. */
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { launchTestBrowser } from "./test-browser.mjs";
const { chromium } = await import(process.env.AK5E_PLAYWRIGHT ?? "playwright");
const browser = await launchTestBrowser(chromium);
const errors = [], report = {};
const popup = page => page.locator("dialog:has(.ak5e-skill-choices)");
async function join(name) {
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  await context.addInitScript(() => localStorage.setItem("core.noCanvas", "true"));
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("http://127.0.0.1:30134/join");
  await page.selectOption('select[name="userid"]', { label: name });
  await page.click('button[name="join"]');
  await page.waitForFunction(() => globalThis.game?.ready, null, { timeout: 45000 });
  assert.equal(await page.evaluate(() => game.world.id), "skill-choice-test", "Refuse other Worlds");
  return page;
}
async function choose(page, expectedTiers) {
  await popup(page).waitFor({ state: "visible" });
  assert.deepEqual(await popup(page).locator("select").evaluateAll(elements => elements.map(element => element.name)), expectedTiers.map(tier => `skill-${tier.toLowerCase()}`));
  assert.equal(await popup(page).locator('[data-action="learnSkills"]').isDisabled(), true);
  for (const tier of expectedTiers) {
    const control = popup(page).locator(`[name="skill-${tier.toLowerCase()}"]`);
    const value = await control.locator("option").nth(1).getAttribute("value");
    await control.selectOption(value);
    const preview = popup(page).locator(`[data-tier="${tier}"]`);
    assert.match(await preview.innerText(), /SP Cost:/);
    assert.match(await preview.innerText(), /Start SP:/);
    assert.match(await preview.innerText(), /Charging:/);
    assert.match(await preview.innerText(), /Activation:/);
    assert.match(await preview.innerText(), /Duration:/);
  }
  assert.equal(await popup(page).locator('[data-action="learnSkills"]').isDisabled(), false);
  await popup(page).locator('[data-action="learnSkills"]').click();
  await popup(page).waitFor({ state: "hidden" });
}
try {
  const gm = await join("Gamemaster");
  if (!await gm.evaluate(() => game.modules.get("ak5e").active)) {
    await gm.evaluate(() => game.settings.set("core", "moduleConfiguration", { ak5e: true }));
    await gm.reload(); await gm.waitForFunction(() => globalThis.game?.ready && game.ak5e, null, { timeout: 45000 });
  }
  report.environment = await gm.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl"), debug = gl?.getExtension("WEBGL_debug_renderer_info");
    return { foundry: game.version, system: game.system.version, module: game.modules.get("ak5e").version,
      renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : "unavailable" };
  });
  const refs = await gm.evaluate(async () => {
    for (const existing of game.actors.filter(actor => actor.getFlag("ak5e", "choiceLiveTest"))) await existing.delete();
    for (const [name, role] of [["Choice Owner One", 1], ["Choice Owner Two", 1], ["Choice Observer", 1], ["Choice Second GM", 4]]) {
      if (!game.users.getName(name)) await User.implementation.create({ name, role, password: "", ...(role === 4 ? { _id: "zzzzzzzzzzzzzzzz" } : {}) });
    }
    const one = game.users.getName("Choice Owner One"), two = game.users.getName("Choice Owner Two");
    const actor = await Actor.implementation.create({ name: "Operator progression PC", type: "character", ownership: { [one.id]: 3, [two.id]: 3 },
      flags: { ak5e: { choiceLiveTest: true, operatorSkills: { enabled: false, maximum: 12, start: 4, points: 7 } } } });
    await one.update({ character: actor.id });
    const { CHAPTER_THREE_CLASSES } = await import("/modules/ak5e/scripts/chapter-three-content.mjs");
    const entry = CHAPTER_THREE_CLASSES.find(entry => entry.id === "class-caster");
    // This fixture isolates Skill progression from D&D5e's default HP/ASI choice flows.
    const [cls] = await actor.createEmbeddedDocuments("Item", [{ name: entry.name, type: "class", system: { ...entry.systemData, advancement: [] },
      flags: { ak5e: { chapterThreeId: entry.id, classContentKind: "class" } } }]);
    return { actorId: actor.id, classId: cls.id };
  });
  const one = await join("Choice Owner One"), two = await join("Choice Owner Two"), observer = await join("Choice Observer"), gm2 = await join("Choice Second GM");
  for (const page of [one, two]) await page.evaluate(id => game.actors.get(id).sheet.render(true), refs.actorId);
  for (const page of [one, two]) await page.waitForSelector(".ak5e-operator-skills");
  await gm.evaluate(async ({ actorId, classId }) => { await game.actors.get(actorId).items.get(classId).update({ "system.levels": 2 }); }, refs);
  await popup(one).waitFor({ state: "visible" });
  for (const page of [gm, two, observer, gm2]) assert.equal(await popup(page).count(), 0, "Only the assigned owner is prompted");
  const beforeCancel = await gm.evaluate(id => game.actors.get(id).getFlag("ak5e", "operatorSkills"), refs.actorId);
  await popup(one).locator('[data-action="later"]').click(); await popup(one).waitFor({ state: "hidden" });
  await one.evaluate(id => game.actors.get(id).sheet.render({ force: true, parts: ["tabs", "details"] }), refs.actorId);
  await one.waitForTimeout(250); assert.equal(await popup(one).count(), 0, "Partial render must not repeat dismissed popup");
  assert.deepEqual(await gm.evaluate(id => game.actors.get(id).getFlag("ak5e", "operatorSkills"), refs.actorId), beforeCancel);
  await one.locator(".ak5e-operator-skills button", { hasText: "Choose Skills" }).click();
  await choose(one, ["Basic"]);
  await gm.waitForFunction(id => game.ak5e.getOperatorSkillChoices(game.actors.get(id)).pending.length === 0, refs.actorId);
  report.basic = await gm.evaluate(id => {
    const actor = game.actors.get(id), state = actor.getFlag("ak5e", "operatorSkills");
    return { points: state.points, enabled: state.enabled, choices: Object.keys(state.progression.choices).length };
  }, refs.actorId);
  assert.deepEqual(report.basic, { points: 7, enabled: false, choices: 1 });
  console.log("Basic popup, cancellation and player learning passed.");
  // Drive the native AdvancementManager, including its clone and completion hook.
  await one.evaluate(async ({ actorId, classId }) => {
    const manager = dnd5e.applications.advancement.AdvancementManager.forLevelChange(game.actors.get(actorId), classId, 5);
    globalThis.choiceTestManager = manager;
    globalThis.choiceTestEvents = [];
    Hooks.on("dnd5e.advancementManagerComplete", completed => choiceTestEvents.push({ complete: completed.actor.id }));
    let rejected = false;
    try { await game.ak5e.openOperatorSkillChoices(manager.clone); } catch { rejected = true; }
    if (!rejected) throw new Error("Advancement clone accepted a choice popup");
    await manager.render(true);
  }, refs);
  // This fixture has no HP/ASI flows: its real native manager completes automatically.
  await one.waitForTimeout(1000);
  console.log("Native advancement diagnostics:", await one.evaluate(({ actorId, classId }) => ({
    level: game.actors.get(actorId).items.get(classId).system.levels, cloneLevel: choiceTestManager.clone.items.get(classId).system.levels,
    step: choiceTestManager.step?.type, steps: choiceTestManager.steps.map(step => ({ type: step.type, automatic: step.automatic })),
    events: choiceTestEvents, view: { pending: game.ak5e.getOperatorSkillChoices(game.actors.get(actorId)).pending.map(slot => slot.tier),
      blocked: game.ak5e.getOperatorSkillChoices(game.actors.get(actorId)).blocked },
    actorSame: choiceTestManager.actor === game.actors.get(actorId)
  }), refs));
  await choose(one, ["Advanced"]);
  await gm.waitForFunction(id => Object.keys(game.actors.get(id).getFlag("ak5e", "operatorSkills").progression.choices).length === 2, refs.actorId);
  console.log("Native advancement completion and Advanced learning passed.");
  await gm.evaluate(async ({ actorId, classId }) => { await game.actors.get(actorId).items.get(classId).update({ "system.levels": 14 }); }, refs);
  await choose(one, ["Elite"]);
  await gm.waitForFunction(id => Object.keys(game.actors.get(id).getFlag("ak5e", "operatorSkills").progression.choices).length === 3, refs.actorId);
  report.invalid = await one.evaluate(async id => {
    const actor = game.actors.get(id), view = game.ak5e.getOperatorSkillChoices(actor), slot = view.slots[0];
    const { submitOperatorCommand } = await import("/modules/ak5e/scripts/operator-skills.mjs");
    const blocked = [];
    for (const [command, data] of [["learn", { sourceId: slot.options[1].id }], ["chooseSkills", { contextKey: view.contextKey, selections: [{ key: slot.key, sourceId: slot.options[1].id }] }]]) {
      try { await submitOperatorCommand(actor, command, data); blocked.push(false); } catch { blocked.push(true); }
    }
    return blocked;
  }, refs.actorId);
  assert.deepEqual(report.invalid, [true, true]);
  const selected = await gm.evaluate(id => {
    const view = game.ak5e.getOperatorSkillChoices(game.actors.get(id));
    return { contextKey: view.contextKey, selections: view.slots.map(slot => ({ key: slot.key, sourceId: slot.selection.sourceId })) };
  }, refs.actorId);
  await Promise.all([one, two, gm2].map(page => page.evaluate(async ({ actorId, selected }) => {
    const { submitOperatorCommand } = await import("/modules/ak5e/scripts/operator-skills.mjs");
    await submitOperatorCommand(game.actors.get(actorId), "chooseSkills", selected);
  }, { actorId: refs.actorId, selected })));
  report.concurrentReplay = true;
  await gm.evaluate(id => game.ak5e.configureOperatorSkills(game.actors.get(id), { maximum: 12, start: 4, points: 7 }), refs.actorId);
  await one.reload(); await one.waitForFunction(() => globalThis.game?.ready && game.ak5e, null, { timeout: 45000 });
  await one.evaluate(id => game.actors.get(id).sheet.render(true), refs.actorId);
  await one.waitForSelector(".ak5e-operator-skills"); assert.equal(await popup(one).count(), 0);
  report.reload = await one.evaluate(id => {
    const actor = game.actors.get(id), state = actor.getFlag("ak5e", "operatorSkills");
    return { points: state.points, enabled: state.enabled, choices: Object.keys(state.progression.choices).length, skills: actor.items.filter(item => item.getFlag("ak5e", "operatorSkillChoice")).length };
  }, refs.actorId);
  assert.deepEqual(report.reload, { points: 7, enabled: false, choices: 3, skills: 3 });
  // A second fixture exercises a real interactive native HP flow, with its default advancement data.
  const interactive = await gm.evaluate(async () => {
    const one = game.users.getName("Choice Owner One");
    const actor = await Actor.implementation.create({ name: "Interactive advancement PC", type: "character", ownership: { [one.id]: 3 }, flags: { ak5e: { choiceLiveTest: true } } });
    const { CHAPTER_THREE_CLASSES } = await import("/modules/ak5e/scripts/chapter-three-content.mjs");
    const entry = CHAPTER_THREE_CLASSES.find(entry => entry.id === "class-medic");
    const [cls] = await actor.createEmbeddedDocuments("Item", [{ name: entry.name, type: "class", system: entry.systemData, flags: { ak5e: { chapterThreeId: entry.id } } }]);
    await actor.update({ "system.details.originalClass": cls.id });
    return { actorId: actor.id, classId: cls.id };
  });
  await one.evaluate(({ actorId, classId }) => {
    const actor = game.actors.get(actorId);
    void actor.sheet.render(true);
    void dnd5e.applications.advancement.AdvancementManager.forLevelChange(actor, classId, 1).render(true);
  }, interactive);
  const complete = one.locator('[data-action="complete"]');
  await complete.waitFor({ state: "visible" });
  assert.equal(await popup(one).count(), 0, "Skill choices must wait for the interactive HP flow");
  const average = one.locator('dnd5e-checkbox[name="useAverage"]');
  if (!await average.evaluate(element => element.checked)) await average.click();
  await complete.click();
  await choose(one, ["Basic"]);
  await gm.waitForFunction(id => game.ak5e.getOperatorSkillChoices(game.actors.get(id)).pending.length === 0, interactive.actorId);
  report.interactiveAdvancement = true;
  // A high-level import offers all unchosen tiers together, including branch tables.
  const catchupId = await gm.evaluate(async () => {
    const one = game.users.getName("Choice Owner One");
    const actor = await Actor.implementation.create({ name: "Catch-up Liberator", type: "character", ownership: { [one.id]: 3 }, flags: { ak5e: { choiceLiveTest: true } } });
    const { CHAPTER_THREE_CLASSES } = await import("/modules/ak5e/scripts/chapter-three-content.mjs");
    const entries = ["class-guard", "subclass-guard-liberator"].map(id => CHAPTER_THREE_CLASSES.find(entry => entry.id === id));
    await actor.createEmbeddedDocuments("Item", entries.map(entry => ({ name: entry.name, type: entry.itemType, system: { ...entry.systemData, ...(entry.kind === "class" ? { levels: 14 } : {}) }, flags: { ak5e: { chapterThreeId: entry.id } } })));
    return actor.id;
  });
  await popup(one).waitFor({ state: "visible" });
  assert.equal(await popup(one).locator("select").count(), 3);
  assert.match(await popup(one).locator("select").first().innerText(), /Liberator/);
  await popup(one).locator('[data-action="later"]').click();
  await one.reload(); await one.waitForFunction(() => globalThis.game?.ready && game.ak5e, null, { timeout: 45000 });
  await one.evaluate(id => game.actors.get(id).sheet.render(true), catchupId);
  await popup(one).waitFor({ state: "visible" });
  await choose(one, ["Basic", "Advanced", "Elite"]);
  await gm.waitForFunction(id => game.ak5e.getOperatorSkillChoices(game.actors.get(id)).pending.length === 0, catchupId);
  report.catchup = true;
  report.observer = await observer.evaluate(async id => { try { await game.ak5e.openOperatorSkillChoices(game.actors.get(id)); return false; } catch { return true; } }, refs.actorId);
  assert.equal(report.observer, true);
  report.errors = errors; assert.deepEqual(errors, []);
  await writeFile("/tmp/ak5e-choice-live-report.json", `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(JSON.stringify({ errors, report }, null, 2));
  throw error;
} finally {
  await browser.close();
}
