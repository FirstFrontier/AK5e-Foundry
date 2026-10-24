/**
 * Supporter Arts setup (Ch.3 Hexer Arts Casting L7254-7279, Hexer Arts Pools L7281; head ruling R8).
 * - SUPPORTER_ARTS_TABLES is keyed by branch. Only the Hexer is listed: the Ritualist and Summoner tables print extra
 *   columns (Arts Known; Sparks of Creation), so they are not identical to it and are left out until ruled.
 * - The Arts granted are the members of the chosen Standard Arts Pool(s) of 5th Level or less (Cantrips included),
 *   resolved by resolvePoolArtData. Nothing is invented: a member without an AK5e record or GM mapping is reported
 *   as missing and not granted. Granted Arts are always Prepared and tagged flags.ak5e.supporterArts = {branch, pool}.
 * - Writes happen only in applySupporterArts (confirmed) or through the play-uses engine (hexer-arts.mjs), which
 *   records the flag changes and the created and removed Items so the setup can be undone.
 */
import { standardPools } from "./caster-rules.mjs";
import { resolvePoolArtData } from "./caster-setup.mjs";
import { castingConfig } from "./arts-rules.mjs";
import { supporterUses } from "./supporter-uses.mjs";
import { supporterProfile, supporterLevel, flag, pbForLevel } from "./supporter-rules.mjs";
import { need, values, esc } from "./operation-kernel.mjs";

const row = (maxArtLevel, artsPoints) => Object.freeze({ maxArtLevel, artsPoints });

/** Hexer Arts Casting (C3:7254-7279), checked row by row against the source. Keyed by Supporter level. */
export const SUPPORTER_ARTS_TABLES = Object.freeze({
  hexer: Object.freeze({
    1: row(1, 3), 2: row(1, 3), 3: row(1, 4), 4: row(1, 4),
    5: row(2, 6), 6: row(2, 6), 7: row(2, 7), 8: row(2, 7),
    9: row(3, 10), 10: row(3, 10), 11: row(3, 11), 12: row(3, 11),
    13: row(4, 12), 14: row(4, 12), 15: row(4, 15), 16: row(4, 15),
    17: row(5, 16), 18: row(5, 16), 19: row(5, 17), 20: row(5, 17)
  })
});

export const SUPPORTER_ARTS_ABILITIES = Object.freeze(["int", "wis", "cha"]);
/** A second Standard Arts Pool may be chosen from this Supporter level (Hexer Arts Pools, L7281). */
export const SECOND_POOL_LEVEL = 11;
/** Arts granted from a pool: every Art of this level or less, plus its Cantrips. */
export const MAX_GRANT_LEVEL = 5;
const BRANCH_LABEL = Object.freeze({ hexer: "Hexer Arts" });
const ABILITY_LABEL = Object.freeze({ int: "Intelligence", wis: "Wisdom", cha: "Charisma" });
const POOLS = new Map(standardPools.map(pool => [pool.id, pool]));

const nameKey = name => String(name ?? "").replace(/\*+$/, "").toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
const stripStar = name => String(name ?? "").replace(/\*+$/, "").trim();
const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;
const branchLabel = branch => BRANCH_LABEL[branch] ?? `${branch} Arts`;

/** The table row for a branch and Supporter level (1 to 20). Throws for an unknown branch or level. */
export function supporterArtsRow(branch, level) {
  const table = SUPPORTER_ARTS_TABLES[branch];
  need(table, `No Supporter Arts table for branch ${branch}.`);
  const lvl = Number(level);
  need(Number.isInteger(lvl) && lvl >= 1 && lvl <= 20, "Supporter level must be an integer from 1 to 20.");
  return { level: lvl, ...table[lvl] };
}

/** Standard Arts Pools the Supporter may hold: 1, or 2 from 11th Level. */
export function supporterArtsPoolCount(branch, level) {
  supporterArtsRow(branch, level);
  return Number(level) >= SECOND_POOL_LEVEL ? 2 : 1;
}

