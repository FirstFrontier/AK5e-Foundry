/**
 * Hexer Supporter branch (Ch. 3 L7223-7330; DECISIONS.md rulings R8 and R9).
 *
 * Potent Hex (L7287), Cursemark (L7302), Controlled Cruelty (L7307), Gospel of Curses (L7318) and
 * The Ultimate Hex (L7325). Every Hex is an Active Effect on the TARGET carrying `flags.ak5e.hex`.
 * Dice are never rolled automatically: each roll is a button that the owner clicks (WORKFLOW §3.2).
 *
 * Mechanics that are effects: Binding (speed), Wasting (ability check and save bonuses).
 * Mechanics that are buttons: Voicethief saves, the Force rider, Rupturing and the death burst, and every roll.
 * Mechanics that are reminders or flags only: Abjuring (damage roll), Breaking (DR is not a stored key),
 * Looping (Concentration limit), Voicethief's Silenced state.
 */
import { isHexer, supporterLevel, pbForLevel, aidDieSize, flag, aidAbilityKey } from "./supporter-rules.mjs";
import { definePool, getPoolDefinition, getPool } from "./resource-pools.mjs";
import { need, values, esc } from "./operation-kernel.mjs";
import { warn, spendResource } from "./play-uses.mjs";
import { supporterUses } from "./supporter-uses.mjs";
import { actorFromUuid, rollAidDieButton } from "./supporter-features.mjs";
import { onAk5eEvent } from "./trigger-events.mjs";
import { confirmPlayUse } from "./play-uses-sheet.mjs";

export const HEX_KINDS = Object.freeze(["abjuring", "binding", "breaking", "looping", "voicethief", "wasting"]);
export const HEX_LABELS = Object.freeze({
  abjuring: "Abjuring Hex", binding: "Binding Hex", breaking: "Breaking Hex",
  looping: "Looping Hex", voicethief: "Voicethief Hex", wasting: "Wasting Hex"
});
/** Level-13 options (Gospel of Curses). */
const GOSPEL_KINDS = Object.freeze(["voicethief", "wasting"]);
export const ABILITY_KEYS = Object.freeze(["str", "dex", "con", "int", "wis", "cha"]);
export const HEXER_GATES = Object.freeze({ cursemark: 4, controlledCruelty: 10, gospel: 13, ultimate: 17 });
export const HEX_DURATION_SECONDS = 60;
export const CURSEMARK_RANGE_FT = 100;
export const CURSEMARK_RADIUS_FT = 10;
const RUPTURE_RADIUS_FT = 5;
const DEATH_BURST_RADIUS_FT = 15;
const EMPATHIC_PAIN_RADIUS_FT = 30;
const HEX_FLAG = "hex";
const USE_FLAG = "hexUse";
const HEXER_FLAG = "hexer";
const HEX_EFFECT_KIND = "hexEffect";
let hooksInstalled = false;

/* -------------------------------------------------------------- pure helpers */

const worldTime = () => Number(globalThis.game?.time?.worldTime ?? 0);
const sidesFor = level => Number(aidDieSize(level).slice(1));
const roundToFive = value => Math.round(Number(value) / 5) * 5;
const levelOf = actor => supporterLevel(actor) ?? 1;
const hexerState = actor => flag(actor, HEXER_FLAG) ?? {};
const uuidKey = uuid => String(uuid).replaceAll(".", "%2E");

/** The Hex flags on a creature, live (not past their expiry). Each has `effectId`. */
export function hexesOn(target) {
  const now = worldTime();
  return values(target?.effects)
    .map(effect => ({ effect, hex: flag(effect, HEX_FLAG) }))
    .filter(({ hex }) => hex && typeof hex === "object" && !(Number.isFinite(Number(hex.expires)) && Number(hex.expires) <= now))
    .map(({ effect, hex }) => ({ effectId: effect.id, ...hex }));
}

export const isHexed = target => hexesOn(target).length > 0;

/** Spell Save DC of a Hexer: 8 + PB + the modifier of the Arts casting ability (flags.ak5e.casting.ability, else Charisma). */
export function hexerSpellSaveDC(actor) {
  const chosen = flag(actor, "casting")?.ability;
  const ability = ABILITY_KEYS.includes(chosen) ? chosen : "cha";
  const mod = Number(actor?.system?.abilities?.[ability]?.mod ?? 0);
  return 8 + pbForLevel(levelOf(actor)) + (Number.isFinite(mod) ? mod : 0);
}

/**
 * Speed, ability and DR changes a Hex makes, from its rolled value. Binding floors the reduction at the
 * creature's current Speed. Breaking has no stored DR key, so it is a reminder and a flag only.
 */
