import { canMakeDeathSaves, combinedSkillValue, isConstruct, lmdFromCurrency, worldRulesEnabled } from "./world-rule-state.mjs";
import { patchCantripDamage } from "./cantrip-damage.mjs";

const damageSaves = new Set();
const massivePending = new Set();
const updating = new Set();
const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
const safe = promise => Promise.resolve(promise).catch(error => { console.error("AK5e | World rules", error); ui.notifications.error(error.message); });

export function registerWorldRuleSettings() {
  game.settings.register("ak5e", "allowMulticlass", {
    name: "Allow AK5e multiclassing", hint: "AK5e disallows multiclassing by default. Enable only if the GM elects to allow it.",
    scope: "world", config: true, type: Boolean, default: false
  });
}

export function configureWorldConditions() {
  if (!worldRulesEnabled()) return;
  // AK5e Surprised replaces both the modern initiative penalty and the legacy first-turn rule.
  CONFIG.DND5E?.conditionEffects?.initiativeDisadvantage?.delete("surprised");
  for (const key of ["frightened", "surprised"]) {
    const definition = CONFIG.DND5E?.conditionTypes?.[key];
    if (definition) delete definition.reference;
  }
}

export function isRestrictedHealingSource(item) {
  if (!item) return false;
  if (item.type === "spell") return true; // World spellcasting uses Arts.
  if (item.type === "feat") return item.system?.type?.value === "class" ||
    Boolean(item.getFlag?.("ak5e", "chapterThreeId") || item.getFlag?.("ak5e", "operatorSkill"));
  return item.type === "tool" && /Medical Kit/i.test(item.name ?? "") && Boolean(item.getFlag?.("ak5e", "chapterFourId"));
}

export function previewAlternateClass(primary, alternate, abilities) {
  if (!worldRulesEnabled() || primary?.type !== "character" || alternate?.type !== "character" || primary.id === alternate.id) {
    throw new Error("Choose two different World character Actors in an AK5e World.");
  }
  const pair = [...new Set(abilities ?? [])];
  if (pair.length !== 2 || pair.some(key => !["str", "dex", "con", "int", "wis", "cha"].includes(key))) {
    throw new Error("Choose two different ability scores to swap.");
  }
  const level = Number(primary.system.details?.level) || 0;
  if (level < 7 || Number(alternate.system.details?.level) !== level) throw new Error("Both classes must be at the same level, at least 7.");
  const classes = actor => [...actor.items].filter(item => item.type === "class");
  const first = classes(primary), second = classes(alternate);
  if (first.length !== 1 || second.length !== 1 || first[0].name === second[0].name) {
    throw new Error("Each sheet needs one different class.");
  }
  const abilityDifferences = Object.keys(primary.system.abilities).filter(key =>
    Number(alternate.system.abilities[key]?.value) !== Number(primary.system.abilities[pair.includes(key) ? pair.find(other => other !== key) : key]?.value));
  const inventory = actor => [...actor.items].filter(item => !["class", "subclass", "feat", "race", "background", "spell"].includes(item.type))
    .map(item => `${item.type}:${item.name}:${item.system.quantity ?? 1}`).sort();
  const original = inventory(primary), replacement = inventory(alternate);
  return { primary: primary.uuid, alternate: alternate.uuid, level, classes: [first[0].name, second[0].name],
    abilities: pair, abilityDifferences, inventoryMatches: JSON.stringify(original) === JSON.stringify(replacement),
    originalInventory: original, alternateInventory: replacement };
}

