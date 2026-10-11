/** Additional Defender increment checks, called only by the disposable live runner. */
export async function defenderFinishLiveChecks({ gm, owner, observer, ids, check, shot }) {
  await check("progression form is preview-only, legible and offers all 42 talents", async () => {
    const before = await owner.evaluate(id => JSON.stringify(game.actors.get(id).toObject()), ids.actors.dread);
    await owner.evaluate(id => { void game.ak5e.defender.openSetup(game.actors.get(id)); }, ids.actors.dread);
    const form = owner.locator("dialog:has(.ak5e-defender-progression-form)");
    await form.waitFor();
    const result = await form.evaluate(el => ({ overflow: el.scrollWidth > el.clientWidth + 2,
      basic: el.querySelector('[name="talents.basic"]')?.options.length - 1,
      advanced: el.querySelector('[name="talents.advanced"]')?.options.length - 1,
      text: el.innerText.slice(0, 500) }));
    await shot(owner, "progression-choices");
    await form.locator('button[data-action="cancel"]').click();
    await owner.waitForFunction(() => !document.querySelector(".ak5e-defender-progression-form"));
    if (await owner.locator(".ak5e-defender-progression-preview").count()) throw new Error("Cancel opened a progression preview");
    const after = await owner.evaluate(id => JSON.stringify(game.actors.get(id).toObject()), ids.actors.dread);
    if (before !== after || result.overflow || result.basic !== 21 || result.advanced !== 21) throw new Error(JSON.stringify(result));
    return result;
  });
  await check("owner progression uses active GM, preserves HP/resources, applies base STR ASI and retains upgraded Talents once", async () => {
    const result = await owner.evaluate(async ids => {
      const actor = game.actors.get(ids.actors.dread), api = game.ak5e.defender;
      const choices = { saves: ["wis"], skills: ["ath", "ak5elore", "ak5etech"], tool: "Engineering Kit",
        startingEquipment: { mode: "cash" }, talents: {
          basic: "class-option-defender-talent-basic-interlocking-shields",
          basicAt8: { mode: "upgrade", sourceId: "class-option-defender-talent-basic-interlocking-shields" },
          advanced: "class-option-defender-talent-advanced-sword-and-shield",
          advancedAt13: { mode: "upgrade", sourceId: "class-option-defender-talent-advanced-sword-and-shield" }
        }, asi: { 4: { increases: [{ ability: "str", amount: 2 }] } } };
      const hp = structuredClone(actor.system.attributes.hp), resources = JSON.stringify(actor.getFlag("ak5e", "resourcePools"));
      const beforeCash = actor.system.currency.cp, preview = api.previewProgression(actor, { choices });
      if (preview.pending.length || preview.missing.length) throw new Error(JSON.stringify({ pending: preview.pending, missing: preview.missing }));
      const applied = await api.applyProgression(actor, { confirmed: true, choices: preview.choices, contextKey: preview.contextKey, operationId: "live_progression" });
      const count = actor.items.size;
      await api.applyProgression(actor, { confirmed: true, choices: preview.choices, contextKey: preview.contextKey, operationId: "live_progression" });
      if (actor.items.size !== count || actor.system.currency.cp !== beforeCash + 1300) throw new Error("Progression replay duplicated equipment or currency");
      if (actor._source.system.abilities.str.value !== 20 || actor.system.abilities.str.value !== 26) throw new Error("Legendary Might / ASI interaction failed");
      if (actor.system.attributes.hp.value !== hp.value || actor.system.attributes.hp.max !== hp.max || actor.system.attributes.hp.temp !== hp.temp || JSON.stringify(actor.getFlag("ak5e", "resourcePools")) !== resources) throw new Error("Setup altered existing HP/resources");
      return { applied, itemCount: count, base: actor._source.system.abilities.str.value, derived: actor.system.abilities.str.value,
        selections: actor.items.filter(i => i.getFlag("ak5e", "defenderTalent")).map(i => i.getFlag("ak5e", "defenderTalent")) };
    }, ids);
    return result;
  });
  await check("observer cannot open or apply native Defender progression", () => observer.evaluate(async ids => {
    const actor = game.actors.get(ids.actors.dread); let open = false, apply = false;
    try { await game.ak5e.defender.openSetup(actor); } catch { open = true; }
    try { await game.ak5e.defender.applyProgression(actor, { confirmed: true }); } catch { apply = true; }
    if (!open || !apply) throw new Error("Observer mutation permitted");
    return { openRejected: open, applyRejected: apply };
  }, ids));
  await check("Interlocking Shields rechecks Shelter and range and displays Module DR without a damage effect", () => gm.evaluate(async ids => {
    const actor = game.actors.get(ids.actors.dread), ally = fromUuidSync(ids.tokens.ally), token = fromUuidSync(ids.tokens.dread);
    await ally.update({ x: token.x + 100, y: token.y }, { animate: false });
    await game.combat.update({ round: game.combat.round + 1, turn: game.combat.turns.findIndex(t => t.actorId === actor.id) });
    await new Promise(resolve => setTimeout(resolve, 700));
    await game.ak5e.defender.command(actor, "shelter", { activation: "action", tokenUuid: token.uuid, allies: [ally.uuid], alliesConfirmed: true }, "live_interlocking");
    const near = game.ak5e.defender.interlockingShieldsFor(ally.uuid);
    await ally.update({ x: token.x + 600 }, { animate: false });
    const far = game.ak5e.defender.interlockingShieldsFor(ally.uuid);
    if (near.all !== Math.ceil(actor.system.attributes.prof / 2) || far.physical !== 0) throw new Error(JSON.stringify({ near, far }));
    await ally.update({ x: token.x + 100 }, { animate: false });
    await game.ak5e.defender.command(actor, "endShelter", {}, "live_interlocking_end");
    if (game.ak5e.defender.interlockingShieldsFor(ally.uuid).physical !== 0) throw new Error("Expired Shelter retained DR");
    return { near, far };
  }, ids));
  await owner.evaluate(id => { void game.ak5e.defender.openTalents(game.actors.get(id)); }, ids.actors.dread);
  await owner.locator('.ak5e-defender-talents').waitFor();
  await shot(owner, "talent-controls");
  await owner.keyboard.press("Escape");

  await check("live Talent fixtures use native source Items and capped Operator SP integration", () => gm.evaluate(async ids => {
    const { CHAPTER_THREE_CLASSES } = await import("/modules/ak5e/scripts/chapter-three-content.mjs");
    const { sourceEntryData } = await import("/modules/ak5e/scripts/caster-setup.mjs");
    const sp = await import("/modules/ak5e/scripts/operator-skills.mjs");
    const art = game.actors.get(ids.actors.art), dread = game.actors.get(ids.actors.dread), ally = game.actors.get(ids.actors.ally);
    for (const [actor, names] of [[art, ["basic-power-plant", "basic-refreshment"]], [dread, ["advanced-tactical-defence"]]]) {
      for (const name of names) {
        const sourceId = `class-option-defender-talent-${name}`, entry = CHAPTER_THREE_CLASSES.find(e => e.id === sourceId), data = sourceEntryData(entry);
        data.flags.ak5e.defenderTalent = { sourceId, tier: name.split("-")[0], active: true, moduleActive: false };
        await actor.createEmbeddedDocuments("Item", [data]);
      }
    }
    for (const actor of [art, ally]) {
      await game.ak5e.configureOperatorSkills(actor, { enabled: true });
      await sp.submitOperatorCommand(actor, "learn", { sourceId: "operator-skill-defender-basic-power-strike" });
    }
    await ally.update({ [`ownership.${ids.ownerId}`]: 0 });
    return { artTalents: game.ak5e.defender.inspectTalents(art).talents, allyOwner: ally.testUserPermission(game.users.get(ids.ownerId), "OWNER") };
  }, ids));

  for (const moduleActive of [false, true]) await check(`Power Plant ${moduleActive ? "Module" : "base"}: hostile native Art damage grants ${moduleActive ? 6 : 3} SP once`, async () => {
    const result = await gm.evaluate(async ({ ids, moduleActive }) => {
      const actor = game.actors.get(ids.actors.art), enemy = game.actors.get(ids.actors.enemy);
      const sp = await import("/modules/ak5e/scripts/operator-skills.mjs");
      const talent = actor.items.find(i => i.getFlag("ak5e", "defenderTalent")?.sourceId.endsWith("-power-plant"));
      await talent.update({ "flags.ak5e.defenderTalent.moduleActive": moduleActive });
      await sp.adjustOperatorSP(actor, -sp.getIntegratedOperatorState(actor).points, { reason: "Disposable live reset" });
      fromUuidSync(ids.tokens.art).object.setTarget(true, { releaseOthers: true });
      const activity = enemy.items.getName("Live Bolt").system.activities.get("ak5eLiveBolt0001");
      const messages = new Set(game.messages.map(m => m.id));
      await activity.rollDamage({}, { configure: false }, { create: true });
      const message = game.messages.find(m => !messages.has(m.id) && m.flags?.dnd5e?.roll?.type === "damage");
      if (!message) throw new Error("Native Art damage message missing");
      await actor.applyDamage([{ value: 5, type: "fire" }], { originatingMessage: message });
      return { actorId: actor.id, messageUuid: message.uuid };
    }, { ids, moduleActive });
    await gm.waitForFunction(({ id, amount }) => game.actors.get(id).getFlag("ak5e", "operatorSkills")?.points === amount,
      { id: result.actorId, amount: moduleActive ? 6 : 3 }, { timeout: 10000 });
    return gm.evaluate(id => ({ points: game.actors.get(id).getFlag("ak5e", "operatorSkills").points,
      receipts: game.actors.get(id).getFlag("ak5e", "defenderTalentState")?.receipts }), result.actorId);
  });

  await check("native hit creates Sword and Shield Module offer; owner can grant to a Creature they do not own after exact sight review", async () => {
    await gm.evaluate(async ids => {
      const actor = game.actors.get(ids.actors.dread), ally = game.actors.get(ids.actors.ally), sp = await import("/modules/ak5e/scripts/operator-skills.mjs");
      await sp.adjustOperatorSP(ally, -sp.getIntegratedOperatorState(ally).points, { reason: "Disposable live reset" });
      await actor.items.getName("dread Greataxe").update({ "system.activities.ak5eLiveAtk00001.attack.bonus": "100" });
    }, ids);
    await owner.evaluate(async ids => {
      fromUuidSync(ids.tokens.enemy).object.setTarget(true, { releaseOthers: true });
      for (let i = 0; i < 5; i++) {
        const rolls = await game.actors.get(ids.actors.dread).items.getName("dread Greataxe").system.activities.get("ak5eLiveAtk00001").rollAttack({}, { configure: false }, { create: true });
        if (!rolls[0].isFumble) break;
      }
    }, ids);
    await gm.waitForFunction(id => game.ak5e.defender.inspectTalents(game.actors.get(id)).pending.some(e => e.kind === "swordShield"), ids.actors.dread);
    const event = await gm.evaluate(async ids => {
      const actor = game.actors.get(ids.actors.dread), event = game.ak5e.defender.inspectTalents(actor).pending.filter(e => e.kind === "swordShield").at(-1);
      const { defenderTalentOperation } = await import("/modules/ak5e/scripts/defender-talents.mjs");
      await defenderTalentOperation(actor, "review", { eventId: event.id, facts: { visibleRecipientTokenUuid: ids.tokens.ally } }, "live_sword_sight");
      return event;
    }, ids);
    await owner.evaluate(({ ids, event }) => {
      const evidence = fromUuidSync(event.evidenceMessageUuid);
      if (evidence?.isContentVisible && evidence.getFlag("ak5e", "defenderTalentEvidence")) throw new Error("Owner can view the GM-only trigger evidence");
      const state = game.actors.get(ids.actors.dread).getFlag("ak5e", "defenderTalentState");
      if (state.events.some(e => e.positionSnapshot || e.actorSkillSnapshot)) throw new Error("Shared Actor flags contain private trigger snapshots");
    }, { ids, event });
    await owner.evaluate(id => { void game.ak5e.defender.openTalents(game.actors.get(id)); }, ids.actors.dread);
    const picker = owner.locator(`.ak5e-defender-talents [data-event="${event.id}"][data-recipient="${ids.tokens.ally}"]`);
    await picker.check();
    await shot(owner, "sword-recipient-grant");
    await owner.locator('.dialog:has(.ak5e-defender-talents) button[data-button="confirm"]').click();
    await gm.waitForFunction(id => game.actors.get(id).getFlag("ak5e", "operatorSkills")?.points === 2, ids.actors.ally);
    const points = await gm.evaluate(id => game.actors.get(id).getFlag("ak5e", "operatorSkills").points, ids.actors.ally);
    if (points !== 2) throw new Error(`Expected Module 2 SP, got ${points}`);
    return { event, points };
  });

  for (const moduleActive of [false, true]) await check(`Refreshment ${moduleActive ? "Module" : "base"}: native healing grants ${moduleActive ? 6 : 3} SP to the healed Creature once per Turn`, async () => {
    return gm.evaluate(async ({ ids, moduleActive }) => {
      const donor = game.actors.get(ids.actors.art), ally = game.actors.get(ids.actors.ally);
      const sp = await import("/modules/ak5e/scripts/operator-skills.mjs");
      await game.combat.update({ round: game.combat.round + 1 });
      await new Promise(resolve => setTimeout(resolve, 700));
      await donor.items.find(i => i.getFlag("ak5e", "defenderTalent")?.sourceId.endsWith("-refreshment")).update({ "flags.ak5e.defenderTalent.moduleActive": moduleActive });
      await sp.adjustOperatorSP(ally, -sp.getIntegratedOperatorState(ally).points, { reason: "Disposable live reset" });
      let item = donor.items.getName("Live Mend");
      if (!item) [item] = await donor.createEmbeddedDocuments("Item", [{ name: "Live Mend", type: "spell", system: { level: 0, activities: {
        ak5eLiveHeal0001: { _id: "ak5eLiveHeal0001", type: "heal", name: "Mend", activation: { type: "action", value: 1 },
          healing: { number: 1, denomination: 8, bonus: "", types: ["healing"], custom: { enabled: false, formula: "" } }, consumption: { targets: [], spellSlot: false } }
      } } }]);
      const heal = async () => {
        await ally.update({ "system.attributes.hp.value": 40 });
        fromUuidSync(ids.tokens.ally).object.setTarget(true, { releaseOthers: true });
        const before = new Set(game.messages.map(m => m.id));
        await item.system.activities.get("ak5eLiveHeal0001").rollDamage({}, { configure: false }, { create: true });
        const message = game.messages.find(m => !before.has(m.id) && m.flags?.dnd5e?.roll?.type === "healing");
        if (!message) throw new Error("Native healing message missing");
        await ally.applyDamage([{ value: 5, type: "healing" }], { originatingMessage: message });
        for (let i = 0; i < 50; i++) {
          const event = game.ak5e.defender.inspectTalents(donor).pending.find(e => e.kind === "refreshment" && e.messageUuid === message.uuid);
          if (event) return event;
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        throw new Error("Actual healing receipt missing");
      };
      const event = await heal();
      await game.ak5e.defender.grantTalent(donor, { eventId: event.id, sourceId: event.sourceId, recipientTokenUuids: [ids.tokens.ally], operationId: `live_heal_${moduleActive}` });
      const points = sp.getIntegratedOperatorState(ally).points;
      if (points !== (moduleActive ? 6 : 3)) throw new Error(`Refreshment SP ${points}`);
      const second = await heal(); let rejected = false;
      try { await game.ak5e.defender.grantTalent(donor, { eventId: second.id, sourceId: second.sourceId, recipientTokenUuids: [ids.tokens.ally], operationId: `live_heal_twice_${moduleActive}` }); }
      catch (error) { rejected = error.message.includes("already been used this Turn"); }
      if (!rejected || sp.getIntegratedOperatorState(ally).points !== points) throw new Error("Refreshment allowed a second use this Turn");
      return { event, points, secondUseRejected: rejected };
    }, { ids, moduleActive });
  });

  for (const moduleActive of [false, true]) await check(`Tactical Defence ${moduleActive ? "Module" : "base"}: a native missed Attack offers ${moduleActive ? "two distinct recipients" : "one other recipient"}`, async () => {
    return gm.evaluate(async ({ ids, moduleActive }) => {
      const donor = game.actors.get(ids.actors.dread), enemy = game.actors.get(ids.actors.enemy), sp = await import("/modules/ak5e/scripts/operator-skills.mjs");
      const recipients = moduleActive ? ["ally", "art"] : ["ally"];
      const token = fromUuidSync(ids.tokens.dread);
      for (const [index, key] of recipients.entries()) {
        await fromUuidSync(ids.tokens[key]).update({ x: token.x + 100 * (index + 1), y: token.y }, { animate: false });
        const actor = game.actors.get(ids.actors[key]);
        await sp.adjustOperatorSP(actor, -sp.getIntegratedOperatorState(actor).points, { reason: "Disposable live reset" });
      }
      await donor.items.find(i => i.getFlag("ak5e", "defenderTalent")?.sourceId.endsWith("-tactical-defence")).update({ "flags.ak5e.defenderTalent.moduleActive": moduleActive });
      await enemy.items.getName("Live Elite Club").update({ "system.activities.ak5eLiveAtk00001.attack.bonus": "-100" });
      token.object.setTarget(true, { releaseOthers: true });
      const before = new Set(game.messages.map(m => m.id));
      await enemy.items.getName("Live Elite Club").system.activities.get("ak5eLiveAtk00001").rollAttack({}, { configure: false }, { create: true });
      const message = game.messages.find(m => !before.has(m.id) && m.flags?.dnd5e?.roll?.type === "attack");
      let event;
      for (let i = 0; i < 50 && !event; i++) {
        event = game.ak5e.defender.inspectTalents(donor).pending.find(e => e.kind === "tacticalDefence" && e.messageUuid === message.uuid);
        if (!event) await new Promise(resolve => setTimeout(resolve, 50));
      }
      if (!event) throw new Error("Missed Attack did not offer Tactical Defence");
      const options = { eventId: event.id, sourceId: event.sourceId, recipientTokenUuids: recipients.map(key => ids.tokens[key]), operationId: `live_tactical_${moduleActive}` };
      await game.ak5e.defender.grantTalent(donor, options); await game.ak5e.defender.grantTalent(donor, options);
      const points = recipients.map(key => sp.getIntegratedOperatorState(game.actors.get(ids.actors[key])).points);
      if (points.some(value => value !== 1)) throw new Error(`Tactical Defence duplicated or missed grant: ${points}`);
      return { event, attackTotal: message.rolls[0].total, points };
    }, { ids, moduleActive });
  });

  await check("Leaping Ward refunds exactly its Reaction for 1 Resilience and creates no blanket Resistance", () => gm.evaluate(async ids => {
    const actor = game.actors.get(ids.actors.art), ally = fromUuidSync(ids.tokens.ally), token = fromUuidSync(ids.tokens.art);
    await ally.update({ x: token.x + 100, y: token.y }, { animate: false });
    await game.combat.update({ round: game.combat.round + 1, turn: game.combat.turns.findIndex(t => t.actorId === actor.id) });
    await new Promise(resolve => setTimeout(resolve, 700));
    const { getPool } = await import("/modules/ak5e/scripts/resource-pools.mjs");
    const before = getPool(actor, "resilience").value;
    await game.ak5e.defender.command(actor, "leapingWard", { triggerId: "live_ward_save", saveConfirmed: true, moveConfirmed: true, damageTypes: ["fire"],
      tokenUuid: token.uuid, allyTokenUuid: ally.uuid, allyActorUuid: ally.actor.uuid }, "live_ward");
    await game.ak5e.defender.command(actor, "leapingWardRefund", { wardOperationId: "live_ward" }, "live_ward_refund");
    let duplicate = false;
    try { await game.ak5e.defender.command(actor, "leapingWardRefund", { wardOperationId: "live_ward" }, "live_ward_refund_duplicate"); }
    catch { duplicate = true; }
    if (!duplicate || getPool(actor, "resilience").value !== before - 1) throw new Error("Ward refund was duplicated or charged incorrectly");
    if ([actor, ally.actor].some(a => a.effects.some(e => !e.disabled && e.getFlag("ak5e", "defenderWard")))) throw new Error("Ward created blanket Resistance");
    return { duplicateRejected: duplicate, ward: actor.getFlag("ak5e", "defender").ward };
  }, ids));

  await check("Concentration Breaker uses the actual damage receipt, survives an unrelated or cancelled save, and consumes only its owner-claimed native save", async () => {
    const receiptId = await gm.evaluate(async ids => {
      const source = game.actors.get(ids.actors.art), target = game.actors.get(ids.actors.enemy);
      await target.update({ [`ownership.${ids.ownerId}`]: 3 });
      const art = target.items.getName("Live Bolt");
      await art.update({ "system.properties": [...new Set([...art.system.properties, "concentration"])],
        "system.activities.ak5eLiveBolt0001.duration.concentration": true });
      await target.beginConcentrating(art.system.activities.get("ak5eLiveBolt0001"));
      fromUuidSync(ids.tokens.enemy).object.setTarget(true, { releaseOthers: true });
      const before = new Set(game.messages.map(m => m.id));
      await source.items.getName("art Greataxe").system.activities.get("ak5eLiveAtk00001").rollDamage({}, { configure: false }, { create: true });
      const message = game.messages.find(m => !before.has(m.id) && m.flags?.dnd5e?.roll?.type === "damage");
      await target.applyDamage([{ value: 8, type: "slashing" }], { originatingMessage: message });
      for (let i = 0; i < 50; i++) {
        const receipt = target.getFlag("ak5e", "defenderConcentrationBreakers")?.find(r => r.damageMessageUuid === message.uuid);
        if (receipt) {
          await target.rollConcentration({ target: 10 }, { configure: false }, { create: false });
          if (target.getFlag("ak5e", "defenderConcentrationBreakers").find(r => r.id === receipt.id).status !== "pending") throw new Error("Unrelated save consumed receipt");
          return receipt.id;
        }
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      throw new Error("Native damage did not create Concentration Breaker receipt");
    }, ids);
    await owner.evaluate(async () => {
      for (const app of foundry.applications.instances.values()) if (app.element?.tagName === "DIALOG") await app.close();
    });
    await owner.evaluate(async ({ ids, receiptId }) => {
      const { rollConcentrationBreaker } = await import("/modules/ak5e/scripts/artshield-features.mjs");
      globalThis.__concResult = null;
      void rollConcentrationBreaker(game.actors.get(ids.actors.enemy), receiptId).then(result => { globalThis.__concResult = result; })
        .catch(error => { globalThis.__concResult = { error: error.message }; });
    }, { ids, receiptId });
    await owner.locator('.application:visible button[data-action="disadvantage"]').waitFor();
    await shot(owner, "concentration-save");
    await owner.locator('.application:visible:has(button[data-action="disadvantage"]) button[data-action="close"]').click();
    await owner.waitForFunction(() => globalThis.__concResult !== null);
    const cancelled = await owner.evaluate(() => globalThis.__concResult);
    if (!cancelled.cancelled) throw new Error(JSON.stringify(cancelled));
    await owner.evaluate(async ({ ids, receiptId }) => {
      const { rollConcentrationBreaker } = await import("/modules/ak5e/scripts/artshield-features.mjs");
      const target = game.actors.get(ids.actors.enemy);
      globalThis.__concResult = null;
      void rollConcentrationBreaker(target, receiptId).then(result => { globalThis.__concResult = result; })
        .catch(error => { globalThis.__concResult = { error: error.message }; });
    }, { ids, receiptId });
    await owner.locator('.application:visible button[data-action="disadvantage"]').click();
    await owner.waitForFunction(() => globalThis.__concResult !== null);
    return owner.evaluate(({ ids, receiptId }) => {
      const target = game.actors.get(ids.actors.enemy), result = globalThis.__concResult;
      const receipt = target.getFlag("ak5e", "defenderConcentrationBreakers").find(r => r.id === receiptId);
      const message = fromUuidSync(receipt.rollMessageUuid);
      if (receipt.status !== "rolled" || message.rolls[0].options.advantageMode !== -1) throw new Error(JSON.stringify({ receipt, result }));
      return { cancelled: true, receipt, result, disadvantageMode: message.rolls[0].options.advantageMode };
    }, { ids, receiptId });
  });

  await check("Advance inherits an earlier native Attack in its activity window, without granting Advance SP before activation", () => gm.evaluate(async ids => {
    const actor = game.actors.get(ids.actors.dread);
    await game.combat.update({ round: game.combat.round + 1, turn: game.combat.turns.findIndex(t => t.actorId === actor.id) });
    await new Promise(resolve => setTimeout(resolve, 700));
    if (actor.getFlag("ak5e", "defender").advance?.active) await game.ak5e.defender.command(actor, "endAdvance", {}, "live_preentry_end");
    const { getPool } = await import("/modules/ak5e/scripts/resource-pools.mjs");
    if (getPool(actor, "dreadnoughtAdvance").value < 1) await game.ak5e.defender.command(actor, "restoreAdvance", {}, "live_preentry_restore");
    fromUuidSync(ids.tokens.enemy).object.setTarget(true, { releaseOthers: true });
    const before = new Set(game.messages.map(m => m.id));
    await actor.items.getName("dread Greataxe").system.activities.get("ak5eLiveAtk00001").rollAttack({}, { configure: false }, { create: true });
    const message = game.messages.find(m => !before.has(m.id) && m.flags?.dnd5e?.roll?.type === "attack");
    await new Promise(resolve => setTimeout(resolve, 700));
    if (!actor.getFlag("ak5e", "defender").advanceWindow?.attacked) throw new Error("Pre-entry Attack was not tracked");
    if (actor.getFlag("ak5e", "operatorSkills").operations.some(o => o.id.includes(`dreadnought_attack_${message.uuid}`))) throw new Error("Inactive Advance awarded SP");
    await game.ak5e.defender.command(actor, "advance", { confirmed: true }, "live_preentry_activate");
    if (!actor.getFlag("ak5e", "defender").advance.watch.attacked) throw new Error("Advance forgot pre-entry activity");
    await game.ak5e.defender.command(actor, "endAdvance", {}, "live_preentry_finish");
    return { preEntryTracked: true, advanceAwardBeforeEntry: false };
  }, ids));

  await check("Refreshment excludes Temporary HP and requires an explicit GM Turn marker outside combat", () => gm.evaluate(async ids => {
    const donor = game.actors.get(ids.actors.art), ally = game.actors.get(ids.actors.ally), item = donor.items.getName("Live Mend");
    const sp = await import("/modules/ak5e/scripts/operator-skills.mjs");
    const api = await import("/modules/ak5e/scripts/defender-talents.mjs");
    await sp.adjustOperatorSP(ally, -sp.getIntegratedOperatorState(ally).points, { reason: "Disposable live reset" });
    await ally.update({ "system.attributes.hp.temp": 0 });
    const count = donor.getFlag("ak5e", "defenderTalentState").events.filter(e => e.kind === "refreshment").length;
    fromUuidSync(ids.tokens.ally).object.setTarget(true, { releaseOthers: true });
    let before = new Set(game.messages.map(m => m.id));
    await item.system.activities.get("ak5eLiveHeal0001").rollDamage({}, { configure: false }, { create: true });
    let message = game.messages.find(m => !before.has(m.id) && m.flags?.dnd5e?.roll?.type === "healing");
    await ally.applyDamage([{ value: 5, type: "temphp" }], { originatingMessage: message });
    await new Promise(resolve => setTimeout(resolve, 700));
    if (donor.getFlag("ak5e", "defenderTalentState").events.filter(e => e.kind === "refreshment").length !== count) throw new Error("Temporary HP offered Refreshment");
    await game.combat.update({ round: 0, turn: null }); await new Promise(resolve => setTimeout(resolve, 700));
    await ally.update({ "system.attributes.hp.value": 40 });
    before = new Set(game.messages.map(m => m.id));
    await item.system.activities.get("ak5eLiveHeal0001").rollDamage({}, { configure: false }, { create: true });
    message = game.messages.find(m => !before.has(m.id) && m.flags?.dnd5e?.roll?.type === "healing");
    await ally.applyDamage([{ value: 5, type: "healing" }], { originatingMessage: message });
    await new Promise(resolve => setTimeout(resolve, 700));
    const event = game.ak5e.defender.inspectTalents(donor).pending.find(e => e.kind === "refreshment" && e.messageUuid === message.uuid);
    if (!event || event.turnKey) throw new Error("Outside-combat healing invented a Turn");
    let blocked = false;
    try { await game.ak5e.defender.grantTalent(donor, { eventId: event.id, sourceId: event.sourceId, recipientTokenUuids: [ids.tokens.ally], operationId: "live_no_turn" }); } catch { blocked = true; }
    if (!blocked) throw new Error("Refreshment used without a Turn boundary");
    await api.defenderTalentOperation(donor, "confirmTurn", { eventId: event.id, turnMarker: "Live GM observed turn boundary 1" }, "live_confirm_turn");
    await game.ak5e.defender.grantTalent(donor, { eventId: event.id, sourceId: event.sourceId, recipientTokenUuids: [ids.tokens.ally], operationId: "live_outside_heal" });
    return { tempHpExcluded: true, missingTurnRejected: blocked, points: sp.getIntegratedOperatorState(ally).points };
  }, ids));

  await check("a new Constitution ASI adds the included levels' HP exactly once through native D&D5e", () => owner.evaluate(async ids => {
    const actor = game.actors.get(ids.actors.dread), api = game.ak5e.defender;
    await actor.items.find(i => i.getFlag("ak5e", "chapterThreeId") === "class-defender").update({ "system.levels": 16 });
    const before = structuredClone(actor.system.attributes.hp);
    const choices = structuredClone(actor.getFlag("ak5e", "defenderProgression").choices);
    choices.asi[16] = { increases: [{ ability: "con", amount: 2 }] };
    const preview = api.previewProgression(actor, { choices });
    await api.applyProgression(actor, { confirmed: true, choices: preview.choices, contextKey: preview.contextKey, operationId: "live_con_asi" });
    if (actor.system.attributes.hp.max !== before.max + 16 || actor.system.attributes.hp.value !== before.value) throw new Error(JSON.stringify({ before, after: actor.system.attributes.hp }));
    await api.applyProgression(actor, { confirmed: true, choices: preview.choices, contextKey: preview.contextKey, operationId: "live_con_asi" });
    if (actor.system.attributes.hp.max !== before.max + 16) throw new Error("Constitution HP applied twice");
    return { before, after: actor.system.attributes.hp, baseCon: actor._source.system.abilities.con.value };
  }, ids));
}
