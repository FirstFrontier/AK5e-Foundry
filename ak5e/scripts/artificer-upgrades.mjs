/**
 * Artificer Heavy Duty Upgrades (Ch. 3 L6925-7073, source lines "C3:NNNN"): Loaded for Bear, the Automaton and
 * Mobile Cover upgrades, and the Basic Personality Matrix.
 *
 * Every change runs through the Supporter play-use engine (supporter-uses.mjs): confirmation, "Use anyway" warnings,
 * undo receipts and the GM relay for Automatons the user cannot write. Upgrade state lives in flags:
 *   Automaton: flags.ak5e.automaton = { creator, variant, upgrades, personality, destroyed, upgradeUses }
 *   Artificer: flags.ak5e.artificer = { automatons: [uuids], covers: [{ id, label, upgrades, upgradeUses, deployedAt }] }
 * Nothing rolls on its own: dice are rolled only from a card button, and saves are rolled only by the target's owner.
 */
import { supporterUses } from "./supporter-uses.mjs";
import { isArtificer, supporterLevel, artificerDC, aidDieSize, flag } from "./supporter-rules.mjs";
import { actorFromUuid } from "./supporter-features.mjs";
import { warn } from "./play-uses.mjs";
import { need, esc, opaqueKey } from "./operation-kernel.mjs";
import { confirmPlayUse } from "./play-uses-sheet.mjs";
import { upgradeCapFor } from "./artificer-features.mjs";

/* ---------------------------------------------------------------- data (transcribed from the source) */

/** Machine Personality (C3:6923 Basic Personality Matrix table), in roll order 1 to 6. */
export const MACHINE_PERSONALITIES = Object.freeze(["Taciturn", "Caring", "Excitable", "Warlike", "Nervous", "Analytic"]);

const TIMINGS = Object.freeze(["creation", "fortBuilder", "longRest"]);
const VARIANT_LABELS = Object.freeze({ platform: "Platform", airSupport: "Air Support", turret: "Turret" });
const RESTRICTION_TEXT = Object.freeze({
  turret: "Turret only",
  airSupport: "Air Support only",
  platform: "Platform only",
  crossbow: "Requires Crossbow (Air Support or Turret)"
});

const uses = (max, recovery, sharedRest = true) => Object.freeze({ max, recovery, sharedRest });
const save = (ability, halfOnSave) => Object.freeze({ ability, dc: "artificer", halfOnSave });
const dice = (count, kind) => Object.freeze({ count, type: "aid", kind });
const upgrade = fields => Object.freeze({ restriction: null, action: null, uses: null, save: null, dice: null, ...fields });

/**
 * Heavy Duty Upgrades. `dice.count` is N of "N rolls of your Aid Die": N dice of the current Aid Die size, never
 * expended (head ruling A6). `uses.max` "intMod" is the INT modifier (Medical Dispenser, Smoke Launcher).
 * `save.halfOnSave` is true only where the source says half Damage on a success.
 */