export async function queueAlternateClassSwitch(primary, alternate, abilities, { inventoryReviewed = false } = {}) {
  if (!game.user.isGM) throw new Error("A GM must review an Alternate Class switch.");
  const review = previewAlternateClass(primary, alternate, abilities);
  if (review.abilityDifferences.length) throw new Error(`Adjust the Alternate Class sheet's ability scores first: ${review.abilityDifferences.join(", ")}.`);
  if (!review.inventoryMatches && !inventoryReviewed) throw new Error("Review and reconcile both inventories before queuing the switch.");
  const existing = primary.getFlag("ak5e", "alternateClass");
  if (existing && existing.partnerUuid !== alternate.uuid) throw new Error("This character is already linked to another Alternate Class.");
  const current = existing?.active === false ? alternate : primary;
  const next = current === primary ? alternate : primary;
  const partner = current.getFlag("ak5e", "alternateClass");
  if (partner && partner.partnerUuid !== next.uuid) throw new Error("The active sheet has a different Alternate Class link.");
  if (!partner) await current.setFlag("ak5e", "alternateClass", { partnerUuid: next.uuid, active: true, abilitySwap: review.abilities, inventoryReviewed: true });
  if (!next.getFlag("ak5e", "alternateClass")) await next.setFlag("ak5e", "alternateClass", { partnerUuid: current.uuid, active: false, abilitySwap: review.abilities, inventoryReviewed: true });
  await current.setFlag("ak5e", "alternateClass", { ...current.getFlag("ak5e", "alternateClass"), pending: true });
  return { review, restActor: current.uuid, nextActor: next.uuid };
}

export async function openAlternateClassSetup(actor) {
  if (!game.user.isGM || actor?.type !== "character") throw new Error("A GM must choose a character's Alternate Class.");
  const others = game.actors.filter(other => other.type === "character" && other.id !== actor.id);
  const content = `<p>Choose the other character sheet and the two ability scores swapped in that class. Both sheets need separate class features, HP and movement; reconcile inventory before switching.</p>
    <label>Alternate sheet<select name="alternate">${others.map(other => `<option value="${esc(other.id)}">${esc(other.name)}</option>`).join("")}</select></label>
    <label>First ability<select name="first">${["str", "dex", "con", "int", "wis", "cha"].map(key => `<option value="${key}">${key.toUpperCase()}</option>`).join("")}</select></label>
    <label>Second ability<select name="second">${["str", "dex", "con", "int", "wis", "cha"].map(key => `<option value="${key}">${key.toUpperCase()}</option>`).join("")}</select></label>
    <label><input type="checkbox" name="reviewed">I reviewed both inventories and will keep them aligned.</label>`;
  const request = await foundry.applications.api.DialogV2.wait({ window: { title: "Queue Alternate Class switch" }, content,
    buttons: [{ action: "queue", label: "Queue for next Long Rest", default: true, callback: (_event, button) => ({
      alternate: button.form.elements.alternate.value, abilities: [button.form.elements.first.value, button.form.elements.second.value],
      inventoryReviewed: button.form.elements.reviewed.checked }) }, { action: "cancel", label: "Cancel", callback: () => null }], rejectClose: false });
  if (!request) return null;
  return queueAlternateClassSwitch(actor, game.actors.get(request.alternate), request.abilities, request);
}

function withholdHitDiceOnSwitch(actor, result, config) {
  if (!worldRulesEnabled() || config.type !== "long" || !actor.getFlag("ak5e", "alternateClass")?.pending) return;
  result.updateItems = (result.updateItems ?? []).map(update => {
    const clone = { ...update }; delete clone["system.hd.spent"];
    return clone;
  }).filter(update => Object.keys(update).some(key => key !== "_id"));
  delete result.updateData?.["system.attributes.hd.spent"];
  result.deltas ??= {}; result.deltas.hitDice = 0; result.dhd = 0;
}

async function finishAlternateClassSwitch(actor, config) {
  if (!worldRulesEnabled() || config.type !== "long" || !game.user.isGM) return;
  const current = actor.getFlag("ak5e", "alternateClass");
  if (!current?.pending) return;
  const next = await fromUuid(current.partnerUuid);
  if (!next || next.documentName !== "Actor") throw new Error("Alternate Class sheet is missing; the current sheet remains active.");
  const previousNext = next.getFlag("ak5e", "alternateClass");
  await next.setFlag("ak5e", "alternateClass", { ...previousNext, active: true, pending: false });
  try { await actor.setFlag("ak5e", "alternateClass", { ...current, active: false, pending: false }); }
  catch (error) {
    await next.setFlag("ak5e", "alternateClass", previousNext);
    throw error;
  }
}

