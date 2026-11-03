/** Guard feature setup: preview and apply class features up to current Guard level idempotently. */
import { CHAPTER_THREE_CLASSES } from "./chapter-three-content.mjs";
import { GUARD_CLASS_ID, guardProfile, guardLevel, guardEnabled } from "./guard-rules.mjs";
import { defineGuardPools } from "./guard-features.mjs";
import { sourceEntryData } from "./caster-setup.mjs";
import { need } from "./operation-kernel.mjs";
import { guardUses } from "./guard-uses.mjs";
import { currentEpoch, isLocked } from "./play-undo.mjs";

export const GUARD_CORE_FEATURES = Object.freeze([
  { id: "class-feature-guard-1st-level-guard-branch-2128", level: 1, name: "1st Level: Guard Branch" },
  { id: "class-feature-guard-1st-level-fighting-style-4025", level: 1, name: "1st Level: Fighting Style" },
  { id: "class-feature-guard-1st-level-press-the-attack-5745", level: 1, name: "1st Level: Press the Attack" },
  { id: "class-feature-guard-2nd-level-basic-operator-skill-7322", level: 2, name: "2nd Level: Basic Operator Skill" },
  { id: "class-feature-guard-3rd-level-unrelenting-7482", level: 3, name: "3rd Level: Unrelenting" },
  { id: "class-feature-guard-3rd-level-basic-talent-7783", level: 3, name: "3rd Level: Basic Talent" },
  { id: "class-feature-guard-4th-level-ability-score-improvement-8033", level: 4, name: "4th Level: Ability Score Improvement" },
  { id: "class-feature-guard-5th-level-extra-attack-8534", level: 5, name: "5th Level: Extra Attack" },
  { id: "class-feature-guard-7th-level-advanced-operator-skill-8655", level: 7, name: "7th Level: Advanced Operator Skill" },
  { id: "class-feature-guard-9th-level-advanced-talent-8838", level: 9, name: "9th Level: Advanced Talent" },
  { id: "class-feature-guard-11th-level-unrelenting-upgraded-9096", level: 11, name: "11th Level: Unrelenting Upgraded" },
  { id: "class-feature-guard-14th-level-elite-operator-skill-9491", level: 14, name: "14th Level: Elite Operator Skill" },
  { id: "class-feature-guard-15th-level-unrelenting-aggression-9653", level: 15, name: "15th Level: Unrelenting Aggression" },
  { id: "class-feature-guard-18th-level-eternal-aggression-10050", level: 18, name: "18th Level: Eternal Aggression" },
  { id: "class-feature-guard-20th-level-annihilation-protocol-10373", level: 20, name: "20th Level: Annihilation Protocol" }
]);

const list = collection => Array.from(collection?.values?.() ?? collection ?? []);
const flag = (doc, key) => doc?.getFlag?.("ak5e", key) ?? doc?.flags?.ak5e?.[key];

function worldItem(sourceId) {
  return list(globalThis.game?.items).find(i => flag(i, "chapterThreeId") === sourceId) ?? null;
}

function featureItemData(entry) {
  const world = worldItem(entry.id);
  if (world) {
    const data = world.toObject ? world.toObject() : structuredClone(world);
    delete data._id;
    delete data.id;
    data.flags ??= {};
    data.flags.ak5e ??= {};
    data.flags.ak5e.chapterThreeId = entry.id;
    data.flags.ak5e.guardFeature = true;
    return data;
  }
  const source = CHAPTER_THREE_CLASSES.find(e => e.id === entry.id);
  if (source) {
    const data = sourceEntryData(source);
    data.flags ??= {};
    data.flags.ak5e ??= {};
    data.flags.ak5e.chapterThreeId = entry.id;
    data.flags.ak5e.guardFeature = true;
    return data;
  }
  return {
    name: entry.name,
    type: "feat",
    img: "icons/skills/melee/weapons-crossed-swords-yellow.webp",
    system: { description: { value: `<p>AK5e Guard Feature: ${entry.name}</p>` } },
    flags: { ak5e: { chapterThreeId: entry.id, guardFeature: true } }
  };
}

