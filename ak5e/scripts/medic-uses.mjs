/**
 * Medic table-play use engine (WORKFLOW.md §3.2, play-uses.mjs):
 * Base Medic, Physician, and Triage register their plans here.
 * Receipts live in `flags.ak5e.medicUses`; rulings are read from `flags.ak5e.medic.rulings`.
 * Follows "trust the table": confirm before use, non-blocking warnings with "Use anyway",
 * resource shortfall clamping at 0, no auto-rolled dice, automatic GM relay for unowned targets,
 * encounter-window undo receipts.
 */
import { createPlayUses, warn, spendResource, resourceValue } from "./play-uses.mjs";
import {
  medicEnabled,
  medicLevel,
  medicBranch,
  isMedic,
  isPhysician,
  isTriage,
  medicSpellcastingAbility,
  medicSpellDC,
  medicSpellAttackMod,
  pbForLevel,
  flag
} from "./medic-rules.mjs";
import {
  lifeSupport,
  resuscitation,
  mobileHospital,
  medicState,
  inpatientCareHeal,
  toRobTheFerrymanBonus,
  hasSurgeonGeneral
} from "./medic-features.mjs";
import { need, opaqueKey } from "./operation-kernel.mjs";
import { spendReaction, getReactions } from "./trigger-events.mjs";

const isConstruct = actor => String(actor?.system?.details?.type?.value ?? "").toLowerCase() === "construct";

export const medicUses = createPlayUses({
  ns: "medicUses",
  label: "Medic",
  isMember: actor => medicEnabled(actor),
  ruling: (actor, key) => {
    const record = flag(actor, "medic")?.rulings?.[key];
    return record?.source?.trim?.() && record.value !== undefined ? record.value : undefined;
  }
});

/** GM-only: record a ruling for an unresolved reading. */
export async function recordMedicRuling(actor, key, value, source) {
  need(game.user.isGM && actor?.isOwner, "Only the GM may record Medic rulings.");
  const reading = medicUses.readings()[key];
  need(reading?.options.some(option => option.value === value), "Choose a supported ruling value.");
  need(typeof source === "string" && source.trim().length >= 10, "Record the source and reason for this ruling (at least 10 characters).");
  await actor.update({ [`flags.ak5e.medic.rulings.${key}`]: { value, source: source.trim(), approvedBy: game.user.id } });
  return flag(actor, "medic")?.rulings?.[key];
}

const levelWarning = (warnings, actor, requiredLevel, featureName) => {
  const current = medicLevel(actor) ?? 1;
  if (current < requiredLevel) {
    warn(warnings, "level", `${featureName} is a Medic level ${requiredLevel} feature; this character is level ${current}.`);
  }
};

const branchWarning = (warnings, actor, requiredBranch, featureName) => {
  const branch = medicBranch(actor);
  if (branch !== requiredBranch) {
    warn(warnings, "branch", `${featureName} requires the ${requiredBranch} subclass; this character has ${branch ?? "no branch"}.`);
  }
};

function resolveTarget(data) {
  if (data.target && typeof data.target === "object") return data.target;
  if (data.targetUuid) {
    const doc = globalThis.fromUuidSync?.(data.targetUuid);
    return doc?.actor ?? doc ?? null;
  }
  return null;
}

function resolveTargets(data) {
  const result = [];
  if (Array.isArray(data.targetUuids)) {
    for (const u of data.targetUuids) {
      const doc = resolveTarget({ targetUuid: u });
      if (doc) result.push(doc);
    }
  } else if (Array.isArray(data.targets)) {
    for (const t of data.targets) {
      const doc = resolveTarget({ target: t });
      if (doc) result.push(doc);
    }
  } else if (data.target || data.targetUuid) {
    const doc = resolveTarget(data);
    if (doc) result.push(doc);
  }
  return result;
}

/* ---------------------------------------------------------------- Plan Definitions */

