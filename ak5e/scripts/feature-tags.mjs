import { sourceTagPresets, presetTagOptions, treatiseFeatures, tagRulesHtml } from "./tag-presets.mjs";

const flag = (doc, key) => doc?.getFlag?.("ak5e", key) ?? doc?.flags?.ak5e?.[key];
const entries = collection => Array.from(collection?.values?.() ?? collection ?? []);
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const busy = new Set();
const localize = key => game.i18n.localize(`AK5E.Tags.${key}`);
const safely = promise => promise.catch(error => { console.error("AK5e | Temporary tags", error); ui.notifications.error(error.message); });
const isTagSource = item => item.flags?.ak5e && (!flag(item, "temporaryTag") || flag(item, "temporaryTag").preset === "treatise") &&
  ["feat", "spell", "equipment", "weapon", "consumable", "loot", "tool"].includes(item.type);

export function tagActors() {
  const actors = new Map(entries(game.actors).map(actor => [actor.uuid, actor]));
  // Include synthetic Actors, so an unlinked NPC token gets its own benefit.
  for (const scene of entries(game.scenes)) for (const token of entries(scene.tokens)) {
    if (token.actor) actors.set(token.actor.uuid, token.actor);
  }
  return [...actors.values()];
}

export function featureTags(actor) {
  return [...entries(actor.effects), ...entries(actor.items).flatMap(item => entries(item.effects))]
    .filter(effect => flag(effect, "temporaryTag"));
}

// Copies retain the complete receipt so failed cleanup after native effect
// deletion remains visible and removable from the target's sheet.
export function featureTagEntries(actor) {
  const tags = new Map(featureTags(actor).map(effect => [flag(effect, "temporaryTag").id,
    { tag: flag(effect, "temporaryTag"), effect }]));
  for (const item of entries(actor.items)) {
    const tag = flag(item, "temporaryTag");
    if (tag?.id && !tags.has(tag.id)) tags.set(tag.id, { tag: { label: item.name,
      expiry: { trigger: "manual" }, ...tag }, effect: null });
  }
  return [...tags.values()];
}

function assertEditable(actor) {
  if (actor?.documentName === "Item") {
    if (actor.parent?.items?.get(actor.id) !== actor) throw new Error(localize("OwnerRequired"));
    actor = actor.parent;
  }
  if (actor?.documentName !== "Actor" || !actor.isOwner || actor.pack) throw new Error(localize("OwnerRequired"));
}

function assertSource(actor, item) {
  assertEditable(actor);
  if (!item || item.parent !== actor || actor.items.get(item.id) !== item ||
      !["feat", "spell", "equipment", "weapon", "consumable", "loot", "tool"].includes(item.type)) throw new Error(localize("FeatureRequired"));
  if (!isTagSource(item)) throw new Error(localize("FeatureRequired"));
}

export function tagExpiry(source, target, { trigger = "manual", seconds, expiryActor = "target", effectUuid } = {}) {
  if (!["manual", "shortRest", "longRest", "combatEnd", "turnStart", "turnEnd", "nextTurnEnd", "currentTurnEnd", "time", "concentration", "attack"].includes(trigger)) throw new Error(localize("InvalidTrigger"));
  if (!["source", "target", "active"].includes(expiryActor)) throw new Error(localize("InvalidTrigger"));
  const actor = expiryActor === "source" ? source : expiryActor === "active" ? game.combat?.combatant?.actor : target.parent?.documentName === "Actor" ? target.parent : target;
  if (!actor) throw new Error(localize("CombatantRequired"));
  const expiry = { trigger, actorUuid: actor.uuid, actorName: actor.name };
  if (trigger === "concentration") {
    if (!effectUuid) throw new Error(localize("ConcentrationRequired"));
    expiry.effectUuid = effectUuid;
  }
  if (trigger === "time") {
    const duration = Number(seconds);
    if (!Number.isFinite(duration) || duration <= 0) throw new Error(localize("InvalidDuration"));
    expiry.worldTime = Number(game.time.worldTime) + duration;
  }
  if (["combatEnd", "turnStart", "turnEnd", "nextTurnEnd", "currentTurnEnd"].includes(trigger)) {
    const combat = game.combat;
    if (!combat?.started) throw new Error(localize("CombatRequired"));
    expiry.combatUuid = combat.uuid;
    if (trigger !== "combatEnd") {
      const index = combat.turns.findIndex(c => c.actor?.uuid === actor.uuid);
      if (index < 0 || combat.turn === null) throw new Error(localize("CombatantRequired"));
      expiry.combatantId = combat.turns[index].id;
      // Next-start excludes the currently active turn; current/next-end includes it.
      if (trigger === "currentTurnEnd" && index !== combat.turn) throw new Error(localize("CurrentTurnRequired"));
      const nextRound = ["turnStart", "nextTurnEnd"].includes(trigger) ? index <= combat.turn : index < combat.turn;
      expiry.round = combat.round + (nextRound ? 1 : 0);
    }
  }
  return expiry;
}

