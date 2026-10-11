/** Capture, restart the disposable server, then run again without --capture. */
import { readFile, writeFile } from "node:fs/promises";
import { launchTestBrowser } from "./test-browser.mjs";
const { chromium } = await import(process.env.AK5E_PLAYWRIGHT ?? "playwright");
const targeting = JSON.parse(await readFile("/tmp/ak5e-targeting-live-report.json", "utf8"));
const sp = JSON.parse(await readFile("/tmp/ak5e-sp-live-report.json", "utf8"));
const browser = await launchTestBrowser(chromium), errors = [];
async function join(name) {
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  if (name !== "Gamemaster") await context.addInitScript(() => localStorage.setItem("core.noCanvas", "true"));
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("http://127.0.0.1:30133/join");
  await page.selectOption('select[name="userid"]', { label: name }); await page.click('button[name="join"]');
  await page.waitForFunction(() => globalThis.game?.ready && game.ak5e, null, { timeout: 45000 });
  if (await page.evaluate(() => game.world.id) !== "sp-test") throw new Error("Restart tests require the disposable sp-test World.");
  return page;
}
try {
  const gm = await join("Gamemaster"), refs = { targeting: targeting.fixture, sp: sp.slice };
  const snapshot = await gm.evaluate(async refs => {
    const actor = game.actors.get(refs.targeting.actorId), state = game.ak5e.getOperatorSkillState(actor);
    const pc = game.actors.get(refs.sp.pcId), synthetic = await fromUuid(refs.sp.syntheticUuid);
    return { points: state.points, enabled: state.enabled, skillIds: actor.items.map(item => item.id).sort(),
      resolutions: state.resolutions.map(receipt => ({ activationId: receipt.activationId, status: receipt.status, phases: Object.keys(receipt.phases).sort(), bloodBoilDamage: receipt.bloodBoilDamage })),
      templates: [...game.scenes].flatMap(scene => scene.templates.filter(template => state.resolutions.some(receipt => receipt.activationId === template.flags.ak5e?.skillActivation)).map(template => template.uuid)).sort(),
      customFormula: actor.items.get(refs.targeting.items["Holding Shadow"]).system.activities.get("ak5ePhase0000000").damage.parts[0].custom.formula,
      customCounter: actor.items.get(refs.targeting.items["Holding Shadow"]).flags.ak5e.customCounter,
      spPoints: game.ak5e.getOperatorSkillState(pc).points, syntheticPoints: game.ak5e.getOperatorSkillState(synthetic).points,
      spReceipts: game.ak5e.getOperatorSkillState(pc).receipts.length };
  }, refs);
  if (process.argv.includes("--capture")) {
    await writeFile("/tmp/ak5e-before-restart.json", JSON.stringify(snapshot, null, 2));
    console.log("Captured persistent Skill/SP state before server restart.");
  } else {
    const before = JSON.parse(await readFile("/tmp/ak5e-before-restart.json", "utf8"));
    if (JSON.stringify(before) !== JSON.stringify(snapshot)) throw new Error("Skill/SP state changed across the server restart.");
    const player = await join("SP Owner One");
    const playerState = await player.evaluate(refs => ({ points: game.ak5e.getOperatorSkillState(game.actors.get(refs.sp.pcId)).points,
      hiddenLeaked: JSON.stringify(game.ak5e.getOperatorSkillState(game.actors.get(refs.targeting.actorId))).includes(refs.targeting.tokens["Hidden enemy"]) }), refs);
    if (playerState.points !== before.spPoints || playerState.hiddenLeaked) throw new Error("Player restart state or hidden-token privacy failed.");
    const native = await gm.evaluate(async refs => {
      const runtime = await import("/modules/ak5e/scripts/operator-skills.mjs");
      const { CHAPTER_THREE_CLASSES } = await import("/modules/ak5e/scripts/chapter-three-content.mjs");
      const entries = CHAPTER_THREE_CLASSES.filter(entry => entry.operatorSkill);
      for (const entry of entries) {
        const data = runtime.operatorSkillItemData(entry), item = new Item.implementation(data);
        if (item.invalid || item.system.activities.size !== Object.keys(data.system.activities).length) throw new Error(`Invalid fresh native Skill: ${entry.id}`);
      }
      const pc = game.actors.get(refs.sp.pcId), saved = pc.flags.ak5e.spLiveRefs, npc = await fromUuid(saved.npc);
      await runtime.adjustOperatorSP(pc, -10, { reason: "Disposable zero-HP verification" });
      await npc.update({ "system.attributes.hp.value": 0, "system.attributes.hp.temp": 0, "system.traits.di.value": [] });
      const attack = pc.items.get(saved.sword).system.activities.contents[0];
      await attack.rollAttack({}, { configure: false }, { create: true });
      const message = game.messages.filter(message => message.flags.dnd5e?.roll?.type === "attack").at(-1);
      const points = runtime.getIntegratedOperatorState(pc).points;
      await npc.applyDamage([{ value: 5, type: "slashing" }], { originatingMessage: message });
      for (let i = 0; i < 100 && runtime.getIntegratedOperatorState(pc).points === points; i++) await new Promise(resolve => setTimeout(resolve, 30));
      if (npc.system.attributes.hp.value !== 0 || runtime.getIntegratedOperatorState(pc).points !== points + 2) throw new Error("Native damage at zero HP failed to charge.");
      await npc.update({ "system.traits.di.value": ["slashing"] });
      await attack.rollAttack({}, { configure: false }, { create: true });
      const immuneMessage = game.messages.filter(message => message.flags.dnd5e?.roll?.type === "attack").at(-1);
      await npc.applyDamage([{ value: 5, type: "slashing" }], { originatingMessage: immuneMessage });
      await new Promise(resolve => setTimeout(resolve, 200));
      if (runtime.getIntegratedOperatorState(pc).points !== points + 2) throw new Error("Native immunity incorrectly charged SP.");
      const gl = canvas.app.renderer.gl, extension = gl.getExtension("WEBGL_debug_renderer_info");
      return { catalogue: entries.length, zeroHP: true, immunity: true, renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : "unavailable" };
    }, refs);
    const report = { restart: true, snapshot, playerState, native, errors };
    await writeFile("/tmp/ak5e-restart-live-report.json", JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  }
  if (errors.length) throw new Error(`Browser errors: ${errors.join("; ")}`);
} finally { await browser.close(); }
