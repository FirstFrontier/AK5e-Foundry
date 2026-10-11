import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { CHAPTER_FOUR_EQUIPMENT as equipment } from "../scripts/chapter-four-content.mjs";

const variants = equipment.filter(entry => entry.kind === "magic-weapon");
const bases = equipment.filter(entry => entry.kind === "weapon");

test("all 27 base weapons have three source-backed, uniquely identified upgrades", async () => {
  const source = await readFile(new URL("../../AK5e_1.3.1_Foundry_Source/04_chapter_4_equipment.txt", import.meta.url), "utf8");
  assert.equal(variants.length, 81);
  assert.equal(new Set(variants.map(entry => entry.id)).size, 81);
  assert.deepEqual(Object.fromEntries(Object.entries(Object.groupBy(variants, entry => entry.enhancement.family)).map(([family, entries]) => [family, entries.length])), {
    staff: 3, wand: 3, weapon: 69, launcher: 6
  });
  for (const base of bases) {
    const upgrades = variants.filter(entry => entry.enhancement.baseWeaponId === base.id);
    assert.deepEqual(upgrades.map(entry => entry.enhancement.bonus), [1, 2, 3]);
    for (const entry of upgrades) {
      const data = entry.systemData;
      assert.equal(entry.itemType, "weapon");
      assert.equal(entry.id, `magic-weapon-${base.name.toLowerCase().replaceAll(" ", "-")}-plus-${entry.enhancement.bonus}`);
      assert.deepEqual(data.damage.base, base.systemData.damage.base);
      assert.deepEqual(data.weight, base.systemData.weight);
      assert.deepEqual(data.type, base.systemData.type);
      assert.deepEqual(data.properties, [...base.systemData.properties, "mgc"]);
      assert.deepEqual(entry.tableData, base.tableData);
      if (base.systemData.range) {
        assert.equal(data.range.value, base.systemData.range.value);
        assert.equal(data.range.long, base.systemData.range.long);
      }
      assert.equal(data.range.reach, /Ranged/.test(base.tableData.category) ? null : base.systemData.properties.includes("rch") ? 10 : 5);
      assert.equal(data.rarity, ["uncommon", "rare", "veryRare"][entry.enhancement.bonus - 1]);
      assert.equal(data.attunement, "");
      assert.equal(data.price, undefined);
      assert.equal(data.effects, undefined);
      assert.equal(entry.rawSources[1], base.rawSource);
      for (const fragment of entry.rawSources) assert.ok(source.includes(fragment));
      assert.match(entry.content, /GM estimate, not a fixed purchase price/);
    }
  }
});

test("Arts upgrades change Conductive only and explain the highest-equipped-value rule", () => {
  for (const family of ["staff", "wand"]) {
    for (const entry of variants.filter(entry => entry.enhancement.family === family)) {
      const value = entry.enhancement.bonus + (family === "staff" ? 1 : 0);
      assert.equal(entry.enhancement.conductive, value);
      assert.match(entry.content, new RegExp(`Effective properties:</strong>[^<]*Conductive \\(${value}\\)`));
      assert.match(entry.content, /Only the highest equipped Conductive value applies/);
      assert.match(entry.content, /Casting Unit/);
      assert.match(entry.content, /no melee Attack or Damage bonus/);
      assert.equal(entry.systemData.magicalBonus, "");
      assert.equal(Object.values(entry.systemData.activities)[0].type, "attack");
    }
  }
});

test("ordinary upgrades use one native bonus, retaining versatile and thrown modes", () => {
  for (const entry of variants.filter(entry => entry.enhancement.family === "weapon")) {
    assert.equal(entry.systemData.magicalBonus, String(entry.enhancement.bonus));
    const activity = Object.values(entry.systemData.activities)[0];
    assert.equal(activity.type, "attack");
    assert.equal(activity.attack?.bonus, undefined);
    assert.equal(entry.systemData.damage.base.bonus, "");
    assert.equal(entry.enhancement.conductive, 0);
    assert.equal(entry.enhancement.martialDCBonus, 0);
  }
  for (const sword of variants.filter(entry => entry.name.startsWith("Sword +"))) {
    assert.equal(sword.systemData.damage.versatile.number, 1);
    assert.equal(sword.systemData.damage.versatile.denomination, 10);
    assert.equal(sword.systemData.damage.versatile.bonus, "");
    assert.deepEqual(sword.systemData.damage.versatile.types, ["slashing"]);
  }
  assert.ok(variants.find(entry => entry.name === "Knife +1").systemData.properties.includes("thr"));
  assert.equal(variants.find(entry => entry.name === "Spear +2").systemData.range.long, 80);
  assert.equal(variants.filter(entry => entry.name.startsWith("Heavy Defender Shield +")).length, 3);
});

test("launcher variants roll only base damage and document manual Splash resolution", () => {
  for (const entry of variants.filter(entry => entry.enhancement.family === "launcher")) {
    assert.equal(entry.systemData.magicalBonus, "");
    assert.equal(entry.enhancement.martialDCBonus, entry.enhancement.bonus);
    const activities = Object.values(entry.systemData.activities);
    assert.equal(activities.length, 1);
    assert.equal(activities[0].type, "damage");
    assert.equal(activities[0].damage.critical.allow, false);
    assert.deepEqual(activities[0].damage.parts, [entry.systemData.damage.base]);
    assert.match(entry.content, new RegExp(`Martial DC \\+ ${entry.enhancement.bonus}`));
    assert.match(entry.content, /Ability Modifier manually/);
    assert.match(entry.content, /successful save take half/);
    assert.match(entry.content, /not Proficient[^<]*Advantage/);
    assert.match(entry.content, /Do not make an Attack Roll/);
  }
});

test("combined entries remain identifiable equipment references with stable legacy IDs", () => {
  const references = equipment.filter(entry => entry.referenceOnly);
  assert.deepEqual(references.map(entry => entry.id), [
    "magic-item-arts-staff-1-2-3-1668", "magic-item-arts-wand-1-2-3-1804",
    "magic-item-launcher-1-2-3-8815", "magic-item-weapon-1-2-3-12588"
  ]);
  for (const entry of references) {
    assert.equal(entry.itemType, "equipment");
    assert.equal(entry.name, `Reference: ${entry.previousName}`);
    assert.match(entry.content, /Actor-owned copies manually/);
    assert.equal(entry.contentVersion, "0.3.2");
  }
  assert.equal(equipment.length, 213);
});
