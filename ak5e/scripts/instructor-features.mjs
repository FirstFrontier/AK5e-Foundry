/**
 * Guard Subclass: Instructor (Chapter 3: L2846–L2936)
 *
 * 1st Level:
 * - Squad Leader: Attack Action enables Help as Bonus Action; Help attack range 30 ft (if seen/heard).
 * - Instruction: Help Action enables issuing 1 Instruction to the helped ally, costing 1 Instruction Die.
 * - Instruction Dice: 4 at 1st, 5 at 7th, 6 at 14th; d6 size; Short/Long Rest recovery.
 *
 * 4th Level:
 * - Teach from Experience:
 *   - From Experience: Start of turn in Combat, choose 1 Instruction and gain its benefit for self.
 *   - Press the Attack: Cooperative Combat (1 Aggression): Issue Instruction to ally, also gain benefit for self.
 *
 * 10th Level:
 * - Kingmaker: Once per Turn, when issuing an Instruction, choose second ally within 30 ft and issue
 *   the same Instruction for free with a fixed d6 Instruction Die.
 *
 * 13th Level:
 * - Superior Instruction:
 *   - Improved Instruction Dice: Die size increases from d6 to d10.
 *   - Renowned Instructor: On Initiative, if fewer than half max dice remain, recover up to half (ceil).
 *
 * 17th Level:
 * - Once More Unto The Breach: Action, 1/Long Rest. Help & Instruction to all allies within 60 ft without
 *   consuming Instruction Dice (cannot trigger Kingmaker).
 *
 * 10 Instruction Options:
 * - Defend Yourself!: AC + half die roll until end of next turn.
 * - Focus!: Next Skill Check + 1 die roll before start of Instructor's next turn.
 * - Get out of there!: Move 3 dice rounded to 5 ft without OA from starting reach.
 * - Go!: Move half Speed + 3 dice rounded to 5 ft.
 * - Hang in there!: Death save bonus + 1 die roll; > 20 counts as nat 20.
 * - Keep fighting!: Temp HP + 1 die roll.
 * - Now's your chance!: Next Attack roll + 1 die roll before end of next turn.
 * - Snap out of it!: Immediate save against turn-start/end effect + 1 die roll.
 * - Steel Yourself!: Next saving throw within 1 min + 1 die roll.
 * - Strike!: Reaction attack/cantrip deals + 1 die roll damage.
 */

import {
  GUARD_CLASS_ID,
  guardEnabled,
  guardLevel,
  guardBranch,
  INSTRUCTION_DICE_STEPS,
  instructionDiceMax,
  instructionDieFaces
} from "./guard-rules.mjs";
import { guardUses } from "./guard-uses.mjs";
import { defineGuardPools } from "./guard-features.mjs";
import { definePool, getPoolDefinition, setPool } from "./resource-pools.mjs";
import { warn, spendResource, resourceValue } from "./play-uses.mjs";
import { need } from "./operation-kernel.mjs";

const flag = (doc, key) => doc?.getFlag?.("ak5e", key) ?? doc?.flags?.ak5e?.[key];

export function isInstructor(actor) {
  if (!guardEnabled(actor)) return false;
  if (guardBranch(actor) === "instructor") return true;
  return Array.from(actor.items?.values?.() ?? []).some(item =>
    flag(item, "chapterThreeId")?.startsWith("subclass-feature-guard-instructor")
  );
}

export function defineInstructorPools() {
  defineGuardPools();
  if (!getPoolDefinition("instructionDice")) {
    definePool({
      id: "instructionDice",
      label: "Instruction Dice",
      max: INSTRUCTION_DICE_STEPS,
      initial: "max",
      classId: GUARD_CLASS_ID,
      levelBasis: "classLevel",
      appliesTo: actor => isInstructor(actor),
      recovery: [{ on: "sr", amount: "toMax" }, { on: "lr", amount: "toMax" }]
    });
  }
  if (!getPoolDefinition("breach")) {
    definePool({
      id: "breach",
      label: "Once More Unto The Breach",
      max: 1,
      initial: "max",
      classId: GUARD_CLASS_ID,
      levelBasis: "classLevel",
      appliesTo: actor => isInstructor(actor) && (guardLevel(actor) ?? 1) >= 17,
      recovery: [{ on: "lr", amount: "toMax" }]
    });
  }
}