export const ARTIFICER_UPGRADES = Object.freeze([
  upgrade({ id: "aegisSystem", name: "AEGIS System", target: "automaton", action: "passive",
    summary: "Creatures within a 10 ft radius sphere centred on this Automaton have Advantage on Saves against Arts that originate from outside that radius." }),
  upgrade({ id: "arbalest", name: "Arbalest", target: "automaton", restriction: "turret", action: "action",
    save: save("dex", false), dice: dice(1, "damage"),
    summary: "Once per Turn, as an Action, a Crossbow Attack at a visible Creature within 80 ft. On a hit: 3 + one Aid Die Piercing instead of normal Damage. Creatures within 5 ft of the original target: Dex save vs Artificer DC or one Aid Die Thunder." }),
  upgrade({ id: "artsDetonator", name: "Arts Detonator", target: "automaton", action: "reaction",
    uses: uses(1, "srlr"), save: save("dex", true), dice: dice(3, "damage"),
    summary: "Reaction when hit by an Attack: other Creatures within 10 ft Dex save vs Artificer DC. Fail: 3 Aid Dice Force and knocked 10 ft away. Success: half Damage, no other effect. Used until the Automaton and its Creator complete a Short or Long Rest together; at 0 HP it may use the Reaction even if expended." }),
  upgrade({ id: "bombtail", name: "Bombtail", target: "automaton", restriction: "airSupport", action: "action",
    uses: uses(1, "lr"), save: save("dex", true), dice: dice(5, "damage"),
    summary: "Action: a visible point within 60 ft; each Creature in a 10 ft radius sphere Dex save vs Artificer DC. Fail: 5 Aid Dice Thunder. Success: half. Used until the Automaton and its Creator complete a Long Rest together." }),
  upgrade({ id: "castleSystem", name: "CASTLE System", target: "automaton", action: "passive", dice: dice(1, "damage"),
    summary: "Cutting Edge Blades: Melee Weapon Attack, Bonus = PB + INT mod, Reach 5 ft, one target. Hit = STR mod + one Aid Die Slashing. When the Automaton takes the Attack Action it may Attack once more with this weapon." }),
  upgrade({ id: "electroshockCables", name: "Electroshock Cables", target: "automaton", action: "action",
    uses: uses(1, "srlr"), save: save("dex", false), dice: dice(3, "damage"),
    summary: "Action: a Creature it can see within 15 ft Dex save vs Artificer DC. Fail: 3 Aid Dice Lightning and Stunned until the end of its next Turn. Used until the Automaton and its Creator complete a Short or Long Rest together." }),
  upgrade({ id: "flamethrower", name: "Flamethrower", target: "automaton", action: "action",
    uses: uses(1, "srlr"), save: save("dex", true), dice: dice(3, "damage"),
    summary: "Action: a 20 ft Cone of flame. Every Creature in it Dex save vs Artificer DC. Fail: 3 Aid Dice Fire and Burning. Success: half, no further effects. Used until the Automaton and its Creator complete a Short or Long Rest together." }),
  upgrade({ id: "gasProjectors", name: "Gas Projectors", target: "automaton", action: "action",
    uses: uses(1, "lr"), save: save("con", true), dice: dice(2, "damage"),
    summary: "Action: toxic gas in a 10 ft radius sphere that moves with the Automaton for 1 minute. On entering or starting a Turn in it: Con save vs Artificer DC. Fail: 2 Aid Dice Poison and Poisoned until the start of its next Turn. Success: half, not Poisoned. Used until the Automaton and its Creator complete a Long Rest together." }),
  upgrade({ id: "hoistSystem", name: "HOIST System", target: "automaton", restriction: "airSupport", action: "passive",
    summary: "One Medium or smaller Humanoid within 5 ft that can see it and has a free hand can grab on: its Speed becomes 0 and the Automaton's Speed is halved. When the Automaton moves, it moves that Creature too (including flying movement)." }),
  upgrade({ id: "medicalDispenser", name: "Medical Dispenser", target: "automaton", restriction: "platform", action: "action",
    uses: uses("intMod", "sr"), dice: dice(1, "heal"),
    summary: "Action: a Creature it can see within 5 ft recovers Hit Points equal to one Aid Die. Uses per Short Rest equal to your INT modifier; all regained when the Automaton and its Creator complete a Short Rest together." }),
  upgrade({ id: "mobilitySystem", name: "Mobility System", target: "automaton", restriction: "turret", action: "passive",
    summary: "Walking Speed of 15 ft." }),
  upgrade({ id: "raptorArmour", name: "\"Raptor\" Armour", target: "automaton", action: "passive",
    summary: "Damage Reduction 4 against Physical Damage. If it already has Physical Damage Reduction, that amount is increased by 4." }),
  upgrade({ id: "reconnaissanceSuite", name: "Reconnaissance Suite", target: "automaton", action: "passive",
    summary: "When it deals Weapon Damage, that Creature gains no benefit of cover until the start of your next Turn. Bright spotlight: 30 ft cone of bright light with a further 30 ft of dim light." }),
  upgrade({ id: "rotaryCrossbow", name: "Rotary Crossbow", target: "automaton", restriction: "crossbow", action: "passive",
    summary: "Once per Turn, when it makes an Attack with a Crossbow, it may make one additional Attack with that Crossbow as part of that Action." }),
  upgrade({ id: "searchAndRescueSuite", name: "Search and Rescue Suite", target: "automaton", restriction: "platform", action: "action",
    save: save("str", false),
    summary: "Treated as two sizes larger for lifting and carrying. Action: a Creature within 5 ft. If unwilling, Str save vs Artificer DC. On a failed Save, or if willing, it may immediately move up to half its Speed, moving the Creature with it." }),
  upgrade({ id: "smokeLauncher", name: "Smoke Launcher", target: "automaton", action: "action",
    uses: uses("intMod", "sr"),
    summary: "Action: a 20 ft radius Sphere of smoke centred on the Automaton, lasting until the end of your next Turn. Attacks into or out of the smoke are made at Disadvantage. Uses per Short Rest equal to your INT modifier; all regained when the Automaton and its Creator complete a Short Rest together." }),
  upgrade({ id: "tracerShots", name: "Tracer Shots", target: "automaton", restriction: "crossbow", action: "passive",
    summary: "After it deals Damage to a Creature with its Crossbow, the next Ranged Attack against that Creature before the start of your next Turn is made at Advantage." }),
  upgrade({ id: "mountedCrossbow", name: "Mounted Crossbow", target: "cover", action: "passive",
    summary: "A Heavy Crossbow is mounted on the Mobile Cover. A Creature within 5 ft can use it as if equipped; it is Proficient with it if its INT is 8 or higher." }),
  upgrade({ id: "reinforced", name: "Reinforced", target: "cover", action: "passive",
    summary: "Three-Quarters Cover against Ranged Attacks, and Half Cover against Melee Attacks." }),
  upgrade({ id: "stimulantVaporiser", name: "Stimulant Vaporiser", target: "cover", action: "passive", dice: dice(1, "tempHP"),
    summary: "Creatures that begin their Turn within 5 ft gain Temporary Hit Points equal to one Aid Die. After one minute the vaporiser is exhausted and has no further effect." }),
  upgrade({ id: "ultralight", name: "Ultralight", target: "cover", action: "bonus",
    summary: "An allied Creature within 5 ft can use a Bonus Action to begin shoving the Mobile Cover. Until the end of its Turn, when it performs grounded movement it also moves the cover." })
]);