/** Pure trigger matching. Only AK5e-owned tag effects use this lifecycle. */
export function tagHasExpired(tag, event) {
  if (tag.expiries) return tag.expiries.some(expiry => tagHasExpired({ expiry }, event));
  const expiry = tag.expiry;
  if (!expiry) return false;
  if (event.kind === "concentration") return expiry.trigger === "concentration" && expiry.effectUuid === event.effectUuid;
  if (event.kind === "attack") return expiry.trigger === "attack" && expiry.actorUuid === event.actorUuid;
  if (event.kind === "time") return expiry.trigger === "time" && event.worldTime >= expiry.worldTime;
  if (event.kind === "rest") return expiry.actorUuid === event.actorUuid &&
    (expiry.trigger === "shortRest" && ["short", "long"].includes(event.type) || expiry.trigger === "longRest" && event.type === "long");
  if (event.kind === "combatEnd") return expiry.combatUuid === event.combat?.uuid && ["combatEnd", "turnStart", "turnEnd", "nextTurnEnd", "currentTurnEnd"].includes(expiry.trigger);
  if (event.kind !== "combatTurn" || expiry.combatUuid !== event.combat?.uuid || !["turnStart", "turnEnd", "nextTurnEnd", "currentTurnEnd"].includes(expiry.trigger)) return false;
  const combat = event.combat;
  const previous = combat.previous;
  // Do not expire on initiative edits or rewinds.
  if (!previous || combat.turn === null || combat.round < previous.round ||
      combat.round === previous.round && combat.turn <= previous.turn) return false;
  const index = combat.turns.findIndex(c => c.id === expiry.combatantId);
  if (index < 0) return true;
  return combat.round > expiry.round || combat.round === expiry.round &&
    (expiry.trigger === "turnStart" ? combat.turn >= index : combat.turn > index);
}

export async function applyFeatureTag(source, sourceItem, target, options = {}) {
  const key = options.replacement ? `replacement:${options.replacement.family}:${options.replacement.scope === "source" ? source.uuid : target.uuid}` : null;
  if (key && busy.has(key)) throw new Error(localize("Busy"));
  if (key) busy.add(key);
  try { return await createFeatureTag(source, sourceItem, target, options); }
  finally { if (key) busy.delete(key); }
}

