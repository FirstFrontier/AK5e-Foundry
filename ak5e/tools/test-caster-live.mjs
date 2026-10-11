/** Disposable Foundry 13 / D&D5e live Caster acceptance run. Never targets a non-test World. */
import { readFile, writeFile } from "node:fs/promises";
import { launchTestBrowser } from "./test-browser.mjs";
import { casterMechFollowupChecks } from "./caster-mech-live-checks.mjs";

const { chromium } = await import(process.env.AK5E_PLAYWRIGHT ?? "playwright");
const browser = await launchTestBrowser(chromium, {
  ...(process.env.AK5E_CHROMIUM ? { executablePath: process.env.AK5E_CHROMIUM } : {}),
});
const report = { world: "standard-test", errors: [], screenshots: [], fixture: {}, setup: {}, casting: {}, core: {}, mystic: {}, mech: {}, permissions: {} };
const output = process.env.AK5E_CASTER_OUTPUT ?? "/tmp/ak5e-caster-live";
const restartReportPath = process.env.AK5E_CASTER_RESTART_REPORT ?? null;
const base = `http://127.0.0.1:${process.env.AK5E_PORT ?? "30135"}/join`;
const contexts = [];
const mechOnly = process.env.AK5E_CASTER_MECH_ONLY === "1";
let castDialogCount = 0;

async function join(name) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1050 } });
  contexts.push(context);
  const page = await context.newPage();
  page.on("pageerror", error => report.errors.push(`${name}: ${error.stack ?? error.message}`));
  page.on("console", message => {
    if (message.type() === "error") report.errors.push(`${name}: ${message.text()}`);
    else if (message.type() === "info" && message.text().startsWith("CASTER_LIVE_PROGRESS ")) console.log(message.text());
  });
  await page.goto(base);
  try { await page.selectOption('select[name="userid"]', { label: name, timeout: 10000 }); }
  catch (error) {
    report.joinFailure = { name, url: page.url(), title: await page.title(), body: (await page.locator("body").innerText().catch(() => "<body unavailable>")).slice(0, 1800) };
    throw error;
  }
  await page.click('button[name="join"]');
  await page.waitForFunction(() => globalThis.game?.ready && globalThis.game.ak5e?.caster, null, { timeout: 60000 });
  const worldId = await page.evaluate(() => game.world.id);
  if (worldId !== "standard-test") throw new Error(`Refusing World ${worldId}; only disposable standard-test is allowed.`);
  return page;
}

async function screenshot(page, key) {
  const path = `${output}-${key}.png`;
  await page.screenshot({ path, fullPage: false });
  report.screenshots.push(path);
}

async function completeOperatorSkillChoices(page) {
  const dialog = page.locator('dialog:has(.ak5e-skill-choices)');
  if (!await dialog.count()) return { opened: false, selected: [] };
  await dialog.waitFor({ state: "visible" });
  const selected = [];
  for (const control of await dialog.locator("select").all()) {
    const name = await control.getAttribute("name");
    const value = await control.locator("option").nth(1).getAttribute("value");
    if (!value) throw new Error(`Operator Skill chooser ${name} has no source option.`);
    await control.selectOption(value);
    const tier = name.replace(/^skill-/, "");
    const preview = dialog.locator(`[data-tier="${tier[0].toUpperCase()}${tier.slice(1)}"]`);
    if (!/SP Cost:/.test(await preview.innerText())) throw new Error(`Operator Skill ${tier} source preview did not render.`);
    selected.push({ tier, sourceId: value });
  }
  const submit = dialog.locator('[data-action="learnSkills"]');
  if (await submit.isDisabled()) throw new Error("Operator Skill chooser still has incomplete source selections.");
  await submit.click(); await dialog.waitFor({ state: "hidden" });
  return { opened: true, selected };
}

async function runCastDialog(page, actorId, itemId, options = {}) {
  const priorMessageIds = await page.evaluate(() => game.messages.contents.map(message => message.id));
  await page.evaluate(({ actorId, itemId, options }) => {
    const actor = game.actors.get(actorId);
    globalThis.__ak5eCasterPendingUse = game.ak5e.caster.cast(actor, itemId, options);
    globalThis.__ak5eCasterPendingUse.catch(error => { globalThis.__ak5eCasterUseError = error.message; });
  }, { actorId, itemId, options });
  const use = page.locator('button[data-action="use"]');
  await use.first().waitFor({ timeout: 20000 });
  await screenshot(page, `cast-dialog-${++castDialogCount}-${options.empowered ? "empowered" : "standard"}`);
  if (await use.first().isDisabled()) {
    const dialog = page.locator('dialog:has(button[data-action="use"])');
    throw new Error(`Native casting confirmation is disabled: ${(await dialog.innerText()).replace(/\s+/g, " ").trim()}`);
  }
  await use.first().click();
  await page.waitForFunction(prior => game.messages.contents.some(m => m.flags?.ak5e?.artCast && !prior.includes(m.id)), priorMessageIds, { timeout: 25000 });
  await page.evaluate(async () => { await globalThis.__ak5eCasterPendingUse; if (globalThis.__ak5eCasterUseError) throw new Error(globalThis.__ak5eCasterUseError); });
  return page.evaluate(prior => {
    const message = [...game.messages].reverse().find(m => m.flags?.ak5e?.artCast && !prior.includes(m.id));
    return { messageId: message.id, receipt: message.flags.ak5e.artCast, content: message.content };
  }, priorMessageIds);
}