export function previewSkillReconciliation(actor) {
  if (actor?.documentName !== "Actor") throw new Error("Choose an Actor.");
  const mappings = [
    { target: "ak5elore", sources: ["his", "rel"], label: "Lore" },
    { target: "ak5ewilderness", sources: ["nat", "sur"], label: "Wilderness" }
  ];
  return mappings.map(mapping => ({ ...mapping, previous: Number(actor.system.skills?.[mapping.target]?.value) || 0,
    proposed: Math.max(combinedSkillValue(actor, mapping.sources), Number(actor.system.skills?.[mapping.target]?.value) || 0) }));
}

export async function applySkillReconciliation(actor) {
  if (!game.user.isGM || actor?.documentName !== "Actor") throw new Error("A GM must review this Actor's skill conversion.");
  if (actor.getFlag("ak5e", "skillReconciliation")) throw new Error("This Actor's skill conversion is already recorded.");
  const preview = previewSkillReconciliation(actor);
  const original = Object.fromEntries(preview.flatMap(row => [...row.sources, row.target].map(key => [key, Number(actor.system.skills?.[key]?.value) || 0])));
  const updates = { "flags.ak5e.skillReconciliation": { version: 1, original, mode: "maximum" } };
  for (const row of preview) updates[`system.skills.${row.target}.value`] = row.proposed;
  await actor.update(updates);
  return preview;
}

export function equippedDamageReduction(actor, damageType) {
  const category = game.ak5e.damageCategory(damageType);
  const values = [];
  const sources = [];
  for (const item of actor.items ?? []) {
    if (!item.system?.equipped) continue;
    const source = item.getFlag?.("ak5e", "tableData")?.["damage reduction"] ?? item.flags?.ak5e?.tableData?.["damage reduction"];
    const match = String(source ?? "").match(/^(\d+)\s*\((Physical|Arts|All)\)$/i);
    if (!match || !(match[2].toLowerCase() === "all" || match[2].toLowerCase() === category)) continue;
    values.push(Number(match[1]));
    sources.push(`${item.name}: ${match[1]} ${match[2]}`);
  }
  // The source does not establish how several worn DR sources stack.
  return { total: values.length === 1 ? values[0] : 0, sources, requiresGM: values.length > 1 };
}

export function previewDamage(actor, { amount, damageType, reduction, resistance = false, vulnerability = false } = {}) {
  if (actor?.documentName !== "Actor") throw new Error("Choose an Actor.");
  const equipment = equippedDamageReduction(actor, damageType);
  if (equipment.requiresGM && reduction === undefined) throw new Error("Multiple equipped DR sources apply. Ask the GM for the DR total and enter an override.");
  // Active effects may carry a signed DR adjustment (Subtle Spark Bolster/Shred Defences); it applies to equipped DR only, never below 0.
  const adjustment = reduction === undefined ? [...(actor.effects ?? [])].filter(effect => !effect.disabled)
    .reduce((sum, effect) => sum + (Number(effect.getFlag?.("ak5e", "drAdjustment") ?? effect.flags?.ak5e?.drAdjustment) || 0), 0) : 0;
  const baseDR = reduction === undefined ? Math.max(0, equipment.total + adjustment) : Number(reduction);
  const dr = actor.statuses?.has("ak5e-corroded") ? Math.floor(baseDR / 2) : baseDR;
  if (!Number.isFinite(Number(amount)) || Number(amount) < 0 || !Number.isFinite(dr) || dr < 0) throw new Error("Enter nonnegative damage and DR.");
  return { input: Number(amount), damageType, category: game.ak5e.damageCategory(damageType),
    reduction: dr, adjustment, equipment, resistance, vulnerability,
    result: game.ak5e.damageAfterReduction(Number(amount), dr, { resistance, vulnerability }) };
}

export async function rollDyingDamageSave(actor) {
  if (!worldRulesEnabled() || !canMakeDeathSaves(actor) || !actor.isOwner || !actor.getFlag("ak5e", "dying")?.active) {
    throw new Error("Choose an owned Dying Actor that can make death saves.");
  }
  damageSaves.add(actor.uuid);
  try { return await actor.rollDeathSave(); }
  finally { damageSaves.delete(actor.uuid); }
}

