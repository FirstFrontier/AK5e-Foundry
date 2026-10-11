/** Disposable Foundry 13 / D&D5e live Defender, Dreadnought and Artshield acceptance run.
 * Never targets a non-test World: refuses anything but `standard-test`. Uses launchTestBrowser().
 * Env: AK5E_PLAYWRIGHT, AK5E_CHROMIUM, AK5E_NATIVE_VULKAN=1 (needed for WebGL on this host),
 * AK5E_DEFENDER_OUTPUT (artifact prefix), AK5E_DEFENDER_PORT (default 30135),
 * AK5E_DEFENDER_RESTART_REPORT (verify a previous run's persistence after a server restart). */
import { readFile, writeFile } from "node:fs/promises";
import { launchTestBrowser } from "./test-browser.mjs";
import { defenderFinishLiveChecks } from "./defender-finish-live-checks.mjs";
import { defenderBranchesLiveChecks } from "./defender-branches-live-checks.mjs";

const { chromium } = await import(process.env.AK5E_PLAYWRIGHT ?? "playwright");
const browser = await launchTestBrowser(chromium, {
  ...(process.env.AK5E_CHROMIUM ? { executablePath: process.env.AK5E_CHROMIUM } : {}),
  ...(process.env.AK5E_NATIVE_VULKAN ? { args: ["--disable-gpu-sandbox", "--ignore-gpu-blocklist", "--enable-webgl", "--use-angle=vulkan", "--use-vulkan=native", "--disable-vulkan-surface", "--enable-features=Vulkan"] } : {})
});
const output = process.env.AK5E_DEFENDER_OUTPUT ?? "/tmp/ak5e-defender-live";
const base = `http://127.0.0.1:${process.env.AK5E_DEFENDER_PORT ?? 30135}/join`;
const report = { world: "standard-test", errors: [], screenshots: [], checks: [], fixture: {} };
const contexts = [];

async function join(name) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1050 } });
  contexts.push(context);
  const page = await context.newPage();
  page.setDefaultTimeout(25000);
  page.on("pageerror", error => report.errors.push(`${name}: ${error.stack ?? error.message}`));
  page.on("console", message => { if (message.type() === "error") report.errors.push(`${name}: ${message.text()}`); });
  await page.goto(base);
  await page.selectOption('select[name="userid"]', { label: name, timeout: 20000 });
  await page.click('button[name="join"]');
  await page.waitForFunction(() => globalThis.game?.ready && globalThis.game.ak5e?.defender, null, { timeout: 90000 });
  // Foundry opens a one-time User Configuration popup for a brand-new player; it is not part of this feature.
  await page.evaluate(() => { for (const app of foundry.applications.instances.values()) if (/UserConfig/.test(app.constructor.name)) void app.close(); });
  const worldId = await page.evaluate(() => game.world.id);
  if (worldId !== "standard-test") throw new Error(`Refusing World ${worldId}; only disposable standard-test is allowed.`);
  return page;
}
async function shot(page, key) {
  // New characters open the Operator Skill chooser; it is unrelated to this feature and would cover the map and chat.
  await page.evaluate(() => { for (const app of foundry.applications.instances.values()) if (app.element?.querySelector?.(".ak5e-skill-choices")) void app.close(); }).catch(() => {});
  const path = `${output}-${key}.png`;
  await page.screenshot({ path, fullPage: false });
  report.screenshots.push(path);
  return path;
}
/** Record a check; a failure is reported at the end instead of hiding later checks. */
async function check(name, task) {
  let timeout;
  try { const detail = await Promise.race([task(), new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("check timed out after 150 s")), 150000); })]); report.checks.push({ name, ok: true, detail: detail ?? null }); console.log(`PASS ${name}`); }
  catch (error) { report.checks.push({ name, ok: false, error: error.message }); console.log(`FAIL ${name}: ${error.message}`); }
  finally { clearTimeout(timeout); }
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