export function hexChanges(kind, { roll = null, ability = null, walk = undefined, sides = 8 } = {}) {
  if (kind === "binding") {
    const wanted = roll === null ? 0 : roundToFive(roll);
    const applied = Number.isFinite(Number(walk)) ? Math.max(0, Math.min(wanted, Number(walk))) : wanted;
    return { changes: applied > 0 ? [{ key: "system.attributes.movement.walk", mode: 2, value: String(-applied) }] : [],
      speedReduction: applied, wanted, reminder: null };
  }
  if (kind === "wasting" && ABILITY_KEYS.includes(ability) && roll !== null) {
    const penalty = `${-Number(roll)}`;
    return { changes: [
      { key: `system.abilities.${ability}.bonuses.check`, mode: 2, value: penalty },
      { key: `system.abilities.${ability}.bonuses.save`, mode: 2, value: penalty }
    ], penalty: Number(roll), reminder: null };
  }
  if (kind === "breaking") {
    return { changes: [], breakingReduction: roll, reminder: `Damage Reduction is reduced by ${roll ?? `1d${sides}`}; DR is applied by hand (no DR key is stored).` };
  }
  if (kind === "abjuring") {
    return { changes: [], reminder: `When this creature makes a Damage Roll, it also rolls 1d${sides} and subtracts half (rounded down) from that Damage, to a minimum of 1. Apply this by hand on its damage card.` };
  }
  if (kind === "looping") {
    return { changes: [], reminder: "While this creature stays Hexed, your Arts that need Concentration on it do not count toward your Concentration limit. Track this by hand." };
  }
  if (kind === "voicethief") {
    return { changes: [], reminder: "Silenced until the end of its next Turn unless it saves (INT save vs your Spell Save DC), repeated at the start of each of its Turns." };
  }
  return { changes: [], reminder: null };
}

/** Roll made at application (R9): Binding 2 Aid Die rolls, Breaking and Wasting 1 roll. Abjuring rolls on each Damage Roll. */
export function hexRollFormula(kind, sides) {
  if (kind === "binding") return `2d${sides}`;
  if (kind === "breaking" || kind === "wasting") return `1d${sides}`;
  return null;
}

/* -------------------------------------------------------------- warnings */

const levelWarning = (warnings, actor, required, name) => {
  const current = levelOf(actor);
  if (current < required) warn(warnings, "level", `${name} is a Supporter level ${required} feature; this character is level ${current}.`);
};

/* -------------------------------------------------------------- pools */

/** Potent Hex uses (PB per Long Rest) and the once-per-Long-Rest Ultimate Hex. Idempotent. */
export function defineHexerPools() {
  if (!getPoolDefinition("hexerPotentHex")) {
    definePool({
      id: "hexerPotentHex", label: "Potent Hex uses", max: "@attributes.prof", initial: "max",
      appliesTo: isHexer, recovery: [{ on: "lr", amount: "full" }]
    });
  }
  if (!getPoolDefinition("hexerUltimateHex")) {
    definePool({
      id: "hexerUltimateHex", label: "Ultimate Hex", max: 1, initial: "max",
      appliesTo: isHexer, recovery: [{ on: "lr", amount: "full" }]
    });
  }
}

/* -------------------------------------------------------------- target kind */

const snapshotOf = effect => {
  const data = typeof effect.toObject === "function" ? effect.toObject() : {
    name: effect.name, icon: effect.icon, origin: effect.origin, changes: effect.changes, duration: effect.duration,
    description: effect.description, statuses: effect.statuses, disabled: effect.disabled, flags: effect.flags
  };
  const copy = structuredClone(data);
  delete copy._id;
  return copy;
};

/**
 * The Hex Active Effect on a creature. Applied through the play-uses engine, so a creature the user does
 * not own is changed by the GM's client (validateTarget below). Undo deletes the Hex and restores any
 * Hex of the same kind that a re-application replaced (kept on the new effect, not in the receipt).
 */