async function markDead(actor, api) {
  if (!canMakeDeathSaves(actor) || !actor.isOwner) return;
  const prior = actor.getFlag("ak5e", "dying") ?? {};
  if (!actor.statuses?.has("dead")) await actor.toggleStatusEffect("dead", { active: true });
  await api.removeCondition(actor, "dying");
  await actor.setFlag("ak5e", "dying", { ...prior, active: false, mettle: 0, failures: 3,
    stabilisesNextTurn: false, healingThisTurn: false, healingBonusMettle: 0 });
}

export function recordNativeDeathSave(rolls, details) {
  const actor = details.subject;
  if (!worldRulesEnabled() || !canMakeDeathSaves(actor) || actor.system.attributes.hp.value > 0) return;
  const roll = rolls?.[0];
  if (!roll) return;
  const prior = actor.getFlag("ak5e", "dying") ?? {};
  const success = roll.total >= (roll.options?.target ?? 10);
  const damage = damageSaves.has(actor.uuid);
  const next = { active: true, mettle: Math.min(6, (Number(prior.mettle) || 0) + (damage ? 0 : success ? 2 : 1)),
    failures: Math.min(3, (Number(prior.failures) || 0) + (success ? 0 : 1)),
    stabilisesNextTurn: prior.stabilisesNextTurn === true,
    healingThisTurn: prior.healingThisTurn === true,
    healingBonusMettle: Number(prior.healingBonusMettle) || 0 };
  details.updates = { "flags.ak5e.dying": next, "system.attributes.death.success": 0,
    "system.attributes.death.failure": 0 };
  details.chatString = null;
  if (next.failures === 3) ui.notifications.warn(`${actor.name} has three failed AK5e death saves.`);
}

function activeWriter(actor) {
  return actor.isOwner && (game.user.isGM || !game.users?.some(user => user.active && user.isGM));
}

async function afterHpChange(actor, changed, options, api) {
  if (!worldRulesEnabled() || !canMakeDeathSaves(actor) || !activeWriter(actor) ||
      updating.has(actor.uuid) || massivePending.has(actor.uuid) || actor.statuses?.has("dead")) return;
  const old = Number(options?.dnd5e?.hp?.value);
  const current = Number(actor.system.attributes.hp.value);
  if (!Number.isFinite(old) || !Number.isFinite(current)) return;
  updating.add(actor.uuid);
  try {
    if (old > 0 && current <= 0) await api.enterDying(actor);
    else if (actor.getFlag("ak5e", "dying")?.active && current > old) await api.recordHealingWhileDying(actor, current - old);
  } finally { updating.delete(actor.uuid); }
}

function patchASIChoice() {
  const prototype = CONFIG.DND5E?.advancementTypes?.AbilityScoreImprovement?.documentClass?.prototype;
  if (!prototype || Object.hasOwn(prototype, "_ak5eOriginalAllowFeat")) return;
  const original = Object.getOwnPropertyDescriptor(prototype, "allowFeat")?.get;
  if (!original) return;
  Object.defineProperty(prototype, "_ak5eOriginalAllowFeat", { value: original });
  Object.defineProperty(prototype, "allowFeat", { configurable: true, get() {
    return worldRulesEnabled() ? false : original.call(this);
  } });
}

export function refreshConditionReferences() {
  if (!worldRulesEnabled()) return;
  const journal = game.journal?.find?.(entry => entry.getFlag("ak5e", "chapterOneSlug") === "changed-mechanics");
  const reference = journal?.pages?.contents?.[0]?.uuid;
  if (!reference) return;
  for (const key of ["frightened", "surprised"]) {
    if (CONFIG.DND5E?.conditionTypes?.[key]) CONFIG.DND5E.conditionTypes[key].reference = reference;
    const effect = CONFIG.statusEffects.find?.(entry => entry.id === key);
    if (effect) effect.reference = reference;
  }
}