const UPGRADE_BY_ID = new Map(ARTIFICER_UPGRADES.map(entry => [entry.id, entry]));
export const upgradeById = id => UPGRADE_BY_ID.get(id) ?? null;
const requireUpgrade = id => {
  const entry = upgradeById(id);
  need(entry, "Unknown Heavy Duty Upgrade.");
  return entry;
};

/* ---------------------------------------------------------------- rules helpers */

/* upgradeCapFor (A4: 2, or 3 from Supporter level 17; Mobile Cover takes the same cap) is defined once, in artificer-features.mjs. */
export { upgradeCapFor };

/** Upgrades applied when a custom Automaton is created or Fort Builder is used: 1, or 2 from level 17. */
export function upgradesAtCreation(actor) {
  return (supporterLevel(actor) ?? 1) >= 17 ? 2 : 1;
}

/** Uses per Automaton for an upgrade. "intMod" resolves to the Artificer's INT modifier, never below 0. */
export function upgradeUseMax(entry, actor) {
  const max = entry?.uses?.max;
  if (typeof max === "number") return max;
  if (max === "intMod") return Math.max(0, Math.trunc(Number(actor?.system?.abilities?.int?.mod ?? 0)) || 0);
  return 0;
}

/** Restriction tags (C3:6583-6685): "crossbow" means an Air Support or Turret Automaton (both carry a Crossbow). */
export function restrictionMet(restriction, variant) {
  if (!restriction) return true;
  if (restriction === "crossbow") return variant === "airSupport" || variant === "turret";
  return variant === restriction;
}

const automatonInfo = doc => {
  const raw = flag(doc, "automaton") ?? {};
  return {
    creator: raw.creator ?? null,
    variant: raw.variant ?? null,
    upgrades: Array.isArray(raw.upgrades) ? [...raw.upgrades] : [],
    personality: raw.personality ?? null,
    destroyed: raw.destroyed === true,
    upgradeUses: raw.upgradeUses && typeof raw.upgradeUses === "object" ? raw.upgradeUses : {}
  };
};

function artificerState(actor) {
  const raw = flag(actor, "artificer") ?? {};
  return {
    automatons: Array.isArray(raw.automatons) ? [...raw.automatons] : [],
    covers: Array.isArray(raw.covers)
      ? raw.covers.map(cover => ({ ...cover, upgrades: [...(cover.upgrades ?? [])], upgradeUses: { ...(cover.upgradeUses ?? {}) } }))
      : []
  };
}

function automatonFor(uuid) {
  const doc = actorFromUuid(uuid);
  need(doc && flag(doc, "automaton"), "That is not a known Automaton (it has no Automaton record).");
  return doc;
}

/**
 * Resolves the one target a use or install names. A Mobile Cover upgrade on an Automaton (or the reverse) is a
 * technical impossibility, so it throws; cap, restriction and duplicate problems are separate warnings.
 */
function resolveSource(actor, entry, data) {
  const hasAutomaton = typeof data.automatonUuid === "string" && data.automatonUuid !== "";
  const hasCover = data.coverId !== undefined && data.coverId !== null && data.coverId !== "";
  need(hasAutomaton !== hasCover, "Choose exactly one target: an Automaton (automatonUuid) or a Mobile Cover (coverId).");
  if (hasAutomaton) {
    need(entry.target === "automaton", `${entry.name} is a Mobile Cover Upgrade: it can go only on a Mobile Cover, not on an Automaton.`);
    const doc = automatonFor(data.automatonUuid);
    return { kind: "automaton", doc, uuid: doc.uuid, name: doc.name, info: automatonInfo(doc) };
  }
  need(entry.target === "cover", `${entry.name} is an Automaton Upgrade: it can go only on an Automaton, not on a Mobile Cover.`);
  const cover = artificerState(actor).covers.find(candidate => candidate.id === data.coverId);
  need(cover, "No Mobile Cover with that id is recorded on this Artificer.");
  return { kind: "cover", cover, name: cover.label ?? cover.id };
}

const installedOn = source => source.kind === "automaton" ? source.info.upgrades : source.cover.upgrades;

/* ---------------------------------------------------------------- plans */