export const MEDIC_PLANS = {
  /* --- Base Medic Features --- */

  touchHeal(actor, _state, data) {
    need(medicEnabled(actor), "Touch Heal is a Medic feature.");
    const warnings = [];
    const amount = Number(data.amount ?? 1);
    need(Number.isInteger(amount) && amount >= 1, "Choose a whole number of Life Support to spend.");

    const target = resolveTarget(data);
    if (!target) {
      warn(warnings, "target", "No target creature specified for Touch Heal.");
    } else {
      if (isConstruct(target)) {
        warn(warnings, "construct", "Constructs cannot regain Hit Points from class features or Healing Arts (Ch. 1 L138).");
      }
    }

    const available = resourceValue(actor, { pool: "lifeSupport" });
    if (available < amount) {
      warn(warnings, "lifeSupport", `${amount} Life Support needed and ${available} remain; Life Support clamps at 0.`);
    }

    const restoredAmount = hasSurgeonGeneral(actor) ? amount * 2 : amount;

    return {
      warnings,
      title: "Touch Heal",
      validateTarget(source, receipt, entry, targetDoc) {
        return Boolean(targetDoc && entry.kind === "heal" && entry.amount === receipt.result?.amount);
      },
      async apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "lifeSupport", amount, label: "Life Support" });
        if (target) {
          receipt.targets = [
            {
              kind: "heal",
              uuid: target.uuid,
              name: target.name,
              amount: restoredAmount,
              healingSource: "classFeature",
              ready: true
            }
          ];
        }
        receipt.summary = `${actor.name} expends ${amount} Life Support to restore ${restoredAmount} missing Hit Points to ${target?.name ?? "target"}.${hasSurgeonGeneral(actor) ? " (Surgeon-General doubled heal)" : ""}`;
        receipt.result = { amount: restoredAmount, spentLS: amount, targetUuid: target?.uuid ?? null };
        return updates;
      }
    };
  },

  preserver(actor, _state, _data) {
    need(medicEnabled(actor), "Preserver is a Medic feature.");
    const warnings = [];
    const available = resourceValue(actor, { pool: "lifeSupport" });
    if (available < 5) {
      warn(warnings, "lifeSupport", `5 Life Support needed and ${available} remain; Life Support clamps at 0.`);
    }

    return {
      warnings,
      title: "Preserver",
      async apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "lifeSupport", amount: 5, label: "Life Support" });
        receipt.summary = `${actor.name} expends 5 Life Support to reroll any number of dice on a healing or temporary hit point roll.`;
        receipt.result = { rerollsAvailable: true, cost: 5 };
        return updates;
      }
    };
  },

  urgencyOfTreatment(actor, _state, data) {
    need(medicEnabled(actor), "Urgency of Treatment is a Medic feature.");
    const warnings = [];
    const spentLS = Number(data.spentLS ?? 10);
    need(Number.isInteger(spentLS) && spentLS >= 10 && spentLS % 10 === 0, "Spend multiples of 10 Life Support (10, 20, 30...).");
    const apReduction = Math.floor(spentLS / 10);

    const available = resourceValue(actor, { pool: "lifeSupport" });
    if (available < spentLS) {
      warn(warnings, "lifeSupport", `${spentLS} Life Support needed and ${available} remain; Life Support clamps at 0.`);
    }

    return {
      warnings,
      title: "Urgency of Treatment",
      async apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "lifeSupport", amount: spentLS, label: "Life Support" });
        receipt.summary = `${actor.name} expends ${spentLS} Life Support to reduce a Healing Art's AP cost by ${apReduction}.`;
        receipt.result = { spentLS, apReduction };
        return updates;
      }
    };
  },

  resuscitation(actor, _state, data) {
    need(medicEnabled(actor), "Resuscitation is a Medic feature.");
    const warnings = [];
    levelWarning(warnings, actor, 12, "Resuscitation");

    const target = resolveTarget(data);
    if (!target) {
      warn(warnings, "target", "No target specified for Resuscitation.");
    }

    const available = resourceValue(actor, { pool: "resuscitation" });
    if (available < 1) {
      warn(warnings, "resuscitation", "1 use of Resuscitation needed and 0 remain; Resuscitation clamps at 0.");
    }

    const level = medicLevel(actor) ?? 12;
    const isToRob = level >= 18;
    const healAmount = isToRob ? 3 * level : 1;

    return {
      warnings,
      title: isToRob ? "Resuscitation (To Rob the Ferryman)" : "Resuscitation",
      validateTarget(source, receipt, entry, targetDoc) {
        return Boolean(targetDoc && entry.kind === "heal" && entry.amount === receipt.result?.healAmount);
      },
      async apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "resuscitation", amount: 1, label: "Resuscitation" });
        if (target) {
          receipt.targets = [
            {
              kind: "heal",
              uuid: target.uuid,
              name: target.name,
              amount: healAmount,
              healingSource: "classFeature",
              ready: true
            }
          ];
        }
        receipt.summary = `${actor.name} casts Revivify without expending material components. Target returns to life with ${healAmount} Hit Points.`;
        receipt.result = { healAmount, isToRob, targetUuid: target?.uuid ?? null };
        return updates;
      }
    };
  },

  chosenOfAsclepius(actor, _state, _data) {
    need(medicEnabled(actor), "Chosen of Asclepius is a Medic feature.");
    const warnings = [];
    levelWarning(warnings, actor, 20, "Chosen of Asclepius");

    return {
      warnings,
      title: "Chosen of Asclepius",
      async apply(next, receipt) {
        receipt.summary = `${actor.name} invokes Chosen of Asclepius: all healing dice rolled take their maximum possible value.`;
        receipt.result = { maxDice: true };
        return {};
      }
    };
  },

  /* --- Physician Subclass Features --- */

  focusedTreatment(actor, _state, data) {
    need(medicEnabled(actor), "Focused Treatment is a Medic feature.");
    const warnings = [];
    branchWarning(warnings, actor, "physician", "Focused Treatment");

    const level = medicLevel(actor) ?? 1;
    const pb = pbForLevel(level);

    const isSingleTarget = data.isMultiTarget !== true && (data.targetCount === undefined || data.targetCount === 1);
    const isRoll = data.isRoll !== false && data.isFlat !== true;
    const bonus = (isSingleTarget && isRoll) ? pb : 0;

    return {
      warnings,
      title: "Focused Treatment",
      async apply(next, receipt) {
        receipt.summary = bonus > 0
          ? `${actor.name} adds +${bonus} to a single-target healing or damage roll.`
          : `${actor.name} invokes Focused Treatment (no bonus applicable for multi-target or non-rolled healing/damage).`;
        receipt.result = { bonus };
        return {};
      }
    };
  },

  intravenousLine(actor, _state, data) {
    need(medicEnabled(actor), "Intravenous Line is a Medic feature.");
    const warnings = [];
    branchWarning(warnings, actor, "physician", "Intravenous Line");
    levelWarning(warnings, actor, 4, "Intravenous Line");

    const target = resolveTarget(data);
    if (!target) {
      warn(warnings, "target", "No target specified for Intravenous Line.");
    }

    const available = resourceValue(actor, { pool: "lifeSupport" });
    if (available < 10) {
      warn(warnings, "lifeSupport", `10 Life Support needed and ${available} remain; Life Support clamps at 0.`);
    }

    const level = medicLevel(actor) ?? 4;
    const bonusDie = level >= 7 ? "2d6" : "1d6";
    const dc = medicSpellDC(actor);
    const isUnwilling = data.isUnwilling === true;

    return {
      warnings,
      title: "Intravenous Line",
      rolls: isUnwilling ? [{ id: "saveDamage", label: "Save Success Necrotic Damage", formula: "2d8" }] : [],
      validateTarget(source, receipt, entry, targetDoc) {
        return Boolean(targetDoc && (entry.kind === "damage" || entry.kind === "effect"));
      },
      async apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "lifeSupport", amount: 10, label: "Life Support" });
        if (isUnwilling) {
          receipt.saveAbility = "con";
          receipt.saveDc = dc;
          receipt.saveTargetUuid = target?.uuid ?? null;
          receipt.formula = "2d8";
        }

        // Deal 2d8 necrotic damage on saveSuccess if unwilling
        if (isUnwilling && data.saveSuccess === true && target) {
          const dmg = Number(data.damage ?? data.damageAmount ?? 9);
          receipt.targets = [
            {
              kind: "damage",
              uuid: target.uuid,
              name: target.name,
              amount: dmg,
              damageType: "necrotic",
              ready: true
            }
          ];
        } else if (target && (!isUnwilling || data.saveSuccess === false)) {
          // Tune to target (persisting on actor and replacing prior tuning)
          updates["flags.ak5e.medic.tuned"] = {
            targetUuid: target.uuid,
            name: target.name,
            bonusDie,
            expiresAt: Date.now() + 600000,
            worldTimeExpires: (globalThis.game?.time?.worldTime ?? 0) + 600
          };
        }

        receipt.summary = isUnwilling
          ? (data.saveSuccess
              ? `${target?.name ?? "Target"} succeeded on DC ${dc} CON save and takes 2d8 Necrotic damage.`
              : `${target?.name ?? "Target"} makes a DC ${dc} CON save. On success: takes 2d8 Necrotic damage. On failure: Tuned for 10 minutes (+${bonusDie} heal/harm bonus).`)
          : `${target?.name ?? "Target"} is willingly Tuned for 10 minutes (+${bonusDie} heal/harm bonus).`;

        receipt.result = {
          targetUuid: target?.uuid ?? null,
          isUnwilling,
          dc,
          bonusDie,
          tuned: !isUnwilling || data.saveSuccess === false
        };
        return updates;
      }
    };
  },

  hypocriticOath(actor, _state, data) {
    need(medicEnabled(actor), "Hypocritic Oath is a Medic feature.");
    const warnings = [];
    branchWarning(warnings, actor, "physician", "Hypocritic Oath");
    levelWarning(warnings, actor, 7, "Hypocritic Oath");

    const target = resolveTarget(data);
    const dc = medicSpellDC(actor);
    const rolledHealing = Number(data.rolledHealing ?? 20);

    return {
      warnings,
      title: "Hypocritic Oath",
      validateTarget(source, receipt, entry, targetDoc) {
        return Boolean(targetDoc && entry.kind === "damage");
      },
      async apply(next, receipt) {
        receipt.saveAbility = "con";
        receipt.saveDc = dc;
        receipt.saveTargetUuid = target?.uuid ?? null;
        receipt.formula = `${rolledHealing}`;

        // Damage calculation based on saveSuccess: full on fail / half on pass
        const damage = data.saveSuccess === true ? Math.floor(rolledHealing / 2) : rolledHealing;
        if (target) {
          receipt.targets = [
            {
              kind: "damage",
              uuid: target.uuid,
              name: target.name,
              amount: damage,
              damageType: "necrotic",
              ready: true
            }
          ];
        }

        receipt.summary = `${actor.name} converts healing roll (${rolledHealing}) into Necrotic damage! ${target?.name ?? "Target"} makes a DC ${dc} Constitution save for half damage (deals ${damage} Necrotic). Counts as restoring Hit Points for feature triggers.`;
        receipt.result = {
          dc,
          convertedToDamage: true,
          rolledHealing,
          damage,
          targetUuid: target?.uuid ?? null,
          restoresHPTrigger: true
        };
        return {};
      }
    };
  },

  inpatientCare(actor, _state, data) {
    need(medicEnabled(actor), "Inpatient Care is a Medic feature.");
    const warnings = [];
    branchWarning(warnings, actor, "physician", "Inpatient Care");
    levelWarning(warnings, actor, 11, "Inpatient Care");

    const target = resolveTarget(data);
    if (!target) {
      warn(warnings, "target", "No target specified for Inpatient Care.");
    }

    const available = resourceValue(actor, { pool: "lifeSupport" });
    if (available < 15) {
      warn(warnings, "lifeSupport", `15 Life Support needed and ${available} remain; Life Support clamps at 0.`);
    }

    const reactions = getReactions(actor);
    if (reactions?.available < 1) {
      warn(warnings, "reaction", `${actor.name} has no Reaction remaining.`);
    }

    const healed = Number(data.healedAmount ?? 30);
    const reverberation = inpatientCareHeal(healed);

    return {
      warnings,
      title: "Inpatient Care",
      validateTarget(source, receipt, entry, targetDoc) {
        return Boolean(targetDoc && (entry.kind === "heal" || entry.kind === "effect"));
      },
      async apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "lifeSupport", amount: 15, label: "Life Support" });
        const rx = await spendReaction(actor, { triggerId: `${receipt.id}-inpatientCare`, receipt: receipt.id });
        receipt.reaction = { requested: true, spent: rx.ok, receiptId: receipt.id };

        // Queue delayed heal on actor state for turnStart recovery
        const queue = [...(actor.flags?.ak5e?.medic?.inpatientCareQueue ?? []), {
          targetUuid: target?.uuid ?? null,
          amount: reverberation,
          useId: receipt.id
        }];
        updates["flags.ak5e.medic.inpatientCareQueue"] = queue;

        receipt.summary = `${actor.name} uses Reaction and 15 Life Support. At the start of ${actor.name}'s next turn, ${target?.name ?? "target"} will regain ${reverberation} Hit Points.`;
        receipt.result = { reverberation, targetUuid: target?.uuid ?? null };
        return updates;
      }
    };
  },

  surgeonGeneral(actor, _state, _data) {
    need(medicEnabled(actor), "Surgeon-General is a Medic feature.");
    const warnings = [];
    branchWarning(warnings, actor, "physician", "Surgeon-General");
    levelWarning(warnings, actor, 15, "Surgeon-General");

    return {
      warnings,
      title: "Surgeon-General",
      async apply(next, receipt) {
        receipt.summary = `${actor.name} invokes Surgeon-General: doubles total Hit Points restored on a single creature via Life Support, Art, or Operator Skill.`;
        receipt.result = { doubleHealing: true };
        return {};
      }
    };
  },

  /* --- Triage Subclass Features --- */

  onTheScene(actor, _state, data) {
    need(medicEnabled(actor), "On the Scene is a Medic feature.");
    const warnings = [];
    branchWarning(warnings, actor, "triage", "On the Scene");

    const level = medicLevel(actor) ?? 1;
    const pb = pbForLevel(level);

    const withTouchOfLifeAndDeath = data.withTouchOfLifeAndDeath === true;
    if (withTouchOfLifeAndDeath && level < 11) {
      warn(warnings, "touchOfLifeAndDeathLevel", "Touch of Life and Death requires Triage level 11.");
    }

    const targets = Array.isArray(data.targetUuids)
      ? data.targetUuids
      : Array.isArray(data.targets)
      ? data.targets
      : (data.targetUuid ? [data.targetUuid] : (data.target ? [data.target] : []));
    need(targets.length <= pb, `On the Scene can target at most ${pb} creatures (Proficiency Bonus).`);

    const lsCost = withTouchOfLifeAndDeath ? 20 : 10;
    const available = resourceValue(actor, { pool: "lifeSupport" });
    if (available < lsCost) {
      warn(warnings, "lifeSupport", `${lsCost} Life Support needed and ${available} remain; Life Support clamps at 0.`);
    }

    const spellMod = Number(actor.system?.abilities?.[medicSpellcastingAbility(actor)]?.mod ?? 0);
    const dieFormula = level >= 7 ? `2d6 + ${spellMod}` : `1d6 + ${spellMod}`;

    return {
      warnings,
      title: withTouchOfLifeAndDeath ? "On the Scene (Touch of Life and Death)" : "On the Scene",
      rolls: [{ id: "sceneDice", label: "On the Scene: Heal or Harm Roll", formula: dieFormula }],
      validateTarget(source, receipt, entry, targetDoc) {
        return Boolean(targetDoc && (entry.kind === "heal" || entry.kind === "damage" || entry.kind === "effect"));
      },
      async apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "lifeSupport", amount: lsCost, label: "Life Support" });
        receipt.formula = dieFormula;
        receipt.attackType = "msak";
        receipt.attackMod = medicSpellAttackMod(actor);
        const targetDocs = resolveTargets(data);
        if (targetDocs.length) {
          const isHarm = data.mode === "harm" || data.harm === true;
          receipt.targets = targetDocs.map(t => ({
            kind: isHarm ? "damage" : "heal",
            uuid: t.uuid,
            name: t.name,
            amount: Number(data.amount ?? 0),
            damageType: isHarm ? "necrotic" : undefined,
            healingSource: isHarm ? undefined : "classFeature",
            ready: data.amount !== undefined,
            attackType: isHarm ? "msak" : undefined
          }));
        }
        receipt.summary = `${actor.name} moves up to Speed without provoking Opportunity Attacks and targets up to PB creatures within 5 ft for ${dieFormula} Heal or Harm.${withTouchOfLifeAndDeath ? " Touch of Life and Death rider active (ends condition <=1 hr on heal; inflicts Poisoned on harm)." : ""}`;
        receipt.result = {
          lsCost,
          dieFormula,
          withTouchOfLifeAndDeath,
          targetCount: targets.length
        };
        return updates;
      }
    };
  },

  urgentCareCentre(actor, _state, data) {
    need(medicEnabled(actor), "Urgent Care Centre is a Medic feature.");
    const warnings = [];
    branchWarning(warnings, actor, "triage", "Urgent Care Centre");
    levelWarning(warnings, actor, 4, "Urgent Care Centre");

    need(data.isCantrip !== true, "Urgent Care Centre requires a levelled Art (not cantrip).");
    if (data.artLevel !== undefined) {
      const artLvl = Number(data.artLevel);
      need(Number.isInteger(artLvl) && artLvl >= 1, "Urgent Care Centre requires a levelled Art (level 1 or higher).");
    }

    const rolled = Number(data.rolledHealing ?? 10);
    const auraHeal = Math.floor(rolled / 2);

    return {
      warnings,
      title: "Urgent Care Centre",
      validateTarget(source, receipt, entry, targetDoc) {
        return Boolean(targetDoc && entry.kind === "heal" && (entry.amount === receipt.result?.auraHeal || entry.amount <= (receipt.result?.auraHeal ?? Infinity)));
      },
      async apply(next, receipt) {
        const targetDocs = resolveTargets(data);
        if (targetDocs.length) {
          receipt.targets = targetDocs.map(t => ({
            kind: "heal",
            uuid: t.uuid,
            name: t.name,
            amount: auraHeal,
            healingSource: "classFeature",
            ready: true
          }));
        }
        receipt.summary = `${actor.name} rolled ${rolled} healing to self with a levelled Art; all other creatures within 10 ft regain ${auraHeal} Hit Points.`;
        receipt.result = { rolled, auraHeal };
        return {};
      }
    };
  },

  stopTheFlow(actor, _state, data) {
    need(medicEnabled(actor), "Stop the Flow is a Medic feature.");
    const warnings = [];
    branchWarning(warnings, actor, "triage", "Stop the Flow");
    levelWarning(warnings, actor, 7, "Stop the Flow");

    const target = resolveTarget(data);
    if (!target) {
      warn(warnings, "target", "No target specified for Stop the Flow.");
    } else {
      const currentHp = Number(target.system?.attributes?.hp?.value ?? 0);
      if (currentHp > 0) {
        warn(warnings, "targetDying", `${target.name} has ${currentHp} HP and is not Dying (0 HP).`);
      }
      if (flag(target, "dying")?.stopTheFlowReceived && currentHp === 0) {
        warn(warnings, "repeatStopTheFlow", `${target.name} has already received Stop the Flow while Dying.`);
      }
    }

    const available = resourceValue(actor, { pool: "lifeSupport" });
    if (available < 20) {
      warn(warnings, "lifeSupport", `20 Life Support needed and ${available} remain; Life Support clamps at 0.`);
    }

    return {
      warnings,
      title: "Stop the Flow",
      validateTarget(source, receipt, entry, targetDoc) {
        return Boolean(targetDoc && entry.kind === "grantMettle" && entry.amount === 6);
      },
      async apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "lifeSupport", amount: 20, label: "Life Support" });
        if (target) {
          receipt.targets = [
            {
              kind: "grantMettle",
              uuid: target.uuid,
              name: target.name,
              amount: 6,
              ready: true
            }
          ];
        }
        receipt.summary = `${actor.name} expends 20 Life Support. ${target?.name ?? "Target"} immediately gains 6 Mettle (hard cap 8).`;
        receipt.result = { targetUuid: target?.uuid ?? null, mettleGranted: 6 };
        return updates;
      }
    };
  },

  touchOfLifeAndDeath(actor, _state, _data) {
    need(medicEnabled(actor), "Touch of Life and Death is a Medic feature.");
    const warnings = [];
    branchWarning(warnings, actor, "triage", "Touch of Life and Death");
    levelWarning(warnings, actor, 11, "Touch of Life and Death");

    return {
      warnings,
      title: "Touch of Life and Death",
      async apply(next, receipt) {
        receipt.summary = `${actor.name} activates Touch of Life and Death rider for On the Scene: healed allies end one condition <=1 hr; harmed enemies become Poisoned until start of Medic's next turn.`;
        receipt.result = { riderActive: true };
        return {};
      }
    };
  },

  mobileHospital(actor, _state, data) {
    need(medicEnabled(actor), "Mobile Hospital is a Medic feature.");
    const warnings = [];
    branchWarning(warnings, actor, "triage", "Mobile Hospital");
    levelWarning(warnings, actor, 15, "Mobile Hospital");

    const available = resourceValue(actor, { pool: "mobileHospital" });
    if (available < 1) {
      warn(warnings, "mobileHospital", "1 use of Mobile Hospital needed and 0 remain; Mobile Hospital clamps at 0.");
    }

    const spellMod = Number(actor.system?.abilities?.[medicSpellcastingAbility(actor)]?.mod ?? 0);
    const healFormula = `3d6 + ${spellMod}`;

    return {
      warnings,
      title: "Mobile Hospital",
      rolls: [{ id: "auraHeal", label: "Mobile Hospital Aura Healing", formula: healFormula }],
      validateTarget(source, receipt, entry, targetDoc) {
        return Boolean(targetDoc && entry.kind === "heal");
      },
      async apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "mobileHospital", amount: 1, label: "Mobile Hospital" });
        receipt.formula = healFormula;
        const targetDocs = resolveTargets(data);
        if (targetDocs.length) {
          receipt.targets = targetDocs.map(t => ({
            kind: "heal",
            uuid: t.uuid,
            name: t.name,
            amount: Number(data.amount ?? 0),
            healingSource: "classFeature",
            ready: data.amount !== undefined
          }));
        }
        receipt.summary = `${actor.name} establishes a 30-foot Mobile Hospital aura for 1 minute. Creatures entering space heal ${healFormula} HP (max once/round per creature).`;
        receipt.result = { auraRadius: 30, duration: "1 minute", healFormula };
        return updates;
      }
    };
  }
};