async function createFeatureTag(source, sourceItem, target, options = {}) {
  assertSource(source, sourceItem);
  assertEditable(target);
  const label = String(options.label ?? sourceItem.name).trim();
  if (!label || label.length > 160) throw new Error(localize("InvalidLabel"));
  if (options.replacement && (!options.replacement.family || !["source", "target"].includes(options.replacement.scope))) throw new Error(localize("InvalidTrigger"));
  const supportedActions = ["save", "used", "damage", "action", "medicine", "healed", "antidote", "repaired", "moved", "fightEnd", "leftArea", "forcedSave"];
  if (options.actions?.some(action => !supportedActions.includes(action))) throw new Error(localize("InvalidTrigger"));
  const tag = { id: foundry.utils.randomID(), sourceActorUuid: source.uuid, sourceItemUuid: sourceItem.uuid,
    targetActorUuid: target.documentName === "Item" ? target.parent.uuid : target.uuid,
    targetItemUuid: target.documentName === "Item" ? target.uuid : null,
    label, sourceName: source.name, sourceItemName: sourceItem.name, targetItemName: target.documentName === "Item" ? target.name : null,
    expiry: tagExpiry(source, target, options), relationship: Boolean(options.relationship),
    sourceDeletion: options.sourceDeletion ?? "remove", preset: options.preset ?? null,
    actions: options.actions ?? [], instructions: options.instructions ?? "", counters: structuredClone(options.counters ?? {}) };
  if (flag(sourceItem, "temporaryTag")) tag.parentTagId = flag(sourceItem, "temporaryTag").id;
  if (options.expiries) tag.expiries = options.expiries.map(expiry => tagExpiry(source, target, expiry));
  if (options.replacement) tag.replacement = structuredClone(options.replacement);
  const old = tag.replacement ? tagActors().flatMap(actor => featureTagEntries(actor).map(entry => ({ actor, ...entry })))
    .filter(({ tag: previous }) => previous.replacement?.family === tag.replacement.family &&
      (tag.replacement.scope === "source" ? previous.sourceActorUuid === source.uuid :
        (previous.targetItemUuid ?? previous.targetActorUuid) === (tag.targetItemUuid ?? tag.targetActorUuid))) : [];
  for (const entry of old) {
    assertEditable(entry.actor);
    if (entry.tag.pendingReplacement?.length) {
      for (const pending of entry.tag.pendingReplacement) {
        const actor = await fromUuid(pending.actorUuid);
        if (actor && featureTagEntries(actor).some(candidate => candidate.tag.id === pending.id)) throw new Error(localize("ReviewPrevious"));
      }
      entry.tag = { ...entry.tag, pendingReplacement: [] };
      if (entry.effect) await entry.effect.update({ "flags.ak5e.temporaryTag": entry.tag });
      for (const copy of entries(entry.actor.items).filter(item => flag(item, "temporaryTag")?.id === entry.tag.id))
        await copy.update({ "flags.ak5e.temporaryTag": entry.tag });
    }
  }
  tag.pendingReplacement = old.map(entry => ({ actorUuid: entry.actor.uuid, id: entry.tag.id }));
  const changes = options.changes ?? [];
  const status = options.condition ? CONFIG.statusEffects.find(effect => effect.id === options.condition) : null;
  if (options.condition && !status) throw new Error(localize("InvalidCondition"));
  // Generic native-effect editing is explicit. No arbitrary feature text is
  // interpreted as an effect, and base Actor fields are never overwritten.
  const effectData = { name: `AK5e: ${label}`, img: status?.img ?? status?.icon ?? sourceItem.img ?? "icons/svg/aura.svg",
    origin: sourceItem.uuid, transfer: false, disabled: false,
    changes: structuredClone([...(status?.changes ?? []), ...changes]), statuses: status ? [status.id] : [],
    description: `<p>${esc(label)}</p><p>${esc(source.name)} — ${esc(sourceItem.name)}</p><p>${esc(tag.instructions)}</p>${tagRulesHtml(sourceItem)}`,
    flags: { ak5e: { temporaryTag: tag } } };
  if (target.documentName === "Item") {
    if (options.condition || options.copyFeature || options.benefit) throw new Error(localize("ItemTargetRequired"));
    effectData.type = "enchantment";
    // An applied D&D5e enchantment must have an origin different from its target.
    if (effectData.origin === target.uuid) effectData.origin = source.uuid;
  }
  if (tag.expiry.trigger === "time") effectData.duration = { seconds: Number(options.seconds), startTime: game.time.worldTime };
  const [effect] = await target.createEmbeddedDocuments("ActiveEffect", [effectData]);
  try {
    if (options.copyFeature || options.benefit) {
      if (options.copyFeature && sourceItem.type !== "feat") throw new Error(localize("CopyFeatureRequired"));
      const data = options.benefit ? structuredClone(options.benefit) : sourceItem.toObject();
      delete data._id; delete data.folder; delete data.ownership;
      // A temporary copy must not start the origin wizard or masquerade as a
      // fresh origin grant. It retains text and its native removable effects.
      data.name = `${data.name ?? sourceItem.name} (${localize("Temporary")})`;
      data.system.advancement = [];
      data.flags = { ak5e: { ...(options.benefit?.flags?.ak5e ?? {}), temporaryTag: structuredClone(tag),
        sourceHeading: flag(sourceItem, "sourceHeading"), rawSource: flag(sourceItem, "rawSource") } };
      if (options.benefit?.flags?.ak5e) Object.assign(data.flags.ak5e, options.benefit.flags.ak5e);
      await target.createEmbeddedDocuments("Item", [data], { ak5eOriginSetup: true });
    }
  } catch (error) {
    // Remove only this attempt's objects. If cleanup fails, leave its visible
    // tag as a receipt for manual recovery rather than silently retrying.
    try { await removeFeatureTag(target, tag.id); }
    catch (cleanupError) { console.error("AK5e | Tag cleanup failed", cleanupError); }
    throw error;
  }
  // Create first: an unsuccessful application must preserve the previous tag.
  // A failed replacement cleanup keeps a visible receipt for owner/GM recovery.
  for (const entry of old) {
    await removeFeatureTag(entry.actor, entry.tag.id);
    if (featureTagEntries(entry.actor).some(candidate => candidate.tag.id === entry.tag.id)) throw new Error(localize("ReviewPrevious"));
  }
  if (old.length) {
    tag.pendingReplacement = [];
    await effect.update({ "flags.ak5e.temporaryTag": tag });
    for (const copy of entries(target.items).filter(item => flag(item, "temporaryTag")?.id === tag.id))
      await copy.update({ "flags.ak5e.temporaryTag": tag });
  }
  return effect;
}

