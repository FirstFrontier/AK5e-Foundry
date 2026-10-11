/** Guardian/Fortress browser checks for the disposable Foundry V13 runner.
 * The caller must pass pages from launchTestBrowser() and ids from test-defender-live.mjs.
 * This helper creates only Actors, Tokens, Items and flags marked with its private fixture suffix. */
export async function createDefenderBranchesLiveFixtures({ gm, ids }) {
  const made = await gm.evaluate(async ({ ids }) => {
    const { CHAPTER_THREE_CLASSES } = await import("/modules/ak5e/scripts/chapter-three-content.mjs");
    const { sourceEntryData } = await import("/modules/ak5e/scripts/caster-setup.mjs");
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
    const suffix = `branches_${foundry.utils.randomID()}`;
    const scene = game.scenes.get(ids.sceneId);
    assert(scene, "The disposable Defender fixture Scene is missing.");
    const entry = id => {
      const result = CHAPTER_THREE_CLASSES.find(row => row.id === id);
      assert(result, `Missing source feature ${id}`);
      return result;
    };
    const createBranch = async (key, branchId, level, featureIds, x, y) => {
      const actor = await Actor.implementation.create({ name: `${key} ${suffix}`, type: "character",
        ownership: { default: 0, [ids.ownerId]: 3, [ids.observerId]: 2 },
        flags: { ak5e: { defenderBranchesLiveFixture: suffix, defenderBranchesLiveRole: key } },
        system: { abilities: { str: { value: 18 }, dex: { value: 14 }, con: { value: 16 }, int: { value: 12 }, wis: { value: 14 }, cha: { value: 10 } },
          attributes: { hp: { value: 80, max: 80 }, movement: { walk: 30 } } } });
      const cls = sourceEntryData(entry("class-defender")); cls.system.levels = level;
      await actor.createEmbeddedDocuments("Item", [cls, sourceEntryData(entry(branchId)), ...featureIds.map(id => sourceEntryData(entry(id)))]);
      const tokenData = await actor.getTokenDocument({ x, y });
      tokenData.updateSource({ name: actor.name, actorLink: true, disposition: 1 });
      const [token] = await scene.createEmbeddedDocuments("Token", [tokenData.toObject()]);
      const api = game.ak5e.defender, plan = api.preview(actor);
      await api.apply(actor, { confirmed: true, contextKey: plan.contextKey, operationId: `setup_${key}_${suffix}` });
      return { actorId: actor.id, tokenUuid: token.uuid };
    };
    const guardian = await createBranch("guardian", "subclass-defender-guardian", 15, [
      "subclass-feature-defender-guardian-1st-level-guardian-of-life-336", "subclass-feature-defender-guardian-4th-level-not-today-2276",
      "subclass-feature-defender-guardian-9th-level-anaesthesia-2842", "subclass-feature-defender-guardian-12th-level-aura-of-mercy-3172",
      "subclass-feature-defender-guardian-15th-level-the-best-medicine-3344"], 850, 700);
    const fortress = await createBranch("fortress", "subclass-defender-fortress", 15, [
      "subclass-feature-defender-fortress-level-1-fire-support-platform-481", "subclass-feature-defender-fortress-level-4-fire-for-effect-1457",
      "subclass-feature-defender-fortress-level-9-moving-fortress-3521", "subclass-feature-defender-fortress-level-12-stronghold-3723",
      "subclass-feature-defender-fortress-level-15-creeping-barrage-4344", ...[
        "subclass-feature-defender-fortress-concussive-munition-4867", "subclass-feature-defender-fortress-corrosive-munition-5094",
        "subclass-feature-defender-fortress-flare-munition-5316", "subclass-feature-defender-fortress-explosive-munition-5590",
        "subclass-feature-defender-fortress-incendiary-munition-5746", "subclass-feature-defender-fortress-shrapnel-munition-5911"]
    ], 1100, 700);
    const g = game.actors.get(guardian.actorId), f = game.actors.get(fortress.actorId);
    await g.createEmbeddedDocuments("Item", [{ name: "Live Shield", type: "equipment", system: { equipped: true, type: { value: "shield" } }, flags: { ak5e: { defenderBranchesLiveFixture: suffix } } }]);
    await f.createEmbeddedDocuments("Item", [{ name: "Grenade Launcher", type: "weapon", system: { equipped: true, ability: "dex", damage: { base: { number: 1, denomination: 8, types: ["thunder"] } } },
      flags: { ak5e: { chapterFourId: "weapon-grenade-launcher-12", defenderBranchesLiveFixture: suffix } } }]);
    const npc = async (key, creatureType, hp, x, y = 700, maxHp = hp) => {
      const actor = await Actor.implementation.create({ name: `${key} ${suffix}`, type: "npc", ownership: { default: 0 }, flags: { ak5e: { defenderBranchesLiveFixture: suffix } },
        system: { details: { type: { value: creatureType } }, abilities: { dex: { value: 10 } }, attributes: { hp: { value: hp, max: maxHp }, ac: { flat: 10, calc: "flat" } } } });
      const tokenData = await actor.getTokenDocument({ x, y }); tokenData.updateSource({ name: actor.name, actorLink: true, disposition: key === "branch-ally" ? 1 : -1 });
      const [token] = await scene.createEmbeddedDocuments("Token", [tokenData.toObject()]);
      return { actorId: actor.id, tokenUuid: token.uuid };
    };
    return { suffix, guardian, fortress, construct: await npc("branch-construct", "construct", 10, 900, 700, 20), ally: await npc("branch-ally", "humanoid", 20, 950), enemy: await npc("branch-enemy", "humanoid", 50, 1250) };
  }, { ids });
  ids.defenderBranches = made;
  await gm.evaluate(async fixture => {
    if (!game.combat?.started) throw new Error("The branch fixtures require the disposable encounter.");
    await game.combat.createEmbeddedDocuments("Combatant", Object.values(fixture).filter(value => value?.tokenUuid).map((entry, index) => {
      const token = fromUuidSync(entry.tokenUuid);
      return { actorId: entry.actorId, tokenId: token.id, sceneId: token.parent.id, initiative: 5 - index };
    }));
  }, made);
  return made;
}