export function registerWorldRuleHooks(api) {
  patchASIChoice();
  patchCantripDamage();
  refreshConditionReferences();
  Hooks.on("createJournalEntry", entry => {
    if (entry.getFlag("ak5e", "chapterOneSlug") === "changed-mechanics") refreshConditionReferences();
  });
  Hooks.on("dnd5e.preAdvancementManagerComplete", (_manager, _updates, toCreate, toUpdate) => {
    if (!worldRulesEnabled()) return;
    const featASI = item => item.type === "class" && (item.system?.advancement ?? []).some(advancement =>
      advancement.type === "AbilityScoreImprovement" && advancement.value?.type === "feat");
    if (![...toCreate, ...toUpdate].some(featASI)) return;
    ui.notifications.warn("AK5e: an Ability Score Improvement cannot be exchanged for a feat.");
    return false;
  });
  Hooks.on("dnd5e.preUseActivity", (activity) => {
    if (!worldRulesEnabled()) return;
    const actor = activity.actor;
    const properties = activity.item?.getFlag?.("ak5e", "tableData")?.properties ?? "";
    if (actor?.statuses?.has("ak5e-silenced") && /\bFirearm\b/i.test(properties)) {
      ui.notifications.warn("AK5e: a Silenced creature cannot use a Terran firearm.");
      return false;
    }
    if (activity.type !== "heal" || !isRestrictedHealingSource(activity.item)) return;
    const targets = [...(game.user.targets ?? [])].map(token => token.actor).filter(Boolean);
    if (targets.some(isConstruct) && !activity.item.getFlag?.("ak5e", "constructHealingException")) {
      ui.notifications.warn("AK5e: this Healing Art, Operator Skill, Class Feature, or Medicine use cannot restore a Construct's HP without an explicit exception.");
      return false;
    }
  });
  Hooks.on("preCreateActiveEffect", effect => {
    if (!worldRulesEnabled() || effect.parent?.documentName !== "Actor" ||
        !(effect.statuses?.has("ak5e-corroded") || effect._source?.statuses?.includes("ak5e-corroded"))) return;
    const changes = effect.toObject().changes ?? [];
    if (!changes.some(change => change.key === "system.attributes.ac.bonus")) {
      effect.updateSource({ changes: [...changes, { key: "system.attributes.ac.bonus",
        mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "-2", priority: 20 }] });
    }
  });
  Hooks.on("dnd5e.rollDeathSave", recordNativeDeathSave);
  Hooks.on("dnd5e.postRollDeathSave", (_rolls, details) => {
    const actor = details.subject;
    if (!worldRulesEnabled() || !actor?.isOwner) return;
    const dying = actor.getFlag("ak5e", "dying");
    if ((dying?.failures ?? 0) >= 3) safe(markDead(actor, api));
    else if (dying?.active) safe(api.applyCondition(actor, "dying"));
  });
  Hooks.on("dnd5e.preApplyDamage", (actor, amount, _updates, options) => {
    if (!worldRulesEnabled() || !canMakeDeathSaves(actor) || amount <= 0) return;
    const hp = Number(actor.system.attributes.hp.value) || 0;
    const maximum = Number(actor.system.attributes.hp.max) || 0;
    if (amount > hp + maximum) {
      options.ak5eMassiveDeath = true;
      massivePending.add(actor.uuid);
    }
    else if (hp <= 0 && actor.getFlag("ak5e", "dying")?.active) options.ak5eDyingDamage = true;
  });
  Hooks.on("dnd5e.applyDamage", (actor, amount, options) => {
    if (!worldRulesEnabled() || !actor?.isOwner || amount <= 0) return;
    if (options.ak5eMassiveDeath) safe(markDead(actor, api).finally(() => massivePending.delete(actor.uuid)));
    else if (options.ak5eDyingDamage) safe(rollDyingDamageSave(actor));
  });
  Hooks.on("preUpdateActor", (actor, changes) => {
    if (!worldRulesEnabled() || !canMakeDeathSaves(actor)) return;
    const has = path => Object.hasOwn(changes, path) || foundry.utils.hasProperty(changes, path);
    for (const path of ["system.attributes.death.success", "system.attributes.death.failure"]) {
      if (!has(path) && !has("system.attributes.hp.value")) continue;
      if (Object.hasOwn(changes, path)) changes[path] = 0;
      else foundry.utils.setProperty(changes, path, 0);
    }
  });
  Hooks.on("updateActor", (actor, changed, options) => { if (changed.system?.attributes?.hp) safe(afterHpChange(actor, changed, options, api)); });
  Hooks.on("preCreateItem", item => {
    if (!worldRulesEnabled() || game.settings.get("ak5e", "allowMulticlass") || item.type !== "class" ||
        item.parent?.documentName !== "Actor") return;
    if ([...item.parent.items].some(existing => existing.type === "class")) {
      ui.notifications.warn("AK5e disallows multiclassing by default. The GM can change this in AK5e settings.");
      return false;
    }
  });
  Hooks.on("dnd5e.preRestCompleted", (actor, result, config) => {
    if (worldRulesEnabled() && config.type === "long" && actor.getFlag("ak5e", "alternateClass")?.pending && !game.user.isGM) {
      ui.notifications.warn("The GM must complete the Long Rest that switches Alternate Classes.");
      return false;
    }
    withholdHitDiceOnSwitch(actor, result, config);
    if (!worldRulesEnabled() || config.type !== "long" || !canMakeDeathSaves(actor)) return;
    const prior = actor.getFlag("ak5e", "dying") ?? {};
    if ((prior.failures ?? 0) > 0) {
      result.updateData ??= {};
      result.updateData["flags.ak5e.dying.failures"] = Math.max(0, prior.failures - 1);
    }
  });
  Hooks.on("dnd5e.restCompleted", (actor, _result, config) => { safe(finishAlternateClassSwitch(actor, config)); });
  Hooks.on("getHeaderControlsApplicationV2", (app, controls) => {
    const actor = app.document;
    if (!worldRulesEnabled() || !(app instanceof foundry.applications.sheets.ActorSheetV2) ||
        actor?.documentName !== "Actor" || !actor.isOwner || controls.some(control => control.action === "ak5eWorldRules")) return;
    controls.push({ action: "ak5eWorldRules", icon: "fa-solid fa-scale-balanced", label: "AK5e World Rules",
      ownership: "OWNER", onClick: () => safe(openWorldRuleControl(actor, api)) });
  });
  Hooks.on("renderActorSheetV2", (app, element) => {
    if (!worldRulesEnabled()) return;
    const actor = app.document;
    if (actor?.documentName !== "Actor") return;
    const root = element instanceof HTMLElement ? element : element?.[0];
    const header = root?.querySelector(".sheet-header");
    if (!header || header.querySelector(".ak5e-world-summary")) return;
    const row = document.createElement("div"); row.className = "ak5e-world-summary";
    const dying = actor.getFlag("ak5e", "dying");
    row.textContent = `AK5e · ${lmdFromCurrency(actor.system.currency).toLocaleString()} LMD` +
      (dying?.active ? ` · Dying: ${dying.mettle ?? 0}/6 Mettle, ${dying.failures ?? 0}/3 failed saves` : "");
    header.append(row);
  });
}