const HEX_TARGET_KIND = {
  async apply(source, useId, entry, target) {
    const done = values(target.effects).some(effect => flag(effect, USE_FLAG)?.opId === useId && flag(effect, USE_FLAG)?.sourceUuid === source.uuid);
    if (done) return true;
    const replaced = values(target.effects).filter(effect => {
      const hex = flag(effect, HEX_FLAG);
      return hex?.source === source.uuid && hex?.kind === entry.hexKind;
    });
    const snapshots = replaced.map(snapshotOf);
    if (replaced.length) await target.deleteEmbeddedDocuments("ActiveEffect", replaced.map(effect => effect.id));
    const walk = Number(target.system?.attributes?.movement?.walk);
    const sides = entry.sides ?? 8;
    const built = hexChanges(entry.hexKind, { roll: entry.roll ?? null, ability: entry.ability ?? null, walk: Number.isFinite(walk) ? walk : undefined, sides });
    const now = worldTime();
    const label = HEX_LABELS[entry.hexKind];
    await target.createEmbeddedDocuments("ActiveEffect", [{
      name: `AK5e Hex: ${label}`,
      icon: "icons/magic/unholy/strike-body-explode-red.webp",
      origin: source.uuid,
      changes: built.changes,
      duration: { seconds: HEX_DURATION_SECONDS, startTime: now },
      description: `<p>${esc(label)} from ${esc(source.name)}.</p><p>${esc(built.reminder ?? "")}</p>`,
      flags: { ak5e: {
        [HEX_FLAG]: {
          source: source.uuid, kind: entry.hexKind, ultimate: entry.ultimate === true,
          roll: entry.roll ?? null, ability: entry.ability ?? null, expires: now + HEX_DURATION_SECONDS,
          formula: entry.formula ?? null, ...(built.speedReduction !== undefined ? { speedReduction: built.speedReduction } : {}),
          ...(built.penalty !== undefined ? { penalty: built.penalty } : {}),
          ...(built.breakingReduction !== undefined ? { breakingReduction: built.breakingReduction } : {})
        },
        [USE_FLAG]: { opId: useId, sourceUuid: source.uuid, replaced: snapshots }
      } }
    }]);
    return true;
  },
  async revert(source, useId, _entry, target) {
    const mine = values(target.effects).filter(effect => flag(effect, USE_FLAG)?.opId === useId && flag(effect, USE_FLAG)?.sourceUuid === source.uuid);
    const restore = mine.flatMap(effect => flag(effect, USE_FLAG)?.replaced ?? []);
    if (mine.length) await target.deleteEmbeddedDocuments("ActiveEffect", mine.map(effect => effect.id));
    if (restore.length) await target.createEmbeddedDocuments("ActiveEffect", restore);
    return { removed: mine.length, restored: restore.length };
  },
  rolled(entry, total) { entry.roll = Number(total); },
  rollText(entry) {
    const label = HEX_LABELS[entry.hexKind] ?? "Hex";
    const detail = entry.hexKind === "binding" ? `Speed reduced by ${roundToFive(entry.roll)} ft (rolled ${entry.roll}; floored at 0 on the creature).`
      : entry.hexKind === "breaking" ? `DR reduced by ${entry.roll}: apply by hand (no DR key is stored).`
        : entry.hexKind === "wasting" ? `${String(entry.ability).toUpperCase()} checks and saves take a -${entry.roll} penalty.`
          : "";
    return `${entry.name}: ${label} applied. ${detail}`.trim();
  },
  preview(_source, receipt, entry, target) {
    const mine = values(target?.effects).some(effect => flag(effect, USE_FLAG)?.opId === receipt.id);
    return mine ? `${entry.name}: removes the ${HEX_LABELS[entry.hexKind]}.` : `${entry.name}: the ${HEX_LABELS[entry.hexKind]} is already gone.`;
  }
};

supporterUses.register({ targetKinds: { [HEX_EFFECT_KIND]: HEX_TARGET_KIND } });

/** The GM relay may apply only a Hex the Hexer's receipt recorded for this creature (R-relay, WORKFLOW §3.2). */
const relayable = (_source, receipt, entry, target) => entry.kind === HEX_EFFECT_KIND && target?.uuid === entry.uuid
  && entry.hexKind === receipt.result?.kind && entry.ultimate === (receipt.result?.ultimate === true);

/* -------------------------------------------------------------- plans */

/**
 * One Hex on one creature. Spends from `poolId` when `spend` is true. Warns, never blocks: a duplicate Hex,
 * an overlap with the Ultimate Hex, an empty pool, or a level gate. Cursemark passes `sides: 6` and
 * `cursemarkId`; Ultimate passes `ultimate: true`.
 */