const levelWarning = (warnings, actor, requiredLevel, featureName) => {
  const current = guardLevel(actor) ?? 1;
  if (current < requiredLevel) {
    warn(warnings, "level", `${featureName} is an Instructor level ${requiredLevel} feature; this character is level ${current}.`);
  }
};

/* ---------------------------------------------------------------- Instruction Data */

export const INSTRUCTIONS = Object.freeze({
  defendYourself: {
    name: "Defend Yourself!",
    diceCount: 1,
    summary: (actor, targetName, formula) =>
      `${actor.name} instructs ${targetName} to defend: AC increased by half of ${formula} until end of next Turn.`
  },
  focus: {
    name: "Focus!",
    diceCount: 1,
    summary: (actor, targetName, formula) =>
      `${actor.name} instructs ${targetName} to focus: +${formula} bonus on next Skill Check before start of next Turn.`
  },
  getOutOfThere: {
    name: "Get out of there!",
    diceCount: 3,
    summary: (actor, targetName, formula) =>
      `${actor.name} instructs ${targetName} to reposition: may immediately move ${formula} (rounded to 5 ft) without Opportunity Attacks from initial Reach.`
  },
  go: {
    name: "Go!",
    diceCount: 3,
    summary: (actor, targetName, formula) =>
      `${actor.name} commands ${targetName} to advance: may immediately move half Speed + ${formula} (rounded to 5 ft).`
  },
  hangInThere: {
    name: "Hang in there!",
    diceCount: 1,
    summary: (actor, targetName, formula) =>
      `${actor.name} rallies ${targetName}: +${formula} bonus to next Death Saving Throw (result > 20 counts as nat 20).`
  },
  keepFighting: {
    name: "Keep fighting!",
    diceCount: 1,
    summary: (actor, targetName, formula) =>
      `${actor.name} spurs ${targetName}: gains ${formula} Temporary Hit Points.`
  },
  nowIsYourChance: {
    name: "Now's your chance!",
    diceCount: 1,
    summary: (actor, targetName, formula) =>
      `${actor.name} spots an opening for ${targetName}: +${formula} bonus on next Attack Roll before end of next Turn.`
  },
  snapOutOfIt: {
    name: "Snap out of it!",
    diceCount: 1,
    summary: (actor, targetName, formula) =>
      `${actor.name} shouts to ${targetName}: immediately attempt saving throw with +${formula} bonus.`
  },
  steelYourself: {
    name: "Steel Yourself!",
    diceCount: 1,
    summary: (actor, targetName, formula) =>
      `${actor.name} braces ${targetName}: +${formula} bonus on next Saving Throw within 1 minute.`
  },
  strike: {
    name: "Strike!",
    diceCount: 1,
    summary: (actor, targetName, formula) =>
      `${actor.name} directs ${targetName} to strike: may spend Reaction to Attack or cast Action Cantrip dealing +${formula} damage.`
  }
});

export function getInstructionFormula(actor, instructionKey, { isKingmaker = false } = {}) {
  const instr = INSTRUCTIONS[instructionKey];
  need(instr, `Unknown instruction "${instructionKey}".`);
  const faces = isKingmaker ? 6 : instructionDieFaces(guardLevel(actor) ?? 1);
  return `${instr.diceCount}d${faces}`;
}

export async function renownedInstructorInitiative(actor) {
  if (!isInstructor(actor) || (guardLevel(actor) ?? 1) < 13) return null;
  const current = resourceValue(actor, { pool: "instructionDice" });
  const poolMax = Math.max(1, instructionDiceMax(guardLevel(actor)));
  const halfMax = Math.ceil(poolMax / 2);
  if (current < halfMax) {
    await setPool(actor, "instructionDice", halfMax);
    return { regained: halfMax - current, total: halfMax };
  }
  return null;
}

/* ---------------------------------------------------------------- Instructor Plans */