/** Spell Save DC of the Arts casting ability: 8 + Proficiency Bonus + that ability's modifier. Null until an ability is chosen. */
export function supporterSpellSaveDC(actor) {
  const ability = flag(actor, "casting")?.ability;
  if (!SUPPORTER_ARTS_ABILITIES.includes(ability)) return null;
  const mod = Number(actor?.system?.abilities?.[ability]?.mod ?? 0);
  const prof = Number(actor?.system?.attributes?.prof);
  const pb = Number.isFinite(prof) ? prof : pbForLevel(supporterLevel(actor) ?? 1);
  return 8 + pb + mod;
}

/** Members of a Standard Arts Pool that this setup may grant (5th Level or less, Cantrips included), by name. */
export function supporterArtsMembers(poolId) {
  const pool = POOLS.get(poolId);
  need(pool, `Unknown Standard Arts Pool ${poolId}.`);
  return pool.members.filter(member => Number(member.level) <= MAX_GRANT_LEVEL).map(member => ({ name: stripStar(member.name), level: Number(member.level), poolId }));
}

/** Sync part of the setup plan: no resolution, so it can run inside the synchronous play-uses plan step. */
export function supporterArtsSyncPlan(actor, { branch, ability, poolIds = [] } = {}) {
  need(typeof branch === "string" && SUPPORTER_ARTS_TABLES[branch], "Choose a supported Supporter branch.");
  const level = supporterProfile(actor).level;
  need(level !== null, "Set up the Supporter class (levels 1 to 20) first.");
  const row0 = supporterArtsRow(branch, level), poolCount = supporterArtsPoolCount(branch, level);
  const casting = flag(actor, "casting") ?? {}, stored = flag(actor, "artsPoints") ?? null, setup = flag(actor, "supporterArtsSetup") ?? null;
  const chosen = ability === undefined ? casting.ability : ability;
  const abilityKey = SUPPORTER_ARTS_ABILITIES.includes(chosen) ? chosen : null;
  const pools = [...poolIds];
  need(new Set(pools).size === pools.length, "Choose two different Standard Arts Pools.");
  for (const id of pools) need(POOLS.has(id), `Unknown Standard Arts Pool ${id}.`);

  const warnings = [], pending = [];
  const add = (id, text) => warnings.push({ id, text });
  if (!abilityKey) pending.push("ability");
  if (!pools.length) pending.push("pool");
  if (pools.length > poolCount) add("pool-count", `${branchLabel(branch)}: a second Standard Arts Pool is chosen at ${SECOND_POOL_LEVEL}th Level; this is a table decision.`);
  if (pools.length && pools.length < poolCount) add("second-pool", `At ${SECOND_POOL_LEVEL}th Level you may choose an additional Standard Arts Pool. None is chosen yet; the first pool is applied now.`);

  // Desired Arts by name, first pool wins for a name in two pools.
  const desired = new Map();
  for (const poolId of pools) for (const member of supporterArtsMembers(poolId)) {
    if (!desired.has(nameKey(member.name))) desired.set(nameKey(member.name), member);
  }
  const owned = values(actor.items).filter(item => item.type === "spell");
  const ownedKeys = new Set(owned.map(item => nameKey(item.name)));
  const removeItems = owned.filter(item => flag(item, "supporterArts")?.branch === branch && !desired.has(nameKey(item.name)));
  const existing = [...desired.values()].filter(entry => ownedKeys.has(nameKey(entry.name))).map(entry => entry.name);
  const candidates = [...desired.values()].filter(entry => !ownedKeys.has(nameKey(entry.name)));

  if (removeItems.length) add("remove", `Changing the Standard Arts Pools removes ${plural(removeItems.length, "Art")} granted by the previous setup: ${removeItems.map(item => item.name).join(", ")}. Other Arts stay.`);
  if (setup?.ability && abilityKey && setup.ability !== abilityKey) add("ability-change", "The casting ability was chosen when you gained this Feature; changing it is a table decision.");
  if (stored && abilityKey && Number(stored.value) > row0.artsPoints) add("ap-over", `Current AP (${stored.value}) is above the new maximum (${row0.artsPoints}); it is kept (over-maximum AP is spent normally).`);

  const actorUpdates = abilityKey ? {
    "flags.ak5e.casting": castingConfig({ ability: abilityKey, enabled: true }, casting),
    "flags.ak5e.artsPoints": {
      ...(stored ?? {}), maximum: row0.artsPoints, maximumArtLevel: row0.maxArtLevel,
      value: stored ? Number(stored.value) || 0 : row0.artsPoints, ninthLevelCast: stored?.ninthLevelCast === true
    },
    "flags.ak5e.supporterArtsSetup": { version: 1, branch, level, ability: abilityKey, pools: [...pools] }
  } : null;

  return {
    branch, level, row: row0, poolCount, ability: abilityKey, poolIds: pools, pending, warnings,
    candidates, existing, removeItems, actor: actorUpdates
  };
}

