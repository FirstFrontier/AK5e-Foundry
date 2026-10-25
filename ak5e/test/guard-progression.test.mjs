import test from "node:test";
import assert from "node:assert/strict";
import { guardFixture, world } from "./guard-fixture.mjs";
import {
  guardChoices, inspectGuardFields, previewGuardProgression, applyGuardProgression
} from "../scripts/guard-progression.mjs";
import { previewGuardSetup, applyGuardSetup } from "../scripts/guard-setup.mjs";
import { standardPools } from "../scripts/caster-rules.mjs";

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

test("Musha and Weaponmaster subclass proficiencies granted in progression", async () => {
  world();
  // 1. Musha gains Wisdom saving throw proficiency
  const mushaActor = guardFixture({ level: 3 });
  const mushaPlan = await previewGuardProgression(mushaActor, {
    branch: "subclass-guard-musha",
    fightingStyle: "brawler",
    saves: ["con"],
    skills: ["ath", "ins", "ak5ewilderness"],
    tool: "Maintenance Kit",
    startingEquipment: { mode: "cash" }
  });
  assert.ok(mushaPlan.writes["system.traits.saves.value"].includes("wis"));
  assert.ok(mushaPlan.writes["system.traits.saves.value"].includes("str"));
  assert.ok(mushaPlan.writes["system.traits.saves.value"].includes("con"));

  // 2. Weaponmaster gains Light & Heavy Ranged weapon proficiencies and additional style
  const wmActor = guardFixture({ level: 3 });
  const wmPlan = await previewGuardProgression(wmActor, {
    branch: "subclass-guard-weaponmaster",
    fightingStyle: "twoWeaponFighting",
    weaponmasterAdditionalFightingStyle: "closeAndPersonal",
    saves: ["dex"],
    skills: ["ath", "acr", "ak5elore"],
    tool: "Maintenance Kit",
    startingEquipment: { mode: "cash" }
  });
  const customWeapons = wmPlan.writes["system.traits.weaponProf.custom"];
  assert.ok(customWeapons.includes("All Light Ranged Weapons"));
  assert.ok(customWeapons.includes("All Heavy Ranged Weapons"));
  assert.equal(wmPlan.writes["flags.ak5e.weaponmaster.additionalFightingStyle"], "closeAndPersonal");
});

test("progression rejects stale previews after actor HP, ability, or inventory changes", async () => {
  world();
  const choices = {
    branch: "subclass-guard-centurion", fightingStyle: "duelling", saves: ["con"],
    skills: ["ath", "itm", "ak5elore"], tool: "Maintenance Kit",
    startingEquipment: { mode: "cash" }
  };
  for (const mutate of [
    actor => { actor.system.attributes.hp.max += 1; },
    actor => { actor.system.abilities.str.value += 1; },
    actor => { actor.items.set("new-item", { id: "new-item", type: "weapon", name: "New inventory item", system: { quantity: 1 } }); }
  ]) {
    const actor = guardFixture({ level: 1 });
    const preview = await previewGuardProgression(actor, choices);
    mutate(actor);
    await assert.rejects(
      () => applyGuardProgression(actor, { confirmed: true, contextKey: preview.contextKey, ...choices }),
      /character changed since the preview/
    );
  }
});

test("starting equipment preserves authored copies and grants duplicate selected weapons by slot idempotently", async () => {
  world();
  const actor = guardFixture({ level: 1 });
  actor.system.skills.arc = { value: 0, total: 0, mod: 0 };
  actor.items.set("owned-axe", {
    id: "owned-axe", type: "weapon", name: "Axe", system: { quantity: 1 },
    flags: { ak5e: { chapterFourId: "weapon-axe-2" } },
    getFlag(scope, key) { return this.flags?.[scope]?.[key]; }
  });
  const choices = {
    branch: "subclass-guard-centurion", fightingStyle: "duelling", saves: ["con"],
    skills: ["ath", "itm", "ak5elore"], tool: "Maintenance Kit",
    startingEquipment: { mode: "items", weapon1: "weapon-axe-2", weapon2: "weapon-axe-2", armour: "equipment-reinforced-outfit-1" }
  };
  const create = actor.createEmbeddedDocuments;
  actor.createEmbeddedDocuments = async (type, data) => {
    const docs = await create.call(actor, type, data);
    docs.forEach((doc, index) => { doc.type = data[index].type ?? type; });
    return docs;
  };

  const preview = await previewGuardProgression(actor, choices);
  const weaponSlots = preview.createItems.filter(item => item.flags?.ak5e?.guardStartingSlot?.startsWith("weapon"));
  assert.deepEqual(weaponSlots.map(item => item.flags.ak5e.guardStartingSlot).sort(), ["weapon1", "weapon2"]);
  await applyGuardProgression(actor, { confirmed: true, contextKey: preview.contextKey, ...choices });
  const axeItems = [...actor.items.values()].filter(item => item.flags?.ak5e?.chapterFourId === "weapon-axe-2");
  assert.equal(axeItems.length, 3, "one authored item plus two independent starting slots");
  assert.equal(axeItems.filter(item => item.flags?.ak5e?.guardStartingSlot === "weapon1").length, 1);
  assert.equal(axeItems.filter(item => item.flags?.ak5e?.guardStartingSlot === "weapon2").length, 1);

  const retry = await previewGuardProgression(actor, choices);
  assert.equal(retry.createItems.filter(item => item.flags?.ak5e?.guardStartingSlot?.startsWith("weapon")).length, 0);
  await applyGuardProgression(actor, { confirmed: true, contextKey: retry.contextKey, ...choices });
  assert.equal([...actor.items.values()].filter(item => item.flags?.ak5e?.chapterFourId === "weapon-axe-2").length, 3);
});