function installUpgrade(actor, state, data) {
  need(isArtificer(actor), "Heavy Duty Upgrades need the Artificer branch.");
  const entry = requireUpgrade(data.upgradeId);
  const timing = data.timing ?? "creation";
  need(TIMINGS.includes(timing), "Choose a timing: creation, fortBuilder or longRest.");
  const source = resolveSource(actor, entry, data);
  const warnings = [];

  const level = supporterLevel(actor) ?? 1;
  if (level < 4) warn(warnings, "level", `Heavy Duty Upgrades are a Supporter level 4 feature; this character is level ${level}.`);

  const cap = upgradeCapFor(actor);
  const current = installedOn(source);
  if (current.length >= cap) warn(warnings, "cap", `${source.name} already has ${current.length} Upgrade(s); the maximum is ${cap}.`);
  if (current.includes(entry.id)) warn(warnings, "duplicate", `${source.name} already has ${entry.name}.`);
  if (timing !== "longRest" && Number(data.eventCount ?? 0) >= upgradesAtCreation(actor)) {
    warn(warnings, "creationLimit", `This ${timing} event already applied ${upgradesAtCreation(actor)} Upgrade(s), the most a level ${level} Artificer can apply at once.`);
  }

  if (source.kind === "automaton") {
    if (!restrictionMet(entry.restriction, source.info.variant)) {
      const variant = VARIANT_LABELS[source.info.variant] ?? "unknown variant";
      warn(warnings, "restriction", `${entry.name}: ${RESTRICTION_TEXT[entry.restriction]}; ${source.name} is ${variant}.`);
    }
    if (source.info.creator && source.info.creator !== actor.uuid) warn(warnings, "creator", `${source.name} was created by someone else.`);
    if (source.info.destroyed) warn(warnings, "destroyed", `${source.name} is destroyed.`);
  }

  const timingLabel = { creation: "on creation", fortBuilder: "with Fort Builder", longRest: "as a Long Rest Activity" }[timing];
  return {
    title: `Install ${entry.name} on ${source.name}`,
    warnings,
    apply(next, receipt) {
      receipt.summary = `${actor.name} installed ${entry.name} on ${source.name} (${timingLabel}).`;
      receipt.result = { upgradeId: entry.id, targetName: source.name, timing };
      if (source.kind === "automaton") {
        receipt.targets = [{ uuid: source.uuid, name: source.name, kind: "automatonUpgrade", upgradeId: entry.id, ready: true }];
        return {};
      }
      const covers = artificerState(actor).covers.map(cover => cover.id === source.cover.id
        ? { ...cover, upgrades: [...cover.upgrades, entry.id] } : cover);
      return { "flags.ak5e.artificer.covers": covers };
    }
  };
}
/** The GM client may change an unowned Automaton only for the upgrade this receipt recorded. */
installUpgrade.validateTarget = (source, receipt, entry, target) => entry.kind === "automatonUpgrade"
  && target?.uuid === entry.uuid && entry.upgradeId === receipt.data?.upgradeId && flag(target, "automaton")?.creator === source.uuid;

/** Card for a use: the effect, the save rows (DC = Artificer DC) and the roll buttons. Nothing rolls until clicked. */
/* The engine wraps a card summary in a <p>, so the markup here uses inline elements only (no block nesting). */
function useCardHtml({ actor, source, entry, targets, die, dc }) {
  // The summary already states the action economy ("Action:", "Reaction", "Bonus Action"), so no separate label.
  const lines = [`<strong>${esc(entry.name)}</strong> (${esc(source.name)}): ${esc(entry.summary)}`];
  if (entry.save) {
    const ability = entry.save.ability.toUpperCase();
    lines.push(`${esc(ability)} Saving Throw vs Artificer DC ${esc(dc)}${entry.save.halfOnSave ? " (half Damage on a success)" : ""}.`);
    if (!targets.length) lines.push("No targets were listed for this use.");
    for (const target of targets) {
      lines.push(`<span class="ak5e-upgrade-save">${esc(target.name)} <button type="button" data-ak5e-upgrade-save="${esc(entry.save.ability)}" data-dc="${esc(dc)}" data-actor="${esc(target.uuid)}">Roll ${esc(ability)} save (DC ${esc(dc)})</button></span>`);
    }
  }
  if (entry.dice) {
    // `die` is the Aid Die size with its prefix ("d12"), so the formula is count + die.
    const formula = `${entry.dice.count}${die}`;
    lines.push(`<span class="ak5e-upgrade-roll">${esc(formula)} (${esc(entry.dice.kind)}) <button type="button" data-ak5e-upgrade-roll="${esc(formula)}" data-flavor="${esc(entry.name)}" data-actor="${esc(actor.uuid)}">Roll ${esc(formula)} ${esc(entry.dice.kind)}</button></span>`);
  }
  return lines.join("<br>");
}

function useUpgrade(actor, state, data) {
  need(isArtificer(actor), "Heavy Duty Upgrades need the Artificer branch.");
  const entry = requireUpgrade(data.upgradeId);
  const source = resolveSource(actor, entry, data);
  const warnings = [];
  if (!installedOn(source).includes(entry.id)) warn(warnings, "notInstalled", `${source.name} does not have ${entry.name} installed.`);
  if (source.kind === "automaton" && source.info.creator && source.info.creator !== actor.uuid) {
    warn(warnings, "creator", `${source.name} was created by someone else.`);
  }

  const targets = (Array.isArray(data.targets) ? data.targets : [])
    .map(uuid => ({ uuid, name: actorFromUuid(uuid)?.name ?? String(uuid) }));

  let spend = null;
  if (entry.uses) {
    const max = upgradeUseMax(entry, actor);
    const record = source.kind === "automaton" ? source.info.upgradeUses[entry.id] : source.cover.upgradeUses?.[entry.id];
    const used = Number(record?.used ?? 0);
    const left = Math.max(0, max - used);
    if (left < 1) warn(warnings, "overuse", `${entry.name} has ${left} of ${max} use(s) left; using it anyway is short by 1 and clamps at 0.`);
    spend = { max, used, left };
  }

  const dc = artificerDC(actor);
  const die = aidDieSize(supporterLevel(actor) ?? 1);
  return {
    title: `Use ${entry.name} (${source.name})`,
    warnings,
    apply(next, receipt) {
      const updates = {};
      if (spend) {
        if (spend.left < 1) receipt.shortfalls = [...(receipt.shortfalls ?? []), `${entry.name} short by 1 use (0 of ${spend.max} left)`];
        if (source.kind === "automaton") {
          receipt.targets = [{ uuid: source.uuid, name: source.name, kind: "automatonUses", upgradeId: entry.id, max: spend.max, ready: true }];
        } else {
          const delta = Math.min(1, spend.left);
          updates["flags.ak5e.artificer.covers"] = artificerState(actor).covers.map(cover => cover.id === source.cover.id
            ? { ...cover, upgradeUses: { ...cover.upgradeUses, [entry.id]: { used: Math.min(spend.max, spend.used + delta) } } } : cover);
        }
      }
      receipt.html = true;
      receipt.summary = useCardHtml({ actor, source, entry, targets, die, dc });
      receipt.result = { upgradeId: entry.id, dc, dieSize: die, targets: targets.map(target => target.uuid) };
      return updates;
    }
  };
}
useUpgrade.validateTarget = (source, receipt, entry, target) => entry.kind === "automatonUses"
  && target?.uuid === entry.uuid && entry.upgradeId === receipt.data?.upgradeId && flag(target, "automaton")?.creator === source.uuid;