function planHex(actor, data, { title, poolId = "hexerPotentHex", spend = true, sides, ultimate = false, cursemarkId = null,
  extraUpdates = null, levelGate = null } = {}) {
  need(isHexer(actor), "Hexer Hexes require the Hexer branch.");
  const kind = String(data.kind ?? "");
  need(HEX_KINDS.includes(kind), `Choose a Hex: ${HEX_KINDS.join(", ")}.`);
  const target = data.target ?? actorFromUuid(data.targetUuid ?? null);
  need(target?.uuid, "Choose a target creature for this Hex.");
  const ability = kind === "wasting" ? String(data.ability ?? "") : null;
  need(kind !== "wasting" || ABILITY_KEYS.includes(ability), "A Wasting Hex needs the ability it applies to.");
  const warnings = [];
  const level = levelOf(actor);
  if (GOSPEL_KINDS.includes(kind)) levelWarning(warnings, actor, HEXER_GATES.gospel, "Gospel of Curses (Voicethief and Wasting Hexes)");
  if (ultimate) levelWarning(warnings, actor, HEXER_GATES.ultimate, "The Ultimate Hex");
  if (levelGate) levelWarning(warnings, actor, levelGate.level, levelGate.name);
  if (target.uuid === actor.uuid) warn(warnings, "selfTarget", "A Hex is for another Creature; you cannot Hex yourself.");
  const current = hexesOn(target).filter(hex => hex.source === actor.uuid);
  if (current.some(hex => hex.kind === kind)) {
    warn(warnings, "duplicate", `${target.name} already has the ${HEX_LABELS[kind]} from you; using it anyway replaces it.`);
  }
  if (!ultimate && current.some(hex => hex.ultimate)) {
    warn(warnings, "ultimateOverlap", `${target.name} already has your Ultimate Hex; Potent Hex options are not cumulative with it.`);
  }
  if (ultimate && current.some(hex => !hex.ultimate)) {
    warn(warnings, "potentOverlap", `${target.name} already has a Potent Hex from you; the Ultimate Hex is not cumulative with it.`);
  }
  const sidesUsed = sides ?? sidesFor(level);
  if (spend && getPool(actor, poolId).value < 1) {
    warn(warnings, "shortfall", `${getPool(actor, poolId).label} is empty (0 remaining).`);
  }
  const roll = hexRollFormula(kind, sidesUsed);
  const stored = kind === "abjuring" ? `1d${sidesUsed}` : roll;
  const label = HEX_LABELS[kind];
  return {
    title: `${title ?? label} -> ${target.name}`,
    warnings,
    apply(state, receipt) {
      const updates = spend ? spendResource(actor, receipt, { pool: poolId, amount: 1, label: getPool(actor, poolId).label }) : {};
      Object.assign(updates, extraUpdates?.(state, receipt) ?? {});
      receipt.targets = [{
        uuid: target.uuid, name: target.name, kind: HEX_EFFECT_KIND, hexKind: kind, ultimate, ability,
        sides: sidesUsed, formula: stored, roll: null, cursemarkId, ready: !roll
      }];
      receipt.result = { kind, ultimate, ability, formula: stored, targetUuid: target.uuid, targetName: target.name, sides: sidesUsed, cursemarkId };
      const detail = hexChanges(kind, { sides: sidesUsed }).reminder ?? "";
      receipt.html = true;
      if (roll) {
        receipt.formula = roll;
        receipt.rollLabel = `${label} (${roll})`;
        const card = rollAidDieButton({ actor, label: `Roll ${label} (${roll})`, formula: roll, rollType: "hex" });
        receipt.summary = `${esc(actor.name)} applied the ${esc(label)} to ${esc(target.name)} for 1 minute.${card}`;
      } else {
        receipt.summary = `${esc(actor.name)} applied the ${esc(label)} to ${esc(target.name)} for 1 minute. ${esc(detail)}`;
      }
      if (kind === "voicethief") receipt.summary += saveButtonHtml(target, "int", hexerSpellSaveDC(actor));
      return updates;
    }
  };
}

/** Potent Hex (L7287): one Hex on one creature, PB uses per Long Rest. Warns, never auto-applies. */
function potentHexPlan(actor, state, data) {
  return planHex(actor, data, { title: "Potent Hex" });
}
potentHexPlan.validateTarget = relayable;

/**
 * Cursemark (L7302): a Bonus Action that spends one Potent Hex use and places a point. Creatures within 10 ft of the
 * point take the chosen Hex for a minute with the Aid Die as a d6. The point is recorded on the Hexer (undoable).
 * `primary: false` applies the same Cursemark to another creature in the area without spending a second use.
 */
