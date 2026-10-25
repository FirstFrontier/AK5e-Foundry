/**
 * Hexer Supporter branch (Ch. 3 L7223-7330; DECISIONS.md rulings R8 and R9).
 *
 * Potent Hex (L7287), Cursemark (L7302), Controlled Cruelty (L7307), Gospel of Curses (L7318) and
 * The Ultimate Hex (L7325). Every Hex is an Active Effect on the TARGET carrying `flags.ak5e.hex`.
 * Dice are never rolled automatically: each roll is a button that the owner clicks (WORKFLOW §3.2).
 *
 * Mechanics that are effects: Binding (speed), Wasting (ability check and save bonuses).
 * Mechanics that are buttons: Voicethief saves, the Force rider, Rupturing and the death burst, and every roll.
 * Mechanics that are reminders or flags only: Abjuring (its die is rolled when the hexed creature makes a
 * Damage Roll, so the die is stored on the Hex), Breaking (DR is not a stored key), Looping (Concentration limit),
 * Voicethief's Silenced state.
 */
import { isHexer, supporterLevel, pbForLevel, aidDieSize, flag, aidAbilityKey } from "./supporter-rules.mjs";
import { definePool, getPoolDefinition, getPool } from "./resource-pools.mjs";
import { need, values, esc } from "./operation-kernel.mjs";
import { warn, spendResource } from "./play-uses.mjs";
import { supporterUses } from "./supporter-uses.mjs";
import { actorFromUuid } from "./supporter-features.mjs";
import { onAk5eEvent } from "./trigger-events.mjs";
import { confirmPlayUse } from "./play-uses-sheet.mjs";

export const HEX_KINDS = Object.freeze(["abjuring", "binding", "breaking", "looping", "voicethief", "wasting"]);
export const HEX_LABELS = Object.freeze({
  abjuring: "Abjuring Hex", binding: "Binding Hex", breaking: "Breaking Hex",
  looping: "Looping Hex", voicethief: "Voicethief Hex", wasting: "Wasting Hex"
});
/** Kinds that roll at application (one roll per receipt, so each is its own use). */
const ROLL_KINDS = Object.freeze(["binding", "breaking", "wasting"]);
/** Kinds that apply in one receipt with no roll at application (Abjuring's die is rolled on its Damage Roll). */
const PLAIN_KINDS = Object.freeze(["abjuring", "looping", "voicethief"]);
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
const RIDER_RELAY_FLAG = "hexerRiderRelay";
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

/** Roll made by a click at application (R9): Binding 2 Aid Die rolls, Breaking and Wasting 1 roll. */
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
 * The Hex Active Effects on a creature. Applied through the play-uses engine, so a creature the user does
 * not own is changed by the GM's client (validateTarget below). One entry can carry several plain kinds
 * (the Ultimate Hex) as `hexKinds`. Undo deletes the Hexes and restores any Hex of the same kind that a
 * re-application replaced (kept on the new effect, not in the receipt).
 */