export async function removeFeatureTag(target, tagId, removedTag) {
  assertEditable(target);
  const key = `${target.uuid}.${tagId}`;
  if (busy.has(`counter:${key}`)) throw new Error(localize("Busy"));
  if (busy.has(key)) return;
  busy.add(key);
  try {
    const effect = featureTags(target).find(effect => flag(effect, "temporaryTag").id === tagId);
    const copies = entries(target.items).filter(item => flag(item, "temporaryTag")?.id === tagId);
    const tag = flag(effect, "temporaryTag") ?? removedTag ?? flag(copies[0], "temporaryTag");
    if (copies.length) await target.deleteEmbeddedDocuments("Item", copies.map(item => item.id));
    if (effect) await effect.parent.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
    if (tag?.relationship) {
      const sourceItem = await fromUuid(tag.sourceItemUuid);
      // Removing an old relationship during replacement must not clear the new one.
      if (sourceItem?.parent?.isOwner && flag(sourceItem, "featureTracking")?.relationship?.tagId === tagId) {
        await sourceItem.update({ "flags.ak5e.featureTracking.relationship": null,
          "flags.ak5e.featureTracking.values": { role: "", creature: "", skill: "" } });
      }
      if (sourceItem?.parent?.isOwner && flag(sourceItem, "featureTracking")?.previousRelationship?.tagId === tagId) {
        await sourceItem.update({ "flags.ak5e.featureTracking.previousRelationship": null });
      }
    }
  } finally { busy.delete(key); }
}

function operates(actor) {
  const gm = game.users?.activeGM;
  if (gm) return game.user.id === gm.id;
  // One owner handles expiration when no GM is connected; no permission escalation.
  const owners = entries(game.users).filter(user => user.active && actor.testUserPermission?.(user, "OWNER"));
  return owners.length ? owners[0].id === game.user.id : Boolean(game.user.isGM && actor.isOwner);
}

export async function expireFeatureTags(event) {
  for (const actor of tagActors()) {
    if (!actor.isOwner || !operates(actor)) continue;
    for (const { tag } of featureTagEntries(actor)) {
      try {
        if (tagHasExpired(tag, event)) await removeFeatureTag(actor, tag.id);
        else if (event.kind === "rest" && event.actorUuid === actor.uuid) await recoverTagCounters(actor, tag, event.type);
      } catch (error) { console.error("AK5e | Tag expiration failed", tag.id, error); ui.notifications.error(error.message); }
    }
  }
}

export async function resolveFeatureTag(target, tagId, action) {
  assertEditable(target);
  const entry = featureTagEntries(target).find(entry => entry.tag.id === tagId);
  if (!entry) return;
  if (!entry.tag.actions?.includes(action)) throw new Error(localize("InvalidTrigger"));
  await removeFeatureTag(target, tagId);
}

export async function setTagCounter(target, tagId, key, value) {
  assertEditable(target);
  const lock = `${target.uuid}.${tagId}`;
  if (busy.has(lock) || busy.has(`counter:${lock}`)) throw new Error(localize("Busy"));
  busy.add(`counter:${lock}`);
  try {
  const entry = featureTagEntries(target).find(entry => entry.tag.id === tagId);
  const counter = entry?.tag.counters?.[key];
  if (!counter || !Number.isInteger(value) || value < 0 || value > counter.max) throw new Error(localize("InvalidCounter"));
  const tag = structuredClone(entry.tag);
  tag.counters[key].value = value;
  if (entry.effect) await entry.effect.update({ "flags.ak5e.temporaryTag": tag });
  for (const copy of entries(target.items).filter(item => flag(item, "temporaryTag")?.id === tagId))
    await copy.update({ "flags.ak5e.temporaryTag": tag });
  } finally { busy.delete(`counter:${lock}`); }
}

async function recoverTagCounters(actor, tag, type) {
  for (const [key, counter] of Object.entries(tag.counters ?? {})) {
    if (counter.recovery === "sr" && ["short", "long"].includes(type) || counter.recovery === "lr" && type === "long")
      await setTagCounter(actor, tag.id, key, counter.max);
  }
}

export async function applyTagPreset(source, item, target, presetId, parameters = {}) {
  const key = `preset:${source.uuid}`;
  if (busy.has(key)) throw new Error(localize("Busy"));
  busy.add(key);
  try { return await createPresetTag(source, item, target, presetId, parameters); }
  finally { busy.delete(key); }
}