/* ---------------------------------------------------------------- Plan Target Validation (GM Relay) */

MEDIC_PLANS.touchHeal.validateTarget = (source, receipt, entry, targetDoc) =>
  Boolean(targetDoc && entry.kind === "heal" && (entry.amount === receipt.result?.amount || entry.amount <= (receipt.result?.amount ?? 0)));

MEDIC_PLANS.resuscitation.validateTarget = (source, receipt, entry, targetDoc) =>
  Boolean(targetDoc && entry.kind === "heal" && entry.amount === receipt.result?.healAmount);

MEDIC_PLANS.stopTheFlow.validateTarget = (source, receipt, entry, targetDoc) =>
  Boolean(targetDoc && entry.kind === "grantMettle" && entry.amount === 6);

MEDIC_PLANS.intravenousLine.validateTarget = (source, receipt, entry, targetDoc) =>
  Boolean(targetDoc && (entry.kind === "damage" || entry.kind === "effect"));

MEDIC_PLANS.hypocriticOath.validateTarget = (source, receipt, entry, targetDoc) =>
  Boolean(targetDoc && entry.kind === "damage");

MEDIC_PLANS.inpatientCare.validateTarget = (source, receipt, entry, targetDoc) =>
  Boolean(targetDoc && (entry.kind === "heal" || entry.kind === "effect"));