try {
  const gm = await join("Gamemaster");
  if (!await gm.evaluate(() => game.modules.get("ak5e")?.active === true)) throw new Error("AK5e must be enabled in the disposable standard-test World.");
  report.environment = await gm.evaluate(() => ({ foundry: game.version, system: game.system.version, module: game.modules.get("ak5e").version, world: game.world.id,
    renderer: (() => { const gl = canvas?.app?.renderer?.gl; const ext = gl?.getExtension("WEBGL_debug_renderer_info"); return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unavailable"; })() }));
  if (report.environment.system !== "5.3.3") throw new Error(`Expected D&D5e 5.3.3; found ${report.environment.system}.`);

  if (process.env.AK5E_DEFENDER_RESTART_REPORT) {
    const previous = JSON.parse(await readFile(process.env.AK5E_DEFENDER_RESTART_REPORT, "utf8"));
    await check("restart: fixtures, setup receipts, effects, pools, flags persisted", () => gm.evaluate(({ ids, expected }) => {
      const out = {};
      // Only the two Defender fixtures carry setup state; the ally and Elite are plain NPCs without a fixture flag.
      for (const key of Object.keys(expected)) {
        const id = ids.actors[key], actor = game.actors.get(id);
        if (!actor || actor.getFlag("ak5e", "defenderLiveFixture") !== ids.suffix) throw new Error(`${key} fixture lost`);
        const state = actor.getFlag("ak5e", "defender");
        if (!state?.enabled) throw new Error(`${key} setup lost`);
        const effects = actor.effects.filter(e => e.getFlag("ak5e", "defenderManagedEffect")).map(e => e.name).sort();
        if (JSON.stringify(effects) !== JSON.stringify(expected[key].effects)) throw new Error(`${key} managed effects changed: ${effects}`);
        if (JSON.stringify(actor.getFlag("ak5e", "resourcePools")?.resilience ?? null) !== JSON.stringify(expected[key].resilience ?? null)) throw new Error(`${key} Resilience changed`);
        for (const flag of ["defenderProgression", "defenderTalentState", "defenderConcentrationBreakers", "defenderConcentrationBreakerOps", "operatorSkills"])
          if (JSON.stringify(actor.getFlag("ak5e", flag) ?? null) !== JSON.stringify(expected[key].flags[flag])) throw new Error(`${key} ${flag} changed across restart`);
        if (actor.items.size !== expected[key].items || JSON.stringify(actor._source.system.abilities) !== JSON.stringify(expected[key].abilities)
          || JSON.stringify(actor.system.attributes.hp) !== JSON.stringify(expected[key].hp)) throw new Error(`${key} native progression data changed across restart`);
        out[key] = { effects, ops: state.operations.length, shelter: state.shelter?.active ?? false, barrier: state.barrier?.active ?? false };
      }
      return out;
    }, { ids: previous.fixture, expected: previous.persistence }));
    if (previous.branchPersistence) await check("restart: Guardian/Fortress receipts, Arts, links and manual riders persisted", () => gm.evaluate(expected => {
      for (const [id, snapshot] of Object.entries(expected)) {
        const actor = game.actors.get(id);
        const actual = { flags: actor?.flags.ak5e, items: actor?.items.map(item => item.id).sort(),
          effects: actor?.effects.map(effect => ({ id: effect.id, flags: effect.flags.ak5e, changes: effect.changes })).sort((a, b) => a.id.localeCompare(b.id)) };
        if (JSON.stringify(actual) !== JSON.stringify(snapshot)) throw new Error(`Branch Actor ${id} changed across server restart.`);
      }
      return true;
    }, previous.branchPersistence));
    await gm.evaluate(id => { void game.actors.get(id).sheet.render(true); }, previous.fixture.actors.dread);
    await sleep(3500); await shot(gm, "restart-dread-sheet");
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.checks.every(c => c.ok) ? 0 : 1;
  } else {
  /* ------------------------------------------------------------------ fixture */
  report.fixture = await gm.evaluate(async () => {
    const assert = (c, m) => { if (!c) throw new Error(m); };
    const { CHAPTER_THREE_CLASSES } = await import("/modules/ak5e/scripts/chapter-three-content.mjs");
    const { sourceEntryData } = await import("/modules/ak5e/scripts/caster-setup.mjs");
    // Remove only fixtures this script flagged in earlier runs of the disposable World.
    for (const combat of game.combats.filter(c => c.scene?.getFlag("ak5e", "defenderLiveFixture"))) await combat.delete();
    for (const scene of game.scenes.filter(sc => sc.getFlag("ak5e", "defenderLiveFixture"))) await scene.delete();
    for (const actor of game.actors.filter(a => a.getFlag("ak5e", "defenderLiveFixture"))) await actor.delete();
    const suffix = foundry.utils.randomID();
    const owner = game.users.getName("Defender Live Owner") ?? await User.implementation.create({ name: "Defender Live Owner", role: 1, password: "" });
    const observer = game.users.getName("Defender Live Observer") ?? await User.implementation.create({ name: "Defender Live Observer", role: 1, password: "" });
    const scene = await Scene.implementation.create({ name: `Defender Live Arena ${suffix}`, width: 2800, height: 1600, padding: 0, tokenVision: false,
      grid: { type: 1, size: 100, distance: 5, units: "ft" }, flags: { ak5e: { defenderLiveFixture: suffix } } });
    const entry = id => { const e = CHAPTER_THREE_CLASSES.find(row => row.id === id); assert(e, `missing source record ${id}`); return e; };
    const attackActivity = (id, name) => ({ _id: id, type: "attack", name, activation: { type: "action", value: 1 },
      attack: { ability: "str", bonus: "", critical: { threshold: null }, flat: false, type: { value: "melee", classification: "weapon" } },
      damage: { critical: { bonus: "" }, includeBase: true, parts: [] }, consumption: { targets: [], scaling: { allowed: false }, spellSlot: false } });
    const weapon = (name) => ({ name, type: "weapon", system: { type: { value: "martialM", baseItem: "" }, equipped: true, proficient: 1, quantity: 1,
      damage: { base: { number: 1, denomination: 12, bonus: "", types: ["slashing"], custom: { enabled: false, formula: "" } } }, range: { reach: 5, units: "ft" },
      activities: { ak5eLiveAtk00001: attackActivity("ak5eLiveAtk00001", "Attack") } } });
    const ids = { suffix, ownerId: owner.id, observerId: observer.id, sceneId: scene.id, actors: {}, tokens: {} };
    const makeToken = async (actor, x, y, disposition) => {
      const data = await actor.getTokenDocument({ x, y }); data.updateSource({ name: actor.name, actorLink: true, disposition });
      return (await scene.createEmbeddedDocuments("Token", [data.toObject()]))[0];
    };
    const makeDefender = async (key, branchId, level, x, y, extraFeatures) => {
      const actor = await Actor.implementation.create({ name: `${key} live ${suffix}`, type: "character", ownership: { default: 0, [owner.id]: 3, [observer.id]: 2 },
        flags: { ak5e: { defenderLiveFixture: suffix, defenderLiveRole: key } },
        system: { abilities: { str: { value: 18 }, dex: { value: 10 }, con: { value: 16 }, int: { value: 10 }, wis: { value: 10 }, cha: { value: 10 } }, attributes: { hp: { value: 120, max: 120 }, movement: { walk: 30 } } } });
      const classData = sourceEntryData(entry("class-defender")); classData.system.levels = level;
      await actor.createEmbeddedDocuments("Item", [classData, sourceEntryData(entry(branchId)), ...extraFeatures.map(id => sourceEntryData(entry(id))), weapon(`${key} Greataxe`)]);
      const token = await makeToken(actor, x, y, 1);
      ids.actors[key] = actor.id; ids.tokens[key] = token.uuid;
      return actor;
    };
    await makeDefender("dread", "subclass-defender-dreadnought", 15, 400, 400, ["subclass-feature-defender-dreadnought-9th-level-wrecking-wall-1572"]);
    await makeDefender("art", "subclass-defender-artshield", 15, 400, 700, ["subclass-feature-defender-artshield-4th-level-weapons-of-the-enemy-1558"]);
    const ally = await Actor.implementation.create({ name: `Live Ally ${suffix}`, type: "npc", ownership: { default: 0, [owner.id]: 3 },
      flags: { ak5e: { defenderLiveFixture: suffix } },
      system: { attributes: { hp: { value: 60, max: 60 }, ac: { flat: 12, calc: "flat" } } } });
    ids.actors.ally = ally.id; ids.tokens.ally = (await makeToken(ally, 500, 700, 1)).uuid;
    const enemy = await Actor.implementation.create({ name: `Live Elite ${suffix}`, type: "npc",
      flags: { ak5e: { category: "Elite", defenderLiveFixture: suffix, casting: { enabled: true, ability: "int", recovery: "long", version: 1 }, artsPoints: { maximum: 30, value: 30, maximumArtLevel: 9, ninthLevelCast: false } } },
      system: { abilities: { str: { value: 18 }, dex: { value: 12 }, con: { value: 14 }, int: { value: 16 }, wis: { value: 10 }, cha: { value: 10 } }, attributes: { hp: { value: 300, max: 300 }, ac: { flat: 16, calc: "flat" }, prof: 4 },
        details: { cr: 8 } } });
    await enemy.createEmbeddedDocuments("Item", [weapon("Live Elite Club"), { name: "Live Bolt", type: "spell", flags: { ak5e: { art: { noCastingUnit: true } } }, system: { level: 1, school: "evo", preparation: { mode: "always", prepared: true },
      activities: { ak5eLiveBolt0001: { _id: "ak5eLiveBolt0001", type: "save", name: "Cast", activation: { type: "action", value: 1 }, consumption: { targets: [], scaling: { allowed: false }, spellSlot: false },
        save: { ability: ["dex"], dc: { calculation: "", formula: "13" } }, damage: { onSave: "half", parts: [{ number: 2, denomination: 6, bonus: "", types: ["fire"], custom: { enabled: false, formula: "" }, scaling: { number: 1 } }] } } } } }]);
    ids.actors.enemy = enemy.id; ids.tokens.enemy = (await makeToken(enemy, 900, 400, -1)).uuid;
    return ids;
  });
  const ids = report.fixture;
  await gm.evaluate(async ({ sceneId, actors }) => {
    const scene = game.scenes.get(sceneId); await scene.activate();
    const combat = await Combat.implementation.create({ scene: scene.id, active: true });
    const order = ["dread", "art", "ally", "enemy"];
    await combat.createEmbeddedDocuments("Combatant", order.map((key, i) => { const token = scene.tokens.find(t => t.actorId === actors[key]); return { actorId: token.actorId, tokenId: token.id, sceneId: scene.id, initiative: 40 - i * 10 }; }));
    await combat.startCombat(); await combat.update({ turn: 0, round: 1 });
    if (game.paused) await game.togglePause(false, true);   // the pause banner would cover the map in screenshots
  }, ids);
  await sleep(2500);
  report.fixture.renderer = report.environment.renderer;

  /* ------------------------------------------------------------------ setup (owner client, real dialog) */
  const owner = await join("Defender Live Owner");
  if (process.env.AK5E_DEFENDER_FINISH_ONLY || process.env.AK5E_DEFENDER_BRANCHES_ONLY) {
    await gm.evaluate(async ids => {
      for (const key of ["dread", "art"]) {
        const actor = game.actors.get(ids.actors[key]), preview = game.ak5e.defender.preview(actor);
        await game.ak5e.defender.apply(actor, { confirmed: true, contextKey: preview.contextKey, operationId: `finish_setup_${key}` });
      }
      const actor = game.actors.get(ids.actors.dread), sp = await import("/modules/ak5e/scripts/operator-skills.mjs");
      await game.ak5e.configureOperatorSkills(actor, { enabled: true });
      await sp.submitOperatorCommand(actor, "learn", { sourceId: "operator-skill-defender-basic-power-strike" });
    }, ids);
  } else {
  await check("owner opens controls: unconfigured Defender gets the setup preview dialog, which writes nothing", async () => {
    const before = await owner.evaluate(id => JSON.stringify(game.actors.get(id).getFlag("ak5e", "defender") ?? null), ids.actors.dread);
    await owner.evaluate(id => { void game.ak5e.defender.open(game.actors.get(id)); }, ids.actors.dread);
    const dialog = owner.locator("dialog:has(.ak5e-defender-plan)");
    await dialog.waitFor({ timeout: 15000 });
    const text = await dialog.innerText();
    if (!/Enable Defender support/.test(text) || !/Reaction maximum to 2/.test(text) || !/Dreadnought's Advance/.test(text) || !/Legendary Might/.test(text)) throw new Error(`Setup preview text incomplete: ${text}`);
    await shot(owner, "dread-setup-preview");
    const after = await owner.evaluate(id => JSON.stringify(game.actors.get(id).getFlag("ak5e", "defender") ?? null), ids.actors.dread);
    if (before !== after) throw new Error("Previewing wrote Actor state.");
    await dialog.locator('button[data-action="yes"]').click();
    await owner.waitForFunction(id => game.actors.get(id).getFlag("ak5e", "defender")?.enabled === true, ids.actors.dread, { timeout: 15000 });
    return text.replace(/\s+/g, " ").slice(0, 400);
  });
  await check("GM sets up the Artshield with the public API; a second preview is empty and a replayed receipt is a no-op", () => gm.evaluate(async id => {
    const actor = game.actors.get(id), api = game.ak5e.defender;
    const plan = api.preview(actor);
    if (plan.blocked.length) throw new Error(`blocked ${plan.blocked}`);
    const r1 = await api.apply(actor, { confirmed: true, contextKey: plan.contextKey, operationId: "live_art_setup" });
    const again = api.preview(actor);
    if (!again.empty) throw new Error(`second preview not empty: ${JSON.stringify({ c: again.createEffects.length, u: again.updateEffects.length, a: again.addActivities.length })}`);
    const writes = foundry.utils.deepClone(actor.getFlag("ak5e", "defender"));
    const r2 = await api.apply(actor, { confirmed: true, contextKey: plan.contextKey, operationId: "live_art_setup" });
    if (JSON.stringify(r1) !== JSON.stringify(r2) || JSON.stringify(writes) !== JSON.stringify(actor.getFlag("ak5e", "defender"))) throw new Error("replay changed state");
    return { effects: actor.effects.filter(e => e.getFlag("ak5e", "defenderManagedEffect")).map(e => e.name), reactions: actor.getFlag("ak5e", "reactionBudget")?.max };
  }, ids.actors.art));
  await check("setup also configured the dreadnought: effects, Wrecking Wall activity, Reaction maximum 2", () => gm.evaluate(id => {
    const actor = game.actors.get(id);
    const names = actor.effects.filter(e => e.getFlag("ak5e", "defenderManagedEffect")).map(e => e.name).sort();
    const ww = actor.items.find(i => i.getFlag("ak5e", "chapterThreeId") === "subclass-feature-defender-dreadnought-9th-level-wrecking-wall-1572")?.system.activities.get("ak5eWreckingWall");
    if (!ww) throw new Error("Wrecking Wall activity missing");
    if (ww.type !== "save" || ww.damage.onSave !== "half" || ww.damage.parts[0].number !== 10 || ww.save.ability.first() !== "con") throw new Error(`Wrecking Wall activity malformed: ${JSON.stringify(ww.toObject())}`);
    if (actor.getFlag("ak5e", "reactionBudget")?.max !== 2) throw new Error("Reactive not applied");
    return { names, wreckingWall: { dc: ww.save.dc.value, uses: ww.uses.max } };
  }, ids.actors.dread));

  /* ------------------------------------------------------------------ native data behaviour */
  await check("Legendary Might gives STR +6 capped at 26 (18 -> 24, 20 -> 26, 22 -> 26) and Resilience pool is 8 at level 15", () => gm.evaluate(async id => {
    const actor = game.actors.get(id), got = {};
    for (const base of [18, 20, 22]) { await actor.update({ "system.abilities.str.value": base }); got[base] = actor.system.abilities.str.value; }
    await actor.update({ "system.abilities.str.value": 18 });
    const pool = game.ak5e.resourcePools.getPool(actor, "resilience");
    if (got[18] !== 24 || got[20] !== 26 || got[22] !== 26) throw new Error(`STR results ${JSON.stringify(got)}`);
    if (pool.max !== 8 || pool.value !== 8) throw new Error(`Resilience ${JSON.stringify(pool)}`);
    return { got, pool };
  }, ids.actors.dread));

  /* ------------------------------------------------------------------ Shelter and Arts saves (GM + real rolls) */
  await gm.evaluate(async ({ sceneId, tokens }) => {
    const scene = game.scenes.get(sceneId);
    await canvas.scene?.view?.();
    return scene.id;
  }, ids);
  await sleep(1500);
  await check("Shelter by the Artshield: Bonus Action costs 1 Resilience; a real enemy attack on the ally within 5 ft is rolled at Disadvantage, outside 5 ft or after it ends it is not", () => gm.evaluate(async ({ ids }) => {
    const art = game.actors.get(ids.actors.art), api = game.ak5e.defender;
    const allyToken = fromUuidSync(ids.tokens.ally), artToken = fromUuidSync(ids.tokens.art), enemy = game.actors.get(ids.actors.enemy);
    const attack = enemy.items.getName("Live Elite Club").system.activities.get("ak5eLiveAtk00001");
    const roll = async token => { game.user.targets.forEach(t => t.setTarget(false, { releaseOthers: false, groupSelection: true })); token.object.setTarget(true, { releaseOthers: true });
      const rolls = await attack.rollAttack({ event: null }, { configure: false }, { create: false }); return rolls?.[0]?.options?.advantageMode; };
    const before = art.getFlag("ak5e", "resourcePools")?.resilience?.value ?? 8;
    await game.combat.update({ turn: game.combat.turns.findIndex(t => t.actorId === art.id) });
    const none = await roll(allyToken);
    await api.command(art, "shelter", { activation: "bonus", allies: [allyToken.uuid], alliesConfirmed: true, spellshield: true, tokenUuid: artToken.uuid }, "live_shelter");
    const used = game.ak5e.resourcePools.getPool(art, "resilience").value;
    const near = await roll(allyToken);
    await allyToken.update({ x: 1200 }, { animate: false }); await new Promise(r => setTimeout(r, 800));
    const far = await roll(allyToken);
    await allyToken.update({ x: 500 }, { animate: false }); await new Promise(r => setTimeout(r, 800));
    const stillNear = await roll(allyToken);
    return { none, near, far, stillNear, resilience: [before, used] };
  }, { ids }).then(r => { if (r.none !== 0 || r.near !== -1 || r.far !== 0 || r.stillNear !== -1 || r.resilience[1] !== r.resilience[0] - 1) throw new Error(JSON.stringify(r)); return r; }));
  await check("Arts Resistance: the Artshield's own Save from an Art's chat card is rolled with Advantage; a non-Art save is not", async () => {
    const messageId = await gm.evaluate(async ids => {
      const enemy = game.actors.get(ids.actors.enemy), artToken = fromUuidSync(ids.tokens.art);
      artToken.object.setTarget(true, { releaseOthers: true });
      const activity = enemy.items.getName("Live Bolt").system.activities.get("ak5eLiveBolt0001");
      globalThis.__liveBefore = new Set(game.messages.map(m => m.id));
      globalThis.__liveCast = activity.use({}, { configure: false }, { create: true });   // opens AK5e's Arts casting confirmation
      return true;
    }, ids).then(async () => {
      const use = gm.locator('button[data-action="use"]'); await use.first().waitFor({ timeout: 20000 });
      await shot(gm, "arts-cast-dialog"); await use.first().click();
      await gm.waitForFunction(() => game.messages.some(m => !globalThis.__liveBefore.has(m.id) && m.flags?.dnd5e?.item?.type === "spell"), null, { timeout: 20000 });
      return gm.evaluate(() => game.messages.find(m => !globalThis.__liveBefore.has(m.id) && m.flags?.dnd5e?.item?.type === "spell")?.id ?? null);
    });
    if (!messageId) throw new Error("The enemy's Art did not produce a chat card.");
    await gm.evaluate(ids => { fromUuidSync(ids.tokens.art).object.control({ releaseOthers: true }); }, ids);
    const button = gm.locator(`[data-message-id="${messageId}"] button[data-action="rollSave"]`).first();
    await button.waitFor({ timeout: 15000 });
    const before = await gm.evaluate(() => game.messages.size);
    await button.click({ modifiers: ["Shift"] });
    await gm.waitForFunction(n => game.messages.size > n, before, { timeout: 15000 });
    const mode = await gm.evaluate(() => { const m = game.messages.contents.at(-1); return { type: m.flags?.dnd5e?.roll?.type, mode: m.rolls?.[0]?.options?.advantageMode }; });
    await shot(gm, "art-save-chat");
    if (mode.type !== "save" || mode.mode !== 1) throw new Error(`Expected a save with Advantage: ${JSON.stringify(mode)}`);
    const plain = await gm.evaluate(async ids => { const art = game.actors.get(ids.actors.art); const rolls = await art.rollSavingThrow({ ability: "dex", target: 13 }, { configure: false }, { create: false }); return rolls?.[0]?.options?.advantageMode; }, ids);
    if (plain !== 0) throw new Error(`A save not started from an Art card must stay normal: ${plain}`);
    return mode;
  });
  await check("Spellshield: the sheltered ally gets Advantage on the same Art's save", async () => {
    const messageId = await gm.evaluate(ids => game.messages.contents.filter(m => m.flags?.dnd5e?.item?.type === "spell" && !m.flags?.dnd5e?.roll?.type).at(-1)?.id, ids);
    await gm.evaluate(async ({ ids, messageId }) => {
      await game.ak5e.defender.command(game.actors.get(ids.actors.art), "confirmSpellshieldArt",
        { artMessageUuid: `ChatMessage.${messageId}`, visibleConfirmed: true }, "live_spellshield_art");
    }, { ids, messageId });
    await gm.evaluate(ids => { fromUuidSync(ids.tokens.ally).object.control({ releaseOthers: true }); }, ids);
    const before = await gm.evaluate(() => game.messages.size);
    await gm.locator(`[data-message-id="${messageId}"] button[data-action="rollSave"]`).first().click({ modifiers: ["Shift"] });
    await gm.waitForFunction(n => game.messages.size > n, before, { timeout: 15000 });
    const mode = await gm.evaluate(() => game.messages.contents.at(-1).rolls?.[0]?.options?.advantageMode);
    if (mode !== 1) throw new Error(`advantageMode ${mode}`);
    return { mode };
  });

  /* ------------------------------------------------------------------ Dreadnought's Advance (owner command, GM-run SP) */
  await check("enable Operator SP integration for the dreadnought with a learned Skill (GM)", () => gm.evaluate(async ids => {
    const actor = game.actors.get(ids.actors.dread);
    const sp = await import("/modules/ak5e/scripts/operator-skills.mjs");
    await game.ak5e.configureOperatorSkills(actor, { enabled: true });
    await sp.submitOperatorCommand(actor, "learn", { sourceId: "operator-skill-defender-basic-power-strike" });
    const state = sp.getIntegratedOperatorState(actor);
    if (!sp.isOperatorActor(actor)) throw new Error("Operator integration is not enabled.");
    return { enabled: actor.getFlag("ak5e", "operatorSkills")?.enabled, points: state.points, maximum: state.maximum };
  }, ids));
  await check("Advance: the owner enters it on their Turn; the Damage bonus effect switches on; a second entry is refused; the pool is spent", async () => {
    // Round 2: each combatant's Turn ends once per round, and the Dreadnought's round-1 Turn already ended earlier in this run.
    await gm.evaluate(ids => game.combat.update({ round: 2, turn: game.combat.turns.findIndex(t => t.actorId === ids.actors.dread) }), ids);
    await sleep(1500);
    const result = await owner.evaluate(async ids => {
      const actor = game.actors.get(ids.actors.dread);
      await game.ak5e.defender.command(actor, "advance", { confirmed: true }, "live_advance");
      const fx = actor.effects.find(e => e.getFlag("ak5e", "defenderManagedEffect")?.sourceId === "dreadnought-advance");
      let refused = false; try { await game.ak5e.defender.command(actor, "advance", { confirmed: true }, "live_advance2"); } catch { refused = true; }
      return { disabled: fx.disabled, bonus: actor.system.bonuses.mwak.damage, pool: actor.getFlag("ak5e", "resourcePools")?.dreadnoughtAdvance?.value, refused, state: actor.getFlag("ak5e", "defender").advance };
    }, ids);
    if (result.disabled || !/@prof/.test(result.bonus) || result.pool !== 0 || !result.refused || !result.state.active) throw new Error(JSON.stringify(result));
    return result;
  });
  await check("Advance Skill Points: +3 (level 15) for the dreadnought's Attack Roll and +3 when the Elite attacks it, awarded by the GM client exactly once each", async () => {
    const points = () => gm.evaluate(async id => (await import("/modules/ak5e/scripts/operator-skills.mjs")).getIntegratedOperatorState(game.actors.get(id)).points, ids.actors.dread);
    const start = await points();
    await owner.evaluate(async ids => {
      const actor = game.actors.get(ids.actors.dread), attack = actor.items.getName("dread Greataxe").system.activities.get("ak5eLiveAtk00001");
      fromUuidSync(ids.tokens.enemy).object.setTarget(true, { releaseOthers: true });
      await attack.rollAttack({ event: null }, { configure: false }, { create: true });
    }, ids);
    await sleep(2500);
    const afterAttack = await points();
    await gm.evaluate(async ids => {
      const enemy = game.actors.get(ids.actors.enemy), attack = enemy.items.getName("Live Elite Club").system.activities.get("ak5eLiveAtk00001");
      fromUuidSync(ids.tokens.dread).object.setTarget(true, { releaseOthers: true });
      await attack.rollAttack({ event: null }, { configure: false }, { create: true });
    }, ids);
    await sleep(2500);
    const afterDefence = await points();
    const watch = await gm.evaluate(id => game.actors.get(id).getFlag("ak5e", "defender").advance.watch, ids.actors.dread);
    if (afterAttack - start !== 3 || afterDefence - afterAttack !== 3) throw new Error(`SP ${start} -> ${afterAttack} -> ${afterDefence}`);
    if (!watch.attacked) throw new Error("The Attack was not observed for the Advance window.");
    return { start, afterAttack, afterDefence, watch };
  });
  await check("Crownsplitter: with an Operator Skill active a melee damage roll against the Elite adds twice the STR modifier", async () => {
    const result = await gm.evaluate(async ids => {
      const actor = game.actors.get(ids.actors.dread), attack = actor.items.getName("dread Greataxe").system.activities.get("ak5eLiveAtk00001");
      const previous = foundry.utils.deepClone(actor.getFlag("ak5e", "operatorSkills")?.active ?? null);
      await actor.update({ "flags.ak5e.operatorSkills.active": { id: "live-crownsplitter", sourceId: "live" } });
      fromUuidSync(ids.tokens.enemy).object.setTarget(true, { releaseOthers: true });
      let payload;
      const hook = Hooks.on("dnd5e.preRollDamageV2", (config, _dialog, message) => { if (config.subject?.actor?.id === actor.id) payload = {
        messageKeys: Object.keys(message ?? {}), directTargets: message?.flags?.dnd5e?.targets ?? null,
        dataTargets: message?.data?.flags?.dnd5e?.targets ?? null };
      });
      try {
        const rolls = await attack.rollDamage({ event: null }, { configure: false }, { create: false });
        return { formula: rolls?.[0]?.formula, mod: actor.system.abilities.str.mod, payload };
      } finally { Hooks.off("dnd5e.preRollDamageV2", hook); await actor.update({ "flags.ak5e.operatorSkills.active": previous }); }
    }, ids);
    if (!new RegExp(`\\+ ?${result.mod * 2}\\b`).test(result.formula)) throw new Error(`Formula ${result.formula} lacks ${result.mod * 2}`);
    return result;
  });
  await check("the Advance ends at the end of the Dreadnought's Turn when nothing qualified, and the GM can reinstate it", async () => {
    await gm.evaluate(async ids => {
      const actor = game.actors.get(ids.actors.dread); const state = foundry.utils.deepClone(actor.getFlag("ak5e", "defender"));
      state.advance.watch = { attacked: false, dealt: false, forcedSave: false, tookDamage: false };
      state.advanceWindow = { attacked: false, dealt: false, forcedSave: false, tookDamage: false };
      await actor.update({ "flags.ak5e.defender": state });
      await game.combat.nextTurn();
    }, ids);
    await sleep(2500);
    const ended = await gm.evaluate(ids => { const a = game.actors.get(ids.actors.dread); return { active: a.getFlag("ak5e", "defender").advance.active, by: a.getFlag("ak5e", "defender").advance.endedBy, bonus: a.system.bonuses.mwak.damage }; }, ids);
    if (ended.active || ended.by !== "noQualifyingAction" || /@prof/.test(ended.bonus ?? "")) throw new Error(JSON.stringify(ended));
    await gm.evaluate(ids => game.ak5e.defender.command(game.actors.get(ids.actors.dread), "reinstateAdvance", { reason: "Live test: an Attack was made off-camera." }, "live_reinstate"), ids);
    const back = await gm.evaluate(ids => game.actors.get(ids.actors.dread).getFlag("ak5e", "defender").advance.active, ids);
    if (!back) throw new Error("not reinstated");
    return ended;
  });

  /* ------------------------------------------------------------------ Artshield: Absorb / Expel, Eye of the Storm */
  await check("Expel Absorbed Arts is refused with nothing stored; Absorb stores one charge; the activity then runs and consumes it", async () => {
    const result = await gm.evaluate(async ids => {
      const art = game.actors.get(ids.actors.art), api = game.ak5e.defender;
      const item = art.items.find(i => i.getFlag("ak5e", "chapterThreeId") === "subclass-feature-defender-artshield-4th-level-weapons-of-the-enemy-1558");
      const activity = item.system.activities.get("ak5eArtsExpel001");
      if (!activity) throw new Error("Expel activity missing");
      // It is the Artshield's turn only after the combat advances; make the check independent of turn order.
      const combat = game.combat; await combat.update({ turn: combat.turns.findIndex(t => t.actorId === art.id) });
      const message = game.messages.size;
      await activity.use({ create: { measuredTemplate: false } }, { configure: false }, { create: true });
      const refused = game.messages.size === message && !art.getFlag("ak5e", "defender").absorbed;
      await api.command(art, "absorb", { artsDamageConfirmed: true, art: "Live Bolt" }, "live_absorb");
      const stored = !!art.getFlag("ak5e", "defender").absorbed;
      await activity.use({ create: { measuredTemplate: false } }, { configure: false }, { create: true });
      await new Promise(r => setTimeout(r, 1500));
      return { refused, stored, consumed: art.getFlag("ak5e", "defender").absorbed === null, formula: activity.damage.parts[0].custom.formula, rolled: game.messages.contents.at(-1)?.flags?.dnd5e?.item?.id === item.id };
    }, ids);
    await shot(gm, "expel-chat");
    if (!result.refused || !result.stored || !result.consumed) throw new Error(JSON.stringify(result));
    return result;
  });
  await check("Wrecking Wall: the native activity posts a Constitution save card with the 10d6 bludgeoning damage button", async () => {
    const result = await gm.evaluate(async ids => {
      const dread = game.actors.get(ids.actors.dread);
      const item = dread.items.find(i => i.getFlag("ak5e", "chapterThreeId") === "subclass-feature-defender-dreadnought-9th-level-wrecking-wall-1572"), activity = item.system.activities.get("ak5eWreckingWall");
      fromUuidSync(ids.tokens.enemy).object.setTarget(true, { releaseOthers: true });
      await activity.use({}, { configure: false }, { create: true });
      await new Promise(r => setTimeout(r, 1000));
      const message = game.messages.contents.at(-1);
      const rolls = await activity.rollDamage({ event: null }, { configure: false }, { create: false });
      return { buttons: [...document.querySelectorAll(`[data-message-id="${message.id}"] button`)].map(b => b.innerText.trim().replace(/\s+/g, " ")), formula: rolls?.[0]?.formula, uses: activity.uses.value };
    }, ids);
    await shot(gm, "wrecking-wall-chat");
    if (!result.buttons.some(b => /Constitution|DC/.test(b)) || result.formula !== "10d6") throw new Error(JSON.stringify(result));
    return result;
  });
  await check("Eye of the Storm: Reaction + pool spent, a 20-ft flagged template is placed on the scene, and it ends at the end of the Artshield's next Turn", async () => {
    const result = await gm.evaluate(async ids => {
      const art = game.actors.get(ids.actors.art), combat = game.combat;
      await combat.update({ turn: combat.turns.findIndex(t => t.actorId === ids.actors.enemy) });
      await new Promise(r => setTimeout(r, 2500));   // let the Artshield's own turn-end event from this change finish first
      const out = await game.ak5e.defender.command(art, "eyeOfTheStorm", { triggerId: "live-cast", radius: 20, reactionConfirmed: true, tokenUuid: ids.tokens.art }, "live_eye");
      const scene = game.scenes.get(ids.sceneId);
      const template = scene.templates.find(t => t.flags?.ak5e?.eyeOfTheStorm?.actorUuid === art.uuid);
      return { out, template: template ? { distance: template.distance, t: template.t } : null, pool: art.getFlag("ak5e", "resourcePools")?.eyeOfTheStorm?.value, reactions: art.getFlag("ak5e", "reactionBudget")?.spent };
    }, ids);
    await sleep(3500); await shot(gm, "eye-of-the-storm-map");
    const stillUp = await gm.evaluate(ids => ({ active: game.actors.get(ids.actors.art).getFlag("ak5e", "defender").barrier?.active, placeables: canvas.templates.placeables.filter(t => t.document.flags?.ak5e?.eyeOfTheStorm).length }), ids);
    if (!stillUp.active || stillUp.placeables !== 1) throw new Error(`The barrier should still be up and drawn before the Artshield's next Turn ends: ${JSON.stringify(stillUp)}`);
    if (!result.template || result.template.distance !== 20 || result.pool !== 0 || result.reactions !== 1) throw new Error(JSON.stringify(result));
    const ended = await gm.evaluate(async ids => {
      const combat = game.combat;
      for (let i = 0; i < 6 && game.actors.get(ids.actors.art).getFlag("ak5e", "defender").barrier?.active; i++) { await combat.nextTurn(); await new Promise(r => setTimeout(r, 1200)); }
      const scene = game.scenes.get(ids.sceneId);
      return { active: game.actors.get(ids.actors.art).getFlag("ak5e", "defender").barrier?.active, templates: scene.templates.filter(t => t.flags?.ak5e?.eyeOfTheStorm).length, round: combat.round };
    }, ids);
    if (ended.active || ended.templates !== 0) throw new Error(JSON.stringify(ended));
    return { ...result, ended };
  });

  /* ------------------------------------------------------------------ UI inspection and permissions */
  await check("owner sheet shows the Defender panel and controls dialog lists only the features this level and Branch have; screenshots taken", async () => {
    await owner.evaluate(id => { void game.actors.get(id).sheet.render(true); }, ids.actors.dread);
    await sleep(1500);
    await owner.locator('nav [data-tab="features"], [data-action="tab"][data-tab="features"], a[data-tab="features"]').first().click().catch(() => {});
    await sleep(500);
    const panel = owner.locator(".ak5e-defender-sheet-panel").first();
    await panel.waitFor({ timeout: 10000 });
    await shot(owner, "dread-sheet-features");
    await owner.evaluate(id => { void game.ak5e.defender.open(game.actors.get(id)); }, ids.actors.dread);
    const dialog = owner.locator("dialog:has(.ak5e-defender-panel)");
    await dialog.waitFor({ timeout: 10000 });
    const labels = await dialog.locator("button[data-defender-ui]").allInnerTexts();
    await shot(owner, "dread-controls");
    const must = ["Take the Shelter Action", "Leaping Defence", "Enter the Advance", "Leaping Offence", "Tear them Down"], mustNot = ["Absorb Arts", "Eye of the Storm", "Indestructible", "Reinstate the Advance (GM)"];
    for (const label of must) if (!labels.some(l => l.includes(label))) throw new Error(`Missing ${label}: ${labels}`);
    for (const label of mustNot) if (labels.some(l => l.includes(label))) throw new Error(`Unexpected ${label}: ${labels}`);
    await dialog.locator('button[data-defender-ui="shelter"]').click();
    const form = owner.locator("dialog:has(.ak5e-defender-form)");
    await form.waitFor({ timeout: 10000 });
    await shot(owner, "shelter-form");
    const legible = await form.evaluate(el => ({ overflowX: el.scrollWidth > el.clientWidth + 2, text: el.innerText.slice(0, 300) }));
    if (legible.overflowX) throw new Error("Shelter form overflows horizontally.");
    await form.locator('button[data-action="cancel"], button[data-action="close"]').first().click().catch(() => owner.keyboard.press("Escape"));
    return labels;
  });
  }
  const observer = await join("Defender Live Observer");
  await check("observer: no Defender controls, and commands are rejected", async () => {
    const result = await observer.evaluate(async ids => {
      const actor = game.actors.get(ids.actors.dread); let rejected = false;
      try { await game.ak5e.defender.command(actor, "shelter", { activation: "action", allies: ["x"], alliesConfirmed: true, positionConfirmed: true }, "live_observer"); } catch { rejected = true; }
      void actor.sheet.render(true); await new Promise(r => setTimeout(r, 1500));
      return { owns: actor.isOwner, rejected, panel: !!document.querySelector(".ak5e-defender-sheet-panel"), header: !!document.querySelector('[data-action="ak5eDefender"]') };
    }, ids);
    await shot(observer, "observer-sheet");
    if (result.owns || !result.rejected || result.panel || result.header) throw new Error(JSON.stringify(result));
    return result;
  });

  if (!process.env.AK5E_DEFENDER_BRANCHES_ONLY) await defenderFinishLiveChecks({ gm, owner, observer, ids, check, shot });
  await defenderBranchesLiveChecks({ gm, owner, observer, ids, check, shot });
  report.branchPersistence = await gm.evaluate(fixture => Object.fromEntries([fixture.guardian, fixture.fortress, fixture.enemy].map(({ actorId }) => {
    const actor = game.actors.get(actorId);
    return [actorId, { flags: actor.flags.ak5e, items: actor.items.map(item => item.id).sort(),
      effects: actor.effects.map(effect => ({ id: effect.id, flags: effect.flags.ak5e, changes: effect.changes })).sort((a, b) => a.id.localeCompare(b.id)) }];
  })), ids.defenderBranches);

  /* ------------------------------------------------------------------ persistence */
  report.persistence = await gm.evaluate(ids => Object.fromEntries(["dread", "art"].map(key => { const a = game.actors.get(ids.actors[key]);
    return [key, { effects: a.effects.filter(e => e.getFlag("ak5e", "defenderManagedEffect")).map(e => e.name).sort(), resilience: a.getFlag("ak5e", "resourcePools")?.resilience ?? null,
      items: a.items.size, abilities: a._source.system.abilities, hp: a.system.attributes.hp,
      flags: Object.fromEntries(["defenderProgression", "defenderTalentState", "defenderConcentrationBreakers", "defenderConcentrationBreakerOps", "operatorSkills"].map(flag => [flag, a.getFlag("ak5e", flag) ?? null])) }]; })), ids);
  await gm.reload(); await gm.waitForFunction(() => game.ready && game.ak5e?.defender, null, { timeout: 90000 });
  await check("browser reload: Guardian/Fortress receipts, Arts and manual riders persist", () => gm.evaluate(expected => {
    for (const [id, snapshot] of Object.entries(expected)) {
      const actor = game.actors.get(id), actual = { flags: actor?.flags.ak5e, items: actor?.items.map(item => item.id).sort(),
        effects: actor?.effects.map(effect => ({ id: effect.id, flags: effect.flags.ak5e, changes: effect.changes })).sort((a, b) => a.id.localeCompare(b.id)) };
      if (JSON.stringify(actual) !== JSON.stringify(snapshot)) throw new Error(`Branch Actor ${id} changed across reload.`);
    }
    return true;
  }, report.branchPersistence));
  await check("after a browser reload the setup, effects, pools and receipts persist and no hook re-imported anything", () => gm.evaluate(({ ids, persistence }) => {
    for (const key of ["dread", "art"]) {
      const a = game.actors.get(ids.actors[key]), state = a.getFlag("ak5e", "defender");
      if (!state?.enabled || !state.operations.length) throw new Error(`${key} lost state`);
      const effects = a.effects.filter(e => e.getFlag("ak5e", "defenderManagedEffect")).map(e => e.name).sort();
      if (JSON.stringify(effects) !== JSON.stringify(persistence[key].effects)) throw new Error(`${key} effects ${effects}`);
      if (JSON.stringify(a.getFlag("ak5e", "resourcePools")?.resilience ?? null) !== JSON.stringify(persistence[key].resilience ?? null)) throw new Error(`${key} Resilience changed: ${JSON.stringify(a.getFlag("ak5e", "resourcePools")?.resilience)} vs ${JSON.stringify(persistence[key].resilience)}`);
      if (a.items.filter(i => i.getFlag("ak5e", "chapterThreeId") === "class-defender").length !== 1) throw new Error(`${key} duplicate class Items`);
      for (const flag of Object.keys(persistence[key].flags))
        if (JSON.stringify(a.getFlag("ak5e", flag) ?? null) !== JSON.stringify(persistence[key].flags[flag])) throw new Error(`${key} ${flag} changed across reload`);
      if (a.items.size !== persistence[key].items || JSON.stringify(a._source.system.abilities) !== JSON.stringify(persistence[key].abilities)
        || JSON.stringify(a.system.attributes.hp) !== JSON.stringify(persistence[key].hp)) throw new Error(`${key} native progression data changed across reload`);
    }
    return true;
  }, { ids, persistence: report.persistence }));

  report.errors = report.errors.filter(e => !/ActiveEffect is not a valid choice|ReadPixels|GPU stall/.test(e));
  report.consoleErrorsFailed = report.errors.length > 0;
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.checks.every(c => c.ok) && !report.errors.length ? 0 : 1;
  }
} finally {
  try { await writeFile(`${output}.json`, JSON.stringify(report, null, 2)); }
  finally { await Promise.allSettled(contexts.map(context => context.close())); await browser.close(); }
}