function cursemarkPlan(actor, state, data) {
  need(isHexer(actor), "Cursemark requires the Hexer branch.");
  const pointDistance = Number(data.pointDistance ?? 0);
  const excluded = Array.isArray(data.excluded) ? data.excluded.filter(uuid => typeof uuid === "string") : [];
  const markId = String(data.markId ?? "");
  need(/^[A-Za-z0-9_-]{1,60}$/.test(markId), "A Cursemark needs a stable mark ID.");
  const point = data.point ?? null;
  const primary = data.primary !== false;
  const placed = (hexerState(actor).cursemarks ?? []).some(mark => mark.id === markId);
  if (primary && !placed) {
    need(point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y)) && point.sceneId, "Choose the Cursemark point on a scene.");
  }
  const plan = planHex(actor, data, {
    title: "Cursemark", sides: 6, spend: primary, cursemarkId: markId,
    levelGate: { level: HEXER_GATES.cursemark, name: "Cursemark" },
    extraUpdates: () => {
      if (!primary || (hexerState(actor).cursemarks ?? []).some(mark => mark.id === markId)) return {};
      const record = { id: markId, point: { x: Number(point.x), y: Number(point.y), sceneId: String(point.sceneId) }, kind: data.kind,
        radius: CURSEMARK_RADIUS_FT, excluded: levelOf(actor) >= HEXER_GATES.controlledCruelty ? excluded : [],
        gridSize: Number(data.gridSize ?? 100), expires: worldTime() + HEX_DURATION_SECONDS };
      return { [`flags.ak5e.${HEXER_FLAG}.cursemarks`]: [...(hexerState(actor).cursemarks ?? []), record] };
    }
  });
  if (pointDistance > CURSEMARK_RANGE_FT) warn(plan.warnings, "range", `The Cursemark point is ${pointDistance} ft away; Cursemark reaches 100 ft.`);
  if (excluded.length && levelOf(actor) < HEXER_GATES.controlledCruelty) {
    warn(plan.warnings, "level", "Spare the Rod (Controlled Cruelty) is a Supporter level 10 feature; the exclusions are ignored.");
  }
  if (!primary && !(hexerState(actor).cursemarks ?? []).some(mark => mark.id === markId)) {
    throw new Error("Place the Cursemark before applying it to another creature.");
  }
  return plan;
}
cursemarkPlan.validateTarget = relayable;

/** The Ultimate Hex (L7325): once per Long Rest. Its first use spends the pool; further kinds are `ultimateHexPart` uses. */
function ultimateHexPlan(actor, state, data) {
  return planHex(actor, data, { title: "Ultimate Hex", poolId: "hexerUltimateHex", ultimate: true });
}
ultimateHexPlan.validateTarget = relayable;

/**
 * One further kind of the Ultimate Hex on the same creature. It spends nothing, but only follows a recorded
 * Ultimate Hex use (data.ultimateUseId) so it cannot be run on its own.
 */
function ultimateHexPartPlan(actor, state, data) {
  const parent = supporterUses.receipt(actor, String(data.ultimateUseId ?? ""));
  need(parent?.command === "ultimateHex" && parent.status !== "undone", "The Ultimate Hex must be applied first.");
  return planHex(actor, data, { title: "Ultimate Hex (part)", spend: false, ultimate: true });
}
ultimateHexPartPlan.validateTarget = relayable;

/**
 * Plan map for the head to compose into the Hexer branch definition. Every plan starts with need(isHexer(actor)).
 * Keys match the `supporterUses` plan names.
 */
export const hexerPlans = Object.freeze({
  potentHex: potentHexPlan,
  cursemark: cursemarkPlan,
  ultimateHex: ultimateHexPlan,
  ultimateHexPart: ultimateHexPartPlan
});

/* -------------------------------------------------------------- buttons and cards */

function saveButtonHtml(target, ability, dc) {
  return `<div class="ak5e-hexer-save"><p>${esc(target.name)}: ${esc(ability.toUpperCase())} save vs DC ${esc(dc)}.</p>`
    + `<button type="button" data-ak5e-hexer-save="${esc(ability)}" data-dc="${esc(dc)}" data-actor="${esc(target.uuid)}">Roll ${esc(ability.toUpperCase())} save (DC ${esc(dc)})</button></div>`;
}

/** A roll button for the Hexer's Force rider or burst. Nothing rolls until the owner clicks. */
export function hexerRollButton({ actor, label, formula, flavor = label }) {
  return `<div class="ak5e-hexer-roll"><p>${esc(formula)}</p><button type="button" data-ak5e-hexer-roll="${esc(formula)}" data-flavor="${esc(flavor)}" data-actor="${esc(actor.uuid)}">${esc(label)}</button></div>`;
}

/**
 * Hexer panel (Features tab). Buttons use data-supporter-cmd, dispatched by the sheet to hexerCommand().
 * Level-gated options show with their gate; they warn when used below the gate, never block.
 */
export function hexerPanel(actor) {
  if (!isHexer(actor)) return "";
  const potent = getPool(actor, "hexerPotentHex");
  const ultimate = getPool(actor, "hexerUltimateHex");
  const cmd = (name, label) => `<button type="button" data-supporter-cmd="${esc(name)}">${esc(label)}</button>`;
  const rows = [
    `<div class="ak5e-hexer-badges"><span class="ak5e-hexer-badge">Potent Hex: ${esc(potent.value)} / ${esc(potent.max)}</span>`
      + `<span class="ak5e-hexer-badge">Spell Save DC ${esc(hexerSpellSaveDC(actor))}</span></div>`,
    `<div class="ak5e-hexer-button-row">${cmd("potentHex", "Apply Potent Hex")}`
      + `${levelOf(actor) >= HEXER_GATES.cursemark ? cmd("cursemark", "Cursemark (Bonus Action)") : ""}`
      + `${levelOf(actor) >= HEXER_GATES.ultimate ? cmd("ultimateHex", `Ultimate Hex (${ultimate.value} / ${ultimate.max})`) : ""}</div>`
  ];
  return `<section class="ak5e-hexer-panel">${rows.join("")}</section>`;
}

