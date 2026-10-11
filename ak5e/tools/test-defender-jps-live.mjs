/** Disposable Foundry 13 / D&D5e live checks for the Juggernaut, Protector and Sentry Defender Branches.
 * Never targets a non-test World: refuses anything but `standard-test`. Uses launchTestBrowser().
 * Env: AK5E_PLAYWRIGHT, AK5E_CHROMIUM, AK5E_NATIVE_VULKAN=1, AK5E_JPS_OUTPUT (artifact prefix), AK5E_JPS_PORT (default 30185),
 * AK5E_JPS_RESTART_REPORT (verify a previous run's persistence after a server restart). */
import { readFile, writeFile } from "node:fs/promises";
import { launchTestBrowser } from "./test-browser.mjs";

const { chromium } = await import(process.env.AK5E_PLAYWRIGHT ?? "playwright");
const browser = await launchTestBrowser(chromium, {
  ...(process.env.AK5E_CHROMIUM ? { executablePath: process.env.AK5E_CHROMIUM } : {}),
  ...(process.env.AK5E_NATIVE_VULKAN ? { args: ["--disable-gpu-sandbox", "--ignore-gpu-blocklist", "--enable-webgl", "--use-angle=vulkan", "--use-vulkan=native", "--disable-vulkan-surface", "--enable-features=Vulkan"] } : {})
});
const output = process.env.AK5E_JPS_OUTPUT ?? "/tmp/ak5e-jps-live";
const base = `http://127.0.0.1:${process.env.AK5E_JPS_PORT ?? 30185}/join`;
const report = { world: "standard-test", errors: [], screenshots: [], checks: [], fixture: {} };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function join(name) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1050 } });
  const page = await context.newPage();
  page.setDefaultTimeout(25000);
  page.on("pageerror", error => report.errors.push(`${name}: ${error.stack ?? error.message}`));
  page.on("console", message => { if (message.type() === "error") report.errors.push(`${name}: ${message.text()}`); });
  await page.goto(base);
  await page.selectOption('select[name="userid"]', { label: name, timeout: 20000 });
  await page.click('button[name="join"]');
  await page.waitForFunction(() => globalThis.game?.ready && globalThis.game.ak5e?.defender, null, { timeout: 90000 });
  await page.evaluate(() => { for (const app of foundry.applications.instances.values()) if (/UserConfig/.test(app.constructor.name) || app.element?.querySelector?.(".ak5e-skill-choices")) void app.close(); });
  const worldId = await page.evaluate(() => game.world.id);
  if (worldId !== "standard-test") throw new Error(`Refusing World ${worldId}; only disposable standard-test is allowed.`);
  return page;
}
/** Close unrelated windows (new characters' Operator Skill chooser), then optionally show the chat log in the sidebar. */
async function tidy(page, { chat = false } = {}) {
  await page.evaluate(async chat => {
    for (const app of foundry.applications.instances.values())
      if (app.element?.querySelector?.(".ak5e-skill-choices") || /^Choose Skills/.test(app.title ?? app.options?.window?.title ?? "")) void app.close();
    if (chat) { await ui.sidebar?.expand?.(); ui.sidebar?.changeTab?.("chat", "primary"); ui.chat?.scrollBottom?.(); }
  }, chat).catch(() => {});
  await sleep(700);
}
async function shot(page, key, options = {}) {
  await tidy(page, options);
  const path = `${output}-${key}.png`;
  await page.screenshot({ path, fullPage: false });
  report.screenshots.push(path);
  return path;
}
async function check(name, task) {
  let timeout;
  try { const detail = await Promise.race([task(), new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("check timed out after 120 s")), 120000); })]); report.checks.push({ name, ok: true, detail: detail ?? null }); console.log(`PASS ${name}`); }
  catch (error) { report.checks.push({ name, ok: false, error: error.message }); console.log(`FAIL ${name}: ${error.message}`); }
  finally { clearTimeout(timeout); }
}
/** The persisted state of every fixture Actor and the Scene's templates, compared across a server restart. */
const persistence = (page, ids) => page.evaluate(ids => {
  const out = {};
  for (const [key, id] of Object.entries(ids.actors)) {
    const actor = game.actors.get(id);
    out[key] = { flags: { uses: actor?.flags.ak5e?.defenderUses ?? null, pools: actor?.flags.ak5e?.resourcePools ?? null, shelter: actor?.flags.ak5e?.defender?.shelter ?? null },
      hp: actor?.system.attributes.hp.value ?? null, items: actor?.items.map(item => `${item.id}:${item.system.equipped ?? ""}`).sort() ?? [],
      effects: actor?.effects.map(effect => `${effect.id}:${effect.disabled}:${JSON.stringify(effect.flags.ak5e?.defenderUsesEffect ?? null)}`).sort() ?? [] };
  }
  out.templates = game.scenes.get(ids.sceneId)?.templates.map(template => template.id).sort() ?? [];
  return out;
}, ids);