async function createPresetTag(source, item, target, presetId, parameters) {
  assertSource(source, item);
  const preset = sourceTagPresets(item).find(preset => preset.id === presetId);
  if (!preset) throw new Error(localize("InvalidPreset"));
  if (preset.counter === "flock" && target.uuid !== source.uuid) {
    const members = tagActors().flatMap(actor => featureTagEntries(actor)).filter(({ tag }) => tag.preset === "flock" &&
      tag.sourceActorUuid === source.uuid && tag.targetActorUuid !== source.uuid && tag.targetActorUuid !== target.uuid);
    if (members.length >= Math.ceil(Number(source.system.attributes.prof) / 2)) throw new Error(localize("FlockCapacity"));
  }
  const options = presetTagOptions(preset, source, target, parameters);
  if (preset.concentration) {
    const effect = entries(source.effects).find(effect => !effect.disabled && effect.origin === item.uuid &&
      entries(effect.statuses).includes(CONFIG.specialStatusEffects?.CONCENTRATING ?? "concentrating"));
    if (!effect) throw new Error(localize("ConcentrationRequired"));
    options.expiries = [...(options.expiries ?? [{ trigger: options.trigger, seconds: options.seconds }]),
      { trigger: "concentration", expiryActor: "source", effectUuid: effect.uuid }];
  }
  return applyFeatureTag(source, item, target, options);
}

const SKILL_KEYS = { Acrobatics: "acr", "Animal Handling": "ani", Arts: "arc", Athletics: "ath", Deception: "dec", Insight: "ins",
  Intimidation: "itm", Investigation: "inv", Lore: "ak5elore", Medicine: "med", Perception: "prc", Performance: "prf",
  Persuasion: "per", "Sleight of Hand": "slt", Stealth: "ste", Technology: "ak5etech", Wilderness: "ak5ewilderness" };

function skillWithoutRelationship(actor, key, previous) {
  if (actor.clone) {
    const effects = entries(actor.effects).filter(effect => flag(effect, "temporaryTag")?.id !== previous?.tagId).map(effect => effect.toObject());
    return Number(actor.clone({ effects }).system.skills?.[key]?.value) || 0;
  }
  return Number((actor._source?.system ?? actor.system).skills?.[key]?.value) || 0;
}

/** One source relationship, one removable UPGRADE effect; permanent skills remain intact. */
export async function saveAegirRelationship(source, item, values, targetUuid) {
  assertSource(source, item);
  const key = item.uuid;
  if (busy.has(key)) throw new Error(localize("Busy"));
  busy.add(key);
  try {
    const stored = flag(item, "featureTracking") ?? {};
    const previous = stored.relationship;
    const oldTarget = previous ? await fromUuid(previous.targetUuid) : null;
    const oldTagPresent = oldTarget && featureTagEntries(oldTarget).some(entry => entry.tag.id === previous.tagId);
    if (oldTagPresent) assertEditable(oldTarget);
    if (stored.previousRelationship) {
      const pending = await fromUuid(stored.previousRelationship.targetUuid);
      if (pending && featureTagEntries(pending).some(entry => entry.tag.id === stored.previousRelationship.tagId)) throw new Error(localize("ReviewPrevious"));
      await item.update({ "flags.ak5e.featureTracking.previousRelationship": null });
    }
    if (!targetUuid || !values.role) {
      if (oldTagPresent) await removeFeatureTag(oldTarget, previous.tagId);
      return item.update({ "flags.ak5e.featureTracking.values": values, "flags.ak5e.featureTracking.relationship": null });
    }
    const partner = await fromUuid(targetUuid);
    assertEditable(partner);
    if (partner.uuid === source.uuid) throw new Error(localize("DifferentCreature"));
    const skill = SKILL_KEYS[values.skill];
    if (!skill || !["Student", "Teacher"].includes(values.role)) throw new Error(localize("InvalidSkill"));
    const provider = values.role === "Teacher" ? source : partner;
    const recipient = values.role === "Teacher" ? partner : source;
    const proficiency = skillWithoutRelationship(provider, skill, previous);
    if (proficiency < 1) throw new Error(localize("ProficiencyRequired"));
    const existing = skillWithoutRelationship(recipient, skill, previous);
    const value = values.role === "Student" ? existing >= 1 ? 2 : 1 : proficiency >= 2 ? 2 : 1;
    const effect = await applyFeatureTag(source, item, recipient, { label: `${values.skill} — Ever the Student, Ever the Master`,
      relationship: true, changes: [{ key: `system.skills.${skill}.value`, mode: 4, value: String(value), priority: 20 }] });
    const tagId = flag(effect, "temporaryTag").id;
    try {
      await item.update({ "flags.ak5e.featureTracking.values": { ...values, creature: partner.name },
        "flags.ak5e.featureTracking.relationship": { targetUuid: recipient.uuid, partnerUuid: partner.uuid, tagId },
        "flags.ak5e.featureTracking.previousRelationship": previous ?? null });
    } catch (error) {
      await removeFeatureTag(recipient, tagId);
      throw error;
    }
    // Persist the replacement before removing the old effect. A cleanup failure
    // leaves both links visible in the receipt and blocks another replacement.
    if (oldTagPresent) await removeFeatureTag(oldTarget, previous.tagId);
    await item.update({ "flags.ak5e.featureTracking.previousRelationship": null });
    return effect;
  } finally { busy.delete(key); }
}