const HEX_TARGET_KIND = {
  async apply(source, useId, entry, target) {
    const done = values(target.effects).some(effect => flag(effect, USE_FLAG)?.opId === useId && flag(effect, USE_FLAG)?.sourceUuid === source.uuid);
    if (done) return true;
    const walk = Number(target.system?.attributes?.movement?.walk);
    const now = worldTime();
    for (const hexKind of entry.hexKinds ?? [entry.hexKind]) {
      const replaced = values(target.effects).filter(effect => {
        const hex = flag(effect, HEX_FLAG);
        return hex?.source === source.uuid && hex?.kind === hexKind;
      });
      const snapshots = replaced.map(snapshotOf);
      if (replaced.length) await target.deleteEmbeddedDocuments("ActiveEffect", replaced.map(effect => effect.id));
      const rolledHere = hexKind === entry.hexKind ? entry.roll ?? null : null;
      const ability = hexKind === "wasting" ? entry.ability ?? null : null;
      const sides = entry.sides ?? 8;
      const built = hexChanges(hexKind, { roll: rolledHere, ability, walk: Number.isFinite(walk) ? walk : undefined, sides });
      await target.createEmbeddedDocuments("ActiveEffect", [{
        name: `AK5e Hex: ${HEX_LABELS[hexKind]}`,
        icon: "icons/svg/aura.svg",
        origin: source.uuid,
        changes: built.changes,
        duration: { seconds: HEX_DURATION_SECONDS, startTime: now },
        description: `<p>${esc(HEX_LABELS[hexKind])} from ${esc(source.name)}.</p><p>${esc(built.reminder ?? "")}</p>`,
        flags: { ak5e: {
          [HEX_FLAG]: {
            source: source.uuid, kind: hexKind, ultimate: entry.ultimate === true,
            roll: rolledHere, ability, expires: now + HEX_DURATION_SECONDS,
            formula: hexKind === "abjuring" ? `1d${sides}` : hexRollFormula(hexKind, sides),
            ...(built.speedReduction !== undefined ? { speedReduction: built.speedReduction } : {}),
            ...(built.penalty !== undefined ? { penalty: built.penalty } : {}),
            ...(built.breakingReduction !== undefined ? { breakingReduction: built.breakingReduction } : {})
          },
          [USE_FLAG]: { opId: useId, sourceUuid: source.uuid, replaced: snapshots }
        } }
      }]);
    }
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

/** The GM relay may apply only the Hexes the Hexer's receipt recorded for this creature (WORKFLOW §3.2). */
const kindsOfEntry = entry => [...(entry.hexKinds ?? [entry.hexKind])].sort().join(",");
const relayable = (_source, receipt, entry, target) => entry.kind === HEX_EFFECT_KIND && target?.uuid === entry.uuid
  && kindsOfEntry(entry) === [...(receipt.result?.kinds ?? [receipt.result?.kind])].sort().join(",")
  && entry.ultimate === (receipt.result?.ultimate === true);

/* -------------------------------------------------------------- plans */

/**
 * Hexes on one creature (or on none, for a Cursemark placed on a point). Spends from `poolId` when `spend` is
 * true. Warns, never blocks: a duplicate Hex (use anyway replaces it), an overlap with the Ultimate Hex, an empty
 * pool, a missing Wasting ability, or a level gate. Roll kinds are one kind per use (the roll is one click).
 */
function planHex(actor, data, { title, poolId = "hexerPotentHex", spend = true, sides, ultimate = false, cursemarkId = null,
  extraUpdates = null, levelGate = null, kinds = null, optionalTarget = false } = {}) {
  need(isHexer(actor), "Hexer Hexes require the Hexer branch.");
  const chosen = kinds ?? [String(data.kind ?? "")];
  need(chosen.length > 0 && chosen.every(kind => HEX_KINDS.includes(kind)), `Choose a Hex: ${HEX_KINDS.join(", ")}.`);
  need(chosen.length === 1 || !chosen.some(kind => ROLL_KINDS.includes(kind)), "Roll Hexes are separate uses.");
  const target = data.target ?? actorFromUuid(data.targetUuid ?? null);
  need(optionalTarget || target?.uuid, "Choose a target creature for this Hex.");
  const warnings = [];
  const level = levelOf(actor);
  const ability = chosen.includes("wasting") ? (ABILITY_KEYS.includes(String(data.ability ?? "")) ? String(data.ability) : null) : null;
  if (chosen.includes("wasting") && !ability) {
    warn(warnings, "ability", "A Wasting Hex needs the ability it applies to; none was chosen, so no check or save penalty is recorded (its roll still waits for your click).");
  }
  if (chosen.some(kind => GOSPEL_KINDS.includes(kind))) levelWarning(warnings, actor, HEXER_GATES.gospel, "Gospel of Curses (Voicethief and Wasting Hexes)");
  if (ultimate) levelWarning(warnings, actor, HEXER_GATES.ultimate, "The Ultimate Hex");
  if (levelGate) levelWarning(warnings, actor, levelGate.level, levelGate.name);
  const current = target ? hexesOn(target).filter(hex => hex.source === actor.uuid) : [];
  if (target?.uuid === actor.uuid) warn(warnings, "selfTarget", "A Hex is for another Creature; you cannot Hex yourself.");
  if (chosen.some(kind => current.some(hex => hex.kind === kind))) {
    warn(warnings, "duplicate", `${target.name} already has a ${chosen.filter(kind => current.some(hex => hex.kind === kind)).map(kind => HEX_LABELS[kind]).join(", ")} from you; using it anyway replaces it.`);
  }
  if (target && !ultimate && current.some(hex => hex.ultimate)) {
    warn(warnings, "ultimateOverlap", `${target.name} already has your Ultimate Hex; Potent Hex options are not cumulative with it.`);
  }
  if (target && ultimate && current.some(hex => !hex.ultimate)) {
    warn(warnings, "potentOverlap", `${target.name} already has a Potent Hex from you; the Ultimate Hex is not cumulative with it.`);
  }
  const sidesUsed = sides ?? sidesFor(level);
  if (spend && getPool(actor, poolId).value < 1) {
    warn(warnings, "shortfall", `${getPool(actor, poolId).label} is empty (0 remaining).`);
  }
  const kind = chosen[0];
  const roll = chosen.length === 1 ? hexRollFormula(kind, sidesUsed) : null;
  const stored = kind === "abjuring" && chosen.length === 1 ? `1d${sidesUsed}` : roll;
  const label = chosen.length > 1 ? "Ultimate Hex" : HEX_LABELS[kind];
  return {
    title: `${title ?? label}${target ? ` -> ${target.name}` : ""}`,
    warnings,
    apply(state, receipt) {
      const updates = spend ? spendResource(actor, receipt, { pool: poolId, amount: 1, label: getPool(actor, poolId).label }) : {};
      Object.assign(updates, extraUpdates?.(state, receipt) ?? {});
      receipt.targets = target ? [{
        uuid: target.uuid, name: target.name, kind: HEX_EFFECT_KIND, hexKind: kind, hexKinds: chosen, ultimate, ability,
        sides: sidesUsed, formula: stored, roll: null, cursemarkId, ready: !roll
      }] : [];
      receipt.result = { kind, kinds: chosen, ultimate, ability, formula: stored, targetUuid: target?.uuid ?? null,
        targetName: target?.name ?? null, sides: sidesUsed, cursemarkId };
      receipt.html = true;
      const names = chosen.map(hexKind => HEX_LABELS[hexKind]).join(", ");
      const who = target ? ` to ${esc(target.name)}` : "";
      if (roll) {
        receipt.formula = roll;
        receipt.rollLabel = `${label} (${roll})`;
        // The play-uses card renders the one roll button from receipt.formula (no second button here).
        receipt.summary = `${esc(actor.name)} applied the ${esc(label)}${who} for 1 minute.`;
      } else {
        const detail = chosen.map(hexKind => hexChanges(hexKind, { sides: sidesUsed }).reminder).filter(Boolean).join(" ");
        receipt.summary = `${esc(actor.name)} applied ${esc(names)}${who} for 1 minute. ${esc(detail)}`;
      }
      if (target && chosen.includes("voicethief")) receipt.summary += saveButtonHtml(target, "int", hexerSpellSaveDC(actor));
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
 * With a target, that creature is hexed by this use (`primary`); area creatures use `primary: false` parts. The mark
 * ID is generated when the caller does not give one.
 */
function cursemarkPlan(actor, state, data) {
  need(isHexer(actor), "Cursemark requires the Hexer branch.");
  const distance = Number(data.distance ?? data.pointDistance ?? 0);
  const excluded = Array.isArray(data.excluded) ? data.excluded.filter(uuid => typeof uuid === "string") : [];
  const markId = typeof data.markId === "string" && /^[A-Za-z0-9_-]{1,60}$/.test(data.markId) ? data.markId : `mark-${foundry.utils.randomID()}`;
  const point = data.point ?? null;
  const primary = data.primary !== false;
  const placed = (hexerState(actor).cursemarks ?? []).some(mark => mark.id === markId);
  if (primary && !placed) {
    need(point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y)), "Choose the Cursemark point.");
  }
  if (!primary) need(placed, "Place the Cursemark before applying it to another creature.");
  const plan = planHex(actor, data, {
    title: "Cursemark", sides: 6, spend: primary, cursemarkId: markId, optionalTarget: true,
    levelGate: { level: HEXER_GATES.cursemark, name: "Cursemark" },
    extraUpdates: () => {
      if (!primary || placed) return {};
      const record = { id: markId, point: { x: Number(point.x), y: Number(point.y), ...(point.sceneId ? { sceneId: String(point.sceneId) } : {}) },
        kind: data.kind, radius: CURSEMARK_RADIUS_FT, excluded: levelOf(actor) >= HEXER_GATES.controlledCruelty ? excluded : [],
        gridSize: Number(data.gridSize ?? 100), gridDistance: gridDistanceOf(data.gridDistance), expires: worldTime() + HEX_DURATION_SECONDS };
      // Expired marks are pruned whenever a new one is written (they have no effect once expired).
      const live = (hexerState(actor).cursemarks ?? []).filter(entry => !(Number.isFinite(Number(entry.expires)) && Number(entry.expires) <= worldTime()));
      return { [`flags.ak5e.${HEXER_FLAG}.cursemarks`]: [...live, record] };
    }
  });
  if (distance > CURSEMARK_RANGE_FT) warn(plan.warnings, "range", `The Cursemark point is ${distance} ft away; Cursemark reaches 100 ft.`);
  if (excluded.length && levelOf(actor) < HEXER_GATES.controlledCruelty) {
    warn(plan.warnings, "level", "Spare the Rod (Controlled Cruelty) is a Supporter level 10 feature; the exclusions are ignored.");
  }
  return plan;
}
cursemarkPlan.validateTarget = relayable;

/**
 * The Ultimate Hex (L7325): once per Long Rest. It applies every plain option at once (Abjuring, Looping, Voicethief,
 * with ultimate: true), in one receipt. The roll kinds (Binding, Breaking, Wasting) follow as ultimateHexPart uses.
 */
function ultimateHexPlan(actor, state, data) {
  return planHex(actor, data, { title: "Ultimate Hex", poolId: "hexerUltimateHex", ultimate: true, kinds: PLAIN_KINDS });
}
ultimateHexPlan.validateTarget = relayable;

/**
 * A roll kind of the Ultimate Hex on the same creature (Binding, Breaking or Wasting). It spends nothing, and only
 * follows a recorded Ultimate Hex use (data.ultimateUseId) so it cannot be run on its own.
 */
function ultimateHexPartPlan(actor, state, data) {
  const parent = supporterUses.receipt(actor, String(data.ultimateUseId ?? ""));
  need(parent?.command === "ultimateHex" && parent.status !== "undone", "The Ultimate Hex must be applied first.");
  need(ROLL_KINDS.includes(data.kind), "An Ultimate Hex part is a Binding, Breaking or Wasting Hex.");
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
export function hexerRollButton({ actor, label, formula, flavor = label, once = null }) {
  const onceAttr = once ? ` data-ak5e-hexer-once="${esc(once)}"` : "";
  return `<div class="ak5e-hexer-roll"><p>${esc(formula)}</p><button type="button" data-ak5e-hexer-roll="${esc(formula)}" data-flavor="${esc(flavor)}" data-actor="${esc(actor.uuid)}"${onceAttr}>${esc(label)}</button></div>`;
}

/**
 * Hexer panel (Features tab). Buttons use data-supporter-cmd, dispatched by the sheet to hexerCommand().
 * Level-gated options show with their gate; they warn when used below the gate, never block.
 * Cursemark point: until canvas placement exists, the point is the first token you target.
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
      + `${levelOf(actor) >= HEXER_GATES.cursemark ? cmd("cursemarkArea", "Apply Cursemark to creatures in area") : ""}`
      + `${levelOf(actor) >= HEXER_GATES.ultimate ? cmd("ultimateHex", `Ultimate Hex (${ultimate.value} / ${ultimate.max})`) : ""}</div>`,
    levelOf(actor) >= HEXER_GATES.cursemark ? `<p class="ak5e-hexer-note">Cursemark point: the token you target (canvas placement not yet available).</p>` : ""
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
  return foundry.applications.api.DialogV2.wait({
    window: { title }, position: { width: 420 }, rejectClose: false, content,
    buttons: [
      { action: "apply", label: "Confirm", default: true, callback: (_event, button) => ({ kind: button.form.elements.kind.value, ability: button.form.elements.ability.value }) },
      { action: "cancel", label: "Cancel", callback: () => false }
    ]
  });
}

const targetedUuid = () => globalThis.game?.user?.targets?.first?.()?.actor?.uuid ?? null;

/** Confirmed Potent Hex: the usual warnings, then the Hex on the chosen creature. */
export async function applyPotentHex(actor, { kind, ability, targetUuid } = {}) {
  const opId = foundry.utils.randomID();
  return confirmPlayUse("Potent Hex", extra => supporterUses.execute(actor, "potentHex", { targetUuid, kind, ability, ...extra }, opId));
}

/** The point of a Cursemark: the first targeted token (the Hexer places it by targeting until canvas placement exists). */
function targetedPoint() {
  const token = globalThis.game?.user?.targets?.first?.() ?? null;
  need(token, "Target the token that marks the Cursemark point first.");
  return {
    point: { x: token.center?.x ?? token.x, y: token.center?.y ?? token.y, sceneId: token.scene?.id ?? globalThis.canvas?.scene?.id ?? null },
    gridSize: globalThis.canvas?.grid?.size ?? 100,
    gridDistance: gridDistanceOf(globalThis.canvas?.scene?.grid?.distance),
    targetUuid: token.actor?.uuid ?? null
  };
}

/** Actor-backed tokens on the canvas, in the pure shape cursemarkTargets reads. */
function canvasCreatureTokens() {
  return (globalThis.canvas?.tokens?.placeables ?? []).map(token => ({
    uuid: token.actor?.uuid, x: token.center?.x ?? token.x, y: token.center?.y ?? token.y,
    sceneId: token.scene?.id ?? globalThis.canvas?.scene?.id ?? null, name: token.name
  })).filter(token => token.uuid);
}

/**
 * Spare the Rod (L7307, Controlled Cruelty): tick the creatures within 10 ft of the Cursemark point that are
 * unaffected by it. Resolves to the excluded actor uuids, or null when the dialog is cancelled (nothing changes).
 */
async function pickSpareTheRod(actor, placed) {
  const candidates = tokensInCursemarkArea({ point: placed.point, gridSize: placed.gridSize, gridDistance: placed.gridDistance,
    radius: CURSEMARK_RADIUS_FT, excluded: [] }, actor, canvasCreatureTokens());
  const rows = candidates.map(token => `<label class="ak5e-hexer-spare"><input type="checkbox" name="excluded" value="${esc(token.uuid)}"> ${esc(token.name ?? token.uuid)}</label>`).join("");
  const content = `<div class="ak5e-hexer-spare"><p>Spare the Rod: tick any creature that is unaffected by this Cursemark.</p>`
    + `${rows || "<p>No other creature is within 10 ft of the point.</p>"}</div>`;
  const choice = await foundry.applications.api.DialogV2.wait({
    window: { title: "Spare the Rod" }, position: { width: 420 }, rejectClose: false, content,
    buttons: [
      { action: "apply", label: "Confirm", default: true,
        callback: (_event, button) => [...button.form.querySelectorAll('input[name="excluded"]:checked')].map(input => input.value) },
      { action: "cancel", label: "Cancel", callback: () => false }
    ]
  });
  return Array.isArray(choice) ? choice : null;
}

/**
 * Confirmed Cursemark area: one confirm listing the creatures within 10 ft of the mark (exclusions and the Hexer
 * removed). Each creature is one undoable use; only the first spends the Potent Hex use.
 */
export async function applyCursemarkArea(actor, markId) {
  need(isHexer(actor), "Cursemark requires the Hexer branch.");
  const mark = (hexerState(actor).cursemarks ?? []).find(entry => entry.id === markId);
  need(mark, "Place the Cursemark first.");
  const areaTokens = cursemarkTargets(actor, markId, canvasCreatureTokens());
  need(areaTokens.length, "No creature is within 10 ft of the Cursemark point.");
  const names = areaTokens.map(token => token.name ?? token.uuid).join(", ");
  const { DialogV2 } = foundry.applications.api;
  const confirmed = await DialogV2.confirm({
    window: { title: "Apply Cursemark to creatures in area" },
    content: `<p>Apply the Cursemark Hex to: ${esc(names)}.</p><p>Each creature is a separate use you can undo.</p>`,
    rejectClose: false
  });
  if (confirmed !== true) return null;
  const results = [];
  for (const token of areaTokens) {
    results.push(await confirmPlayUse("Cursemark", extra => supporterUses.execute(actor, "cursemark",
      { markId, kind: mark.kind, targetUuid: token.uuid, primary: false, ...extra }, foundry.utils.randomID())));
  }
  return results;
}

/**
 * Panel commands. Each one confirms before any use; cancelling changes nothing.
 * cursemark: the point is the first targeted token. Ultimate: the plain options, then one use per roll option.
 */
export async function hexerCommand(actor, name) {
  need(isHexer(actor), "Hexer commands need the Hexer branch.");
  if (name === "potentHex") {
    const choice = await pickHex(actor, "Apply Potent Hex");
    if (!choice) return null;
    return applyPotentHex(actor, { ...choice, targetUuid: targetedUuid() });
  }
  if (name === "ultimateHex") {
    const choice = await pickHex(actor, "Apply The Ultimate Hex (plain options, then Binding, Breaking and Wasting)", ROLL_KINDS.concat(["abjuring"]));
    if (!choice) return null;
    const targetUuid = targetedUuid();
    const opId = foundry.utils.randomID();
    const first = await confirmPlayUse("Ultimate Hex", extra => supporterUses.execute(actor, "ultimateHex", { targetUuid, ability: choice.ability, ...extra }, opId));
    if (!first) return null;
    for (const kind of ROLL_KINDS) {
      await confirmPlayUse(`Ultimate Hex (${HEX_LABELS[kind]})`, extra => supporterUses.execute(actor, "ultimateHexPart",
        { targetUuid, kind, ability: choice.ability, ultimateUseId: opId, ...extra }, foundry.utils.randomID()));
    }
    return first;
  }
  if (name === "cursemark") {
    const choice = await pickHex(actor, "Cursemark (Bonus Action; spends one Potent Hex use)");
    if (!choice) return null;
    const placed = targetedPoint();
    // Spare the Rod (Controlled Cruelty, level 10+) is asked here; below level 10 there is no prompt and no exclusions.
    let excluded = [];
    if (levelOf(actor) >= HEXER_GATES.controlledCruelty) {
      const spared = await pickSpareTheRod(actor, placed);
      if (!spared) return null;
      excluded = spared;
    }
    // A spared point creature is not hexed by this use; the mark still records it as excluded from the area.
    const targetUuid = excluded.includes(placed.targetUuid) ? null : placed.targetUuid;
    return confirmPlayUse("Cursemark", extra => supporterUses.execute(actor, "cursemark",
      { kind: choice.kind, ability: choice.ability, markId: foundry.utils.randomID(), ...placed, targetUuid, excluded, ...extra }, foundry.utils.randomID()));
  }
  if (name === "cursemarkArea") {
    const mark = (hexerState(actor).cursemarks ?? []).at(-1);
    need(mark, "Place a Cursemark first.");
    return applyCursemarkArea(actor, mark.id);
  }
  throw new Error(`Unknown Hexer command ${name}.`);
}

/** Feet per grid cell recorded on a Cursemark (the scene's grid distance; 5 ft when none is recorded). */
const gridDistanceOf = value => {
  const feet = Number(value);
  return Number.isFinite(feet) && feet > 0 ? feet : 5;
};

/**
 * Pure area test for one Cursemark record: the tokens within its radius of its point, excluding the Hexer and any
 * Spare the Rod exclusions. Tokens are { uuid, x, y, sceneId, actor?, center? }.
 */
export function tokensInCursemarkArea(mark, actor, tokens = []) {
  const excluded = new Set(mark.excluded ?? []);
  const pixelsPerFoot = Number(mark.gridSize ?? 100) / gridDistanceOf(mark.gridDistance);
  return tokens.filter(token => {
    const actorUuid = token?.actor?.uuid ?? token?.uuid;
    if (!actorUuid || actorUuid === actor.uuid || excluded.has(actorUuid) || excluded.has(token.uuid)) return false;
    if (mark.point.sceneId && token.sceneId && token.sceneId !== mark.point.sceneId) return false;
    const cx = Number(token.center?.x ?? token.x), cy = Number(token.center?.y ?? token.y);
    return Math.hypot(cx - mark.point.x, cy - mark.point.y) / pixelsPerFoot <= (mark.radius ?? CURSEMARK_RADIUS_FT);
  });
}

/**
 * Cursemark area: the creatures within 10 ft of the mark (Spare the Rod exclusions and the Hexer removed).
 * Pure: tokens are { uuid, x, y, sceneId, actor?, center? }. Distance uses the scene's grid distance per cell
 * (recorded on the mark; 5 ft when absent) over gridSize pixels. Returns the matching tokens.
 */
export function cursemarkTargets(actor, markId, tokens = []) {
  const mark = (hexerState(actor).cursemarks ?? []).find(entry => entry.id === markId);
  if (!mark) return [];
  if (Number.isFinite(Number(mark.expires)) && Number(mark.expires) <= worldTime()) return [];
  return tokensInCursemarkArea(mark, actor, tokens);
}

/* -------------------------------------------------------------- hooks and events */

/**
 * Force rider (L7287 and L7325). The rider is per hexed creature and per Hexer: only Hexes whose source is this
 * Hexer count. The card is posted from whichever client sees the hit. The `riderTaken` record is written by the
 * Hexer's owner, or relayed to the GM through a whispered message when the current user cannot write it.
 */
async function handleHit(event) {
  const target = actorFromUuid(event?.targetUuid);
  if (!target) return;
  // One rider per (Hexer, creature): the target's Hexes are grouped by source first, so three Hexes from one Hexer
  // post one card and one relay. The group is Rupturing if any of that Hexer's Hexes on the target is Ultimate.
  const bySource = new Map();
  for (const hex of hexesOn(target)) {
    if (!hex.source) continue;
    bySource.set(hex.source, (bySource.get(hex.source) === true) || hex.ultimate === true);
  }
  for (const [sourceUuid, ultimate] of bySource) {
    const hexer = actorFromUuid(sourceUuid);
    if (!hexer || !isHexer(hexer) || sourceUuid !== hexer.uuid) continue;
    const taken = hexerState(hexer).riderTaken ?? {};
    if (taken[uuidKey(target.uuid)]) continue;                 // one card per hexed creature until the Hexer's next Turn
    const sides = sidesFor(levelOf(hexer));
    const formula = `1d${sides}`;
    const text = ultimate === true
      ? `Rupturing Hex: ${esc(target.name)} was hit. Instead of Force on ${esc(target.name)}, every hostile creature within ${RUPTURE_RADIUS_FT} ft takes Force damage equal to one roll of your Aid Die.`
      : `Hex rider: ${esc(target.name)} was hit. Force damage equal to one roll of your Aid Die is available now (once until your next Turn).`;
    const empathic = levelOf(hexer) >= HEXER_GATES.controlledCruelty && ultimate !== true
      ? `<p>Empathic Pain: you may deal this Force to a different creature you can see within ${EMPATHIC_PAIN_RADIUS_FT} ft of ${esc(target.name)}.</p>` : "";
    const content = `<h3>Hex rider</h3><p>${text}</p>${empathic}`
      + hexerRollButton({ actor: hexer, label: `Roll Force ${formula}`, formula, flavor: ultimate === true ? "Rupturing Hex (Force)" : "Hex rider (Force)" });
    await globalThis.ChatMessage?.implementation?.create?.({ speaker: globalThis.ChatMessage.implementation.getSpeaker({ actor: hexer }), content });
    await recordRiderTaken(hexer, target);
  }
}

/** Writes riderTaken for this creature, directly or through the GM relay, and warns when neither is possible. */
async function recordRiderTaken(hexer, target) {
  if (hexer.isOwner) {
    await hexer.update({ [`flags.ak5e.${HEXER_FLAG}.riderTaken.${uuidKey(target.uuid)}`]: true });
    return;
  }
  const gm = globalThis.game?.users?.activeGM ?? null;
  if (!gm) {
    globalThis.ui?.notifications?.warn?.(`${hexer.name}'s once-per-turn Hex rider was NOT recorded for ${target.name}: no GM is connected. Record it when the GM connects.`);
    console.warn("AK5e | Hexer rider not recorded: no active GM.");
    return;
  }
  await globalThis.ChatMessage?.implementation?.create?.({
    whisper: [gm.id],
    content: "<p>Hexer rider record (relay).</p>",
    flags: { ak5e: { [RIDER_RELAY_FLAG]: { hexerUuid: hexer.uuid, targetUuid: target.uuid } } }
  });
}

/**
 * GM side of the rider relay: applies a relayed riderTaken record when the active GM receives it. The record is
 * accepted only if the target carries a Hex from that Hexer and the cycle is not already recorded.
 */
export async function handleRiderRelayMessage(message) {
  const relay = message?.flags?.ak5e?.[RIDER_RELAY_FLAG];
  if (!relay) return;
  if (!(globalThis.game?.user?.isGM && globalThis.game.users?.activeGM?.id === globalThis.game.user.id)) return;
  const hexer = actorFromUuid(relay.hexerUuid);
  const target = actorFromUuid(relay.targetUuid);
  if (!hexer || !target || !isHexer(hexer)) return;
  if (!hexesOn(target).some(hex => hex.source === hexer.uuid)) return;
  if ((hexerState(hexer).riderTaken ?? {})[uuidKey(target.uuid)]) return;
  await hexer.update({ [`flags.ak5e.${HEXER_FLAG}.riderTaken.${uuidKey(target.uuid)}`]: true });
  await message.delete?.().catch?.(() => null);
}

/** Rupturing death burst (L7325): when an Ultimate-hexed creature is reduced to 0 HP. Save and damage are buttons. */
async function handleKill(event) {
  const target = actorFromUuid(event?.actorUuid);
  if (!target) return;
  // One burst card per (Hexer, creature): an Ultimate Hex is several effects (one per plain option), so the Hexers
  // are grouped first. Two different Hexers each get their own card.
  const sources = [...new Set(hexesOn(target).filter(hex => hex.ultimate && hex.source).map(hex => hex.source))];
  for (const sourceUuid of sources) {
    const hexer = actorFromUuid(sourceUuid);
    if (!hexer || !isHexer(hexer)) continue;
    const sides = sidesFor(levelOf(hexer));
    const dc = hexerSpellSaveDC(hexer);
    const formula = `4d${sides}`;
    const content = `<h3>Rupturing Hex</h3><p>${esc(target.name)} is reduced to 0 Hit Points. Creatures of ${esc(hexer.name)}'s choice within ${DEATH_BURST_RADIUS_FT} ft make a DEX Saving Throw vs DC ${esc(dc)}: fail = Force damage ${esc(formula)}; success = half.</p>`
      + hexerRollButton({ actor: hexer, label: `Roll burst ${formula}`, formula, flavor: "Rupturing Hex burst (Force, half on a save)", once: foundry.utils.randomID() });
    await globalThis.ChatMessage?.implementation?.create?.({ speaker: globalThis.ChatMessage.implementation.getSpeaker({ actor: hexer }), content });
  }
}

/** A Turn start: the Hexer's rider records reset; a Voicethief creature gets its repeat save button (never a roll). */
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

/** After an Art: a button offers Potent Hex. It never applies on its own. */
async function handleArtCast(event) {
  const actor = actorFromUuid(event?.actorUuid);
  if (!actor || !isHexer(actor) || !actor.isOwner) return;
  const left = getPool(actor, "hexerPotentHex").value;
  if (left < 1) return;
  // The cast event says whether it dealt Damage when it can. Damage is claimed only when the event carries it; an
  // explicit "no Damage" posts nothing; otherwise the wording stays neutral.
  const dealt = event?.damage;
  if (dealt === false || (typeof dealt === "number" && dealt <= 0)) return;
  const claimed = dealt === true || (typeof dealt === "number" && dealt > 0);
  const lead = claimed
    ? "You dealt Damage with an Art. You may apply a Hex to one creature"
    : "Art cast: if the Art damaged a creature, you may apply a Hex.";
  const content = `<h3>Potent Hex</h3><p>${lead} (${left} use${left === 1 ? "" : "s"} left). This is optional.</p>`
    + `<button type="button" data-ak5e-hexer-apply="potentHex" data-actor="${esc(actor.uuid)}">Apply Potent Hex</button>`;
  await globalThis.ChatMessage?.implementation?.create?.({ speaker: globalThis.ChatMessage.implementation.getSpeaker({ actor }), content });
}

async function clickRoll(button) {
  const actor = actorFromUuid(button.dataset.actor);
  need(actor?.isOwner, "Only the Hexer's owner may roll this.");
  // A once-only roll (the Rupturing burst) is recorded when rolled. A repeat click warns and rolls only if confirmed.
  const once = button.dataset.ak5eHexerOnce;
  if (once) {
    const rolled = Boolean((hexerState(actor).burstRolled ?? {})[once]);
    if (rolled) {
      const again = await foundry.applications.api.DialogV2.confirm({
        window: { title: "Already rolled" }, rejectClose: false,
        content: "<p>Already rolled: this burst was already rolled for this creature. Roll it again?</p>"
      });
      if (again !== true) return null;
    }
    await actor.update({ [`flags.ak5e.${HEXER_FLAG}.burstRolled.${once}`]: true });
  }
  const roll = await new globalThis.Roll(button.dataset.ak5eHexerRoll ?? button.dataset.formula, actor.getRollData?.() ?? {}).evaluate();
  await roll.toMessage({ speaker: globalThis.ChatMessage.implementation.getSpeaker({ actor }), flavor: button.dataset.flavor ?? "Hex roll" });
}

async function clickSave(button) {
  const actor = actorFromUuid(button.dataset.actor);
  need(actor?.isOwner, "Only the creature's owner may roll this save.");
  const ability = button.dataset.ak5eHexerSave;
  const dc = Number(button.dataset.dc);
  // The native dnd5e 5.x save (bonuses, advantage, dialog); a failure means Silenced until the end of its next Turn.
  const rolls = await actor.rollSavingThrow({ ability, target: dc });
  const total = (Array.isArray(rolls) ? rolls[0] : rolls)?.total;
  if (Number.isFinite(total) && total < dc) {
    await globalThis.ChatMessage.implementation.create({ speaker: globalThis.ChatMessage.implementation.getSpeaker({ actor }),
      content: `<p>Voicethief Hex: ${esc(actor.name)} failed the ${ability.toUpperCase()} save (DC ${dc}) and is Silenced until the end of its next Turn. Apply the Silenced condition.</p>` });
  }
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

/** Idempotent: installs the event handlers, the card wiring and the GM rider relay once. Pools are defined here too. */
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
    globalThis.Hooks.on("createChatMessage", message => {
      Promise.resolve(handleRiderRelayMessage(message)).catch(error => console.error("AK5e | Hexer rider relay", error));
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