test("partial starting-equipment creation retries only missing slot grants", async () => {
  world();
  const actor = guardFixture({ level: 1 });
  const choices = {
    branch: "subclass-guard-centurion", fightingStyle: "duelling", saves: ["con"],
    skills: ["ath", "itm", "ak5elore"], tool: "Maintenance Kit",
    startingEquipment: { mode: "items", weapon1: "weapon-axe-2", weapon2: "weapon-axe-2", armour: "equipment-reinforced-outfit-1" }
  };
  const create = actor.createEmbeddedDocuments;
  let failOnce = true;
  actor.createEmbeddedDocuments = async (type, data) => {
    if (failOnce) {
      failOnce = false;
      const partial = await create.call(actor, type, data.slice(0, 4));
      partial.forEach((doc, index) => { doc.type = data[index].type ?? type; });
      throw new Error("simulated partial embedded-item batch");
    }
    const docs = await create.call(actor, type, data);
    docs.forEach((doc, index) => { doc.type = data[index].type ?? type; });
    return docs;
  };
  const preview = await previewGuardProgression(actor, choices);
  await assert.rejects(
    () => applyGuardProgression(actor, { confirmed: true, contextKey: preview.contextKey, ...choices }),
    /simulated partial embedded-item batch/
  );
  const retry = await previewGuardProgression(actor, choices);
  assert.deepEqual(retry.createItems.filter(item => item.flags?.ak5e?.guardStartingSlot).map(item => item.flags.ak5e.guardStartingSlot).sort(), ["armour", "kit"]);
  await applyGuardProgression(actor, { confirmed: true, contextKey: retry.contextKey, ...choices });
  for (const slot of ["weapon1", "weapon2", "armour", "kit"]) {
    assert.equal([...actor.items.values()].filter(item => item.flags?.ak5e?.guardStartingSlot === slot).length, 1, `${slot} is granted exactly once`);
  }
});

test("Artsblade progression grants every selected-pool Art through level five and Arts-Touched rank", async () => {
  world();
  const actor = guardFixture({ level: 1 });
  actor.system.skills.arc = { value: 0, total: 0, mod: 0 };
  const choices = {
    branch: "subclass-guard-artsblade", artPools: ["corrosion"], additionalArtPools: [],
    fightingStyle: "duelling", saves: ["con"], skills: ["ath", "itm", "ak5elore"],
    tool: "Maintenance Kit", startingEquipment: { mode: "cash" }
  };
  const plan = await previewGuardProgression(actor, choices);
  const corrosion = standardPools.find(pool => pool.id.includes("-corrosion-arts-"));
  const expected = [...new Set(corrosion.members.filter(member => Number(member.level) >= 1 && Number(member.level) <= 5).map(member => member.name))].sort();
  const grants = plan.createItems.filter(item => item.flags?.ak5e?.guardProgressionGrant?.kind === "artsbladeArt");
  assert.deepEqual(grants.map(item => item.name).sort(), expected);
  assert.ok(grants.every(item => item.system.level >= 1), "Sword and Sorcery grants levelled pool Arts, not the pool's cantrips");
  assert.equal(plan.writes["system.skills.arc.value"], 1);
  const manual = grants.filter(item => item.flags.ak5e.guardProgressionGrant.manual);
  assert.ok(manual.length > 0);
  assert.ok(manual.every(item => item.type === "spell" && item.system.level <= 5 && item.system.description.value.includes("Do not substitute a different Art")));

  actor.system.skills.arc.value = 1;
  const expert = await previewGuardProgression(actor, choices);
  assert.equal(expert.writes["system.skills.arc.value"], 2);
});