/**
 * Basic Personality Matrix (C3:6923, level 4+). `choice` 1 to 6 takes that row of the Machine Personality table.
 * Without `choice` the card gets a Roll button (1d6, rolled only on that click) and the row is taken from the roll.
 */
function basicPersonalityMatrix(actor, state, data) {
  need(isArtificer(actor), "The Basic Personality Matrix needs the Artificer branch.");
  const doc = automatonFor(data.automatonUuid);
  const info = automatonInfo(doc);
  const warnings = [];
  const level = supporterLevel(actor) ?? 1;
  if (level < 4) warn(warnings, "level", `The Basic Personality Matrix is a Supporter level 4 feature; this character is level ${level}.`);
  if (info.creator && info.creator !== actor.uuid) warn(warnings, "creator", `${doc.name} was created by someone else.`);
  if (info.destroyed) warn(warnings, "destroyed", `${doc.name} is destroyed.`);
  if (info.personality) warn(warnings, "replace", `${doc.name} already has a personality (${info.personality}); this replaces it.`);

  const hasChoice = data.choice !== undefined && data.choice !== null && data.choice !== "";
  // The d6 result (1 to 6) or the personality's name from the table (C3:6914-6921).
  const named = hasChoice ? MACHINE_PERSONALITIES.findIndex(name => name.toLowerCase() === String(data.choice).trim().toLowerCase()) : -1;
  const choice = hasChoice ? (named >= 0 ? named + 1 : Number(data.choice)) : null;
  if (hasChoice) need(Number.isInteger(choice) && choice >= 1 && choice <= 6, "Choose a personality from 1 to 6, or by name.");

  return {
    title: `Basic Personality Matrix: ${doc.name}`,
    warnings,
    apply(next, receipt) {
      const entry = { uuid: doc.uuid, name: doc.name, kind: "automatonPersonality" };
      if (choice) {
        receipt.summary = `${actor.name} instilled the ${MACHINE_PERSONALITIES[choice - 1]} personality in ${doc.name}.`;
        receipt.targets = [{ ...entry, value: MACHINE_PERSONALITIES[choice - 1], ready: true }];
      } else {
        receipt.summary = `${actor.name} instils a personality in ${doc.name}: roll the Machine Personality d6 with the Roll button on this card.`;
        receipt.formula = "1d6";
        receipt.rollLabel = "Machine Personality (d6)";
        receipt.targets = [{ ...entry, ready: false }];
      }
      receipt.result = { choice };
      return {};
    }
  };
}
basicPersonalityMatrix.validateTarget = (source, receipt, entry, target) => entry.kind === "automatonPersonality"
  && target?.uuid === entry.uuid && flag(target, "automaton")?.creator === source.uuid;

export const artificerUpgradePlans = Object.freeze({
  installUpgrade,
  useUpgrade,
  basicPersonalityMatrix
});

/* ---------------------------------------------------------------- target kinds (Automaton side of each change) */

const appliedKey = (useId, source) => opaqueKey(`${useId}:${source.uuid}`);
const appliedRecord = (target, source, useId) => flag(target, supporterUses.appliedFlag)?.[appliedKey(useId, source)] ?? null;
const appliedPath = (source, useId) => `flags.ak5e.${supporterUses.appliedFlag}.${appliedKey(useId, source)}`;