/**
 * Read-only preview of the Supporter Arts setup: resolves each candidate Art (never invented) and returns what would be
 * created, removed and reported missing. Writes nothing. `contextKey` identifies this exact preview for a later apply.
 */
export async function previewSupporterArts(actor, options = {}) {
  need(actor?.isOwner && !actor.pack, "Choose an owned Supporter.");
  const sync = supporterArtsSyncPlan(actor, options);
  const creates = [], missing = [];
  for (const entry of sync.candidates) {
    const data = await resolvePoolArtData(entry.name, entry.level, [entry.poolId]);
    if (!data) { missing.push({ name: entry.name, level: entry.level, poolId: entry.poolId }); continue; }
    creates.push(grantData(data, sync, entry));
  }
  const warnings = [...sync.warnings];
  if (missing.length) warnings.push({ id: "mapping", text: `${plural(missing.length, "Art")} need a GM-approved spell mapping before they can be granted: ${missing.map(entry => entry.name).join(", ")}.` });
  const plan = { ...sync, warnings, creates, missing, granted: creates.map(data => data.name) };
  plan.contextKey = JSON.stringify([sync.branch, sync.level, sync.ability, sync.poolIds, plan.granted, sync.existing,
    sync.removeItems.map(item => item.id), flag(actor, "artsPoints")?.maximum ?? null]);
  return plan;
}

function grantData(data, sync, entry) {
  return {
    ...data,
    system: { ...data.system, prepared: 2, method: "ak5e", ability: sync.ability ?? "" },
    flags: { ...data.flags, ak5e: { ...data.flags?.ak5e, supporterArts: { branch: sync.branch, pool: entry.poolId } } }
  };
}

/**
 * Item writes for a setup: creates the granted Arts not yet owned and deletes the given Item ids. Idempotent: an Art
 * whose name is already owned as a spell is never created again. Returns what was actually written (for undo).
 */
export async function writeArtItems(actor, { creates = [], removeIds = [], snapshots = [] } = {}) {
  const ownedKeys = new Set(values(actor.items).filter(item => item.type === "spell").map(item => nameKey(item.name)));
  const toCreate = creates.filter(data => !ownedKeys.has(nameKey(data.name)));
  const toRemove = removeIds.filter(id => actor.items.get(id));
  const removed = snapshots.filter(snapshot => toRemove.includes(snapshot._id));
  if (toRemove.length) await actor.deleteEmbeddedDocuments("Item", toRemove);
  const created = toCreate.length ? await actor.createEmbeddedDocuments("Item", toCreate) : [];
  return { createdIds: created.map(doc => doc.id), removed };
}

/** Undo of writeArtItems: deletes the Arts it created and recreates the Arts it removed (same ids). */
export async function revertArtItems(actor, applied = {}) {
  const createdIds = (applied.createdIds ?? []).filter(id => actor.items.get(id));
  if (createdIds.length) await actor.deleteEmbeddedDocuments("Item", createdIds);
  const restore = (applied.removed ?? []).filter(snapshot => !actor.items.get(snapshot._id));
  if (restore.length) await actor.createEmbeddedDocuments("Item", restore.map(snapshot => structuredClone(snapshot)));
  return { removed: createdIds.length, restored: restore.length };
}