export async function previewGuardSetup(actor) {
  const profile = guardProfile(actor);
  need(actor?.isOwner && profile.applicable && !profile.blocked.length, "Choose an owned character with a valid single Guard class.");
  const level = profile.level ?? 1;
  const existing = list(actor.items);
  const creates = [], kept = [];

  for (const feat of GUARD_CORE_FEATURES) {
    if (feat.level > level) continue;
    const owned = existing.find(i => flag(i, "chapterThreeId") === feat.id || i.name === feat.name);
    if (owned) {
      kept.push(feat.name);
    } else {
      creates.push(featureItemData(feat));
    }
  }

  if (profile.branch === "artsblade") {
    const features = CHAPTER_THREE_CLASSES.filter(entry => entry.kind === "subclass-feature" && entry.parentBranch === "Artsblade"
      && ((entry.level != null && entry.level <= level) || entry.id === "subclass-feature-guard-artsblade-blade-art-6708"
        || entry.id === "subclass-feature-guard-artsblade-artsblade-table-1152"
        || entry.id === "subclass-feature-guard-artsblade-resolving-spellsword-arts-2822"));
    for (const entry of features) {
      const owned = existing.find(item => flag(item, "chapterThreeId") === entry.id);
      if (owned) kept.push(entry.name);
      else creates.push(featureItemData({ ...entry, name: entry.name, level: entry.level ?? 1 }));
    }
  }

  const contextKey = JSON.stringify([actor.uuid, level, actor._source?.system ?? actor.system,
    actor.flags?.ak5e ?? {}, existing.map(item => ({ id: item.id, data: item.toObject?.() ?? itemSnapshot(item) })), creates, kept]);
  return {
    level,
    creates,
    kept,
    contextKey,
    actorUpdates: {
      "flags.ak5e.guard.enabled": true
    }
  };
}

export async function applyGuardSetup(actor, { confirmed, contextKey } = {}) {
  need(confirmed === true, "Confirm the previewed Guard setup first.");
  return guardUses.serial(actor, async () => {
    const plan = await previewGuardSetup(actor);
    need(typeof contextKey === "string" && contextKey.length > 0 && plan.contextKey === contextKey,
      "The character changed since the preview; preview the Guard setup again.");
    defineGuardPools();
    const receipt = await commitGuardChanges(actor, "setup", plan.actorUpdates, plan.creates);
    return { level: plan.level, created: plan.creates.map(c => c.name), kept: plan.kept, receiptId: receipt.id, receipt };
  });
}

/** Setup and progression share an owner-local ledger, not a document-update relay.
 * The actor delta and its before-state land atomically, before any Item creation.
 * Each planned Item has a persisted marker, so partial creation is discoverable.
 */