export async function openWorldRuleControl(actor, api = game.ak5e) {
  if (!worldRulesEnabled() || !actor?.isOwner) throw new Error("Choose an owned Actor in an AK5e World.");
  const dying = actor.getFlag("ak5e", "dying") ?? {};
  const restricted = actor.statuses?.has("frightened") || actor.statuses?.has("surprised");
  const rules = ["Turn choice", "Begin Dying turn", "End Dying turn", "Damage death save", "Medicine triage succeeded (DC 15)",
    "Lash Out (1 Mettle)", "Stagger Away (1 Mettle)", "Take Action (2 Mettle)", "Stabilise (6 Mettle)",
    "Preview skill conversion", "Apply skill conversion (GM)", "Damage Reduction calculator", "Queue Alternate Class switch (GM)"];
  const content = `<p>${esc(actor.name)}: ${dying.active ? `Dying, ${dying.mettle ?? 0}/6 Mettle, ${dying.failures ?? 0}/3 failed saves` : "not Dying"}.</p>
    <p>${restricted ? "Frightened/Surprised: choose Move, Action, or Bonus Action this turn; the GM confirms movement and action use." : "No changed action-limiting condition is active."}</p>
    <p>Currency: ${lmdFromCurrency(actor.system.currency).toLocaleString()} LMD. One copper piece equals 1 LMD.</p>
    <label>AK5e control<select name="rule">${rules.map((label, index) => `<option value="${index}">${esc(label)}</option>`).join("")}</select></label>`;
  const choice = await foundry.applications.api.DialogV2.wait({ window: { title: `AK5e World Rules — ${actor.name}` },
    content, buttons: [{ action: "apply", label: "Continue", default: true,
      callback: (_event, button) => Number(button.form.elements.rule.value) }, { action: "cancel", label: "Cancel", callback: () => null }], rejectClose: false });
  if (choice == null) return;
  if (choice === 0) return chooseTurnAction(actor);
  if (choice === 1) return dying.stabilisesNextTurn ? api.resolveDyingTurnStart(actor, false) : actor.rollDeathSave();
  if (choice === 2) return api.resolveDyingTurnEnd(actor);
  if (choice === 3) return rollDyingDamageSave(actor);
  if (choice === 4) return api.grantMettle(actor, 6);
  if ([5, 6, 7].includes(choice)) return api.spendMettle(actor, choice === 7 ? 2 : 1);
  if (choice === 8) return api.resolveStabilise(actor);
  if (choice === 9) {
    const rows = previewSkillReconciliation(actor);
    ui.notifications.info(rows.map(row => `${row.label}: ${row.previous} → ${row.proposed} (from ${row.sources.join("/")})`).join("; "));
    return rows;
  }
  if (choice === 10) return applySkillReconciliation(actor);
  if (choice === 11) return openDamageCalculator(actor);
  if (choice === 12) return openAlternateClassSetup(actor);
}