/** Direct (non-engine) apply. Requires `confirmed: true`; cancelling never reaches this function. */
export async function applySupporterArts(actor, { branch, ability, poolIds = [], confirmed, contextKey } = {}) {
  need(confirmed === true, "Confirm the previewed Supporter Arts setup first.");
  const plan = await previewSupporterArts(actor, { branch, ability, poolIds });
  need(!plan.pending.length, plan.pending.includes("ability") ? "Choose Intelligence, Wisdom or Charisma as your spellcasting ability." : "Choose a Standard Arts Pool.");
  need(contextKey === undefined || plan.contextKey === contextKey, "The character changed since the preview; preview the Supporter Arts setup again.");
  await actor.update(plan.actor);
  const written = await writeArtItems(actor, { creates: plan.creates, removeIds: plan.removeItems.map(item => item.id),
    snapshots: plan.removeItems.map(item => item.toObject()) });
  return {
    granted: plan.granted, removed: written.removed.map(snapshot => snapshot.name), missing: plan.missing.map(entry => entry.name),
    warnings: plan.warnings, table: plan.row, createdIds: written.createdIds
  };
}

/**
 * Re-applies the table when the Supporter level changes: raises or lowers the AP maximum and maximum Art level. It never
 * grants a new pool; at 11th Level with one pool it posts a whispered prompt instead. Does nothing before a setup exists.
 */
export async function syncSupporterArts(actor, branch) {
  const setup = flag(actor, "supporterArtsSetup");
  if (!setup || setup.branch !== branch) return { changed: false, reason: "not-configured" };
  const level = supporterLevel(actor);
  if (level === null) return { changed: false, reason: "no-level" };
  const row0 = supporterArtsRow(branch, level), allowed = supporterArtsPoolCount(branch, level);
  const ap = flag(actor, "artsPoints") ?? {}, pools = setup.pools ?? [];
  const updates = {};
  if (Number(ap.maximum) !== row0.artsPoints) updates["flags.ak5e.artsPoints.maximum"] = row0.artsPoints;
  if (Number(ap.maximumArtLevel) !== row0.maxArtLevel) updates["flags.ak5e.artsPoints.maximumArtLevel"] = row0.maxArtLevel;
  if (setup.level !== level) updates["flags.ak5e.supporterArtsSetup.level"] = level;
  const prompted = level >= SECOND_POOL_LEVEL && Number(setup.level ?? 0) < SECOND_POOL_LEVEL && pools.length < allowed;
  if (Object.keys(updates).length) await actor.update(updates);
  if (prompted) await postSecondPoolPrompt(actor, branch);
  const warnings = pools.length > allowed
    ? [`${plural(pools.length, "Standard Arts Pool")} recorded below ${SECOND_POOL_LEVEL}th Level; this sync removes nothing, and the GM decides whether the second pool stays.`] : [];
  return { changed: Object.keys(updates).length > 0, level, maximum: row0.artsPoints, maximumArtLevel: row0.maxArtLevel,
    secondPoolAvailable: pools.length < allowed, prompted, warnings, updates };
}

async function postSecondPoolPrompt(actor, branch) {
  const ids = values(game.users).filter(user => user.isGM || actor.testUserPermission?.(user, "OWNER")).map(user => user.id);
  await ChatMessage.implementation.create({ whisper: ids, speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content: `<h3>${esc(branchLabel(branch))}</h3><p>${esc(actor.name)} reached ${SECOND_POOL_LEVEL}th Level: you may choose an additional Standard Arts Pool. `
      + `Open the Supporter controls and choose Configure ${esc(branchLabel(branch))} (nothing is granted automatically).</p>` });
}

const KIND = Object.freeze({
  local: true,
  documentName: "Actor",
  async apply(_source, _useId, entry, target) {
    return writeArtItems(target, { creates: entry.creates ?? [], removeIds: entry.removeIds ?? [], snapshots: entry.snapshots ?? [] });
  },
  async revert(_source, _useId, entry, target) {
    return revertArtItems(target, entry.applied ?? {});
  },
  preview(_source, _receipt, entry) {
    const applied = entry.applied ?? {};
    return `${entry.name}: removes the ${applied.createdIds?.length ?? 0} Arts this setup created and restores the ${applied.removed?.length ?? 0} it removed.`;
  }
});
let kindRegistered = false;
/** Registers the `supporterArts` target kind with the Supporter play-uses engine (idempotent). */
export function registerSupporterArtsKind() {
  if (kindRegistered) return;
  kindRegistered = true;
  supporterUses.register({ targetKinds: { supporterArts: KIND } });
}