async function dialog(options) {
  let closed;
  const render = options.render;
  const result = await foundry.applications.api.DialogV2.wait({ ...options, rejectClose: false, render: (event, app) => {
    closed = new Promise(resolve => app.addEventListener("close", resolve, { once: true }));
    render?.(event, app);
  } });
  if (closed) await closed;
  return result;
}

export async function openFeatureTagSetup(source) {
  assertEditable(source);
  const features = entries(source.items).filter(isTagSource);
  const actors = tagActors().filter(actor => actor.isOwner);
  if (!features.length || !actors.length) throw new Error(localize("FeatureRequired"));
  const itemId = await dialog({ window: { title: localize("Add") }, content: `<label>${localize("Feature")}<select name="feature">${features.map(i => `<option value="${esc(i.id)}">${esc(i.name)}</option>`).join("")}</select></label>`,
    buttons: [{ action: "next", label: localize("Next"), default: true, callback: (_event, button) => button.form.elements.feature.value }] });
  if (!itemId) return;
  const item = source.items.get(itemId);
  assertSource(source, item);
  const profiles = sourceTagPresets(item);
  const targets = actors.flatMap(actor => [actor, ...entries(actor.items).filter(item => item.type === "weapon")]);
  const choices = treatiseFeatures();
  const content = `<p>${localize("Hint")}</p>
    <p><strong>${esc(item.name)}</strong></p>
    <label>${localize("Profile")}<select name="preset">${profiles.map(p => `<option value="${esc(p.id)}">${esc(p.label)}</option>`).join("")}<option value="">${localize("Custom")}</option></select></label>
    <label>${localize("Target")}<select name="target">${targets.map(a => `<option value="${esc(a.uuid)}">${esc(a.documentName === "Item" ? `${a.parent.name} — ${a.name}` : a.name)}${a.isToken ? ` (${localize("Token")})` : ""}</option>`).join("")}</select></label>
    ${profiles.some(p => p.parameter === "castLevel") ? `<label>${localize("CastLevel")}<input name="castLevel" type="number" min="1" max="9" value="${Math.max(1, Number(item.system.level) || 3)}"></label>` : ""}
    ${profiles.some(p => p.parameter === "doom") ? `<label>${localize("SaveAbility")}<select name="ability">${["str", "dex", "con", "int", "wis", "cha"].map(key => `<option value="${key}">${key.toUpperCase()}</option>`).join("")}</select></label><label>${localize("DamageType")}<select name="damageType">${Object.entries(CONFIG.DND5E.damageTypes).map(([key, value]) => `<option value="${esc(key)}">${esc(game.i18n.localize(value.label ?? value))}</option>`).join("")}</select></label>` : ""}
    ${profiles.some(p => p.parameter === "treatise") ? `<label>${localize("BorrowedFeature")}<select name="featureId">${choices.map(e => `<option value="${esc(e.id)}">${esc(e.name)}</option>`).join("")}</select></label><label><input name="writtenConfirmed" type="checkbox"> ${localize("WrittenConfirmed")}</label><label><input name="eligibleConfirmed" type="checkbox"> ${localize("EligibleConfirmed")}</label>` : ""}
    <details><summary>${localize("SourceRules")}</summary>${tagRulesHtml(item)}</details>
    <details><summary>${localize("CustomSettings")}</summary>
    <label>${localize("Label")}<input name="label" maxlength="160"></label>
    <label>${localize("Condition")}<select name="condition"><option value=""></option>${CONFIG.statusEffects.map(e => `<option value="${esc(e.id)}">${esc(game.i18n.localize(e.name ?? e.label))}</option>`).join("")}</select></label>
    <label><input name="copyFeature" type="checkbox"> ${localize("Copy")}</label>
    <label>${localize("Trigger")}<select name="trigger">${["manual", "shortRest", "longRest", "turnStart", "turnEnd", "nextTurnEnd", "currentTurnEnd", "combatEnd", "time"].map(key => `<option value="${key}">${localize(key)}</option>`).join("")}</select></label>
    <label>${localize("ExpiryActor")}<select name="expiryActor"><option value="target">${localize("Target")}</option><option value="source">${localize("Source")}</option><option value="active">${localize("ActiveCreature")}</option></select></label>
    <label>${localize("Seconds")}<input name="seconds" type="number" min="1" step="1" value="60"></label>
    <label>${localize("OtherTrigger")}<select name="otherTrigger">${["manual", "shortRest", "longRest", "turnStart", "turnEnd", "nextTurnEnd", "currentTurnEnd", "combatEnd", "time", "attack"].map(key => `<option value="${key}">${localize(key)}</option>`).join("")}</select></label>
    <label>${localize("OtherActor")}<select name="otherActor"><option value="target">${localize("Target")}</option><option value="source">${localize("Source")}</option><option value="active">${localize("ActiveCreature")}</option></select></label>
    <label>${localize("ManualActions")}<select name="actions" multiple size="5">${["save", "used", "damage", "action", "medicine", "healed", "antidote", "repaired", "moved", "fightEnd", "leftArea", "forcedSave"].map(key => `<option value="${key}">${localize(key)}</option>`).join("")}</select></label>
    <label>${localize("Replacement")}<select name="replacement"><option value="">${localize("AllowMultiple")}</option><option value="source">${localize("OnePerSource")}</option><option value="target">${localize("OnePerTarget")}</option></select></label>
    <label>${localize("ReplacementFamily")}<input name="family" maxlength="160" placeholder="${esc(item.name)}"></label>
    <label>${localize("Instructions")}<textarea name="instructions" maxlength="4000"></textarea></label>
    <label><input name="retainSource" type="checkbox"> ${localize("RetainSource")}</label></details>
    <label><input name="editEffect" type="checkbox"> ${localize("EditEffect")}</label>
    <p class="ak5e-tag-preview"></p>`;
  return dialog({ window: { title: localize("Add") }, content: `<div class="ak5e-tracker-dialog">${content}</div>`,
    buttons: [{ action: "apply", label: localize("Apply"), default: true, callback: async (_event, button) => {
      const values = Object.fromEntries(new FormData(button.form));
      const target = await fromUuid(values.target);
      const custom = { ...values, actions: new FormData(button.form).getAll("actions"), label: values.label || item.name,
        replacement: values.replacement ? { family: values.family.trim() || item.uuid, scope: values.replacement } : null,
        copyFeature: Boolean(values.copyFeature), sourceDeletion: values.retainSource ? "retain" : "remove" };
      if (values.otherTrigger !== "manual") custom.expiries = [values, { trigger: values.otherTrigger, expiryActor: values.otherActor, seconds: values.seconds }];
      const effect = values.preset ? await applyTagPreset(source, item, target, values.preset, values) :
        await applyFeatureTag(source, item, target, custom);
      if (values.editEffect) effect.sheet.render(true);
      return effect;
    } }], render: (_event, app) => {
      const select = app.element.querySelector('[name="preset"]');
      const preview = app.element.querySelector(".ak5e-tag-preview");
      const update = () => {
        const profile = profiles.find(profile => profile.id === select.value);
        preview.textContent = profile ? `${localize(profile.trigger)}${profile.seconds ? ` (${profile.seconds}s)` : ""}. ${profile.instructions ?? localize("ResolveManually")}` : localize("CustomHint");
      };
      select.addEventListener("change", update); update();
    } });
}