const ARTIFICER_TARGET_KINDS = Object.freeze({
  automatonUpgrade: {
    async apply(source, useId, entry, target) {
      const done = appliedRecord(target, source, useId);
      if (done) return done;
      const applied = { upgradeId: entry.upgradeId };
      await target.update({
        "flags.ak5e.automaton.upgrades": [...automatonInfo(target).upgrades, entry.upgradeId],
        [appliedPath(source, useId)]: applied
      });
      return applied;
    },
    async revert(source, useId, _entry, target) {
      const applied = appliedRecord(target, source, useId);
      if (!applied) return { removed: 0 };
      const upgrades = automatonInfo(target).upgrades;
      const index = upgrades.indexOf(applied.upgradeId);
      if (index >= 0) upgrades.splice(index, 1);
      await target.update({ "flags.ak5e.automaton.upgrades": upgrades, [appliedPath(source, useId)]: null });
      return { removed: index >= 0 ? 1 : 0 };
    },
    preview(source, receipt, entry, target) {
      return appliedRecord(target, source, receipt.id)
        ? `${entry.name}: removed from ${target?.name ?? entry.name}.`
        : `${entry.name}: nothing recorded to remove.`;
    }
  },
  automatonUses: {
    async apply(source, useId, entry, target) {
      const done = appliedRecord(target, source, useId);
      if (done) return done;
      const used = Number(automatonInfo(target).upgradeUses[entry.upgradeId]?.used ?? 0);
      const delta = Math.min(1, Math.max(0, entry.max - used));
      const applied = { upgradeId: entry.upgradeId, before: used, delta };
      await target.update({
        [`flags.ak5e.automaton.upgradeUses.${entry.upgradeId}.used`]: used + delta,
        [appliedPath(source, useId)]: applied
      });
      return applied;
    },
    async revert(source, useId, entry, target) {
      const applied = appliedRecord(target, source, useId);
      if (!applied) return { removed: 0 };
      const current = Number(automatonInfo(target).upgradeUses[applied.upgradeId]?.used ?? 0);
      await target.update({
        [`flags.ak5e.automaton.upgradeUses.${applied.upgradeId}.used`]: Math.max(0, current - applied.delta),
        [appliedPath(source, useId)]: null
      });
      return { removed: applied.delta };
    },
    preview(source, receipt, entry, target) {
      const applied = appliedRecord(target, source, receipt.id);
      return applied ? `${entry.name}: restores ${applied.delta} use(s).` : `${entry.name}: nothing recorded to restore.`;
    }
  },
  automatonPersonality: {
    async apply(source, useId, entry, target) {
      const done = appliedRecord(target, source, useId);
      if (done) return done;
      const name = entry.value ?? MACHINE_PERSONALITIES[Number(entry.amount) - 1];
      need(name, "No personality result yet.");
      const applied = { before: automatonInfo(target).personality, after: name };
      await target.update({ "flags.ak5e.automaton.personality": name, [appliedPath(source, useId)]: applied });
      return applied;
    },
    async revert(source, useId, _entry, target) {
      const applied = appliedRecord(target, source, useId);
      if (!applied) return { removed: 0 };
      await target.update({ "flags.ak5e.automaton.personality": applied.before ?? null, [appliedPath(source, useId)]: null });
      return { removed: 1 };
    },
    preview(source, receipt, entry, target) {
      const applied = appliedRecord(target, source, receipt.id);
      return applied ? `${entry.name}: personality back to ${applied.before ?? "none"}.` : `${entry.name}: nothing recorded to remove.`;
    },
    rolled(entry, total) { entry.amount = total; },
    rollText(entry) {
      return `${entry.name}: Machine Personality roll ${entry.amount} (${MACHINE_PERSONALITIES[Number(entry.amount) - 1] ?? "unknown"}).`;
    }
  }
});

/**
 * Registers the Automaton target kinds with the Supporter engine. Upgrade uses and state live in flags, not in
 * resource pools, so there are no pools to define. Idempotent (a re-register replaces the same kinds).
 */
export function defineArtificerUpgradePools() {
  supporterUses.register({ targetKinds: ARTIFICER_TARGET_KINDS });
  return Object.freeze({ targetKinds: Object.keys(ARTIFICER_TARGET_KINDS) });
}

/* ---------------------------------------------------------------- recovery (A5) */

function recoveryMatches(recovery, restType) {
  if (recovery === "srlr") return restType === "short" || restType === "long";
  if (recovery === "sr") return restType === "short";
  if (recovery === "lr") return restType === "long";
  return false;
}

/**
 * On the Creator's rest, recovers each Automaton upgrade use whose recovery matches the rest. A sharedRest use
 * recovers only when the Automaton is not destroyed (ruling A5), and a reminder is posted that the Automaton must
 * complete the rest alongside its Creator. An Automaton the current user cannot write is reported, not changed.
 */
export async function recoverUpgradeUses(actor, restType) {
  const result = { recovered: [], reminders: [], skipped: [] };
  for (const uuid of artificerState(actor).automatons) {
    const doc = actorFromUuid(uuid);
    if (!doc || !flag(doc, "automaton")) continue;
    const info = automatonInfo(doc);
    const updates = {};
    for (const [upgradeId, record] of Object.entries(info.upgradeUses)) {
      const entry = upgradeById(upgradeId);
      if (!entry?.uses || !recoveryMatches(entry.uses.recovery, restType)) continue;
      if (!(Number(record?.used) > 0)) continue;
      if (entry.uses.sharedRest && info.destroyed) {
        result.skipped.push(`${entry.name} (${doc.name} is destroyed)`);
        continue;
      }
      updates[`flags.ak5e.automaton.upgradeUses.${upgradeId}.used`] = 0;
      result.recovered.push(`${entry.name} (${doc.name})`);
      if (entry.uses.sharedRest) result.reminders.push(`${entry.name} (${doc.name})`);
    }
    if (Object.keys(updates).length) {
      if (doc.isOwner || game.user?.isGM) await doc.update(updates);
      else result.skipped.push(`${doc.name} is not writable by this user; the GM must reset its uses`);
    }
  }
  if (result.reminders.length && globalThis.ChatMessage?.implementation) {
    const label = restType === "long" ? "Long Rest" : "Short Rest";
    await ChatMessage.implementation.create({
      speaker: ChatMessage.implementation.getSpeaker({ actor }),
      content: `<p>${esc(actor.name)} completed a ${esc(label)}. Recovered: ${esc(result.reminders.join(", "))}.</p>`
        + "<p><strong>Reminder:</strong> the Automaton must also complete a Short or Long Rest at the same time as its Creator for these uses to recover.</p>"
    });
  }
  return result;
}