/* -------------------------------------------------------------- commands (dialogs) */

async function pickHex(actor, title, kinds = HEX_KINDS) {
  const options = kinds.map(kind => `<option value="${esc(kind)}">${esc(HEX_LABELS[kind])}</option>`).join("");
  const abilities = ABILITY_KEYS.map(key => `<option value="${key}"${key === aidAbilityKey(actor) ? " selected" : ""}>${key.toUpperCase()}</option>`).join("");
  const picked = globalThis.game?.user?.targets?.first?.()?.actor?.name ?? "(target a creature first)";
  const content = `<div class="ak5e-hexer-pick"><p>Target: ${esc(picked)}</p>`
    + `<label>Hex <select name="kind">${options}</select></label>`
    + `<label>Ability (Wasting Hex only) <select name="ability">${abilities}</select></label></div>`;
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title }, position: { width: 420 }, rejectClose: false, content,
    buttons: [
      { action: "apply", label: "Confirm", default: true, callback: (_event, button) => ({ kind: button.form.elements.kind.value, ability: button.form.elements.ability.value }) },
      { action: "cancel", label: "Cancel", callback: () => null }
    ]
  });
  return result;
}

/** Confirmed Potent Hex: pick the Hex, then the usual warnings and the Hex on the chosen creature. */
export async function applyPotentHex(actor, { kind, ability, targetUuid } = {}) {
  const opId = foundry.utils.randomID();
  return confirmPlayUse("Potent Hex", extra => supporterUses.execute(actor, "potentHex", { targetUuid, kind, ability, ...extra }, opId));
}

/**
 * Panel commands. Each one confirms before any use; cancelling changes nothing.
 * cursemark: the point is the first targeted token on the canvas (the Hexer places it by targeting).
 */
export async function hexerCommand(actor, name) {
  need(isHexer(actor), "Hexer commands need the Hexer branch.");
  if (name === "potentHex") {
    const choice = await pickHex(actor, "Apply Potent Hex");
    if (!choice) return null;
    return applyPotentHex(actor, { ...choice, targetUuid: globalThis.game?.user?.targets?.first?.()?.actor?.uuid ?? null });
  }
  if (name === "ultimateHex") {
    const choice = await pickHex(actor, "Apply The Ultimate Hex (all Potent options and Rupturing)");
    if (!choice) return null;
    const targetUuid = globalThis.game?.user?.targets?.first?.()?.actor?.uuid ?? null;
    const opId = foundry.utils.randomID();
    const first = await confirmPlayUse("Ultimate Hex", extra => supporterUses.execute(actor, "ultimateHex", { targetUuid, kind: HEX_KINDS[0], ...extra }, opId));
    if (!first) return null;
    for (const kind of HEX_KINDS.slice(1)) {
      await confirmPlayUse("Ultimate Hex (part)", extra => supporterUses.execute(actor, "ultimateHexPart",
        { targetUuid, kind, ultimateUseId: opId, ...extra }, foundry.utils.randomID()));
    }
    return first;
  }
  if (name === "cursemark") {
    const choice = await pickHex(actor, "Cursemark (Bonus Action; spends one Potent Hex use)");
    if (!choice) return null;
    const token = globalThis.game?.user?.targets?.first?.() ?? null;
    need(token, "Target the token that marks the Cursemark point first.");
    const point = { x: token.center?.x ?? token.x, y: token.center?.y ?? token.y, sceneId: token.scene?.id ?? globalThis.canvas?.scene?.id };
    const gridSize = globalThis.canvas?.grid?.size ?? 100;
    const markId = foundry.utils.randomID();
    return confirmPlayUse("Cursemark", extra => supporterUses.execute(actor, "cursemark",
      { kind: choice.kind, ability: choice.ability, point, gridSize, markId, targetUuid: token.actor?.uuid ?? null, ...extra }, foundry.utils.randomID()));
  }
  throw new Error(`Unknown Hexer command ${name}.`);
}

/**
 * Cursemark area: the creatures within 10 ft of the mark (Spare the Rod exclusions removed). Pure: tokens are
 * { uuid, x, y, sceneId }. Distance uses 5 ft per grid cell (gridSize pixels per cell).
 */
