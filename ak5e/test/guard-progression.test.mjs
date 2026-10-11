import test from "node:test";
import assert from "node:assert/strict";
import { guardFixture, world } from "./guard-fixture.mjs";
import {
  guardChoices, inspectGuardFields, previewGuardProgression, applyGuardProgression
} from "../scripts/guard-progression.mjs";
import { previewGuardSetup, applyGuardSetup } from "../scripts/guard-setup.mjs";

test("inspectGuardFields returns choices and options for an eligible character", () => {
  world();
  const actor = guardFixture({ level: 5 });
  const fields = inspectGuardFields(actor);
  assert.ok(fields.some(f => f.key === "branch"));
  assert.ok(fields.some(f => f.key === "fightingStyle"));
  assert.ok(fields.some(f => f.key === "skills"));
  assert.ok(fields.some(f => f.key === "saves"));
  assert.ok(fields.some(f => f.key === "startingEquipment.mode"));
  assert.ok(fields.some(f => f.key === "hp.1"));
  assert.ok(fields.some(f => f.key === "asi.4"));
  assert.ok(fields.some(f => f.key === "talents.basic"));
});

test("previewGuardProgression identifies pending choices when unconfigured", async () => {
  world();
  const actor = guardFixture({ level: 5 });
  const plan = await previewGuardProgression(actor, {});
  assert.ok(plan.pending.includes("saves"));
  assert.ok(plan.pending.includes("skills"));
  assert.ok(plan.pending.includes("fightingStyle"));
  assert.ok(plan.pending.includes("startingEquipment.mode"));
});

test("previewGuardProgression and applyGuardProgression apply valid choices idempotently", async () => {
  world();
  const actor = guardFixture({ level: 5 });
  const choices = {
    branch: "subclass-guard-centurion",
    fightingStyle: "duelling",
    saves: ["con"],
    skills: ["ath", "itm", "ak5elore"],
    tool: "Maintenance Kit",
    startingEquipment: { mode: "cash" },
    hp: { 1: { mode: "fixed", roll: 10 }, 2: { mode: "fixed", roll: 6 }, 3: { mode: "fixed", roll: 6 }, 4: { mode: "fixed", roll: 6 }, 5: { mode: "fixed", roll: 6 } },
    asi: { 4: { increases: [{ ability: "str", amount: 2 }] } },
    talents: { basic: "class-option-guard-alert-87" }
  };

  const plan = await previewGuardProgression(actor, choices);
  assert.deepEqual(plan.pending, []);
  assert.equal(plan.writes["system.currency.cp"], 1300);
  assert.ok(plan.writes["system.traits.saves.value"].includes("con"));
  assert.ok(plan.writes["system.traits.saves.value"].includes("str"));
  assert.ok(plan.writes["system.traits.armorProf.value"].includes("lgt"));
  assert.ok(plan.writes["system.traits.armorProf.value"].includes("shl"));
  assert.equal(plan.writes["system.abilities.str.value"], 20); // 18 + 2 ASI = 20

  const applied = await applyGuardProgression(actor, { confirmed: true, contextKey: plan.contextKey, ...choices });
  assert.equal(applied.level, 5);
  assert.equal(actor.flags.ak5e.guard.enabled, true);
  assert.equal(actor.flags.ak5e.guard.fightingStyle, "duelling");

  // Re-previewing produces no pending choices and preserves state
  const rePlan = await previewGuardProgression(actor);
  assert.deepEqual(rePlan.pending, []);
});

test("previewGuardSetup and applyGuardSetup grant level-appropriate features without duplicates", async () => {
  world();
  const actor = guardFixture({ level: 3 });
  const preview = await previewGuardSetup(actor);
  assert.equal(preview.level, 3);
  // At level 3, features include: Branch, Style, Press the Attack, Basic Skill, Unrelenting, Basic Talent
  assert.ok(preview.creates.some(c => c.name.includes("Press the Attack")));
  assert.ok(preview.creates.some(c => c.name.includes("Unrelenting")));

  const applied = await applyGuardSetup(actor, { confirmed: true, contextKey: preview.contextKey });
  assert.ok(applied.created.some(c => c.includes("Unrelenting")));

  // Running setup again keeps existing features
  const rePreview = await previewGuardSetup(actor);
  assert.equal(rePreview.creates.length, 0);
  assert.ok(rePreview.kept.length > 0);
});