try {
  const gm = await join("Gamemaster");
  if (!await gm.evaluate(() => game.modules.get("ak5e")?.active === true)) throw new Error("AK5e must be enabled in the disposable standard-test World.");
  report.environment = await gm.evaluate(() => ({ foundry: game.version, system: game.system.version, module: game.modules.get("ak5e").version, world: game.world.id,
    renderer: (() => { const gl = canvas?.app?.renderer?.gl; const ext = gl?.getExtension("WEBGL_debug_renderer_info"); return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unavailable"; })() }));
  if (report.environment.system !== "5.3.3") throw new Error(`Expected D&D5e 5.3.3; found ${report.environment.system}.`);

  if (process.env.AK5E_JPS_RESTART_REPORT) {
    const previous = JSON.parse(await readFile(process.env.AK5E_JPS_RESTART_REPORT, "utf8"));
    await check("restart: Branch receipts, pools, effects, templates and equipped shields persisted", async () => {
      const now = await persistence(gm, previous.fixture);
      if (JSON.stringify(now) !== JSON.stringify(previous.persistence)) throw new Error(`Persisted state changed: ${JSON.stringify(now).slice(0, 400)}`);
      return { actors: Object.keys(now).length - 1, templates: now.templates.length };
    });
    await gm.evaluate(ids => game.scenes.get(ids.sceneId)?.view(), previous.fixture); await sleep(2500);
    await shot(gm, "restart-scene");
  } else {
    /* -------------------------------------------------------------- fixture */
    report.fixture = await gm.evaluate(async () => {
      const assert = (c, m) => { if (!c) throw new Error(m); };
      const { CHAPTER_THREE_CLASSES } = await import("/modules/ak5e/scripts/chapter-three-content.mjs");
      const { sourceEntryData } = await import("/modules/ak5e/scripts/caster-setup.mjs");
      for (const combat of game.combats.filter(c => c.scene?.getFlag("ak5e", "jpsLiveFixture"))) await combat.delete();
      for (const scene of game.scenes.filter(sc => sc.getFlag("ak5e", "jpsLiveFixture"))) await scene.delete();
      for (const actor of game.actors.filter(a => a.getFlag("ak5e", "jpsLiveFixture"))) await actor.delete();
      const suffix = foundry.utils.randomID(6);
      const owner = game.users.getName("Defender Live Owner") ?? await User.implementation.create({ name: "Defender Live Owner", role: 1, password: "" });
      const scene = await Scene.implementation.create({ name: `JPS Live Arena ${suffix}`, width: 2400, height: 1400, padding: 0, tokenVision: false,
        grid: { type: 1, size: 100, distance: 5, units: "ft" }, flags: { ak5e: { jpsLiveFixture: suffix } } });
      await scene.update({ active: true }); await scene.view();
      const entry = id => { const e = CHAPTER_THREE_CLASSES.find(row => row.id === id); assert(e, `missing source record ${id}`); return e; };
      const features = branch => CHAPTER_THREE_CLASSES.filter(row => row.kind === "subclass-feature" && row.parentBranch === branch && Number(row.level) > 0).map(row => row.id);
      const ids = { suffix, ownerId: owner.id, sceneId: scene.id, actors: {}, tokens: {}, items: {} };
      const token = async (actor, x, y, disposition) => {
        const data = await actor.getTokenDocument({ x, y }); data.updateSource({ name: actor.name, actorLink: true, disposition });
        return (await scene.createEmbeddedDocuments("Token", [data.toObject()]))[0];
      };
      const melee = (name, denomination = 10) => ({ name, type: "weapon", system: { type: { value: "martialM", baseItem: "" }, equipped: true, proficient: 1, quantity: 1,
        damage: { base: { number: 1, denomination, bonus: "", types: ["slashing"], custom: { enabled: false, formula: "" } } }, range: { reach: 5, units: "ft" },
        activities: { ak5eJpsAttack001: { _id: "ak5eJpsAttack001", type: "attack", name: "Attack", activation: { type: "action", value: 1 },
          attack: { ability: "str", bonus: "", critical: { threshold: null }, flat: false, type: { value: "melee", classification: "weapon" } },
          damage: { critical: { bonus: "" }, includeBase: true, parts: [] }, consumption: { targets: [], scaling: { allowed: false }, spellSlot: false } } } } });
      const defender = async (key, branch, level, x, y, extra = []) => {
        const actor = await Actor.implementation.create({ name: `${key} ${suffix}`, type: "character", ownership: { default: 0, [owner.id]: 3 },
          flags: { ak5e: { jpsLiveFixture: suffix } },
          system: { abilities: { str: { value: 18 }, dex: { value: 12 }, con: { value: 16 }, int: { value: 10 }, wis: { value: 10 }, cha: { value: 10 } }, attributes: { hp: { value: 120, max: 120 }, movement: { walk: 30 } } } });
        const cls = sourceEntryData(entry("class-defender")); cls.system.levels = level;
        await actor.createEmbeddedDocuments("Item", [cls, sourceEntryData(entry(`subclass-defender-${branch}`)), ...features(branch[0].toUpperCase() + branch.slice(1)).map(id => sourceEntryData(entry(id))), ...extra]);
        const plan = game.ak5e.defender.preview(actor);
        await game.ak5e.defender.apply(actor, { confirmed: true, contextKey: plan.contextKey, operationId: `setup_${key}_${suffix}` });
        ids.actors[key] = actor.id; ids.tokens[key] = (await token(actor, x, y, 1)).uuid;
        return actor;
      };
      const shield = { name: "Defender Shield", type: "equipment", system: { equipped: true, type: { value: "shield" }, armor: { value: 0 } },
        flags: { ak5e: { tableData: { category: "Heavy Shields", name: "Defender Shield", "damage reduction": "2 (Physical)", special: "Bastion, Stealth Disadvantage" } } } };
      const heavyArmour = { name: "Juggernaut Armour", type: "equipment", system: { equipped: true, type: { value: "heavy" }, armor: { value: 12 } } };
      const bow = { name: "Bow", type: "weapon", system: { type: { value: "martialR", baseItem: "" }, equipped: true, proficient: 1, quantity: 1,
        damage: { base: { number: 1, denomination: 8, bonus: "", types: ["piercing"], custom: { enabled: false, formula: "" } } }, range: { value: 75, long: 200, units: "ft" },
        activities: { ak5eJpsRanged001: { _id: "ak5eJpsRanged001", type: "attack", name: "Shoot", activation: { type: "action", value: 1 },
          attack: { ability: "dex", bonus: "", critical: { threshold: null }, flat: false, type: { value: "ranged", classification: "weapon" } },
          damage: { critical: { bonus: "" }, includeBase: true, parts: [] }, consumption: { targets: [], scaling: { allowed: false }, spellSlot: false } } } } };
      await defender("juggernaut", "juggernaut", 12, 300, 300, [heavyArmour, melee("Juggernaut Greataxe", 12)]);
      await defender("protector", "protector", 15, 300, 700, [shield, melee("Protector Mace", 6)]);
      await defender("sentry", "sentry", 15, 1300, 700, [{ ...shield }, bow]);
      const npc = async (key, x, y, disposition, ownership = { default: 0 }) => {
        const actor = await Actor.implementation.create({ name: `${key} ${suffix}`, type: "npc", ownership, flags: { ak5e: { jpsLiveFixture: suffix } },
          system: { details: { type: { value: "humanoid" } }, abilities: { str: { value: 14 }, dex: { value: 10 } }, attributes: { hp: { value: 60, max: 60 }, ac: { flat: 12, calc: "flat" } } } });
        await actor.createEmbeddedDocuments("Item", [melee(`${key} Sword`, 8)]);
        ids.actors[key] = actor.id; ids.tokens[key] = (await token(actor, x, y, disposition)).uuid;
        return actor;
      };
      await npc("enemy", 800, 300, -1);
      await npc("ally", 400, 700, 1);            // owned by the GM only: Protector changes to it go through the relay
      await npc("pally", 1200, 700, 1);          // the Sentry's Pavise ally
      await npc("raider", 1800, 700, -1);         // beyond the Sentry's shield, seen from the Pavise ally
      await npc("lurker", 900, 700, -1);          // on the ally's own side of the shield
      return ids;
    });
    const ids = report.fixture;
    const owner = await join("Defender Live Owner");
    await owner.evaluate(id => game.scenes.get(id)?.view(), ids.sceneId); await sleep(2000);

    /* -------------------------------------------------------------- Juggernaut */
    await check("Juggernaut: native Apply Damage from an enemy card is halved once, previews change nothing, a layer shatters with a Shatterstorm Roll button", () => gm.evaluate(async ids => {
      const j = game.actors.get(ids.actors.juggernaut), enemy = game.actors.get(ids.actors.enemy);
      const layers = () => j.getFlag("ak5e", "resourcePools")?.barrierLayers?.value ?? 2;
      const message = await ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ actor: enemy }), content: "JPS live damage source", flags: { dnd5e: { roll: { type: "damage" } } } });
      for (let i = 0; i < 3; i++) { const preview = j.calculateDamage([{ value: 11, type: "slashing" }], { originatingMessage: message }); if (preview.amount !== 5) throw new Error(`preview ${preview.amount}`); }
      if (layers() !== 2) throw new Error(`a preview used a layer (${layers()})`);
      const before = j.system.attributes.hp.value;
      await j.applyDamage([{ value: 11, type: "slashing" }], { originatingMessage: message });
      await new Promise(resolve => setTimeout(resolve, 1500));
      const after = j.system.attributes.hp.value;
      if (before - after !== 5) throw new Error(`took ${before - after}, expected 5`);
      if (layers() !== 1) throw new Error(`layers ${layers()}, expected 1`);
      const own = j.calculateDamage([{ value: 11, type: "slashing" }], {});
      if (own.amount !== 11) throw new Error("Damage without a chat card was changed");
      const receipt = game.ak5e.defender.uses(j).find(use => use.command === "barrierShatter");
      if (receipt?.status !== "awaitingRoll" || receipt.formula !== "1d8 + 3") throw new Error(`receipt ${JSON.stringify(receipt)}`);
      return { took: before - after, layers: layers(), formula: receipt.formula };
    }, ids));
    await check("Juggernaut: Overwhelming Might adds a Force die to a melee damage roll while a layer holds", () => gm.evaluate(async ids => {
      const j = game.actors.get(ids.actors.juggernaut), activity = j.items.getName("Juggernaut Greataxe").system.activities.contents[0];
      const rolls = await activity.rollDamage({ event: null }, { configure: false }, { create: false });
      const types = rolls.map(roll => roll.options.type);
      if (!types.includes("force")) throw new Error(`roll types ${types}`);
      return { formulas: rolls.map(roll => roll.formula), types };
    }, ids));
    await check("Juggernaut: undo of the shatter restores the layer; Reform and Bullrush cards from the player", async () => {
      // The shatter receipt is written on the GM's client; wait until the player's client has it.
      await owner.waitForFunction(id => game.ak5e.defender.uses(game.actors.get(id)).some(use => use.command === "barrierShatter"), ids.actors.juggernaut, { timeout: 20000 });
      const result = await owner.evaluate(async ids => {
        const j = game.actors.get(ids.actors.juggernaut), use = game.ak5e.defender.use;
        const shatter = game.ak5e.defender.uses(j).find(entry => entry.command === "barrierShatter");
        await use(j, "useRoll", { useId: shatter.id }, foundry.utils.randomID());
        await use(j, "undoUse", { useId: shatter.id }, foundry.utils.randomID());
        const restored = j.getFlag("ak5e", "resourcePools").barrierLayers.value;
        await use(j, "bullrush", { confirmed: true }, foundry.utils.randomID());
        return { restored, bullrush: j.getFlag("ak5e", "resourcePools").bullrush.value };
      }, ids);
      if (result.restored !== 2 || result.bullrush !== 0) throw new Error(JSON.stringify(result));
      await sleep(1200); await shot(owner, "juggernaut-cards", { chat: true });
      return result;
    });

    /* -------------------------------------------------------------- Protector */
    await check("Protector: a player's Stone Wall failed save puts Off Balance on a GM-owned enemy through the relay; attacks against it have Advantage", async () => {
      const relayed = await owner.evaluate(async ids => {
        const p = game.actors.get(ids.actors.protector), enemy = game.actors.get(ids.actors.enemy), use = game.ak5e.defender.use;
        const wall = foundry.utils.randomID();
        await use(p, "stoneWall", { confirmed: true, attackerUuid: enemy.uuid, triggerId: "live-hit", hitConfirmed: true }, wall);
        await use(p, "stoneWallFailed", { confirmed: true, stoneWallUseId: wall, targetUuid: enemy.uuid, failedSave: true }, foundry.utils.randomID());
        return enemy.isOwner;
      }, ids);
      await sleep(2500);
      return gm.evaluate(async ({ ids, relayed }) => {
        const enemy = game.actors.get(ids.actors.enemy), marks = enemy.effects.filter(effect => effect.flags.ak5e?.defenderUsesEffect?.protectorMark);
        if (!marks.some(effect => effect.flags.ak5e.defenderUsesEffect.protectorMark === "offBalance")) throw new Error(`no Off Balance on the enemy (${marks.length} marks)`);
        const ally = game.actors.get(ids.actors.ally), token = canvas.tokens.get(fromUuidSync(ids.tokens.enemy).id);
        token.setTarget(true, { releaseOthers: true });
        const rolls = await ally.items.contents.find(item => item.type === "weapon").system.activities.contents[0].rollAttack({ event: null }, { configure: false }, { create: false });
        token.setTarget(false);
        if (rolls?.[0]?.options?.advantageMode !== 1) throw new Error(`advantageMode ${rolls?.[0]?.options?.advantageMode}`);
        return { playerOwnedEnemy: relayed, marks: marks.map(effect => effect.flags.ak5e.defenderUsesEffect.protectorMark) };
      }, { ids, relayed });
    });
    await check("Protector: Shelter with Anchor Point is 10 ft; the ally rolls Dexterity saves with Advantage; Greater Improved Shelter halves its first Damage only", async () => {
      await owner.evaluate(async ids => {
        await game.ak5e.defender.command(game.actors.get(ids.actors.protector), "shelter", { activation: "action", allies: [ids.tokens.ally], alliesConfirmed: true, anchorPoint: true }, foundry.utils.randomID());
      }, ids);
      await sleep(2500);
      return gm.evaluate(async ids => {
        const p = game.actors.get(ids.actors.protector), ally = game.actors.get(ids.actors.ally), enemy = game.actors.get(ids.actors.enemy);
        if (p.getFlag("ak5e", "defender").shelter.radius !== 10) throw new Error("radius not 10");
        const save = await ally.rollSavingThrow({ ability: "dex" }, { configure: false }, { create: false });
        if (save?.[0]?.options?.advantageMode !== 1) throw new Error(`save advantageMode ${save?.[0]?.options?.advantageMode}`);
        const gis = ally.effects.filter(effect => effect.flags.ak5e?.defenderUsesEffect?.protectorMark === "gis" && !effect.disabled);
        if (gis.length !== 1) throw new Error(`GIS effects on the ally: ${gis.length}`);
        const message = await ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ actor: enemy }), content: "JPS live damage source", flags: { dnd5e: { roll: { type: "damage" } } } });
        const before = ally.system.attributes.hp.value;
        await ally.applyDamage([{ value: 10, type: "slashing" }], { originatingMessage: message });
        await new Promise(resolve => setTimeout(resolve, 1200));
        const first = before - ally.system.attributes.hp.value;
        await ally.applyDamage([{ value: 10, type: "slashing" }], { originatingMessage: message });
        await new Promise(resolve => setTimeout(resolve, 800));
        const second = before - first - ally.system.attributes.hp.value;
        if (first !== 5 || second !== 10) throw new Error(`first ${first}, second ${second}`);
        return { first, second };
      }, ids);
    });
    await shot(gm, "protector-gm", { chat: true });

    /* -------------------------------------------------------------- Sentry */
    await check("Sentry: the player plants a Pavise template (shield unequipped by reading); an attack from beyond it on the ally has Disadvantage, from the near side none", async () => {
      await owner.evaluate(async ids => {
        await game.ak5e.defender.use(game.actors.get(ids.actors.sentry), "plantPavise", { confirmed: true, allies: [ids.tokens.pally], alliesConfirmed: true, reading: "unequip" }, foundry.utils.randomID());
      }, ids);
      await sleep(2000);
      const result = await gm.evaluate(async ids => {
        const scene = game.scenes.get(ids.sceneId), s = game.actors.get(ids.actors.sentry), raider = game.actors.get(ids.actors.raider);
        const template = scene.templates.find(t => t.flags.ak5e?.sentryPavise?.actorUuid === s.uuid);
        if (!template) throw new Error("no Pavise template");
        if (s.items.getName("Defender Shield").system.equipped !== false) throw new Error("shield still equipped");
        const pally = canvas.tokens.get(fromUuidSync(ids.tokens.pally).id), attack = raider.items.contents.find(item => item.type === "weapon").system.activities.contents[0];
        pally.setTarget(true, { releaseOthers: true });
        const beyond = (await attack.rollAttack({ event: null }, { configure: false }, { create: false }))?.[0]?.options?.advantageMode;
        const lurker = game.actors.get(ids.actors.lurker).items.contents.find(item => item.type === "weapon").system.activities.contents[0];
        const near = (await lurker.rollAttack({ event: null }, { configure: false }, { create: false }))?.[0]?.options?.advantageMode;
        pally.setTarget(false);
        if (beyond !== -1 || near === -1) throw new Error(`beyond ${beyond}, near ${near}`);
        return { template: template.id, beyond, near };
      }, ids);
      await sleep(800); await shot(gm, "sentry-pavise");
      return result;
    });
    await check("Sentry: Advance and Fire spends a Reaction and links the Bow; the refund restores it", () => owner.evaluate(async ids => {
      const s = game.actors.get(ids.actors.sentry), raider = game.actors.get(ids.actors.raider), use = game.ak5e.defender.use, id = foundry.utils.randomID();
      await use(s, "advanceAndFire", { confirmed: true, attackerUuid: raider.uuid, weaponId: s.items.getName("Bow").id, triggerId: "live-shot", attackConfirmed: true }, id);
      const spent = s.getFlag("ak5e", "reactionBudget")?.spent;
      await use(s, "advanceAndFireRefund", { confirmed: true, useId: id }, foundry.utils.randomID());
      const after = s.getFlag("ak5e", "reactionBudget")?.spent;
      if (spent !== 1 || after !== 0) throw new Error(`spent ${spent}, after refund ${after}`);
      return { spent, after };
    }, ids));

    /* -------------------------------------------------------------- panels and persistence */
    for (const key of ["juggernaut", "protector", "sentry"]) {
      await owner.evaluate(id => { void game.ak5e.defender.open(game.actors.get(id)); }, ids.actors[key]);
      await sleep(1500); await shot(owner, `panel-${key}`);
      await owner.evaluate(() => { for (const app of foundry.applications.instances.values()) if (app.options?.classes?.includes?.("ak5e-defender-dialog")) void app.close(); });
      await sleep(500);
    }
    await shot(owner, "player-chat", { chat: true });
    await gm.reload(); await gm.waitForFunction(() => globalThis.game?.ready && globalThis.game.ak5e?.defender, null, { timeout: 90000 });
    await check("reload: Pavise template, shield state, Off Balance and receipts survive a browser reload", () => gm.evaluate(ids => {
      const s = game.actors.get(ids.actors.sentry), enemy = game.actors.get(ids.actors.enemy);
      if (!game.scenes.get(ids.sceneId).templates.size || s.items.getName("Defender Shield").system.equipped !== false) throw new Error("Pavise state lost");
      if (!enemy.effects.some(effect => effect.flags.ak5e?.defenderUsesEffect?.protectorMark === "offBalance")) throw new Error("Off Balance lost");
      return { receipts: Object.keys(ids.actors).map(key => (game.actors.get(ids.actors[key]).flags.ak5e?.defenderUses?.undo ?? []).length) };
    }, ids));
    report.persistence = await persistence(gm, ids);
  }
} catch (error) {
  report.errors.push(`run: ${error.stack ?? error.message}`);
  console.log(`ERROR ${error.message}`);
} finally {
  await browser.close();
  await writeFile(`${output}-report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ checks: report.checks.map(c => `${c.ok ? "PASS" : "FAIL"} ${c.name}${c.ok ? "" : `: ${c.error}`}`), errors: report.errors.length, environment: report.environment, screenshots: report.screenshots }, null, 2));
  process.exitCode = report.checks.length && report.checks.every(c => c.ok) && !report.errors.some(e => e.startsWith("run:")) ? 0 : 1;
}