try {
  const gm = await join("Gamemaster");
  const activated = await gm.evaluate(() => game.modules.get("ak5e")?.active === true);
  if (!activated) throw new Error("AK5e must already be enabled in the disposable standard-test World.");
  report.environment = await gm.evaluate(() => ({ foundry: game.version, system: game.system.version, world: game.world.id,
    activeModules: game.modules.filter(module => module.active).map(module => module.id), moduleVersion: game.modules.get("ak5e").version,
    renderer: (() => { const gl = canvas?.app?.renderer?.gl; const ext = gl?.getExtension("WEBGL_debug_renderer_info"); return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unavailable"; })() }));
  if (report.environment.system !== "5.3.3") throw new Error(`Expected D&D5e 5.3.3; found ${report.environment.system}.`);
  if (report.environment.activeModules.length !== 1 || report.environment.activeModules[0] !== "ak5e") throw new Error("Only AK5e may be enabled in this disposable acceptance World.");

  if (restartReportPath) {
    const previous = JSON.parse(await readFile(restartReportPath, "utf8"));
    if (previous.world !== "standard-test" || !previous.fixture?.suffix || !previous.persistence) {
      throw new Error("Restart verification requires a completed Caster report from the disposable standard-test World.");
    }
    report.restart = await gm.evaluate(({ fixture, setup, mystic, mech, persistence, postSetup }) => {
      const facts = {};
      for (const [key, id] of Object.entries(fixture.actors)) {
        const actor = game.actors.get(id);
        if (!actor || actor.getFlag("ak5e", "casterLiveFixture") !== fixture.suffix || actor.getFlag("ak5e", "casterLiveRole") !== key) {
          throw new Error(`Restart lost or mismatched the flagged ${key} Caster fixture.`);
        }
        const expected = persistence[key], actualAp = actor.getFlag("ak5e", "artsPoints");
        if(expected.itemIds && JSON.stringify(actor.items.map(item=>item.id).sort())!==JSON.stringify(expected.itemIds))throw new Error(`${key} Item IDs changed across server restart.`);
        if (JSON.stringify(actualAp) !== JSON.stringify(expected.ap)) throw new Error(`${key} Arts Points did not persist across server restart.`);
        const managed = actor.items.filter(item => item.flags.ak5e?.casterArtGrants?.length || item.flags.ak5e?.casterTalent || item.flags.ak5e?.chapterThreeId);
        if (managed.length < setup[key].managedItems) throw new Error(`${key} managed Art/talent/class Items were lost across server restart.`);
        facts[key] = { actorId: actor.id, ap: actualAp, managedItemCount: managed.length, expectedManagedItemCount: setup[key].managedItems,
          poolIds: actor.getFlag("ak5e", "caster")?.pools ?? [] };
        if (key === "core" && postSetup.borrowedName) {
          const learned = managed.filter(item => postSetup.skillIds.includes(item.flags.ak5e?.chapterThreeId));
          const borrowed = managed.filter(item => item.flags.ak5e?.casterBorrowed && item.name === postSetup.borrowedName);
          if (learned.length !== 3 || borrowed.length !== 1 || managed.length !== setup[key].managedItems + learned.length + borrowed.length) throw new Error("Core inventory differs beyond its three learned Operator Skills and retained borrowed Art.");
          facts[key].postSetupItems = [...learned, ...borrowed].map(item => ({ id: item.id, name: item.name, sourceId: item.flags.ak5e?.chapterThreeId ?? item.flags.ak5e?.chapterFiveId }));
        }
      }
      const mysticActor = game.actors.get(fixture.actors.mystic);
      const charge = mysticActor.getFlag("ak5e", "resourcePools")?.mysticCharge;
      if (mystic.longRestClear && (charge?.value !== mystic.longRestClear.chargeAfterLongRest || charge?.value !== 0)) throw new Error("Mystic Charge did not retain its zeroed Long Rest state across restart.");
      facts.mysticCharge = charge;
      const mechActor = game.actors.get(fixture.actors.mech), linked = mechActor.getFlag("ak5e", "caster")?.drones ?? [];
      if (linked.length !== 2 || mech.drones.some(uuid => !game.actors.get(uuid.split(".").at(-1)))) throw new Error("Linked Arts Master Actors did not persist across server restart.");
      facts.drones = mech.drones.map(uuid => {
        const drone = fromUuidSync(uuid);
        if (!drone || !linked.includes(drone.uuid)) throw new Error(`Arts Master ${uuid} no longer resolves or is linked.`);
        return { uuid, hp: drone.system.attributes.hp, destroyed: drone.flags.ak5e.artsMaster.destroyed === true };
      });
      return facts;
    }, { fixture: previous.fixture, setup: previous.fixture.setup, mystic: previous.mystic, mech: previous.mech, persistence: previous.persistence,
      postSetup: { skillIds: previous.permissions.operatorSkills?.selected?.map(choice => choice.sourceId) ?? [], borrowedName: previous.core.branch?.borrowedName } });
    report.restart.sourceReport = restartReportPath;
    await gm.evaluate(actorId => { void game.actors.get(actorId).sheet.render(true); }, previous.fixture.actors.core);
    await gm.waitForTimeout(500); await screenshot(gm, "restart-core-sheet");
    const coreId=previous.fixture.actors.core;
    report.restart.setupPreview=await gm.evaluate(async actorId=>{
      const actor=game.actors.get(actorId),preview=await game.ak5e.caster.preview(actor);
      if(preview.createItems.length)throw new Error("Reapplied setup preview incorrectly lists already-owned Items as additions.");
      globalThis.__casterRestartSetupBefore=JSON.stringify(actor.toObject());
      globalThis.__casterRestartSetup=game.ak5e.caster.openSetup(actor);
      return {newItems:preview.createItems.length};
    },coreId);
    const setup=gm.locator('dialog:has(h2:text("Preview changes"))');
    await setup.waitFor({timeout:20000});await screenshot(gm,"restart-setup-preview");
    await setup.locator('button[data-action="cancel"]').click();
    await gm.evaluate(async actorId=>{
      await globalThis.__casterRestartSetup;
      if(JSON.stringify(game.actors.get(actorId).toObject())!==globalThis.__casterRestartSetupBefore)throw new Error("Restart setup cancellation changed Actor data.");
    },coreId);
    await gm.evaluate(async uuid=>{
      const drone=fromUuidSync(uuid);
      await drone.sheet.render(true);
      drone.sheet.bringToTop();
    },previous.mech.drones[0]);
    await gm.waitForTimeout(500);await screenshot(gm,"restart-gm-drone-sheet");
    console.log(JSON.stringify(report, null, 2));
  } else {
  report.fixture = await gm.evaluate(async () => {
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
    const { CHAPTER_THREE_CLASSES } = await import("/modules/ak5e/scripts/chapter-three-content.mjs");
    const { CHAPTER_FOUR_EQUIPMENT } = await import("/modules/ak5e/scripts/chapter-four-content.mjs");
    const { standardPools } = await import("/modules/ak5e/scripts/caster-rules.mjs");
    const { sourceEntryData } = await import("/modules/ak5e/scripts/caster-setup.mjs");
    const suffix = foundry.utils.randomID();
    const player = game.users.getName("Caster Live Owner") ?? await User.implementation.create({ name: "Caster Live Owner", role: 1, password: "" });
    const observer = game.users.getName("Caster Live Observer") ?? await User.implementation.create({ name: "Caster Live Observer", role: 1, password: "" });
    const scene = await Scene.implementation.create({ name: `Caster Live Arena ${suffix}`, width: 2800, height: 1200, padding: 0, tokenVision: false,
      grid: { type: 1, size: 100, distance: 5, units: "ft" }, flags: { ak5e: { casterLiveFixture: suffix } } });
    const ids = { suffix, playerId: player.id, observerId: observer.id, sceneId: scene.id, actors: {}, tokens: {}, targetId: null };
    const classEntry = CHAPTER_THREE_CLASSES.find(entry => entry.id === "class-caster");
    const branchEntries = Object.fromEntries(["core", "mystic", "mech-accord"].map(key => [key, CHAPTER_THREE_CLASSES.find(entry => entry.kind === "subclass" && entry.parentClass === "Caster" && entry.sourceHeading === ({ core: "Core", mystic: "Mystic", "mech-accord": "Mech-Accord" })[key])]));
    const fixtureEquipment = ["weapon-arts-staff-0", "weapon-knife-4", "tool-medical-kit-8", "tool-engineering-kit-3"].map(id => CHAPTER_FOUR_EQUIPMENT.find(entry => entry.id === id));
    assert(fixtureEquipment.every(Boolean), "Exact source starting-equipment records are missing.");
    for (const entry of fixtureEquipment) {
      if (!game.items.some(item => item.getFlag("ak5e", "chapterFourId") === entry.id)) {
        await Item.implementation.create(sourceEntryData(entry));
      }
    }
    const createCaster = async (key, level, branchKey, x) => {
      const actor = await Actor.implementation.create({ name: `Caster ${key.toUpperCase()} live ${suffix}`, type: "character",
        ownership: { default: 0, [player.id]: 3, [observer.id]: 2 }, flags: { ak5e: { casterLiveFixture: suffix, casterLiveRole: key } },
        system: { abilities: { str: { value: 10 }, dex: { value: 10 }, con: { value: 12 }, int: { value: 14 }, wis: { value: 10 }, cha: { value: 10 } }, attributes: { hp: { value: 100, max: 100 } }, currency: { cp: 800 } } });
      const classData = sourceEntryData(classEntry); classData.system.levels = level;
      const branchData = sourceEntryData(branchEntries[branchKey]);
      await actor.createEmbeddedDocuments("Item", [classData, branchData]);
      const tokenData = await actor.getTokenDocument({ x, y: 400 }); tokenData.updateSource({ name: actor.name, actorLink: true, disposition: 1 });
      const [token] = await scene.createEmbeddedDocuments("Token", [tokenData.toObject()]);
      ids.actors[key] = actor.id; ids.tokens[key] = token.uuid;
      return actor;
    };
    const core = await createCaster("core", 20, "core", 400);
    const mystic = await createCaster("mystic", 15, "mystic", 900);
    const mech = await createCaster("mech", 15, "mech-accord", 1400);
    const target = await Actor.implementation.create({ name: `Caster Live Target ${suffix}`, type: "npc", ownership: { default: 0 },
      flags: { ak5e: { casterLiveFixture: suffix, casterLiveRole: "target" } }, system: { abilities: { con: { value: 10 } }, attributes: { hp: { value: 120, max: 120 }, ac: { flat: 10, calc: "flat" } } } });
    const targetTokenDoc = await target.getTokenDocument({ x: 1800, y: 400 }); targetTokenDoc.updateSource({ name: target.name, actorLink: true, disposition: -1 });
    const [targetToken] = await scene.createEmbeddedDocuments("Token", [targetTokenDoc.toObject()]);
    ids.targetId = target.id; ids.targetToken = targetToken.uuid;

    // Select low-mapping, still-distinct official pools. Approve only explicit
    // D&D5e spell document candidates found in the installed compendium.
    const pool = name => standardPools.find(row => row.name === name);
    const selectedPools = { core: [pool("Crude Arts"), pool("Corrosion Arts"), pool("Electric Arts")],
      mystic: [pool("Crude Arts"), pool("Corrosion Arts")], mech: [pool("Crude Arts"), pool("Corrosion Arts")] };
    assert(Object.values(selectedPools).flat().every(Boolean), "Expected source Standard Arts Pools are missing.");
    const needed = new Map([["Detect Magic", { level: 1, pools: [] }], ["Counterspell", { level: 3, pools: [] }], ["Dispel Magic", { level: 3, pools: [] }]]);
    for (const rows of Object.values(selectedPools)) for (const p of rows) for (const art of p.members) if (!art.sourceId) {
      const current = needed.get(art.name) ?? { level: art.level, pools: [] };
      if (current.level !== art.level) throw new Error(`Conflicting source levels for ${art.name}: ${current.level} and ${art.level}.`);
      current.pools.push(p.name); needed.set(art.name, current);
    }
    const aliases = new Map([["Mage Armour", "Mage Armor"], ["Armour of Agathys", "Armor of Agathys"],
      ["Create/Destroy Water", "Create or Destroy Water"], ["Maximillian's Earthen Grasp", "Maximilian's Earthen Grasp"]]);
    const spellPacks = [...game.packs].filter(pack => pack.documentName === "Item" && pack.metadata?.system === "dnd5e")
      .sort((a, b) => Number(b.collection === "dnd5e.spells") - Number(a.collection === "dnd5e.spells"));
    const indexes = new Map();
    const mappings = [];
    const manualReferences = [];
    for (const [sourceName, sourceReference] of needed) {
      const candidateNames = [sourceName, ...(aliases.has(sourceName) ? [aliases.get(sourceName)] : [])];
      let candidate;
      for (const pack of spellPacks) {
        if (!indexes.has(pack.collection)) indexes.set(pack.collection, await pack.getIndex({ fields: ["name", "type"] }));
        const index = indexes.get(pack.collection);
        const matches = index.filter(row => row.type === "spell" && candidateNames.includes(row.name));
        if (matches.length) { candidate = { pack, row: matches[0], candidates: matches.map(row => ({ name: row.name, uuid: `${pack.collection}.${pack.documentName}.${row._id}` })) }; break; }
      }
      let document, mappingKind;
      if (candidate) {
        document = await candidate.pack.getDocument(candidate.row._id);
        assert(document?.type === "spell", `Candidate for ${sourceName} is not a D&D5e spell Item.`);
        mappingKind = "compendium";
      } else {
        // A test-only reference carries only printed pool membership and level.
        // It deliberately has no activity, effect, roll, damage, or other spell mechanics.
        const existing = game.items.find(item => item.getFlag("ak5e", "casterLiveManualReference")?.sourceName === sourceName &&
          item.getFlag("ak5e", "casterLiveManualReference")?.level === sourceReference.level);
        document = existing ?? await Item.implementation.create({ name: sourceName, type: "spell",
          system: { level: sourceReference.level, activities: {} },
          description: { value: `<p><strong>Test fixture manual reference only.</strong> Rules are not supplied in this environment. This item records only the source-listed Standard Arts Pool name and level; it has no mechanics or native casting activity. Native casting is unavailable until a GM maps a licensed source document.</p>` },
          flags: { ak5e: { casterLiveManualReference: { sourceName, level: sourceReference.level, pools: [...new Set(sourceReference.pools)], fixtureOnly: true } } } });
        assert(document.type === "spell" && Number(document.system.level) === sourceReference.level, `Manual reference for ${sourceName} lost its source level.`);
        assert(document.system.activities.size === 0, `Manual reference ${sourceName} unexpectedly has an activity.`);
        mappingKind = "fixture-manual-reference";
        manualReferences.push({ sourceName, level: sourceReference.level, pools: [...new Set(sourceReference.pools)], uuid: document.uuid,
          activityCount: document.system.activities.size, productionMappingRemainsRequired: true });
      }
      const uuid = document.uuid;
      console.info(`CASTER_LIVE_PROGRESS mapped ${sourceName} as ${mappingKind}`);
      const rationale = mappingKind === "compendium"
        ? `Disposable live test GM review: exact D&D5e spell compendium candidate ${document.name} (${uuid}) for source-listed Art ${sourceName}; fixture only.`
        : `Disposable test-fixture GM mapping only: ${sourceName} is a source-level/pool manual reference without licensed mechanics or native activity; this is not a production UUID mapping and production must retain the unresolved licensed-source mapping.`;
      await game.ak5e.caster.mapArt(sourceName, uuid, rationale);
      mappings.push({ sourceName, mappedName: document.name, uuid, kind: mappingKind,
        candidateUuids: candidate?.candidates.map(row => row.uuid) ?? [], productionMappingRemainsRequired: mappingKind !== "compendium" });
    }
    const classItems = { core, mystic, mech };
    const setup = {};
    for (const [key, actor] of Object.entries(classItems)) {
      const poolRows = selectedPools[key];
      const branchKey = key === "mech" ? "mech-accord" : key;
      const branchId = branchEntries[branchKey].id;
      const view = game.ak5e.caster.choices(actor);
      const originalItems = actor.items.size, originalState = structuredClone(actor.getFlag("ak5e", "caster") ?? null);
      const initialPreview = await game.ak5e.caster.preview(actor, { choices: { branch: branchId, ability: "int", pools: poolRows.map(p => p.id) } });
      assert(actor.items.size === originalItems && JSON.stringify(actor.getFlag("ak5e", "caster") ?? null) === JSON.stringify(originalState), `${key} preview mutated its Actor.`);
      const staff = CHAPTER_FOUR_EQUIPMENT.find(entry => entry.name === "Arts Staff");
      const startingWeapon = CHAPTER_FOUR_EQUIPMENT.find(entry => entry.kind === "weapon" && /Dagger|Knife/i.test(entry.name));
      const startingToolkit = CHAPTER_FOUR_EQUIPMENT.find(entry => entry.kind === "tool" && entry.name === "Medical Kit");
      assert(staff && startingWeapon && startingToolkit, "Required source starting equipment records are missing.");
      const choices = { ...(view.choices ?? {}), branch: branchId, ability: "int", pools: poolRows.map(p => p.id), saves: ["int", "wis"], skills: ["Arts", "Tech", "Lore"], tool: "Medical Kit",
        startingEquipment: { mode: "items", weaponOrShield: startingWeapon.id, wandOrStaff: staff.id, toolkit: startingToolkit.id }, castingUnit: staff.id,
        talents: { ...(view.choices?.talents ?? {}) }, asi: { ...(view.choices?.asi ?? {}) }, hp: { ...(view.choices?.hp ?? {}) } };
      delete choices.summary;
      const basicTalent = view.pending.find(descriptor => descriptor.key === "talents.basic")?.options[0]?.value;
      const advancedTalent = view.pending.find(descriptor => descriptor.key === "talents.advanced")?.options[0]?.value;
      assert(basicTalent && advancedTalent, `${key}: source talent choices are missing.`);
      choices.talents = { basic: basicTalent, basicAt8: { mode: "upgrade", sourceId: basicTalent }, advanced: advancedTalent,
        advancedAt13: { mode: "upgrade", sourceId: advancedTalent } };
      if (key === "mech") choices.mechExchange = { proficiency: "Medical Kit", startingToolkit: true };
      const selectSetupOption = descriptor => {
        const values = descriptor.options.map(option => option.value);
        let selected;
        if (descriptor.key === "startingEquipment.weaponOrShield") selected = descriptor.options.find(option => /Dagger|Knife/i.test(option.label))?.value ?? values[0];
        else if (descriptor.key === "startingEquipment.wandOrStaff") selected = descriptor.options.find(option => option.label === "Arts Staff")?.value ?? values[0];
        else if (descriptor.key === "startingEquipment.toolkit") selected = descriptor.options.find(option => /Medical Kit/i.test(option.label))?.value ?? values[0];
        else if (descriptor.key === "castingUnit") selected = descriptor.options.find(option => option.label.includes("Arts Staff"))?.value ?? values[0];
        else if (descriptor.key === "talents.basicAt8" || descriptor.key === "talents.advancedAt13") selected = descriptor.options.find(option => option.value?.mode === "upgrade")?.value ?? values[0];
        else if (descriptor.key.startsWith("talents.")) selected = values[0];
        else if (descriptor.key.startsWith("asi.")) {
          let scores = Object.fromEntries(["str", "dex", "con", "int", "wis", "cha"].map(ability => [ability, actor.system.abilities[ability].value]));
          for (const old of Object.values(choices.asi)) for (const inc of old.increases ?? []) scores[inc.ability] += inc.amount;
          selected = descriptor.options.find(option => Array.isArray(option.value?.increases) && option.value.increases.length &&
            option.value.increases.every(inc => scores[inc.ability] + inc.amount <= 20))?.value ??
            descriptor.options.find(option => option.value?.mode === "existing")?.value;
        } else if (descriptor.key.startsWith("hp.")) selected = descriptor.options.find(option => option.value.mode === "fixed")?.value ?? values[0];
        else if (descriptor.key === "mechExchange.proficiency") selected = "Maintenance Kit";
        else if (descriptor.key === "mechExchange.startingToolkit") selected = true;
        else selected = values[0];
        if (selected === undefined) throw new Error(`${key}: no valid dynamic setup option for ${descriptor.key}; options=${JSON.stringify(descriptor.options)}.`);
        const path = descriptor.key.split("."); let target = choices;
        for (const segment of path.slice(0, -1)) target = target[segment] ??= {};
        target[path.at(-1)] = structuredClone(selected);
      };
      // Fill the static progression and talent descriptors. Equipment mode,
      // equipment options and casting unit are source IDs selected above; no
      // UI-dependent choices are inferred from a stale descriptor list.
      for (const descriptor of view.pending) {
        if (["branch", "ability", "pools", "saves", "skills", "tool", "startingEquipment.mode", "castingUnit", "talents.basic", "talents.basicAt8", "talents.advanced", "talents.advancedAt13", "mechExchange.proficiency", "mechExchange.startingToolkit"].includes(descriptor.key)) continue;
        if (descriptor.key.startsWith("startingEquipment.")) continue;
        selectSetupOption(descriptor);
      }
      const preview = await game.ak5e.caster.preview(actor, { choices });
      assert(preview.pending.length === 0, `${key} setup has pending choices: ${preview.pending.map(row => row.key).join(", ")}`);
      assert(preview.missing.length === 0, `${key} setup has unresolved mappings: ${preview.missing.map(row => row.name).join(", ")}`);
      const applied = await game.ak5e.caster.apply(actor, { choices, contextKey: preview.contextKey, confirmed: true, operationId: `live_${suffix}_${key}_setup` });
      console.info(`CASTER_LIVE_PROGRESS ${key} setup applied`);
      assert(actor.getFlag("ak5e", "artsPoints").value === actor.getFlag("ak5e", "artsPoints").maximum, `${key} initial setup did not start at full AP.`);
      const managedBefore = actor.items.filter(item => item.flags.ak5e?.casterArtGrants?.length || item.flags.ak5e?.casterTalent || item.flags.ak5e?.chapterThreeId).map(item => item.id).sort();
      const repreview = await game.ak5e.caster.preview(actor, { choices });
      const reapplied = await game.ak5e.caster.apply(actor, { choices, contextKey: repreview.contextKey, confirmed: true, operationId: `live_${suffix}_${key}_reapply` });
      const managedAfter = actor.items.filter(item => item.flags.ak5e?.casterArtGrants?.length || item.flags.ak5e?.casterTalent || item.flags.ak5e?.chapterThreeId).map(item => item.id).sort();
      assert(JSON.stringify(managedBefore) === JSON.stringify(managedAfter), `${key} reapplication changed managed Item IDs.`);
      assert(actor.getFlag("ak5e", "artsPoints").value === actor.getFlag("ak5e", "artsPoints").maximum, `${key} reapplication changed current AP.`);
      setup[key] = { level: actor.items.find(item => item.flags.ak5e?.chapterThreeId === "class-caster").system.levels,
        branch: actor.items.find(item => item.type === "subclass").name, ap: actor.getFlag("ak5e", "artsPoints"),
        managedItems: managedAfter.length, initialPreviewMutated: false, mappingsResolved: preview.missing.length === 0,
        created: applied.created, reappliedCreated: reapplied.created, selectedPools: poolRows.map(p => p.name), choices };
    }
    const gl = canvas?.app?.renderer?.gl, debug = gl?.getExtension("WEBGL_debug_renderer_info");
    return { ...ids, mappings, manualReferences, setup, renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : "unavailable" };
  });

  const ids = report.fixture;
  await gm.evaluate(async sceneId => { await game.scenes.get(sceneId).activate(); return true; }, ids.sceneId);
  await gm.evaluate(async ({ actorIds, targetId }) => {
    const actors = Object.values(actorIds).map(id => game.actors.get(id));
    const scene = game.scenes.active;
    const tokens = actors.map(actor => scene.tokens.find(token => token.actorId === actor.id));
    const target = scene.tokens.find(token => token.actorId === targetId);
    const combat = await Combat.implementation.create({ scene: scene.id, active: true });
    await combat.createEmbeddedDocuments("Combatant", [...tokens, target].map((token, index) => ({ actorId: token.actorId, tokenId: token.id, sceneId: scene.id, initiative: 40 - index * 10 })));
    await combat.startCombat();
    await combat.update({ turn: 0, round: 1 });
    game.user.targets = new Set([target.object]);
  }, { actorIds: ids.actors, targetId: ids.targetId });

  const player = await join("Caster Live Owner");
  await player.waitForFunction(()=>canvas.ready);
  await player.evaluate(targetUuid=>canvas.tokens.get(targetUuid.split(".").at(-1)).setTarget(true,{user:game.user,releaseOthers:true}),ids.targetToken);
  if (!mechOnly) {
  await player.evaluate(actorId => { globalThis.__casterControls = game.ak5e.caster.open(game.actors.get(actorId)); return true; }, ids.actors.core);
  await player.waitForTimeout(500);
  await player.locator(".ak5e-caster-panel h2").scrollIntoViewIfNeeded();
  await screenshot(player, "owner-controls");
  report.permissions.ownerControls = await player.evaluate(actorId => ({ actorOwner: game.actors.get(actorId).isOwner,
    actionCount: document.querySelectorAll(".ak5e-caster-panel [data-caster-ui]").length, visible: !!document.querySelector(".ak5e-caster-panel") }), ids.actors.core);
  const closeControls = player.locator('button[data-action="close"]');
  if (await closeControls.count()) await closeControls.last().click();
  await player.waitForTimeout(250);
  await player.evaluate(actorId => { void game.actors.get(actorId).sheet.render(true); return true; }, ids.actors.core);
  await player.waitForTimeout(500);
  await screenshot(player, "owner-sheet");
  report.permissions.operatorSkills = await completeOperatorSkillChoices(player);
  await player.waitForTimeout(350);
  await screenshot(player, "owner-operator-skills-complete");
  if (!report.permissions.ownerControls.actorOwner) throw new Error("Caster owner user does not own fixture Actor.");
  await player.evaluate(actorId=>{
    const actor=game.actors.get(actorId);
    globalThis.__casterSetupBefore=JSON.stringify({items:actor.items.map(i=>i.id).sort(),ap:actor.flags.ak5e.artsPoints,state:actor.flags.ak5e.caster});
    globalThis.__casterSetupPreview=game.ak5e.caster.openSetup(actor);
  },ids.actors.core);
  const setupDialog=player.locator('dialog:has(h2:text("Preview changes"))');
  await setupDialog.waitFor({timeout:20000});
  await screenshot(player,"owner-setup-preview");
  await setupDialog.locator('button[data-action="cancel"]').click();
  report.permissions.setupCancellation=await player.evaluate(async actorId=>{
    await globalThis.__casterSetupPreview;
    const actor=game.actors.get(actorId),after=JSON.stringify({items:actor.items.map(i=>i.id).sort(),ap:actor.flags.ak5e.artsPoints,state:actor.flags.ak5e.caster});
    if(after!==globalThis.__casterSetupBefore)throw new Error("Cancelling the rendered setup preview changed Actor data.");
    return {previewRendered:true,noMutation:true};
  },ids.actors.core);

  report.casting = await player.evaluate(async ({ actorId, targetId }) => {
    const actor = game.actors.get(actorId), before = actor.getFlag("ak5e", "artsPoints").value;
    const unit = actor.items.find(candidate => candidate.type === "weapon" && candidate.name === "Arts Staff" && candidate.flags.ak5e?.casterGrant?.kind === "startingEquipment");
    if (!unit) throw new Error("Selected starting Arts Staff was not granted.");
    await unit.update({ "system.equipped": true });
    if (!unit.system.equipped) throw new Error("Native D&D5e Arts Staff equip update did not persist.");
    const item = actor.items.find(candidate => candidate.type === "spell" && candidate.name === "Magic Missile");
    if (!item) throw new Error("Mapped Magic Missile Art not granted to Core.");
    const reference = actor.items.find(candidate => candidate.type === "spell" && candidate.name === "Circle of Power");
    if (!reference) throw new Error("Crude pool's test-only Circle of Power manual reference was not granted.");
    let referenceCastError = "";
    try { await game.ak5e.caster.cast(actor, reference.id, { mode: "ap", level: 5 }); }
    catch (error) { referenceCastError = error.message; }
    if (!/source reference without an activity/i.test(referenceCastError)) throw new Error(`Manual reference cast did not stay blocked: ${referenceCastError || "no failure"}.`);
    const afterReferenceAttempt = actor.getFlag("ak5e", "artsPoints").value;
    if (afterReferenceAttempt !== before) throw new Error("Attempting to cast a source-only reference changed AP.");
    return { before, afterReferenceAttempt, referenceCastError, referenceActivityCount: reference.system.activities.size, equippedCastingUnitId: unit.id,
      referenceCastingUnavailable: true, itemId: item.id, level: item.system.level, activityIds: [...item.system.activities.keys()], targetId };
  }, { actorId: ids.actors.core, targetId: ids.targetId });
  // At Core 20, Growing Power reduces casts below maximum Art level by 2 AP.
  // Upcast Magic Missile to level 3 so the live acceptance exercises an actual 1-AP spend.
  const castResult = await runCastDialog(player, ids.actors.core, report.casting.itemId, { mode: "ap", level: 3 });
  report.casting.castReceipt = castResult.receipt;
  report.casting.afterCast = await player.evaluate(actorId => game.actors.get(actorId).getFlag("ak5e", "artsPoints"), ids.actors.core);
  if (report.casting.castReceipt.level !== 3 || report.casting.castReceipt.cost !== 1 || report.casting.afterCast.value !== report.casting.before - 1)
    throw new Error("Level-3 Art cast at Caster 20 did not apply the source Growing Power discount and consume exactly 1 AP.");
  report.casting.nativeDamage = await player.evaluate(async ({ actorId, itemId, messageId }) => {
    const actor = game.actors.get(actorId), message = game.messages.get(messageId), item = actor.items.get(itemId);
    const receipt = message?.flags?.ak5e?.artCast;
    if (!receipt?.caster) throw new Error("The cast chat card lacks its receipt-backed Caster context.");
    const clone = item.clone({}, { keepId: true }); clone.updateSource({ "flags.ak5e.casterCast": { ...receipt.caster.context, castId: receipt.id } });
    const activity = clone.system.activities.contents.find(entry => entry.type === "damage") ?? clone.system.activities.contents[0];
    if (!activity?.rollDamage) throw new Error("Mapped Art has no native damage-roll activity.");
    const rolls = await activity.rollDamage({}, { configure: false }, { create: true });
    if (!rolls?.length || rolls.some(roll => !Number.isFinite(roll.total))) throw new Error("Native Art damage roll did not resolve.");
    return { activityId: activity.id, totals: rolls.map(roll => roll.total), types: activity.getDamageConfig?.()?.rolls?.map(roll => roll.options?.types) ?? [] };
  }, { actorId: ids.actors.core, itemId: report.casting.itemId, messageId: castResult.messageId });
  await gm.evaluate(async ({ actorId }) => game.ak5e.caster.recordRuling(game.actors.get(actorId), "unendingBasis", "actualSpend",
    "Disposable live fixture: compare the actual AP expenditure with the source d6 refund roll."), { actorId: ids.actors.core });
  await player.evaluate(async actorId => {
    for (let i = 0; i < 100; i++) {
      if (game.actors.get(actorId).getFlag("ak5e", "caster")?.rulings?.unendingBasis?.value === "actualSpend") return true;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error("Owner client did not receive the fixture's GM-recorded Unending ruling.");
  }, ids.actors.core);
  report.core.unending = await player.evaluate(async ({ actorId, spendId }) => {
    const actor = game.actors.get(actorId), api = game.ak5e.caster;
    for (let i = 0; i < 100 && !actor.getFlag("ak5e", "caster").spends.some(spend => spend.id === spendId); i++) await new Promise(resolve => setTimeout(resolve, 25));
    const spend = actor.getFlag("ak5e", "caster").spends.find(candidate => candidate.id === spendId);
    if (!spend) throw new Error("AP expenditure event did not create an Unending receipt.");
    const before = actor.getFlag("ak5e", "artsPoints").value;
    const result = await api.command(actor, "unending", { spendId, confirmed: true }, `live_unending_${foundry.utils.randomID()}`);
    const expected = before + (result.refunded ? result.refunded : 0);
    if (actor.getFlag("ak5e", "artsPoints").value !== expected) throw new Error("Unending did not apply its matching-spend refund exactly once.");
    return { spend, result, before, after: actor.getFlag("ak5e", "artsPoints").value };
  }, { actorId: ids.actors.core, spendId: castResult.receipt.id });
  await gm.evaluate(async actorId => {
    const actor=game.actors.get(actorId),api=game.ak5e.caster;
    await api.recordRuling(actor,"costOrder","discountsThenSurcharge","Disposable fixture: resolve combined Growing Power and Savant discounts before surcharge.");
    await api.recordRuling(actor,"signatureRerollOnce",true,"Disposable fixture: optional Savant dice reroll once only.");
    await api.recordRuling(actor,"doublecastCost","normal","Disposable fixture: a Doublecast uses its normal reviewed AP quote.");
  },ids.actors.core);
  await player.waitForFunction(actorId=>game.actors.get(actorId).flags.ak5e.caster.rulings.doublecastCost?.value==="normal",ids.actors.core);
  await player.evaluate(async ({actorId,itemId})=>game.ak5e.caster.command(game.actors.get(actorId),"signature",
    {confirmed:true,restCompleted:true,itemId,damaging:true},`live_signature_${foundry.utils.randomID()}`),{actorId:ids.actors.core,itemId:report.casting.itemId});
  const signatureCast=await runCastDialog(player,ids.actors.core,report.casting.itemId,{mode:"ap",level:3,signatureReroll:true,maverick:"acid"});
  report.core.signature=await player.evaluate(async ({actorId,receipt})=>{
    const actor=game.actors.get(actorId),item=actor.items.get(receipt.itemId),clone=item.clone({}, {keepId:true});
    clone.updateSource({"flags.ak5e.casterCast":{...receipt.caster.context,castId:receipt.id}});
    const activity=clone.system.activities.contents[0],config=activity.getDamageConfig(),rolls=await activity.rollDamage({}, {configure:false},{create:true});
    if(!config.rolls.every(r=>r.options.types.includes("acid"))||!rolls.some(r=>r.terms.some(t=>t.modifiers?.includes("r<=3"))))throw new Error("Maverick damage type or native Savant reroll is missing.");
    if(item.flags.ak5e.casterCast)throw new Error("Savant/Maverick mutated the owned Art.");
    return {cost:receipt.cost,types:config.rolls.map(r=>r.options.types),rolls:rolls.map(r=>r.total),rerollOnce:true,sourcePreserved:true};
  },{actorId:ids.actors.core,receipt:signatureCast.receipt});
  report.core.signature.damage=await gm.evaluate(async ({actorId,castId,targetId})=>{
    const result=await game.ak5e.caster.command(game.actors.get(actorId),"damage",{confirmed:true,castId,targetUuid:`Actor.${targetId}`,amount:4,type:"acid",reduction:99,resistance:true,vulnerability:true,immunity:false},`live_signature_damage_${foundry.utils.randomID()}`);
    if(result.final!==8)throw new Error(`Signature did not bypass DR/resistance and retain vulnerability: ${JSON.stringify(result)}`);
    return result;
  },{actorId:ids.actors.core,castId:signatureCast.receipt.id,targetId:ids.targetId});
  const repeated=await runCastDialog(player,ids.actors.core,report.casting.itemId,{mode:"ap",level:3,repeat:"doublecast",previousCastId:signatureCast.receipt.id});
  report.core.doublecast=await player.evaluate(async ({actorId,receipt})=>{
    const actor=game.actors.get(actorId);let rejected=false;
    try{await game.ak5e.caster.cast(actor,receipt.itemId,{mode:"ap",level:3,repeat:"doublecast",previousCastId:receipt.id});}catch{rejected=true;}
    if(receipt.cost!==1||!actor.flags.ak5e.caster.uses.doublecast||!rejected)throw new Error("Doublecast cost or once-per-Short-Rest limit is wrong.");
    return {cost:receipt.cost,repeatDenied:rejected};
  },{actorId:ids.actors.core,receipt:repeated.receipt});
  const empowerItem = await player.evaluate(actorId => game.actors.get(actorId).items.find(item => item.type === "spell" && item.name === "Eldritch Blast")?.id, ids.actors.core);
  if (!empowerItem) throw new Error("Mapped Eldritch Blast Art not granted to Core.");
  const empoweredCast = await runCastDialog(player, ids.actors.core, empowerItem, { mode: "ap", level: 0, empowered: true });
  report.core.empoweredMessage = empoweredCast.receipt;
  report.core.empoweredDamage = await player.evaluate(async ({ actorId, itemId, messageId }) => {
    const actor = game.actors.get(actorId), item = actor.items.get(itemId), message = game.messages.get(messageId), receipt = message?.flags?.ak5e?.artCast;
    if (!receipt?.caster?.context?.empowered) throw new Error("Empowered cast context did not reach the chat card.");
    const clone = item.clone({}, { keepId: true }); clone.updateSource({ "flags.ak5e.casterCast": { ...receipt.caster.context, castId: receipt.id } });
    const activity = clone.system.activities.contents.find(entry => typeof entry.rollDamage === "function");
    if (!activity) throw new Error("Eldritch Blast has no native damage roll.");
    const rolls = await activity.rollDamage({}, { configure: false }, { create: true });
    const empowered = actor.getFlag("ak5e", "caster").empoweredReceipt;
    if (!rolls?.length || empowered?.castId !== receipt.id || empowered.amount !== actor.system.attributes.prof) throw new Error("Empowered Arts damage bonus/completion receipt is incorrect.");
    return { activityId: activity.id, totals: rolls.map(roll => roll.total), receipt: empowered };
  }, { actorId: ids.actors.core, itemId: empowerItem, messageId: empoweredCast.messageId });
  report.casting.reapply = await player.evaluate(async ({ actorId, choices }) => {
    const actor = game.actors.get(actorId), before = actor.getFlag("ak5e", "artsPoints").value;
    const preview = await game.ak5e.caster.preview(actor, { choices });
    const result = await game.ak5e.caster.apply(actor, { choices, contextKey: preview.contextKey, confirmed: true, operationId: `live_after_cast_${foundry.utils.randomID()}` });
    if (actor.getFlag("ak5e", "artsPoints").value !== before) throw new Error("Caster update did not preserve spent AP.");
    return { before, after: actor.getFlag("ak5e", "artsPoints").value, created: result.created };
  }, { actorId: ids.actors.core, choices: report.fixture.setup.core.choices });
  report.core.branch = await player.evaluate(async ({ actorId, targetTokenUuid }) => {
    const actor = game.actors.get(actorId), runtime = game.ak5e.caster;
    const sourceArt = (await import("/modules/ak5e/scripts/caster-rules.mjs")).standardPools.flatMap(pool => pool.members)
      .find(art => art.sourceId && !actor.items.some(item => item.flags.ak5e?.chapterFiveId === art.sourceId));
    if (!sourceArt) throw new Error("No source-backed unselected Standard Art available to test Rabbit provenance.");
    const beforeAP = actor.getFlag("ak5e", "artsPoints").value;
    const power = await runtime.command(actor, "powerWithin", { restCompleted: true, confirmed: true }, `live_power_${foundry.utils.randomID()}`);
    if (actor.getFlag("ak5e", "artsPoints").value < beforeAP || power.recovered < 0) throw new Error("Power from Within did not recover AP.");
    let repeatPowerBlocked = false;
    try { await runtime.command(actor, "powerWithin", { restCompleted: true, confirmed: true }, `live_power_repeat_${foundry.utils.randomID()}`); } catch { repeatPowerBlocked = true; }
    if (!repeatPowerBlocked) throw new Error("Once-per-Long-Rest Core use was not enforced before the next Long Rest.");
    const borrowed = await runtime.command(actor, "rabbit", { poolArtName: sourceArt.name, confirmed: true }, `live_rabbit_${foundry.utils.randomID()}`);
    const borrowedItem = actor.items.get(borrowed.itemId);
    if (!borrowedItem?.flags.ak5e?.casterBorrowed) throw new Error("Rabbit grant lost borrowed provenance.");
    await actor.longRest({ dialog: false, chat: false, request: true, advanceTime: false, advanceBastionTurn: false });
    const { grantFor } = await import("/modules/ak5e/scripts/arts-casting.mjs");
    const expiredGrant = grantFor(borrowedItem, actor);
    if (!expiredGrant.blocked) throw new Error("Rabbit Art was not blocked after Long Rest.");
    return { power, repeatPowerBlocked, borrowedName: borrowedItem.name, expiredGrantBlocked: true, borrowedItemPreserved: !!actor.items.get(borrowedItem.id), apAfterRest: actor.getFlag("ak5e", "artsPoints").value,
      pools: actor.getFlag("ak5e", "caster").pools, targetTokenUuid };
  }, { actorId: ids.actors.core, targetTokenUuid: ids.targetToken });
  await gm.evaluate(async actorId => game.ak5e.caster.recordRuling(game.actors.get(actorId), "costOrder", "discountsThenSurcharge",
    "Disposable live fixture: exercise the reviewed cost ordering without changing production data."), ids.actors.core);

  report.mystic = await player.evaluate(async ({ actorId }) => {
    const actor = game.actors.get(actorId), api = game.ak5e.caster, charge = () => game.ak5e.resourcePools.getPool(actor, "mysticCharge");
    if (charge().value !== 0 || charge().max !== 3) throw new Error("Mystic Charge did not start at 0 with level-10 maximum 3.");
    await api.command(actor, "beginRitual", { confirmed: true }, `live_mritual_begin_${foundry.utils.randomID()}`);
    return { initial: 0, maximum: 3, chargeAtRitualStart: charge() };
  }, { actorId: ids.actors.mystic });
  // World-time advancement is GM-only in Foundry; owner confirms the actual activity requirements.
  await gm.evaluate(() => game.time.advance(60));
  Object.assign(report.mystic, await player.evaluate(async ({ actorId }) => {
    const actor = game.actors.get(actorId), api = game.ak5e.caster, charge = () => game.ak5e.resourcePools.getPool(actor, "mysticCharge");
    const unit = actor.items.find(item => item.type === "weapon" && item.name === "Arts Staff" && item.flags.ak5e?.casterGrant?.kind === "startingEquipment");
    if (!unit) throw new Error("Mystic selected starting Arts Staff was not granted.");
    await unit.update({ "system.equipped": true });
    if (!unit.system.equipped) throw new Error("Mystic Arts Staff equip update did not persist.");
    const apBefore = actor.getFlag("ak5e", "artsPoints").value;
    const ritual = await api.command(actor, "finishRitual", { ap: 2, stationary: true, concentration: true, minuteCompleted: true, confirmed: true }, `live_mritual_finish_${foundry.utils.randomID()}`);
    if (charge().value !== 2 || actor.getFlag("ak5e", "artsPoints").value !== apBefore - 2) throw new Error("Mystic ritual charge/AP accounting failed.");
    const item = actor.items.find(candidate => candidate.type === "spell" && candidate.name === "Eldritch Blast");
    if (!item) throw new Error("Mystic Crude pool did not grant Eldritch Blast.");
    return { ritual, chargeAfterRitual: charge(), apAfterRitual: actor.getFlag("ak5e", "artsPoints").value,
      itemId: item.id, itemName: item.name, actionActivityId: item.system.activities.contents.find(activity => activity.activation.type === "action")?.id };
  }, { actorId: ids.actors.mystic }));
  await gm.evaluate(async actorId=>{const combat=game.combat;await combat.update({turn:combat.turns.findIndex(c=>c.actorId===actorId)});},ids.actors.mystic);
  await player.waitForFunction(actorId=>game.combat.combatant?.actorId===actorId,ids.actors.mystic);
  const mysticBurst = await runCastDialog(player, ids.actors.mystic, report.mystic.itemId, { mode: "ap", level: 0, burstStart: true });
  report.mystic.burstStart = mysticBurst.receipt;
  report.mystic.burstState = await player.evaluate(actorId => game.actors.get(actorId).getFlag("ak5e", "caster").burst, ids.actors.mystic);
  if (report.mystic.burstState.total !== 3 || report.mystic.burstState.remaining !== 2) throw new Error("Mystic Burst did not establish N+1 separate cantrip uses.");
  const priorBurstMessages = await player.evaluate(() => game.messages.contents.filter(message => message.flags?.ak5e?.artCast).length);
  const nextBurst = await player.evaluate(async actorId => {
    const actor = game.actors.get(actorId); globalThis.__ak5eCasterPendingUse = game.ak5e.caster.command(actor, "nextBurst", { confirmed: true }, `live_mburst_${foundry.utils.randomID()}`);
    globalThis.__ak5eCasterPendingUse.catch(error => { globalThis.__ak5eCasterUseError = error.message; }); return true;
  }, ids.actors.mystic);
  await player.waitForTimeout(250);
  const mysticUse = player.locator('button[data-action="use"]'); await mysticUse.first().waitFor({ timeout: 15000 }); await mysticUse.first().click();
  await player.waitForFunction(prior => game.messages.contents.filter(m => m.flags?.ak5e?.artCast).length > prior, priorBurstMessages, { timeout: 20000 });
  await player.evaluate(async () => { await globalThis.__ak5eCasterPendingUse; if (globalThis.__ak5eCasterUseError) throw new Error(globalThis.__ak5eCasterUseError); });
  report.mystic.burstAfterSecond = await player.evaluate(actorId => ({ state: game.actors.get(actorId).getFlag("ak5e", "caster").burst,
    charge: game.ak5e.resourcePools.getPool(game.actors.get(actorId), "mysticCharge").value }), ids.actors.mystic);
  if (report.mystic.burstAfterSecond.state.remaining !== 1 || report.mystic.burstAfterSecond.charge !== 0) throw new Error("Mystic Burst did not decrement one separate-use receipt or clear charges.");
  report.mystic.nextBurstRequested = !!nextBurst;
  const finalBurst=await runCastDialog(player,ids.actors.mystic,report.mystic.itemId,{mode:"ap",level:0,burstStep:true});
  report.mystic.burstCompleted=await player.evaluate(async ({actorId,itemId,messageId})=>{
    const actor=game.actors.get(actorId),receipt=game.messages.get(messageId).flags.ak5e.artCast;
    const clone=actor.items.get(itemId).clone({}, {keepId:true});clone.updateSource({"flags.ak5e.casterCast":{...receipt.caster.context,castId:receipt.id}});
    const activity=clone.system.activities.contents.find(a=>a.rollDamage);
    const rolls=await activity.rollDamage({isCritical:true},{configure:false},{create:true});
    if(rolls.some(r=>r.options.isCritical))throw new Error("Burst native critical damage was not suppressed.");
    const burst=actor.flags.ak5e.caster.burst;
    if(burst.remaining!==0||burst.castIds.length!==3)throw new Error("Burst did not finish three distinct uses.");
    return {remaining:burst.remaining,receipts:burst.castIds,critical:rolls.map(r=>r.options.isCritical),damage:rolls.map(r=>r.total)};
  },{actorId:ids.actors.mystic,itemId:report.mystic.itemId,messageId:finalBurst.messageId});
  await gm.evaluate(async actorId=>game.ak5e.caster.recordRuling(game.actors.get(actorId),"potentMultiAttack",true,
    "Disposable fixture: GM reviewed a single Eldritch Blast beam miss with seven rolled damage; apply half and no other effects."),ids.actors.mystic);
  report.mystic.potent=await gm.evaluate(async ({actorId,targetId,castId})=>{
    const result=await game.ak5e.caster.command(game.actors.get(actorId),"potent",{confirmed:true,castId,targetUuid:`Actor.${targetId}`,amount:7,outcome:"miss",multiAttack:true,type:"force",reduction:0,resistance:false,vulnerability:false,immunity:false},`live_potent_${foundry.utils.randomID()}`);
    if(result.final!==3||result.noAdditionalEffects!==true)throw new Error("Potent Cantrip did not halve the reviewed miss damage without effects.");
    return result;
  },{actorId:ids.actors.mystic,targetId:ids.targetId,castId:finalBurst.receipt.id});
  report.mystic.initiativeRolls = await player.evaluate(async actorId => {
    const actor = game.actors.get(actorId), combat = game.combat, combatant = combat.combatants.find(entry => entry.actorId === actor.id);
    if (!combatant) throw new Error("Mystic has no live combatant for Turbocharger test.");
    const before = game.ak5e.resourcePools.getPool(actor, "mysticCharge").value;
    await combat.rollInitiative([combatant.id], { formula: "1d20", rollMode: "publicroll" });
    const expectedFirst = Math.min(3, before + 1);
    for (let i = 0; i < 100 && game.ak5e.resourcePools.getPool(actor, "mysticCharge").value !== expectedFirst; i++) await new Promise(resolve => setTimeout(resolve, 25));
    const first = game.ak5e.resourcePools.getPool(actor, "mysticCharge").value;
    await combat.rollInitiative([combatant.id], { formula: "1d20", rollMode: "publicroll" });
    const expectedSecond = Math.min(3, first + 1);
    for (let i = 0; i < 100 && game.ak5e.resourcePools.getPool(actor, "mysticCharge").value !== expectedSecond; i++) await new Promise(resolve => setTimeout(resolve, 25));
    const second = game.ak5e.resourcePools.getPool(actor, "mysticCharge").value;
    if (first !== Math.min(3, before + 1) || second !== Math.min(3, first + 1)) throw new Error(`Turbocharger did not charge on each distinct actual initiative roll (before=${before}, first=${first}, second=${second}).`);
    return { before, first, second };
  }, ids.actors.mystic);
  report.mystic.longRestClear = await player.evaluate(async actorId => {
    const actor = game.actors.get(actorId); await actor.longRest({ dialog: false, chat: false, request: true, advanceTime: false, advanceBastionTurn: false });
    for (let i = 0; i < 100 && game.ak5e.resourcePools.getPool(actor, "mysticCharge").value !== 0; i++) await new Promise(resolve => setTimeout(resolve, 25));
    const value = game.ak5e.resourcePools.getPool(actor, "mysticCharge").value;
    if (value !== 0) throw new Error(`Mystic Charge did not clear on Long Rest (observed ${value}).`);
    return { chargeAfterLongRest: value };
  }, ids.actors.mystic);
  await gm.evaluate(async actorId=>{
    const combat=game.combat;await combat.update({round:combat.round+1,turn:combat.turns.findIndex(c=>c.actorId===actorId)});
  },ids.actors.mystic);
  await player.waitForFunction(actorId=>game.combat.combatant?.actorId===actorId,ids.actors.mystic);
  const feedbackItem=await player.evaluate(actorId=>game.actors.get(actorId).items.find(i=>i.name==="Magic Missile").id,ids.actors.mystic);
  const feedbackCast=await runCastDialog(player,ids.actors.mystic,feedbackItem,{mode:"ap",level:6});
  report.mystic.feedback=await player.evaluate(({actorId,receipt})=>{
    const actor=game.actors.get(actorId),charge=game.ak5e.resourcePools.getPool(actor,"mysticCharge").value;
    if(receipt.cost!==4||charge!==2)throw new Error(`Level-6 AP cast Feedback Loop expected cost4/charge2; got ${receipt.cost}/${charge}.`);
    return {cost:receipt.cost,castLevel:receipt.level,charge};
  },{actorId:ids.actors.mystic,receipt:feedbackCast.receipt});
  await gm.evaluate(async actorId=>{
    const combat=game.combat,turn=combat.turns.findIndex(c=>c.actorId===actorId);
    await combat.update({round:turn<=combat.turn?combat.round+1:combat.round,turn});
  },ids.actors.mech);
  await player.waitForFunction(actorId=>game.ak5e.resourcePools.getPool(game.actors.get(actorId),"mysticCharge").value===3,ids.actors.mystic);
  report.mystic.endTurnCharge=await player.evaluate(actorId=>game.ak5e.resourcePools.getPool(game.actors.get(actorId),"mysticCharge").value,ids.actors.mystic);
  await player.evaluate(async actorId=>game.actors.get(actorId).longRest({dialog:false,chat:false,request:true,advanceTime:false,advanceBastionTurn:false}),ids.actors.mystic);
  await player.waitForFunction(actorId=>game.ak5e.resourcePools.getPool(game.actors.get(actorId),"mysticCharge").value===0,ids.actors.mystic);
  }
  await gm.evaluate(async actorId => {
    const actor = game.actors.get(actorId), api = game.ak5e.caster;
    await api.recordRuling(actor, "technologyModifier", "intMod", "Disposable live fixture: use the creator Intelligence modifier for Arts Master HP test.");
    await api.recordRuling(actor, "droneReactionTiming", "ownBudget", "Disposable live fixture: each drone uses an independent reaction budget.");
    await api.recordRuling(actor,"costOrder","discountsThenSurcharge","Disposable fixture: apply source discounts before Translocation surcharge.");
    await api.recordRuling(actor,"residualStacking","latest","Disposable fixture: each levelled cast replaces the residual energy amount.");
    await api.recordRuling(actor,"duplicationCost",1,"Disposable fixture: Duplication costs one AP total after reviewing surcharge interaction.");
    await api.recordRuling(actor,"deathAboveCost","normal","Disposable fixture: Death from Above uses the normal quote including Translocation surcharge.");
  }, ids.actors.mech);
  await player.waitForFunction(actorId => game.actors.get(actorId).flags.ak5e.caster.rulings.technologyModifier?.value === "intMod", ids.actors.mech);
  report.mech = await player.evaluate(async ({ actorId, sceneId, suffix }) => {
    const actor = game.actors.get(actorId), api = game.ak5e.caster, scene = game.scenes.get(sceneId);
    const operationIds = [`live_${suffix}_drone1`, `live_${suffix}_drone2`];
    for (const [index, operationId] of operationIds.entries()) await api.requestDrone(actor, "create", {
      confirmed: true, sceneId, x: 1900 + index * 200, y: 400, operationId });
    const drones = operationIds.map(id => game.actors.find(drone => drone.flags.ak5e?.artsMaster?.operationId === id));
    const tokens = drones.map(drone => scene.tokens.find(token => token.actorId === drone?.id));
    if (drones.some(drone => !drone?.isOwner) || tokens.some(token => !token)) throw new Error("Owner request did not create two owned Actors and Tokens through the automatic GM relay.");
    let capWarning = false;
    try { await api.requestDrone(actor, "create", { confirmed: true, operationId: `live_${suffix}_drone3` }); }
    catch (error) { capWarning = error.warnings?.some(warning => warning.id === "cap") === true; }
    if (!capWarning) throw new Error("Third Arts Master did not warn before creation.");
    return { drones: drones.map(drone => drone.uuid), tokens: tokens.map(token => token.uuid), capWarning, operationIds,
      owners: drones.map(drone => drone.isOwner), stats: drones.map(drone => drone.flags.ak5e.artsMaster.stats) };
  }, { actorId: ids.actors.mech, sceneId: ids.sceneId, suffix: ids.suffix });
  await gm.evaluate(async actorId=>{const combat=game.combat;await combat.update({turn:combat.turns.findIndex(c=>c.actorId===actorId)});},ids.actors.mech);
  await player.waitForFunction(actorId=>game.combat.combatant?.actorId===actorId && game.actors.get(actorId).flags.ak5e.caster.rulings.duplicationCost?.value===1,ids.actors.mech);
  const mechArts=await player.evaluate(async actorId=>{
    const actor=game.actors.get(actorId);await actor.items.get(actor.flags.ak5e.casting.castingUnit).update({"system.equipped":true});
    return {missile:actor.items.find(i=>i.name==="Magic Missile").id,cantrip:actor.items.find(i=>i.name==="Eldritch Blast").id,ap:actor.flags.ak5e.artsPoints.value};
  },ids.actors.mech);
  const originCast=await runCastDialog(player,ids.actors.mech,mechArts.missile,{mode:"ap",level:3,droneTokenUuid:report.mech.tokens[0]});
  report.mech.origin=await player.evaluate(async ({actorId,receipt,tokenUuids})=>{
    const actor=game.actors.get(actorId),token=fromUuidSync(tokenUuids[0]),ownedArt=actor.items.get(receipt.itemId);
    const clone=ownedArt.clone({}, {keepId:true});clone.updateSource({"flags.ak5e.casterCast":receipt.caster.context});
    const activity=clone.system.activities.contents[0];
    if(receipt.cost!==2||receipt.caster.origin!==token.uuid||activity.getUsageToken().uuid!==token.uuid||activity.actor.uuid!==actor.uuid)throw new Error("Translocation did not retain caster and use drone origin with correct AP.");
    if(ownedArt.flags.ak5e.casterCast)throw new Error("Casting changed the underlying owned Art.");
    await game.ak5e.caster.command(actor,"commandDrones",{confirmed:true,mode:"action",tokenUuids},`live_command_${foundry.utils.randomID()}`);
    const reaction=await game.ak5e.caster.command(actor,"wolfpack",{confirmed:true,castId:receipt.id,droneUuid:tokenUuids[1],visible:true},`live_wolfpack_${foundry.utils.randomID()}`);
    let denied=false;try{await game.ak5e.caster.command(actor,"wolfpack",{confirmed:true,castId:receipt.id,droneUuid:tokenUuids[1],visible:true},`live_reaction_again_${foundry.utils.randomID()}`);}catch{denied=true;}
    if(!denied)throw new Error("Drone Reaction was reusable in the same budget.");
    return {cost:receipt.cost,origin:token.uuid,caster:activity.actor.uuid,commanded:tokenUuids.length,reaction,secondReactionDenied:denied};
  },{actorId:ids.actors.mech,receipt:originCast.receipt,tokenUuids:report.mech.tokens});
  const death=await runCastDialog(player,ids.actors.mech,mechArts.missile,{mode:"ap",level:3,repeat:"deathAbove",previousCastId:originCast.receipt.id,droneTokenUuid:report.mech.tokens[1]});
  report.mech.deathAbove=await player.evaluate(({actorId,receipt,tokenUuid})=>{
    const actor=game.actors.get(actorId),drone=fromUuidSync(tokenUuid).actor,spark=drone.items.find(i=>i.flags.ak5e?.artsMasterSpark).system.activities.contents[0];
    const config=spark.getDamageConfig();
    if(receipt.cost!==2||actor.flags.ak5e.caster.residual?.amount!==2||!config.rolls[0].parts.includes("2"))throw new Error("Death from Above cost or actual-spend Army of One rider is wrong.");
    return {cost:receipt.cost,origin:receipt.caster.origin,residual:actor.flags.ak5e.caster.residual,damageParts:config.rolls[0].parts};
  },{actorId:ids.actors.mech,receipt:death.receipt,tokenUuid:report.mech.tokens[1]});
  const firstCantrip=await runCastDialog(player,ids.actors.mech,mechArts.cantrip,{mode:"ap",level:0});
  const duplicate=await runCastDialog(player,ids.actors.mech,mechArts.cantrip,{mode:"ap",level:0,repeat:"duplicate",sameTargets:true,previousCastId:firstCantrip.receipt.id,droneTokenUuid:report.mech.tokens[0]});
  report.mech.duplication=await player.evaluate(async ({actorId,receipt,tokenUuid})=>{
    const actor=game.actors.get(actorId),drone=fromUuidSync(tokenUuid).actor;
    const lock=Object.values(actor.flags.ak5e.caster.attackLocks).find(lock=>lock.tokenUuid===tokenUuid);
    if(receipt.cost!==1||!lock)throw new Error("Duplication cost or until-next-turn attack lock is missing.");
    if(drone.system.skills.prc.passive!==6)throw new Error("Printed drone passive Perception is not represented.");
    const spark=drone.items.find(i=>i.flags.ak5e?.artsMasterSpark).system.activities.contents[0];
    const blocked=await spark.rollAttack({}, {configure:false}, {create:true});
    if(blocked?.length)throw new Error("A duplicated drone's native Attack roll bypassed its attack prohibition.");
    return {cost:receipt.cost,attackLock:lock,passivePerception:drone.system.skills.prc.passive,attackDenied:true};
  },{actorId:ids.actors.mech,receipt:duplicate.receipt,tokenUuid:report.mech.tokens[0]});
  const sparkWarning = player.locator('dialog').filter({ has: player.locator('button[data-action="yes"]') }).last();
  await sparkWarning.waitFor({ timeout: 15000 });
  await screenshot(player, "owner-spark-warning");
  await sparkWarning.locator('button[data-action="no"]').click();
  await player.evaluate(async tokenUuid => {
    const drone = fromUuidSync(tokenUuid).actor;
    globalThis.__sparkLiveCounts = { uses: 0, attacks: 0 };
    globalThis.__sparkLiveHooks = [
      ["dnd5e.preUseActivity", Hooks.on("dnd5e.preUseActivity", activity => { if (activity.actor?.uuid === drone.uuid) __sparkLiveCounts.uses++; })],
      ["dnd5e.postRollAttack", Hooks.on("dnd5e.postRollAttack", (rolls, { subject }) => { if (subject?.actor?.uuid === drone.uuid && rolls?.length) __sparkLiveCounts.attacks++; })]
    ];
    const spark = drone.items.find(item => item.flags.ak5e?.artsMasterSpark).system.activities.contents[0];
    await spark.rollAttack({}, { configure: false }, { create: true });
  }, report.mech.tokens[0]);
  await sparkWarning.waitFor({ timeout: 15000 });
  await sparkWarning.locator('button[data-action="yes"]').click();
  await player.waitForFunction(() => globalThis.__sparkLiveCounts.attacks === 1, null, { timeout: 15000 });
  report.mech.attackContinuation = await player.evaluate(() => {
    const counts = { ...__sparkLiveCounts };
    for (const [name, id] of __sparkLiveHooks) Hooks.off(name, id);
    if (counts.uses !== 0 || counts.attacks !== 1) throw new Error(`Held attack started another use or duplicated a roll: ${JSON.stringify(counts)}`);
    return counts;
  });
  await screenshot(player, "owner-spark-continued-attack");
  await player.evaluate(uuid => {
    const drone = fromUuidSync(uuid);
    if (!drone?.isOwner) throw new Error("Player does not own the Arts Master sheet target.");
    void drone.sheet.render(true);
  }, report.mech.drones[0]);
  await player.waitForTimeout(500);
  await screenshot(player, "owner-drone-sheet");
  const repairPrepared = await player.evaluate(async ({ actorId, droneTokenUuid }) => {
    const actor = game.actors.get(actorId), drone = fromUuidSync(droneTokenUuid).actor;
    const beforeAP = actor.flags.ak5e.artsPoints.value, hp = drone.system.attributes.hp;
    await drone.update({ "system.attributes.hp.value": hp.max - 10, "system.attributes.hp.temp": 7 });
    const useId = `live_jury_no_excess_${foundry.utils.randomID()}`;
    await game.ak5e.caster.command(actor, "juryRig", { droneUuid: droneTokenUuid, ap: 1, visible: true, confirmed: true }, useId);
    if (drone.system.attributes.hp.value !== hp.max - 10 || actor.flags.ak5e.caster.undo.find(r => r.id === useId).roll !== undefined) throw new Error("Jury Rigging rolled or healed before the player's roll request.");
    return { useId, beforeAP, hpBefore: hp.max - 10,
      messageId: game.messages.find(message => message.flags.ak5e?.casterUse?.useId === useId)?.id };
  }, { actorId: ids.actors.mech, droneTokenUuid: report.mech.tokens[1] });
  await screenshot(player, "owner-jury-before-roll");
  const repairCard = player.locator(`[data-message-id="${repairPrepared.messageId}"]`);
  await repairCard.locator(".ak5e-caster-roll").click();
  await player.waitForFunction(({ actorId, useId }) => game.actors.get(actorId).flags.ak5e.caster.undo.find(receipt => receipt.id === useId)?.status === "complete",
    { actorId: ids.actors.mech, useId: repairPrepared.useId });
  report.mech.zeroExcessRepair = await player.evaluate(({ actorId, droneTokenUuid, prepared }) => {
    const actor = game.actors.get(actorId), drone = fromUuidSync(droneTokenUuid).actor;
    const receipt = actor.flags.ak5e.caster.undo.find(entry => entry.id === prepared.useId);
    if (drone.system.attributes.hp.value !== prepared.hpBefore + receipt.roll || drone.system.attributes.hp.temp !== 7 || actor.flags.ak5e.artsPoints.value !== prepared.beforeAP - 1) throw new Error("Repair without excess healing changed existing temporary HP or spent the wrong AP.");
    return { roll: receipt.roll, temporaryHP: drone.system.attributes.hp.temp, spent: receipt.apSpent, clickedCard: true };
  }, { actorId: ids.actors.mech, droneTokenUuid: report.mech.tokens[1], prepared: repairPrepared });
  await screenshot(player, "owner-jury-after-roll");
  await player.evaluate(async ({ actorId, droneUuids }) => {
    const actor = game.actors.get(actorId), drones = droneUuids.map(uuid => fromUuidSync(uuid));
    if (drones.some(drone => !drone?.isOwner)) throw new Error("Owner does not directly own both Arts Master Actors.");
    const spark = drones[1].items.find(item => item.flags.ak5e?.artsMasterSpark), activity = spark.system.activities.contents[0];
    if (!activity || activity.attack.bonus === "") throw new Error("Native Originium Spark attack activity is not configured.");
    await activity.rollAttack({}, { configure: false }, { create: true });
    const hp = drones[1].system.attributes.hp;
    await drones[1].update({ "system.attributes.hp.value": hp.max - 3 });
    return { directOwnership: drones.every(drone => drone.isOwner), sparkAttack: activity.attack.bonus,
      droneUuid: drones[1].uuid, damagedHp: hp.max - 3, sceneId: game.scenes.active?.id };
  }, { actorId: ids.actors.mech, droneUuids: report.mech.drones });
  report.mech.repairs = await player.evaluate(async ({ actorId, droneTokenUuid }) => {
    const actor = game.actors.get(actorId), drone = fromUuidSync(droneTokenUuid).actor, beforeAP = actor.getFlag("ak5e", "artsPoints").value;
    const useId = `live_jury_${foundry.utils.randomID()}`;
    await game.ak5e.caster.command(actor, "juryRig", { droneUuid: droneTokenUuid, ap: 2, visible: true, confirmed: true, reading: "replace" }, useId);
    const result = await game.ak5e.caster.command(actor, "useRoll", { useId }, `${useId}-roll`);
    if (actor.getFlag("ak5e", "artsPoints").value !== beforeAP - 2 || drone.system.attributes.hp.value < drone.system.attributes.hp.max - 3) throw new Error("Jury Rig did not heal drone and spend 2 AP.");
    await drone.update({ "system.attributes.hp.value": 0 });
    await actor.update({ "system.currency.cp": 800 });
    const rebuild = await game.ak5e.caster.command(actor, "rebuild", { droneUuid: drone.uuid, restCompleted: true, components: false, paid: 500, confirmed: true }, `live_rebuild_${foundry.utils.randomID()}`);
    if (actor.system.currency.cp !== 300 || drone.system.attributes.hp.value !== drone.system.attributes.hp.max || drone.flags.ak5e.artsMaster.destroyed) throw new Error("Long Rest rebuild/500 LMD payment failed.");
    return { repair: result, rebuild, apAfterRepair: actor.getFlag("ak5e", "artsPoints").value, hpAfterRebuild: drone.system.attributes.hp.value, cpAfterPayment: actor.system.currency.cp };
  }, { actorId: ids.actors.mech, droneTokenUuid: report.mech.tokens[1] });
  await casterMechFollowupChecks({ gm, player, ids, report, screenshot });

  await player.evaluate(async ({ actorIds, observerId }) => {
    const actor = game.actors.get(actorIds.core);
    actor.setFlag("ak5e", "casterLiveObserverId", observerId);
    return true;
  }, { actorIds: ids.actors, observerId: ids.observerId });

  await gm.evaluate(async ({ actorId, tokenUuids }) => {
    const actor = game.actors.get(actorId), scene = game.scenes.active;
    await actor.sheet.render(true);
    for (const uuid of tokenUuids) { const token = fromUuidSync(uuid); await token.actor.sheet.render(true); token.actor.sheet.bringToTop(); }
    return { ownerIds: Object.keys(actor.ownership), droneCount: actor.getFlag("ak5e", "caster").drones.length, scene: scene?.name };
  }, { actorId: ids.actors.mech, tokenUuids: report.mech.tokens });
  await gm.waitForTimeout(500);await screenshot(gm, "gm-drone-sheet");

  const observer = await join("Caster Live Observer");
  report.permissions.observer = await observer.evaluate(async actorId => {
    const actor = game.actors.get(actorId); let rejected = false;
    try { await game.ak5e.caster.command(actor, "powerWithin", { restCompleted: true, confirmed: true }, "live_observer_denied"); } catch { rejected = true; }
    void actor.sheet.render(true);
    return { ownsActor: actor.isOwner, observesActor: actor.testUserPermission(game.user,"OBSERVER"), rejected, casterControls: !!document.querySelector(".ak5e-caster-panel") };
  }, ids.actors.core);
  if (!report.permissions.observer.rejected || report.permissions.observer.ownsActor || !report.permissions.observer.observesActor) throw new Error("Observer permissions are not enforced.");
  await observer.evaluate(async()=>{for(const app of foundry.applications.instances.values())if(app.constructor.name.includes("UserConfig"))await app.close();});
  await observer.waitForTimeout(350);
  await screenshot(observer, "observer-sheet");
  await gm.reload(); await gm.waitForFunction(() => game.ready && game.ak5e?.caster, null, { timeout: 60000 });
  report.persistence = await gm.evaluate(ids => Object.fromEntries(Object.entries(ids.actors).map(([key, id]) => {
    const actor = game.actors.get(id); return [key, { ap: actor.getFlag("ak5e", "artsPoints"), pools: actor.getFlag("ak5e", "caster").pools,
      branch: actor.items.find(item => item.type === "subclass")?.flags.ak5e.chapterThreeId, casterLevel: actor.items.find(item => item.flags.ak5e?.chapterThreeId === "class-caster")?.system.levels,
      itemIds: actor.items.map(item=>item.id).sort(), droneCount: actor.getFlag("ak5e", "caster").drones.length }];
  })), ids);
  if (!report.persistence.core || report.persistence.mech.droneCount !== 2) throw new Error("Caster or Arts Master state did not persist across reload.");
  report.knownBaselineErrors = report.errors.filter(error => /AK5e \| Standard Bearer Error: The Standard Bearer state could not be saved\.|The Standard Bearer state could not be saved\./.test(error));
  report.unexpectedBrowserErrors = report.errors.filter(error => !report.knownBaselineErrors.includes(error));
  if (report.unexpectedBrowserErrors.length) throw new Error(`Unexpected browser errors (known Standard Bearer baseline errors are recorded separately): ${report.unexpectedBrowserErrors.join("; ")}`);
  console.log(JSON.stringify(report, null, 2));
  }
} catch (error) {
  report.failure = { message: error.message, stack: error.stack };
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
} finally {
  try { await writeFile(`${output}.json`, JSON.stringify(report, null, 2)); }
  finally { await Promise.allSettled(contexts.map(context => context.close())); await browser.close(); }
}