export function cursemarkTargets(actor, markId, tokens = []) {
  const mark = (hexerState(actor).cursemarks ?? []).find(entry => entry.id === markId);
  if (!mark) return [];
  if (Number.isFinite(Number(mark.expires)) && Number(mark.expires) <= worldTime()) return [];
  const excluded = new Set(mark.excluded ?? []);
  const pixelsPerFoot = Number(mark.gridSize ?? 100) / 5;
  return tokens.filter(token => token?.uuid && token.uuid !== actor.uuid && !excluded.has(token.uuid)
    && token.sceneId === mark.point.sceneId
    && Math.hypot(Number(token.x) - mark.point.x, Number(token.y) - mark.point.y) / pixelsPerFoot <= (mark.radius ?? CURSEMARK_RADIUS_FT));
}

/* -------------------------------------------------------------- hooks and events */

/** Force rider (L7287 and L7325). The hit creature is the one hexed; the card goes to the Hexer's owner. */
async function handleHit(event) {
  const target = actorFromUuid(event?.targetUuid);
  if (!target) return;
  for (const hex of hexesOn(target)) {
    const hexer = actorFromUuid(hex.source);
    if (!hexer || !isHexer(hexer)) continue;
    if (hex.source !== hexer.uuid) continue;                    // only the Hexer whose Hex this is
    const used = hexerState(hexer).riderTaken ?? {};
    if (used[uuidKey(target.uuid)]) continue;                  // one card per hexed creature until the Hexer's next Turn
    const sides = sidesFor(levelOf(hexer));
    const rupture = hex.ultimate === true;
    const formula = `1d${sides}`;
    const text = rupture
      ? `Rupturing Hex: ${esc(target.name)} was hit. Instead of Force on ${esc(target.name)}, every hostile creature within ${RUPTURE_RADIUS_FT} ft takes Force damage equal to one roll of your Aid Die.`
      : `Hex rider: ${esc(target.name)} was hit. Force damage equal to one roll of your Aid Die is available now (use it once per turn cycle).`;
    const empathic = levelOf(hexer) >= HEXER_GATES.controlledCruelty && !rupture
      ? `<p>Empathic Pain: you may deal this Force to a different creature you can see within ${EMPATHIC_PAIN_RADIUS_FT} ft of ${esc(target.name)}.</p>` : "";
    const content = `<h3>Hex rider</h3><p>${text}</p>${empathic}${hexerRollButton({ actor: hexer, label: `Roll Force ${formula}`, formula, flavor: rupture ? "Rupturing Hex (Force)" : "Hex rider (Force)" })}`;
    await globalThis.ChatMessage?.implementation?.create?.({ speaker: globalThis.ChatMessage.implementation.getSpeaker({ actor: hexer }), content });
    if (hexer.isOwner) {
      await hexer.update({ [`flags.ak5e.${HEXER_FLAG}.riderTaken.${uuidKey(target.uuid)}`]: true });
    } else {
      console.warn("AK5e | Hexer rider: the Hexer's owner must record this cycle (the hit was seen on another client).");
    }
  }
}

/** Rupturing death burst (L7325): when an Ultimate-hexed creature is reduced to 0 HP. Save and damage are buttons. */
async function handleKill(event) {
  const target = actorFromUuid(event?.actorUuid);
  if (!target) return;
  for (const hex of hexesOn(target).filter(entry => entry.ultimate)) {
    const hexer = actorFromUuid(hex.source);
    if (!hexer || !isHexer(hexer)) continue;
    const sides = sidesFor(levelOf(hexer));
    const dc = hexerSpellSaveDC(hexer);
    const formula = `4d${sides}`;
    const content = `<h3>Rupturing Hex</h3><p>${esc(target.name)} is reduced to 0 Hit Points. Creatures of ${esc(hexer.name)}'s choice within ${DEATH_BURST_RADIUS_FT} ft make a DEX Saving Throw vs DC ${esc(dc)}: fail = Force damage ${esc(formula)}; success = half.</p>`
      + hexerRollButton({ actor: hexer, label: `Roll burst ${formula}`, formula, flavor: "Rupturing Hex burst (Force, half on a save)" });
    await globalThis.ChatMessage?.implementation?.create?.({ speaker: globalThis.ChatMessage.implementation.getSpeaker({ actor: hexer }), content });
  }
}

/** Voicethief repeat save at the start of each Turn of the hexed creature (buttons only; the owner clicks). */
async function handleTurnStart(event) {
  const actor = actorFromUuid(event?.actorUuid);
  if (!actor) return;
  if (isHexer(actor) && actor.isOwner) {
    await actor.update({ [`flags.ak5e.${HEXER_FLAG}.-=riderTaken`]: null }).catch(error => console.error("AK5e | Hexer turn reset", error));
  }
  for (const hex of hexesOn(actor).filter(entry => entry.kind === "voicethief")) {
    const hexer = actorFromUuid(hex.source);
    if (!hexer || !isHexer(hexer)) continue;
    const content = `<h3>Voicethief Hex</h3>${saveButtonHtml(actor, "int", hexerSpellSaveDC(hexer))}`;
    await globalThis.ChatMessage?.implementation?.create?.({ speaker: globalThis.ChatMessage.implementation.getSpeaker({ actor }), content });
  }
}