export function renderFeatureTags(app, element) {
  const actor = app?.document?.documentName === "Actor" ? app.document : app?.actor;
  if (!(app instanceof foundry.applications.sheets.ActorSheetV2) || !actor || !element?.querySelector) return;
  const effects = element.matches?.('.tab[data-tab="effects"]') ? element : element.querySelector('.tab[data-tab="effects"]');
  if (!effects) return;
  for (const old of effects.querySelectorAll(".ak5e-feature-tags")) old.remove();
  const tags = featureTagEntries(actor);
  const canAdd = actor.isOwner && entries(actor.items).some(isTagSource);
  if (!tags.length && !canAdd) return;
  const section = document.createElement("section");
  section.className = "ak5e-feature-tags";
  const heading = document.createElement("h3");
  heading.textContent = localize("Title");
  section.append(heading);
  if (canAdd) {
    const add = document.createElement("button");
    add.type = "button"; add.textContent = localize("Add");
    add.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); safely(openFeatureTagSetup(actor)); });
    section.append(add);
  }
  for (const { tag, effect } of tags) {
    const row = document.createElement("div");
    row.className = "ak5e-feature-tracker";
    const name = document.createElement("span");
    name.className = "ak5e-tracker-name";
    name.textContent = `${tag.label}${tag.targetItemName ? ` — ${tag.targetItemName}` : ""} · ${(tag.expiries ?? [tag.expiry]).map(expiry =>
      `${localize(expiry?.trigger ?? "manual")}${expiry?.trigger !== "manual" && expiry?.actorName ? ` (${expiry.actorName})` : ""}`).join(" / ")}`;
    name.title = `${tag.sourceName ?? ""} — ${tag.sourceItemName ?? ""}\n${tag.instructions ?? ""}`;
    row.append(name);
    if (tag.instructions) {
      const summary = document.createElement("span");
      summary.className = "ak5e-tracker-summary"; summary.textContent = tag.instructions; row.append(summary);
    }
    for (const [key, counter] of Object.entries(tag.counters ?? {})) {
      const label = document.createElement("span"); label.textContent = `${counter.label} / ${counter.max}`; row.append(label);
      const input = document.createElement("input");
      input.type = "number"; input.min = "0"; input.max = String(counter.max); input.value = String(counter.value); input.disabled = !actor.isOwner;
      input.title = `${counter.label}: ${counter.value} / ${counter.max}`;
      input.setAttribute("aria-label", counter.label);
      input.addEventListener("change", () => safely(setTagCounter(actor, tag.id, key, Number(input.value))));
      row.append(input);
    }
    for (const [label, action] of [["Edit", () => effect.sheet.render(true)], ["Remove", () => removeFeatureTag(actor, tag.id)],
      ...(tag.actions ?? []).map(action => [action, () => resolveFeatureTag(actor, tag.id, action)])]) {
      if (!actor.isOwner) continue;
      if (label === "Edit" && !effect) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = localize(label);
      if (!["Edit", "Remove"].includes(label)) button.title = localize("ConfirmEvent");
      button.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); safely(Promise.resolve().then(action)); });
      row.append(button);
    }
    section.append(row);
  }
  effects.prepend(section);
}