export async function defenderBranchesLiveChecks({ gm, owner, observer, ids, check, shot }) {
  const fixture = ids.defenderBranches ?? await createDefenderBranchesLiveFixtures({ gm, ids });
  const actors = { guardian: fixture.guardian.actorId, fortress: fixture.fortress.actorId };
  const clickRoll = async (page, useId) => {
    const messageId = await page.evaluate(id => game.messages.contents.find(message => message.flags?.ak5e?.defenderUsesUse?.useId === id)?.id, useId);
    if (!messageId) throw new Error(`Missing public use card for ${useId}`);
    const card = page.locator(`[data-message-id="${messageId}"]`);
    const button = card.locator(".ak5e-play-use-controls button").filter({ hasText: /^Roll / }).first();
    await button.waitFor(); await button.click();
  };
  await check("Guardian and Fortress source features appear in owner controls and the panels render without horizontal clipping", async () => {
    for (const key of ["guardian", "fortress"]) {
      await owner.evaluate(({ id }) => { void game.actors.get(id).sheet.render(true); }, { id: actors[key] });
      await owner.waitForTimeout(900);
      const panel = owner.locator(".ak5e-defender-sheet-panel").last(); await panel.waitFor();
      const control = await panel.evaluate(el => ({ text: el.innerText, overflow: el.scrollWidth > el.clientWidth + 2 }));
      if (control.overflow) throw new Error(`${key} sheet panel clips horizontally`);
      await shot(owner, `branches-${key}-sheet`);
      await owner.evaluate(id => { void game.ak5e.defender.open(game.actors.get(id)); }, actors[key]);
      const dialog = owner.locator("dialog:has(.ak5e-defender-panel)").last(); await dialog.waitFor();
      const buttons = await dialog.locator("[data-defender-ui]").allInnerTexts();
      if (!buttons.some(text => key === "guardian" ? /Not Today/.test(text) : /Entrench/.test(text))) throw new Error(`${key} control missing: ${buttons.join(", ")}`);
      await shot(owner, `branches-${key}-controls`);
      await dialog.locator('button[data-action="close"]').last().click().catch(() => owner.keyboard.press("Escape"));
    }
    return { actors, fixture: fixture.suffix };
  });

  await check("Guardian Art setup keeps the equipped shield as Casting Unit; cancelling a feature form changes nothing", async () => {
    const result = await owner.evaluate(async ({ actorId }) => {
      const actor = game.actors.get(actorId);
      const { previewGuardianArts, applyGuardianArts } = await import("/modules/ak5e/scripts/guardian-features.mjs");
      const preview = await previewGuardianArts(actor, { ability: "wis" });
      await applyGuardianArts(actor, { ability: "wis", confirmed: true, contextKey: preview.contextKey });
      const { artAvailability } = await import("/modules/ak5e/scripts/arts-casting.mjs");
      const art = { id: "branches_shield_focus_art", uuid: "Actor.branches.Item.focus", name: "Shield Focus Check", type: "spell",
        system: { level: 1, method: "spell", prepared: 2, properties: ["vocal"], materials: {} }, flags: {}, actor };
      const availability = artAvailability(actor, art);
      if (!availability.quote) throw new Error(`Equipped shield failed the real Art availability check: ${availability.error?.message}`);
      const before = JSON.stringify({ state: actor.getFlag("ak5e", "defenderUses"), pool: actor.getFlag("ak5e", "resourcePools") });
      const form = await import("/modules/ak5e/scripts/defender-sheet.mjs");
      // Cancel through the same form used by the visible control; prompt close returns null before a command runs.
      const opening = form.openDefenderForm(actor, "notToday");
      await new Promise(resolve => setTimeout(resolve, 250));
      const dialog = [...foundry.applications.instances.values()].find(app => app.element?.querySelector?.(".ak5e-defender-form"));
      if (!dialog) throw new Error("Not Today confirmation form did not open");
      await dialog.close(); await opening;
      const after = JSON.stringify({ state: actor.getFlag("ak5e", "defenderUses"), pool: actor.getFlag("ak5e", "resourcePools") });
      return { castingUnit: actor.getFlag("ak5e", "casting")?.castingUnit, shieldEquipped: actor.items.some(item => item.name === "Live Shield" && item.system.equipped), artAvailable: !!availability.quote, unchanged: before === after };
    }, { actorId: actors.guardian });
    await shot(owner, "branches-guardian-cancel");
    if (result.castingUnit !== "shield" || !result.shieldEquipped || !result.artAvailable || !result.unchanged) throw new Error(JSON.stringify(result));
    return result;
  });

  await check("Guardian healing warns on Constructs, exposes an explicit override, relays the use, and leaves healing dice on the owner card", async () => {
    const prepared = await owner.evaluate(async ({ actorId, constructId }) => {
      const actor = game.actors.get(actorId), target = game.actors.get(constructId), api = game.ak5e.defender;
      const before = target.system.attributes.hp.value;
      await api.use(actor, "bestMedicine", { confirmed: true }, "branches_medicine");
      const data = { targetUuid: target.uuid, attackConfirmed: true, visible: true, constructOverride: true, attackId: "branches_melee_1", confirmed: true };
      try { await api.use(actor, "bestMedicineHeal", { ...data, constructOverride: false }, "branches_heal_warn"); throw new Error("Construct warning was not shown"); }
      catch (error) { if (!error.warnings?.some(warning => warning.id === "construct")) throw error; }
      await api.use(actor, "bestMedicineHeal", { ...data, overrides: ["construct"] }, "branches_heal");
      const card = game.messages.contents.find(message => message.flags?.ak5e?.defenderUsesUse?.useId === "branches_heal");
      if (!card || !/Chapter 1 says Constructs/.test(card.content)) throw new Error("Public Construct override warning missing");
      return { before, messageId: card.id };
    }, { actorId: actors.guardian, constructId: fixture.construct.actorId });
    await clickRoll(owner, "branches_heal");
    await owner.waitForFunction(id => game.actors.get(id).system.attributes.hp.value > 10, fixture.construct.actorId, { timeout: 15000 });
    const result = await owner.evaluate(async ({ actorId, constructId }) => {
      const actor = game.actors.get(actorId), target = game.actors.get(constructId), api = game.ak5e.defender;
      const afterRoll = target.system.attributes.hp.value;
      await api.use(actor, "undoUse", { useId: "branches_heal" }, "branches_heal_undo");
      return { afterRoll, afterUndo: target.system.attributes.hp.value, owner: actor.isOwner };
    }, { actorId: actors.guardian, constructId: fixture.construct.actorId });
    await shot(owner, "branches-guardian-healing-card");
    if (result.afterRoll <= prepared.before || result.afterUndo !== prepared.before) throw new Error(JSON.stringify({ prepared, result }));
    return { ...prepared, ...result };
  });

  await check("Not Today survives native cast cancellation and is consumed by committed AP, free, ritual and Cantrip casts", async () => {
    const arts = await gm.evaluate(async actorId => {
      const actor = game.actors.get(actorId), bolster = actor.items.find(item => item.getFlag("ak5e", "chapterFiveId") === "art-bolster-29722"),
        abjure = actor.items.find(item => item.getFlag("ak5e", "chapterFiveId") === "art-abjure-186");
      if (!bolster || !abjure) throw new Error("Source-backed Guardian Healing Arts were not granted.");
      await game.ak5e.configureArt(bolster, { enabled: true, ritual: true, free: { level: 2, maximum: null, recovery: "manual" },
        source: "GM-approved disposable acceptance fixture only: grant free and ritual modes to the existing source Bolster Art to exercise consumption." });
      return { bolster: bolster.id, abjure: abjure.id };
    }, actors.guardian);
    await owner.waitForFunction(({ actorId, itemId }) => game.actors.get(actorId).items.get(itemId)?.getFlag("ak5e", "art")?.ritual === true,
      { actorId: actors.guardian, itemId: arts.bolster });
    const results = [];
    for (const [label, mode, itemId] of [["ap", "ap", arts.bolster], ["free", "free", arts.bolster], ["ritual", "ritual", arts.bolster], ["cantrip", "ap", arts.abjure]]) {
      const useId = `branches_notToday_${label}`;
      await owner.evaluate(async ({ actorId, useId }) => game.ak5e.defender.use(game.actors.get(actorId), "notToday", {
        amount: 1, confirmed: true, overrides: ["turn", "pending"] }, useId), { actorId: actors.guardian, useId });
      const begin = async () => {
        await owner.evaluate(({ actorId, itemId, mode }) => {
          const actor = game.actors.get(actorId), item = actor.items.get(itemId);
          const activity = item.system.activities.contents[0];
          if (!activity) throw new Error(`${item.name} lacks its native source activity.`);
          globalThis.__guardianNativeCast = activity.use({ ak5eMode: mode, ak5eLevel: item.system.level }, { configure: true });
          __guardianNativeCast.catch(error => { globalThis.__guardianNativeError = error.message; });
        }, { actorId: actors.guardian, itemId, mode });
        const dialog = owner.locator('dialog:has(button[data-action="use"])').last();
        await dialog.waitFor({ timeout: 15000 });
        return dialog;
      };
      if (label === "ap") {
        const cancelled = await begin();
        await shot(owner, "branches-guardian-art-cancel");
        await cancelled.locator('button[data-action="cancel"], button[data-action="close"]').first().click();
        await owner.evaluate(async () => { await __guardianNativeCast; });
        const pending = await owner.evaluate(actorId => game.actors.get(actorId).getFlag("ak5e", "defenderUses").data.notToday, actors.guardian);
        if (pending?.consumedBy) throw new Error("Cancelling a native Art consumed Not Today.");
      }
      const dialog = await begin();
      await shot(owner, `branches-guardian-art-${label}`);
      await dialog.locator('button[data-action="use"]').click();
      await owner.evaluate(async () => { await __guardianNativeCast; });
      const result = await owner.evaluate(async ({ actorId, useId, mode }) => {
        const actor = game.actors.get(actorId), pending = actor.getFlag("ak5e", "defenderUses").data.notToday, cast = actor.getFlag("ak5e", "lastArtCast");
        if (!cast || cast.mode !== mode || pending?.consumedBy !== cast.id) throw new Error(`Committed ${mode} cast did not consume the matching Not Today use.`);
        const apAfter = actor.getFlag("ak5e", "artsPoints").value;
        await game.ak5e.defender.use(actor, "undoUse", { useId }, `${useId}_undo`);
        if (actor.getFlag("ak5e", "artsPoints").value !== apAfter) throw new Error("Not Today undo repriced the completed cast.");
        return { mode, castId: cast.id, level: cast.level, cost: cast.cost, apAfter };
      }, { actorId: actors.guardian, useId, mode });
      results.push(result);
    }
    return results;
  });

  await check("a native Guardian melee attack supplies raw.subject.attack.type.value and posts The Best Medicine prompt", async () => {
    const weaponId = await gm.evaluate(async actorId => {
      const actor = game.actors.get(actorId);
      const [weapon] = await actor.createEmbeddedDocuments("Item", [{ name: "Guardian native melee fixture", type: "weapon",
        system: { equipped: true, type: { value: "simpleM" }, quantity: 1, damage: { base: { number: 1, denomination: 4, types: ["slashing"] } },
          activities: { ak5eMeleeLive001: { _id: "ak5eMeleeLive001", name: "Melee Attack", type: "attack", activation: { type: "action", value: 1 },
            attack: { ability: "str", type: { value: "melee", classification: "weapon" } }, damage: { includeBase: true, parts: [] }, consumption: { targets: [], spellSlot: false } } } },
        flags: { ak5e: { defenderBranchesLiveFixture: actor.getFlag("ak5e", "defenderBranchesLiveFixture") } } }]);
      return weapon.id;
    }, actors.guardian);
    await owner.waitForFunction(({ actorId, weaponId }) => !!game.actors.get(actorId).items.get(weaponId), { actorId: actors.guardian, weaponId });
    const result = await owner.evaluate(async ({ actorId, weaponId }) => {
      const actor = game.actors.get(actorId), events = await import("/modules/ak5e/scripts/trigger-events.mjs");
      const { bestMedicineActive } = await import("/modules/ak5e/scripts/guardian-features.mjs");
      if (!bestMedicineActive(actor)) throw new Error("The source one-minute Best Medicine fixture expired before the attack check.");
      const before = game.messages.filter(message => message.flags.ak5e?.guardianPrompt?.kind === "medicine").length;
      let type = null;
      const off = events.onAk5eEvent("attack", event => { if (event.actorUuid === actor.uuid) type = event.raw?.subject?.attack?.type?.value; });
      try {
        await actor.items.get(weaponId).system.activities.contents[0].rollAttack({}, { configure: false }, { create: true });
        for (let index = 0; index < 100 && game.messages.filter(message => message.flags.ak5e?.guardianPrompt?.kind === "medicine").length === before; index++)
          await new Promise(resolve => setTimeout(resolve, 50));
        return { type, prompts: game.messages.filter(message => message.flags.ak5e?.guardianPrompt?.kind === "medicine").length - before };
      } finally { if (typeof off === "function") off(); }
    }, { actorId: actors.guardian, weaponId });
    await shot(owner, "branches-guardian-melee-prompt");
    if (result.type !== "melee" || result.prompts !== 1) throw new Error(JSON.stringify(result));
    return result;
  });

  await check("Fortress shows its movement-speed guidance, loads all six Munitions, and preserves native damage roll controls", async () => {
    const result = await owner.evaluate(async ({ actorId }) => {
      const actor = game.actors.get(actorId), api = game.ak5e.defender;
      const setup = await import("/modules/ak5e/scripts/fortress-features.mjs");
      const launcher = actor.items.find(item => item.name === "Grenade Launcher");
      if (!launcher) throw new Error("Fixture launcher missing");
      await api.use(actor, "entrench", { confirmed: true, overrides: ["turn"] }, "branches_entrench");
      const movement = actor.effects.find(effect => effect.name.includes("Entrenched"))?.description ?? "";
      for (const munition of Object.keys(setup.MUNITIONS)) {
        await api.use(actor, "loadMunition", { weaponId: launcher.id, munition, confirmed: true }, `branches_load_${munition}`);
        await api.use(actor, "undoUse", { useId: `branches_load_${munition}` }, `branches_unload_${munition}`);
      }
      await api.use(actor, "loadMunition", { weaponId: launcher.id, munition: "flare", confirmed: true }, "branches_damage_load");
      try { await api.use(actor, "fireMunitions", { weaponId: launcher.id, mode: "attack", pointConfirmed: true, reading: "weaponDice", confirmed: true }, "branches_volley"); }
      catch (error) { if (!error.warnings?.length) throw error; await api.use(actor, "fireMunitions", { weaponId: launcher.id, mode: "attack", pointConfirmed: true, reading: "weaponDice", confirmed: true,
        overrides: error.warnings.map(warning => warning.id) }, "branches_volley"); }
      const message = game.messages.contents.find(entry => entry.flags?.ak5e?.defenderUsesUse?.useId === "branches_volley");
      return { movement, dice: actor.getFlag("ak5e", "resourcePools")?.munitionsDice, loaded: setup.loadedMunitions(actor), messageId: message?.id, card: message?.content ?? "", launcher: launcher.name };
    }, { actorId: actors.fortress });
    await clickRoll(owner, "branches_volley");
    await owner.waitForFunction(() => game.messages.contents.some(message => message.flags?.ak5e?.defenderUsesOperation === "branches_volley-dice"), null, { timeout: 15000 });
    const damageCard = await owner.evaluate(() => {
      const message = game.messages.contents.find(entry => entry.flags?.ak5e?.defenderUsesOperation === "branches_volley-dice");
      const el = message && document.querySelector(`[data-message-id="${message.id}"]`);
      const controls = [...(el?.querySelectorAll("button") ?? [])].map(button => button.innerText.trim());
      const applyDamage = Boolean(el?.querySelector(".apply-damage, [data-action='applyDamage'], button[aria-label*='Apply Damage']")) || controls.some(label => /apply damage/i.test(label));
      return { id: message?.id, controls, applyDamage, content: el?.innerText ?? "" };
    });
    await shot(owner, "branches-fortress-volley");
    if (!/reduce other movement speeds manually/.test(result.movement) || !/Roll/.test(result.card) || !result.launcher || !damageCard.id || !damageCard.applyDamage) throw new Error(JSON.stringify({ result, damageCard }));
    return { ...result, damageCard };
  });

  await check("Fortress Reaction spends once, warns when exhausted, refunds on undo, and Fortification has an undo receipt", async () => {
    const result = await owner.evaluate(async ({ actorId, allyUuid }) => {
      const actor = game.actors.get(actorId), api = game.ak5e.defender;
      const { getReactions, spendReaction, refreshReactions } = await import("/modules/ak5e/scripts/trigger-events.mjs");
      const { defenderUses } = await import("/modules/ak5e/scripts/defender-uses.mjs");
      const { loadedMunitions } = await import("/modules/ak5e/scripts/fortress-features.mjs");
      const start = { reactions: getReactions(actor).available, resilience: actor.getFlag("ak5e", "resourcePools")?.resilience?.value };
      await api.use(actor, "loadMunition", { weaponId: actor.items.find(item => item.name === "Grenade Launcher").id, munition: "concussive", confirmed: true }, "branches_reaction_load");
      const reactionData = { weaponId: actor.items.find(item => item.name === "Grenade Launcher").id, mode: "stopTheirAdvance", triggerId: "branches_move_1", triggerConfirmed: true,
        pointConfirmed: true, reading: "weaponDice", confirmed: true };
      await api.use(actor, "fireMunitions", reactionData, "branches_reaction_fire");
      const spent = getReactions(actor).available;
      await api.use(actor, "fireMunitions", reactionData, "branches_reaction_fire");
      if (getReactions(actor).available !== spent) throw new Error("Retrying Stop their Advance spent a second Reaction");
      await api.use(actor, "undoUse", { useId: "branches_reaction_fire" }, "branches_reaction_undo");
      const refunded = getReactions(actor).available;
      await refreshReactions(actor);
      await api.use(actor, "undoUse", { useId: "branches_reaction_load" }, "branches_reaction_load_undo");

      for (let index = 0; getReactions(actor).available > 0; index++)
        await spendReaction(actor, { triggerId: `branches_external_reaction_${index}`, receipt: `branches_external_reaction_${index}` });
      await api.use(actor, "loadMunition", { weaponId: reactionData.weaponId, munition: "flare", confirmed: true }, "branches_exhaust_load");
      await api.use(actor, "fireMunitions", { ...reactionData, triggerId: "branches_move_2", overrides: ["reaction"] }, "branches_exhaust_fire");
      const exhausted = defenderUses.receipt(actor, "branches_exhaust_fire").reaction;
      await api.use(actor, "undoUse", { useId: "branches_exhaust_fire" }, "branches_exhaust_undo");
      await refreshReactions(actor);
      await api.use(actor, "undoUse", { useId: "branches_exhaust_load" }, "branches_exhaust_load_undo");

      await api.use(actor, "undoUse", { useId: "branches_entrench" }, "branches_entrench_undo");
      await api.use(actor, "entrench", { confirmed: true, overrides: ["turn"] }, "branches_fortification_entrench");
      await api.use(actor, "fortification", { allies: [allyUuid], alliesConfirmed: true, confirmed: true }, "branches_fortification");
      const shelter = actor.getFlag("ak5e", "defender")?.shelter;
      await api.use(actor, "undoUse", { useId: "branches_fortification" }, "branches_fortification_undo");
      await api.use(actor, "undoUse", { useId: "branches_fortification_entrench" }, "branches_fortification_entrench_undo");
      return { start, spent, refunded, exhausted, loaded: loadedMunitions(actor), shelterApplied: shelter?.activation === "fortification",
        shelterRestored: !actor.getFlag("ak5e", "defender")?.shelter };
    }, { actorId: actors.fortress, allyUuid: fixture.ally.tokenUuid });
    if (result.spent >= result.start.reactions || result.refunded !== result.start.reactions || result.exhausted?.spent !== false || !result.shelterApplied || !result.shelterRestored || Object.values(result.loaded).some(list => list.length)) {
      throw new Error(JSON.stringify(result));
    }
    return result;
  });

  await check("observer cannot open Guardian/Fortress controls or spend their resources", async () => {
    const result = await observer.evaluate(async ({ guardianId, fortressId }) => {
      const outcomes = [];
      for (const id of [guardianId, fortressId]) {
        const actor = game.actors.get(id); let rejected = false;
        try { await game.ak5e.defender.use(actor, "notToday", { amount: 1, confirmed: true }, `observer_${id}`); } catch { rejected = true; }
        outcomes.push({ owns: actor.isOwner, rejected });
      }
      return outcomes;
    }, { guardianId: actors.guardian, fortressId: actors.fortress });
    if (result.some(entry => entry.owns || !entry.rejected)) throw new Error(JSON.stringify(result));
    return result;
  });

  await check("all Fortress riders relay from the owner with source-defined expiry and guided instructions; equipment loss is undoable", async () => {
    const rows = [];
    for (const munition of ["concussive", "corrosive", "flare", "explosive", "incendiary", "shrapnel"]) {
      const fireId = `branches_rider_fire_${munition}`, effectId = `branches_rider_effect_${munition}`;
      await owner.evaluate(async ({ actorId, munition, fireId }) => {
        const actor = game.actors.get(actorId), api = game.ak5e.defender, weapon = actor.items.find(item => item.name === "Grenade Launcher");
        await api.use(actor, "loadMunition", { weaponId: weapon.id, munition, confirmed: true, overrides: ["dice"] }, `${fireId}_load`);
        await api.use(actor, "fireMunitions", { weaponId: weapon.id, pointConfirmed: true, reading: "weaponDice", explosiveType: "acid", confirmed: true }, fireId);
      }, { actorId: actors.fortress, munition, fireId });
      await clickRoll(owner, fireId);
      await owner.waitForFunction(({ actorId, fireId }) => game.actors.get(actorId).getFlag("ak5e", "defenderUses").undo.find(receipt => receipt.id === fireId)?.status === "complete",
        { actorId: actors.fortress, fireId });
      const row = await owner.evaluate(async ({ actorId, enemyId, fireId, effectId, munition }) => {
        const actor = game.actors.get(actorId), enemy = game.actors.get(enemyId), api = game.ak5e.defender;
        if (munition === "explosive") return { munition, rider: "none" };
        await api.use(actor, "munitionEffects", { fireId, targetUuid: enemy.uuid, failedSave: true, confirmed: true }, effectId);
        const effect = enemy.effects.find(effect => effect.flags.ak5e?.defenderUsesEffect?.opId === effectId);
        if (!effect) throw new Error(`${munition} rider was not applied through the elected GM.`);
        return { munition, name: effect.name, description: effect.description, tags: effect.flags.ak5e };
      }, { actorId: actors.fortress, enemyId: fixture.enemy.actorId, fireId, effectId, munition });
      rows.push(row);
    }
    await gm.evaluate(id => { void game.actors.get(id).sheet.render(true); }, fixture.enemy.actorId);
    await gm.waitForTimeout(800); await shot(gm, "branches-fortress-all-riders-gm");
    const loss = await owner.evaluate(async actorId => {
      const actor = game.actors.get(actorId), api = game.ak5e.defender, weapon = actor.items.find(item => item.name === "Grenade Launcher");
      await api.use(actor, "loadMunition", { weaponId: weapon.id, munition: "flare", confirmed: true, overrides: ["dice"] }, "branches_loss_load");
      await weapon.update({ "system.equipped": false });
      for (let index = 0; index < 100 && actor.getFlag("ak5e", "defenderUses").data.munitions[weapon.id]?.length; index++) await new Promise(resolve => setTimeout(resolve, 50));
      const lost = actor.getFlag("ak5e", "defenderUses").undo.findLast(receipt => receipt.command === "munitionsLost");
      if (!lost || actor.getFlag("ak5e", "defenderUses").data.munitions[weapon.id]?.length) throw new Error("Native unequip did not record Munition loss.");
      await api.use(actor, "undoUse", { useId: lost.id }, "branches_loss_undo");
      const restored = actor.getFlag("ak5e", "defenderUses").data.munitions[weapon.id];
      await weapon.update({ "system.equipped": true });
      await api.use(actor, "undoUse", { useId: "branches_loss_load" }, "branches_loss_load_undo");
      return { receipt: lost.id, restored };
    }, actors.fortress);
    if (!loss.restored.includes("flare")) throw new Error(JSON.stringify(loss));
    return { rows, loss };
  });

  await check("Fortress native Turn transitions expire Concussive and Flare while manual riders remain", async () => {
    await gm.evaluate(async () => {
      const count = game.combat.turns.length;
      for (let index = 0; index <= count; index++) await game.combat.nextTurn();
    });
    await gm.waitForFunction(enemyId => {
      const effects = game.actors.get(enemyId).effects.filter(effect => effect.flags.ak5e?.defenderUsesEffect);
      return !effects.some(effect => ["concussive", "flare"].includes(effect.flags.ak5e.defenderUsesEffect.munition));
    }, fixture.enemy.actorId, { timeout: 15000 });
    const remaining = await gm.evaluate(enemyId => game.actors.get(enemyId).effects.filter(effect => effect.flags.ak5e?.defenderUsesEffect)
      .map(effect => effect.flags.ak5e.defenderUsesEffect.munition).sort(), fixture.enemy.actorId);
    if (JSON.stringify(remaining) !== JSON.stringify(["corrosive", "incendiary", "shrapnel"])) throw new Error(`Unexpected rider expiry: ${remaining}`);
    return remaining;
  });

  await check("Guardian shortfall overrides clamp resources, exact undo restores them, and encounter end/start lock old owner receipts", async () => {
    const clamped = await owner.evaluate(async actorId => {
      const actor = game.actors.get(actorId), api = game.ak5e.defender, before = game.ak5e.resourcePools.getPool(actor, "resilience").value;
      await api.use(actor, "notToday", { amount: 20, confirmed: true, overrides: ["resilience", "turn", "pending"] }, "branches_clamped");
      const after = game.ak5e.resourcePools.getPool(actor, "resilience").value;
      await api.use(actor, "undoUse", { useId: "branches_clamped" }, "branches_clamped_undo");
      return { before, after, restored: game.ak5e.resourcePools.getPool(actor, "resilience").value };
    }, actors.guardian);
    if (clamped.after !== 0 || clamped.restored !== clamped.before) throw new Error(JSON.stringify(clamped));
    const beforeEpoch = await gm.evaluate(() => game.settings.get("ak5e", "encounterEpoch"));
    await gm.evaluate(async () => game.combat.delete());
    await owner.waitForFunction(epoch => game.settings.get("ak5e", "encounterEpoch") > epoch, beforeEpoch);
    const endLock = await owner.evaluate(async actorId => {
      const actor = game.actors.get(actorId); let error = "";
      try { await game.ak5e.defender.use(actor, "undoUse", { useId: "branches_medicine" }, "branches_end_locked"); } catch (failure) { error = failure.message; }
      return /locked/i.test(error);
    }, actors.guardian);
    await owner.evaluate(async actorId => game.ak5e.defender.use(game.actors.get(actorId), "notToday", { amount: 1, confirmed: true }, "branches_before_start"), actors.guardian);
    const outsideEpoch = await gm.evaluate(() => game.settings.get("ak5e", "encounterEpoch"));
    await gm.evaluate(async ({ sceneId, guardian, fortress }) => {
      const combat = await Combat.implementation.create({ scene: sceneId, active: true });
      await combat.createEmbeddedDocuments("Combatant", [guardian, fortress].map((entry, index) => ({ actorId: entry.actorId,
        tokenId: entry.tokenUuid.split(".").at(-1), sceneId, initiative: 10 - index })));
      await combat.startCombat();
    }, { sceneId: ids.sceneId, guardian: fixture.guardian, fortress: fixture.fortress });
    await owner.waitForFunction(epoch => game.settings.get("ak5e", "encounterEpoch") > epoch, outsideEpoch);
    const startLock = await owner.evaluate(async actorId => {
      const actor = game.actors.get(actorId); let error = "";
      try { await game.ak5e.defender.use(actor, "undoUse", { useId: "branches_before_start" }, "branches_start_locked"); } catch (failure) { error = failure.message; }
      void game.ak5e.defender.open(actor);
      return /locked/i.test(error);
    }, actors.guardian);
    await owner.waitForTimeout(700); await shot(owner, "branches-guardian-locked-controls");
    if (!endLock || !startLock) throw new Error(JSON.stringify({ endLock, startLock }));
    return { clamped, endLock, startLock };
  });

  return fixture;
}