/* ---------------------------------------------------------------- card buttons */

const notify = error => {
  console.error("AK5e | Artificer upgrade card", error);
  globalThis.ui?.notifications?.error?.(error?.message ?? String(error));
};

async function clickSave(button) {
  const target = actorFromUuid(button.dataset.actor);
  need(target?.isOwner, "Only the target's owner may roll this save.");
  // dnd5e 5.x save API, as elsewhere in the module: the native save pipeline (bonuses, advantage, dialog).
  return target.rollSavingThrow({ ability: button.dataset.ak5eUpgradeSave, target: Number(button.dataset.dc) });
}

async function clickRoll(button) {
  const actor = actorFromUuid(button.dataset.actor);
  need(actor?.isOwner, "Only the owner of this Artificer may roll these dice.");
  const roll = await new Roll(button.dataset.ak5eUpgradeRoll, actor.getRollData?.() ?? {}).evaluate();
  await roll.toMessage({ speaker: ChatMessage.implementation.getSpeaker({ actor }), flavor: button.dataset.flavor });
}

/** renderChatMessageHTML: wires each upgrade card button once. Nothing rolls until a click. */
export function renderArtificerCardButtons(message, html) {
  const root = html?.querySelectorAll ? html : html?.[0];
  if (!root?.querySelectorAll) return;
  for (const button of root.querySelectorAll("[data-ak5e-upgrade-save], [data-ak5e-upgrade-roll]")) {
    if (button.dataset.ak5eBound) continue;
    button.dataset.ak5eBound = "1";
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      button.disabled = true;
      Promise.resolve()
        .then(() => (button.dataset.ak5eUpgradeSave !== undefined ? clickSave(button) : clickRoll(button)))
        .catch(notify)
        .finally(() => { button.disabled = false; });
    });
  }
}

/* ---------------------------------------------------------------- panel and commands */

const ARTIFICER_COMMANDS = Object.freeze(["artificerInstallUpgrade", "artificerUseUpgrade", "artificerPersonality"]);

/** Artificer Upgrades panel (Features tab). Buttons use data-supporter-cmd, dispatched to artificerUpgradeCommand(). */
export function artificerUpgradePanel(actor) {
  if (!isArtificer(actor)) return "";
  const state = artificerState(actor);
  const rows = state.automatons.map(uuid => {
    const doc = actorFromUuid(uuid);
    if (!doc) return "";
    const info = automatonInfo(doc);
    const names = info.upgrades.length ? info.upgrades.map(id => esc(upgradeById(id)?.name ?? id)).join(", ") : "no upgrades";
    return `<li>${esc(doc.name)} (${esc(VARIANT_LABELS[info.variant] ?? "variant unset")}): ${names}; cap ${upgradeCapFor(actor)}${info.destroyed ? "; destroyed" : ""}</li>`;
  });
  const covers = state.covers.map(cover => `<li>${esc(cover.label ?? cover.id)} (Mobile Cover): ${cover.upgrades.length ? cover.upgrades.map(id => esc(upgradeById(id)?.name ?? id)).join(", ") : "no upgrades"}</li>`);
  const cmd = (name, label) => `<button type="button" data-supporter-cmd="${esc(name)}">${esc(label)}</button>`;
  return `<section class="ak5e-artificer-upgrades"><h4>Heavy Duty Upgrades</h4><ul>${rows.concat(covers).join("")}</ul>`
    + `<div>${cmd("artificerInstallUpgrade", "Install Upgrade")} ${cmd("artificerUseUpgrade", "Use Upgrade")} ${cmd("artificerPersonality", "Machine Personality")}</div></section>`;
}

async function formDialog(title, content, read) {
  return foundry.applications.api.DialogV2.wait({
    window: { title }, position: { width: 520 }, rejectClose: false,
    content: `<div class="ak5e-upgrade-form">${content}</div>`,
    buttons: [
      { action: "ok", label: "Continue", default: true, callback: (_event, button) => read(button.form.elements) },
      { action: "cancel", label: "Cancel", callback: () => false }
    ]
  });
}

const sourceOptions = actor => {
  const state = artificerState(actor);
  return [
    ...state.automatons.map(uuid => actorFromUuid(uuid)).filter(Boolean).map(doc => ({ value: `auto:${doc.uuid}`, label: `Automaton: ${doc.name}` })),
    ...state.covers.map(cover => ({ value: `cover:${cover.id}`, label: `Mobile Cover: ${cover.label ?? cover.id}` }))
  ];
};
const selectHtml = (name, options) => `<select name="${name}">${options.map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join("")}</select>`;
const sourceRef = value => {
  const [kind, ...rest] = String(value ?? "").split(":");
  const id = rest.join(":");
  return kind === "auto" ? { automatonUuid: id } : { coverId: id };
};