export const INSTRUCTOR_PLANS = {
  instruction(actor, _state, data) {
    need(isInstructor(actor), "Instruction is an Instructor feature.");
    const warnings = [];

    const key = String(data.instruction ?? data.option ?? "defendYourself");
    const instr = INSTRUCTIONS[key];
    need(instr, `Choose a valid Instruction: ${Object.keys(INSTRUCTIONS).join(", ")}.`);

    const isKingmaker = Boolean(data.isKingmaker);
    const isFree = Boolean(data.free || isKingmaker);
    const isCooperative = Boolean(data.cooperativeCombat);

    if (isKingmaker) {
      levelWarning(warnings, actor, 10, "Kingmaker");
    }

    if (!isFree) {
      const diceRemaining = resourceValue(actor, { pool: "instructionDice" });
      if (diceRemaining < 1) {
        warn(warnings, "instructionDice", `1 Instruction Die needed and ${diceRemaining} remain.`);
      }
    }

    if (isCooperative) {
      levelWarning(warnings, actor, 4, "Press the Attack: Cooperative Combat");
      const aggressionRemaining = resourceValue(actor, { pool: "aggression" });
      if (aggressionRemaining < 1) {
        warn(warnings, "aggression", `1 Aggression needed and ${aggressionRemaining} remain.`);
      }
    }

    const formula = getInstructionFormula(actor, key, { isKingmaker });
    const targetName = data.targetName ?? (data.targetUuid ? "ally" : "target");

    return {
      warnings,
      title: `Instruction: ${instr.name}${isKingmaker ? " (Kingmaker)" : ""}`,
      rolls: [
        { id: "instructionDie", label: `${instr.name} Die`, formula }
      ],
      apply(next, receipt) {
        let updates = {};
        if (!isFree) {
          updates = spendResource(actor, receipt, { pool: "instructionDice", amount: 1, label: "Instruction Dice" });
        }
        if (isCooperative) {
          const aggrUpdates = spendResource(actor, receipt, { pool: "aggression", amount: 1, label: "Aggression" });
          updates = { ...updates, ...aggrUpdates };
        }

        receipt.formula = formula;
        receipt.rollLabel = `${instr.name} (${formula})`;
        receipt.summary = instr.summary(actor, targetName, formula) +
          (isCooperative ? ` (Cooperative Combat: ${actor.name} also gains the benefit for 1 Aggression)` : "");
        receipt.result = {
          instruction: key,
          formula,
          targetUuid: data.targetUuid ?? null,
          isKingmaker,
          isCooperative
        };

        return updates;
      }
    };
  },

  teachFromExperience(actor, _state, data) {
    need(isInstructor(actor), "Teach from Experience is an Instructor feature.");
    const warnings = [];
    levelWarning(warnings, actor, 4, "Teach from Experience");

    const key = String(data.instruction ?? data.option ?? "defendYourself");
    const instr = INSTRUCTIONS[key];
    need(instr, `Choose a valid Instruction: ${Object.keys(INSTRUCTIONS).join(", ")}.`);

    const formula = getInstructionFormula(actor, key, { isKingmaker: false });

    return {
      warnings,
      title: `Teach from Experience: ${instr.name}`,
      rolls: [
        { id: "experienceDie", label: `${instr.name} Die`, formula }
      ],
      apply(next, receipt) {
        receipt.formula = formula;
        receipt.rollLabel = `${instr.name} (${formula})`;
        receipt.summary = `${actor.name} applies ${instr.name} to self from experience (${formula}) at turn start without expending an Instruction Die.`;
        receipt.result = { instruction: key, formula, selfOnly: true };
        return {};
      }
    };
  },

  onceMoreUntoTheBreach(actor, _state, data) {
    need(isInstructor(actor), "Once More Unto The Breach is an Instructor feature.");
    const warnings = [];
    levelWarning(warnings, actor, 17, "Once More Unto The Breach");

    const available = resourceValue(actor, { pool: "breach" });
    if (available < 1) {
      warn(warnings, "breach", `1 use of Once More Unto The Breach needed and ${available} remain.`);
    }

    const targets = Array.isArray(data.targets) ? data.targets : [];

    return {
      warnings,
      title: "Once More Unto The Breach",
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "breach", amount: 1, label: "Once More Unto The Breach" });
        receipt.summary = `${actor.name} issues a mass Help Action and Instructions to all allies within 60 ft without consuming Instruction Dice.`;
        receipt.result = { targetCount: targets.length, targets };
        return updates;
      }
    };
  }
};

guardUses.register({ plans: INSTRUCTOR_PLANS });

export function registerInstructorHooks() {
  defineInstructorPools();
  if (globalThis.Hooks?.on) {
    Hooks.on("dnd5e.rollInitiative", renownedInstructorInitiative);
  }
}

defineInstructorPools();