const CHANGE_FLAG = "guardChanges";
const changeState = actor => structuredClone(flag(actor, CHANGE_FLAG) ?? { undo: [] });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const readPath = (actor, path) => path.split(".").reduce((value, key) => value?.[key], actor._source ?? actor);
const deletePath = path => { const keys = path.split("."), key = keys.pop(); return [...keys, `-=${key}`].join("."); };
const validId = id => typeof id === "string" && /^[A-Za-z0-9_-]{1,60}$/.test(id);
function requireOwner(actor) {
  need(actor?.isOwner && !actor.pack && guardProfile(actor).applicable, "Choose an owned Guard character.");
}
function itemSnapshot(item) {
  const data = item.toObject?.() ?? item;
  return JSON.parse(JSON.stringify({ name: data.name, type: data.type, img: data.img, system: data.system ?? {}, flags: data.flags ?? {} }));
}
function absentContainers(actor, changes) {
  const result = new Set();
  for (const change of changes) {
    const keys = change.path.split(".");
    for (let size = 1; size < keys.length; size++) {
      const path = keys.slice(0, size).join(".");
      if (readPath(actor, path) === undefined) result.add(path);
    }
  }
  return [...result];
}
function pruneAbsentContainers(actor, receipt, restore) {
  const projected = JSON.parse(JSON.stringify({ system: (actor._source ?? actor).system, flags: (actor._source ?? actor).flags }));
  const at = path => path.split(".").reduce((value, key) => value?.[key], projected);
  for (const [path, value] of Object.entries(restore)) {
    const keys = path.split("."), last = keys.pop();
    const parent = at(keys.join("."));
    if (!parent) continue;
    if (last.startsWith("-=")) delete parent[last.slice(2)];
    else parent[last] = value;
  }
  for (const path of [...(receipt.absentContainers ?? [])].sort((a, b) => b.length - a.length)) {
    const value = at(path);
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length) continue;
    for (const key of Object.keys(restore)) if (key.startsWith(`${path}.`)) delete restore[key];
    restore[deletePath(path)] = null;
    const keys = path.split("."), last = keys.pop(), parent = at(keys.join("."));
    if (parent) delete parent[last];
  }
}
function changesFor(actor, updates) {
  const changes = [];
  const visit = (path, after) => {
    if (after && typeof after === "object" && !Array.isArray(after) && Object.keys(after).length) {
      for (const [key, value] of Object.entries(after)) visit(`${path}.${key}`, value);
      return;
    }
    if (after && typeof after === "object" && !Array.isArray(after) && readPath(actor, path) !== undefined) return;
    const before = readPath(actor, path);
    if (!same(before, after)) changes.push({ path, beforePresent: before !== undefined, before: before === undefined ? null : structuredClone(before), after: structuredClone(after) });
  };
  for (const [path, value] of Object.entries(updates)) visit(path, value);
  return changes;
}
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
async function changeCard(actor, receipt, undo = false) {
  const implementation = globalThis.ChatMessage?.implementation ?? globalThis.ChatMessage;
  if (!implementation?.create) return;
  try {
    await implementation.create({
      speaker: implementation.getSpeaker?.({ actor }) ?? {},
      content: `<h3>${undo ? "Undone: " : ""}${escapeHtml(receipt.title)}</h3><p>${escapeHtml(actor.name)}: ${escapeHtml(receipt.summary)}</p><p>Receipt: ${escapeHtml(receipt.id)}. Undo is available from Guard Controls → Undo Setup / Progression.</p>${undo ? `<ul>${(receipt.undoNotes ?? []).map(note => `<li>${escapeHtml(note)}</li>`).join("")}</ul>` : ""}`,
      flags: { ak5e: { guardChangeCard: { actorUuid: actor.uuid, useId: receipt.id } } }
    });
  } catch { globalThis.ui?.notifications?.warn?.(`Guard change ${receipt.id} was saved, but its chat notice could not be posted. Use Guard Controls to review/undo it.`); }
}
function captureCreated(actor, receipt) {
  for (const item of list(actor.items)) {
    if (flag(item, "guardChange")?.receiptId !== receipt.id) continue;
    if (!receipt.createdIds.includes(item.id)) receipt.createdIds.push(item.id);
    if (!Object.hasOwn(receipt.items, item.id)) receipt.items[item.id] = itemSnapshot(item);
  }
}

/** Internal apply helper; callers hold guardUses.serial across preview validation and commitment. */
export async function commitGuardChanges(actor, kind, updates, creates = [], completionUpdates = {}) {
  requireOwner(actor);
  need(["setup", "progression"].includes(kind), "Choose Guard setup or progression.");
  const id = globalThis.foundry?.utils?.randomID?.();
  need(validId(id), "A stable Guard change receipt ID is required.");
  const state = changeState(actor), changes = changesFor(actor, updates);
  const receipt = { id, kind, title: kind === "setup" ? "Guard core feature setup" : "Guard progression",
    epoch: currentEpoch(), userId: game.user.id, status: "creating", before: changes.map(change => ({ path: change.path, present: change.beforePresent, value: change.before })),
    changes, absentContainers: absentContainers(actor, changes), createdIds: [], items: {}, plannedItems: creates.map((data, index) => ({ index, name: data.name })), summary: `Create ${creates.length} Items; change ${changes.length} fields.` };
  state.undo.push(receipt);
  await actor.update({ ...updates, [`flags.ak5e.${CHANGE_FLAG}`]: state });
  try {
    if (creates.length) await actor.createEmbeddedDocuments("Item", creates.map((data, index) => ({
      ...structuredClone(data), flags: { ...structuredClone(data.flags ?? {}), ak5e: { ...structuredClone(data.flags?.ak5e ?? {}), guardChange: { receiptId: id, index } } }
    })));
  } catch (error) {
    captureCreated(actor, receipt);
    receipt.status = "partial";
    // Even if acknowledgement fails, the prewritten intent and per-Item markers remain recoverable.
    try { await actor.update({ [`flags.ak5e.${CHANGE_FLAG}`]: state }); } catch { /* Intent remains discoverable; never conceal the creation failure. */ }
    throw error;
  }
  captureCreated(actor, receipt);
  for (const change of changesFor(actor, completionUpdates)) {
    const prior = receipt.changes.find(entry => entry.path === change.path);
    if (prior) prior.after = change.after;
    else { receipt.changes.push(change); receipt.before.push({ path: change.path, present: change.beforePresent, value: change.before }); }
  }
  receipt.status = "complete";
  await actor.update({ ...completionUpdates, [`flags.ak5e.${CHANGE_FLAG}`]: state });
  await changeCard(actor, receipt);
  return structuredClone(receipt);
}