async function promptInstall(actor) {
  const upgrades = ARTIFICER_UPGRADES.map(entry => ({ value: entry.id, label: `${entry.name} (${entry.target === "cover" ? "cover" : "Automaton"})` }));
  const timings = [{ value: "creation", label: "On creation" }, { value: "fortBuilder", label: "Fort Builder" }, { value: "longRest", label: "Long Rest Activity" }];
  const content = `<p>Target</p>${selectHtml("source", sourceOptions(actor))}<p>Upgrade</p>${selectHtml("upgradeId", upgrades)}<p>Timing</p>${selectHtml("timing", timings)}`;
  return formDialog("Install Heavy Duty Upgrade", content, elements => ({ ...sourceRef(elements.source.value), upgradeId: elements.upgradeId.value, timing: elements.timing.value }));
}

async function promptUse(actor) {
  const options = sourceOptions(actor);
  const content = `<p>Source</p>${selectHtml("source", options)}<p>Upgrade (as listed on the source)</p><input name="upgradeId" type="text" placeholder="e.g. flamethrower">`;
  return formDialog("Use Upgrade", content, elements => {
    const targets = [...(game.user?.targets ?? [])].map(token => token.actor?.uuid).filter(Boolean);
    return { ...sourceRef(elements.source.value), upgradeId: String(elements.upgradeId.value ?? "").trim(), targets };
  });
}

async function promptPersonality(actor) {
  const automatons = artificerState(actor).automatons.map(uuid => actorFromUuid(uuid)).filter(Boolean).map(doc => ({ value: doc.uuid, label: doc.name }));
  const choices = [{ value: "", label: "Roll the d6 (Roll button on the card)" }, ...MACHINE_PERSONALITIES.map((name, index) => ({ value: String(index + 1), label: `${index + 1}: ${name}` }))];
  const content = `<p>Automaton</p>${selectHtml("automatonUuid", automatons)}<p>Personality</p>${selectHtml("choice", choices)}`;
  return formDialog("Basic Personality Matrix", content, elements => ({ automatonUuid: elements.automatonUuid.value, choice: elements.choice.value || undefined }));
}

/**
 * Panel command dispatcher. Returns undefined for a command it does not own, so the branch can fall through.
 * Each command asks, then runs the engine use through confirmPlayUse (warnings, GM rulings, Cancel changes nothing).
 */
export async function artificerUpgradeCommand(actor, cmd) {
  if (!ARTIFICER_COMMANDS.includes(cmd)) return undefined;
  need(isArtificer(actor), "Artificer commands need the Artificer branch.");
  const choice = cmd === "artificerInstallUpgrade" ? await promptInstall(actor)
    : cmd === "artificerUseUpgrade" ? await promptUse(actor) : await promptPersonality(actor);
  if (!choice) return null;
  const name = { artificerInstallUpgrade: "installUpgrade", artificerUseUpgrade: "useUpgrade", artificerPersonality: "basicPersonalityMatrix" }[cmd];
  const opId = foundry.utils.randomID();
  return confirmPlayUse(name, extra => supporterUses.execute(actor, name, { ...choice, ...extra }, opId), { confirmed: true });
}

/* ---------------------------------------------------------------- hooks and API */

let hooksInstalled = false;

/** Idempotent: installs the rest recovery, the card wiring and the target kinds once. */
export function registerArtificerUpgradeHooks() {
  if (hooksInstalled) return;
  hooksInstalled = true;
  defineArtificerUpgradePools();
  if (typeof globalThis.Hooks?.on === "function") {
    globalThis.Hooks.on("dnd5e.restCompleted", (actor, result, config = {}) => {
      if (!actor?.isOwner || !isArtificer(actor)) return undefined;
      const type = config.type ?? result?.type ?? (config.longRest ? "long" : "short");
      return recoverUpgradeUses(actor, type).catch(error => console.error("AK5e | Artificer upgrade recovery", error));
    });
    globalThis.Hooks.on("renderChatMessageHTML", (message, html) => {
      try { renderArtificerCardButtons(message, html); }
      catch (error) { console.error("AK5e | Artificer upgrade card", error); }
    });
  }
}

export const artificerUpgradeApi = Object.freeze({
  upgrades: ARTIFICER_UPGRADES,
  upgradeById,
  upgradeCapFor,
  upgradesAtCreation,
  upgradeUseMax,
  restrictionMet,
  personalities: MACHINE_PERSONALITIES,
  install: (actor, data) => supporterUses.execute(actor, "installUpgrade", data, foundry.utils.randomID()),
  use: (actor, data) => supporterUses.execute(actor, "useUpgrade", data, foundry.utils.randomID()),
  personality: (actor, data) => supporterUses.execute(actor, "basicPersonalityMatrix", data, foundry.utils.randomID()),
  undo: (actor, useId) => supporterUses.undo(actor, useId),
  recover: recoverUpgradeUses
});