MEDIC_PLANS.onTheScene.validateTarget = (source, receipt, entry, targetDoc) =>
  Boolean(targetDoc && (entry.kind === "heal" || entry.kind === "damage" || entry.kind === "effect"));

MEDIC_PLANS.urgentCareCentre.validateTarget = (source, receipt, entry, targetDoc) =>
  Boolean(targetDoc && entry.kind === "heal");

MEDIC_PLANS.mobileHospital.validateTarget = (source, receipt, entry, targetDoc) =>
  Boolean(targetDoc && entry.kind === "heal");

for (const name of ["preserver", "urgencyOfTreatment", "chosenOfAsclepius", "focusedTreatment", "surgeonGeneral", "touchOfLifeAndDeath"]) {
  if (MEDIC_PLANS[name]) MEDIC_PLANS[name].validateTarget = () => false;
}

/* ---------------------------------------------------------------- Target Kinds Registration */

medicUses.register({
  plans: MEDIC_PLANS,
  targetKinds: {
    grantMettle: {
      async apply(source, useId, entry, target) {
        const dying = target.flags?.ak5e?.dying ?? {};
        const before = Number(dying.mettle) || 0;
        const after = Math.min(8, before + 6);
        const applied = { before, after, granted: after - before };
        const appliedFlag = "medicUsesApplied";
        const key = opaqueKey(`${useId}:${source.uuid}`);
        await target.update({
          "flags.ak5e.dying.active": true,
          "flags.ak5e.dying.mettle": after,
          "flags.ak5e.dying.stopTheFlowReceived": true,
          [`flags.ak5e.${appliedFlag}.${key}`]: applied
        });
        return applied;
      },
      async revert(source, useId, _entry, target) {
        const appliedFlag = "medicUsesApplied";
        const key = opaqueKey(`${useId}:${source.uuid}`);
        const applied = target.flags?.ak5e?.[appliedFlag]?.[key];
        const dying = target.flags?.ak5e?.dying ?? {};
        const before = applied !== undefined ? applied.before : Math.max(0, (Number(dying.mettle) || 0) - 6);
        await target.update({
          "flags.ak5e.dying.mettle": before,
          "flags.ak5e.dying.stopTheFlowReceived": false,
          [`flags.ak5e.${appliedFlag}.-=${key}`]: null
        });
        return { removed: true };
      },
      preview(_source, _receipt, _entry, target) {
        return `${target.name}: Reverts Mettle granted by Stop the Flow.`;
      }
    },
    damage: {
      async apply(source, useId, entry, target) {
        const hp = target.system?.attributes?.hp ?? {};
        const before = Number(hp.value) || 0;
        const dmg = Number(entry.amount) || 0;
        const after = Math.max(0, before - dmg);
        const applied = { before, after, damage: dmg };
        const appliedFlag = "medicUsesApplied";
        const key = opaqueKey(`${useId}:${source.uuid}`);
        await target.update({
          "system.attributes.hp.value": after,
          [`flags.ak5e.${appliedFlag}.${key}`]: applied
        });
        return applied;
      },
      async revert(source, useId, _entry, target) {
        const appliedFlag = "medicUsesApplied";
        const key = opaqueKey(`${useId}:${source.uuid}`);
        const applied = target.flags?.ak5e?.[appliedFlag]?.[key];
        const current = Number(target.system?.attributes?.hp?.value) || 0;
        const restored = applied ? applied.before : current + (_entry.amount ?? 0);
        await target.update({
          "system.attributes.hp.value": restored,
          [`flags.ak5e.${appliedFlag}.-=${key}`]: null
        });
        return { removed: true };
      },
      preview(_source, _receipt, entry, target) {
        return `${target.name}: Reverts ${entry.amount ?? 0} damage.`;
      }
    }
  }
});