export async function chooseTurnAction(actor) {
  if (!actor?.isOwner || !worldRulesEnabled()) throw new Error("Choose an owned Actor in an AK5e World.");
  if (!actor.statuses?.has("frightened") && !actor.statuses?.has("surprised")) throw new Error("This Actor is not Frightened or Surprised.");
  const combat = game.combat;
  const key = combat ? `${combat.id}:${combat.round}:${combat.turn}` : `manual:${Date.now()}`;
  const choice = await foundry.applications.api.DialogV2.wait({ window: { title: "AK5e turn choice" },
    content: "<p>Choose the one option this creature may use during its turn. The GM confirms use.</p>",
    buttons: ["Move", "Action", "Bonus Action"].map(label => ({ action: label.toLowerCase().replace(" ", ""), label,
      callback: () => label.toLowerCase() })), rejectClose: false });
  if (!choice) return null;
  await actor.setFlag("ak5e", "turnChoice", { key, choice });
  return { key, choice };
}

export async function openDamageCalculator(actor) {
  if (!actor?.isOwner || !worldRulesEnabled()) throw new Error("Choose an owned Actor in an AK5e World.");
  const content = `<p>Preview damage after AK5e DR, then resistance or vulnerability. Confirm any stacking of equipped armour and shield DR with the GM.</p>
    <label>Damage<input name="amount" type="number" min="0" step="1" required></label>
    <label>Damage type<select name="type">${["bludgeoning", "piercing", "slashing", "thunder", "acid", "cold", "fire", "force", "lightning", "necrotic", "poison", "psychic", "radiant"].map(t => `<option value="${t}">${t}</option>`).join("")}</select></label>
    <label>DR override (blank uses equipped items)<input name="reduction" type="number" min="0" step="1"></label>
    <label><input name="resistance" type="checkbox">Resistance</label><label><input name="vulnerability" type="checkbox">Vulnerability</label>`;
  const request = await foundry.applications.api.DialogV2.wait({ window: { title: "AK5e Damage Reduction" }, content,
    buttons: [{ action: "calculate", label: "Calculate", default: true, callback: (_event, button) => ({
      amount: button.form.elements.amount.value, damageType: button.form.elements.type.value,
      reduction: button.form.elements.reduction.value === "" ? undefined : button.form.elements.reduction.value,
      resistance: button.form.elements.resistance.checked, vulnerability: button.form.elements.vulnerability.checked
    }) }, { action: "cancel", label: "Cancel", callback: () => null }], rejectClose: false });
  if (!request) return null;
  const result = previewDamage(actor, request);
  ui.notifications.info(`${request.amount} ${request.damageType} damage → ${result.result} after ${result.reduction} DR and defenses. Apply HP change manually.`);
  return result;
}