/** Artificer-style prompt: after an Art, a button offers Potent Hex. It never applies on its own. */
async function handleArtCast(event) {
  const actor = actorFromUuid(event?.actorUuid);
  if (!actor || !isHexer(actor) || !actor.isOwner) return;
  const left = getPool(actor, "hexerPotentHex").value;
  if (left < 1) return;
  const content = `<h3>Potent Hex</h3><p>You dealt Damage with an Art. You may apply a Hex to one creature (${left} use${left === 1 ? "" : "s"} left). This is optional.</p>`
    + `<button type="button" data-ak5e-hexer-apply="potentHex" data-actor="${esc(actor.uuid)}">Apply Potent Hex</button>`;
  await globalThis.ChatMessage?.implementation?.create?.({ speaker: globalThis.ChatMessage.implementation.getSpeaker({ actor }), content });
}

async function clickRoll(button) {
  const actor = actorFromUuid(button.dataset.actor);
  need(actor?.isOwner, "Only the Hexer's owner may roll this.");
  const roll = await new globalThis.Roll(button.dataset.ak5eHexerRoll ?? button.dataset.formula, actor.getRollData?.() ?? {}).evaluate();
  await roll.toMessage({ speaker: globalThis.ChatMessage.implementation.getSpeaker({ actor }), flavor: button.dataset.flavor ?? "Hex roll" });
}

async function clickSave(button) {
  const actor = actorFromUuid(button.dataset.actor);
  need(actor?.isOwner, "Only the creature's owner may roll this save.");
  const ability = button.dataset.ak5eHexerSave;
  const mod = Number(actor.system?.abilities?.[ability]?.save?.value ?? actor.system?.abilities?.[ability]?.mod ?? 0);
  const roll = await new globalThis.Roll(`1d20 + ${Number.isFinite(mod) ? mod : 0}`, {}).evaluate();
  const dc = Number(button.dataset.dc);
  const outcome = roll.total >= dc ? "Saved" : "Failed: Silenced until the end of its next Turn (apply the Silenced condition)";
  await roll.toMessage({ speaker: globalThis.ChatMessage.implementation.getSpeaker({ actor }), flavor: `${ability.toUpperCase()} save vs DC ${dc}. ${outcome}.` });
}

/** renderChatMessageHTML: wires the Hexer card buttons once. Nothing rolls until a click. */
export function renderHexerCardButtons(message, html) {
  const root = html?.querySelectorAll ? html : html?.[0];
  if (!root?.querySelectorAll) return;
  for (const button of root.querySelectorAll("[data-ak5e-hexer-roll], [data-ak5e-hexer-save], [data-ak5e-hexer-apply]")) {
    if (button.dataset.ak5eBound) continue;
    button.dataset.ak5eBound = "1";
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      button.disabled = true;
      const run = async () => {
        if (button.dataset.ak5eHexerRoll !== undefined) return clickRoll(button);
        if (button.dataset.ak5eHexerSave !== undefined) return clickSave(button);
        const actor = actorFromUuid(button.dataset.actor);
        need(actor?.isOwner, "Only the Hexer's owner may apply a Hex.");
        return hexerCommand(actor, button.dataset.ak5eHexerApply);
      };
      Promise.resolve().then(run)
        .catch(error => { console.error("AK5e | Hexer card", error); globalThis.ui?.notifications?.error?.(error?.message ?? String(error)); })
        .finally(() => { button.disabled = false; });
    });
  }
}

/** Idempotent: installs the event handlers and the card wiring once. Pools are defined here too. */
export function registerHexerHooks() {
  if (hooksInstalled) return;
  hooksInstalled = true;
  defineHexerPools();
  onAk5eEvent("artCast", handleArtCast);
  onAk5eEvent("hit", handleHit);
  onAk5eEvent("kill", handleKill);
  onAk5eEvent("turnStart", handleTurnStart);
  if (typeof globalThis.Hooks?.on === "function") {
    globalThis.Hooks.on("renderChatMessageHTML", (message, html) => {
      try { renderHexerCardButtons(message, html); }
      catch (error) { console.error("AK5e | Hexer card", error); }
    });
  }
}

export const hexerApi = Object.freeze({
  isHexed,
  hexesOn,
  hexerSpellSaveDC,
  cursemarkTargets,
  hexChanges,
  hexRollFormula,
  kinds: HEX_KINDS,
  gates: HEXER_GATES
});