export function registerFeatureTagHooks() {
  Hooks.on("renderActorSheetV2", renderFeatureTags);
  Hooks.on("updateCombat", (combat, changed) => {
    if ("round" in changed || "turn" in changed) safely(expireFeatureTags({ kind: "combatTurn", combat }));
  });
  Hooks.on("deleteCombat", combat => { safely(expireFeatureTags({ kind: "combatEnd", combat })); });
  Hooks.on("updateWorldTime", worldTime => { safely(expireFeatureTags({ kind: "time", worldTime })); });
  Hooks.on("dnd5e.restCompleted", (actor, _result, config = {}) => {
    safely(expireFeatureTags({ kind: "rest", actorUuid: actor.uuid, type: config.type }));
  });
  Hooks.on("deleteActiveEffect", effect => {
    safely(expireFeatureTags({ kind: "concentration", effectUuid: effect.uuid }));
    const tag = flag(effect, "temporaryTag");
    const target = effect.parent?.documentName === "Item" ? effect.parent.parent : effect.parent;
    if (!tag || target?.documentName !== "Actor" || !target.isOwner || !operates(target)) return;
    // Native Effects-tab deletion must also remove that tag's feature copies.
    safely(removeFeatureTag(target, tag.id, tag));
  });
  Hooks.on("updateActiveEffect", (effect, changed) => {
    if (changed.disabled === true || "statuses" in changed &&
        !entries(effect.statuses).includes(CONFIG.specialStatusEffects?.CONCENTRATING ?? "concentrating"))
      safely(expireFeatureTags({ kind: "concentration", effectUuid: effect.uuid }));
  });
  Hooks.on("deleteItem", item => {
    if (!item.parent) return;
    if (flag(item, "temporaryTag") && flag(item, "temporaryTag").preset !== "treatise") return;
    for (const actor of tagActors()) if (actor.isOwner && operates(actor)) {
      for (const { tag } of featureTagEntries(actor)) if (tag.sourceItemUuid === item.uuid &&
        (tag.parentTagId || tag.sourceDeletion !== "retain")) safely(removeFeatureTag(actor, tag.id));
    }
  });
  Hooks.on("deleteActor", source => {
    for (const actor of tagActors()) if (actor.isOwner && operates(actor)) {
      for (const { tag } of featureTagEntries(actor)) if (tag.sourceActorUuid === source.uuid && tag.sourceDeletion !== "retain") safely(removeFeatureTag(actor, tag.id));
    }
  });
  Hooks.on("dnd5e.postRollAttack", (_rolls, { subject } = {}) => {
    if (subject?.actor) safely(expireFeatureTags({ kind: "attack", actorUuid: subject.actor.uuid }));
  });
  // Reconcile clocks and removed concentration effects after a World reload.
  safely(expireFeatureTags({ kind: "time", worldTime: game.time?.worldTime ?? 0 }));
  safely((async () => {
    for (const actor of tagActors()) if (actor.isOwner && operates(actor)) {
      for (const { tag } of featureTagEntries(actor)) {
        if (tag.parentTagId && !await fromUuid(tag.sourceItemUuid)) { await removeFeatureTag(actor, tag.id); continue; }
        for (const expiry of tag.expiries ?? [tag.expiry]) if (expiry?.trigger === "concentration") {
          const effect = await fromUuid(expiry.effectUuid);
          if (!effect || effect.disabled || !entries(effect.statuses).includes(CONFIG.specialStatusEffects?.CONCENTRATING ?? "concentrating"))
            await removeFeatureTag(actor, tag.id);
        }
      }
    }
  })());
}