function reviewGuardChange(actor, id) {
  const receipt = changeState(actor).undo.find(entry => entry.id === id);
  if (!receipt) return { lines: ["This Guard change is no longer recorded."], blocked: true };
  if (receipt.status === "undone") return { lines: ["This Guard change was already undone."], blocked: true };
  if (isLocked(receipt)) return { lines: ["Locked: this Guard change belongs to an earlier encounter window."], blocked: true };
  const lines = receipt.changes.map(change => same(readPath(actor, change.path), change.after)
    ? `Restore ${change.path} to ${change.beforePresent ? JSON.stringify(change.before) : "its prior absence"}.`
    : `Preserve ${change.path}: changed after this Guard change.`);
  for (const item of list(actor.items).filter(item => flag(item, "guardChange")?.receiptId === id)) {
    lines.push(Object.hasOwn(receipt.items, item.id) && same(itemSnapshot(item), receipt.items[item.id])
      ? `Remove unchanged created Item: ${item.name} (${item.id}).`
      : `Preserve Item ${item.name}: edited after creation or its creation was not acknowledged.`);
  }
  return { lines: lines.length ? lines : ["No document changes remain to restore."], blocked: false };
}
export async function undoGuardChange(actor, id, { confirmed = false } = {}) {
  requireOwner(actor);
  need(validId(id), "Choose a valid Guard change receipt identifier.");
  need(confirmed === true, "Confirm the Guard change undo preview first.");
  return guardUses.serial(actor, async () => {
    const state = changeState(actor), receipt = state.undo.find(entry => entry.id === id);
    need(receipt, "This Guard change is no longer recorded.");
    if (receipt.status === "undone") return { already: true };
    const review = reviewGuardChange(actor, id);
    need(!review.blocked, review.lines.join(" "));
    receipt.status = "undoing";
    await actor.update({ [`flags.ak5e.${CHANGE_FLAG}`]: state });
    for (const item of list(actor.items).filter(item => flag(item, "guardChange")?.receiptId === id)) {
      if (Object.hasOwn(receipt.items, item.id) && same(itemSnapshot(item), receipt.items[item.id])) await item.delete();
    }
    const restore = {};
    for (const change of receipt.changes) if (same(readPath(actor, change.path), change.after)) {
      restore[change.beforePresent ? change.path : deletePath(change.path)] = change.beforePresent ? change.before : null;
    }
    pruneAbsentContainers(actor, receipt, restore);
    receipt.status = "undone"; receipt.undoNotes = review.lines;
    await actor.update({ ...restore, [`flags.ak5e.${CHANGE_FLAG}`]: state });
    await changeCard(actor, receipt, true);
    return { undone: id, notes: review.lines };
  });
}

/** Adapter exposes the same read-only list/review interface as gameplay-use undo. */
export const guardChanges = {
  ns: CHANGE_FLAG, label: "Guard setup / progression", cardFlag: "guardChangeCard",
  receipt: (actor, id) => changeState(actor).undo.find(receipt => receipt.id === id) ?? null,
  uses: actor => changeState(actor).undo.map(receipt => ({ ...receipt, locked: isLocked(receipt) })),
  previewUndo: reviewGuardChange,
  command: async (actor, command, data) => {
    need(command === "undoUse", "Unknown Guard change command.");
    return undoGuardChange(actor, data?.useId, { confirmed: true });
  }
};
export const undoGuardSetup = undoGuardChange;
