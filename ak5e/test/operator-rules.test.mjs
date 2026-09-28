import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { learnedSkills, operatorState, skillDefinition, chargeOperatorState, activateSkillState, skillExpired, recoverOperatorState } from "../scripts/operator-rules.mjs";
import { CHAPTER_THREE_CLASSES } from "../scripts/chapter-three-content.mjs";
import { splitSourceSections } from "../tools/source-sections.mjs";
import { operatorSkillRecords } from "../tools/operator-skill-content.mjs";

const skill = (id, methods, cost = 40, start = 10, duration = "3 Rounds") => ({ sourceId: id, itemId: id, name: id, cost, start, methods, activation: "Action", duration });
const pool = (points = 0) => operatorState({ enabled: true, points }, [skill("a", ["automatic", "offensive"]), skill("b", ["offensive", "defensive"])]);
const damage = (id, extra = {}) => ({ type: "offensiveDamage", id, hostile: true, positive: true, attack: true, attackId: "attack-one", ownTurn: true, ...extra });

test("learned Skills stack methods, share the largest pool, and ignore duplicate source copies", () => {
  const entries = [skill("one", ["offensive"], 15, 5), skill("two", ["automatic", "offensive", "defensive"], 40, 20)];
  const items = [...entries, entries[0]].map((entry, i) => ({ id: String(i), name: entry.name, flags: { ak5e: { operatorSkill: entry } } }));
  const state = operatorState({ enabled: true, points: 7 }, learnedSkills(items));
  assert.equal(state.maximum, 40); assert.equal(state.start, 20); assert.equal(state.points, 7);
  assert.deepEqual(state.rates, { automatic: 2, offensive: 2, defensive: 2 });
  assert.equal(operatorState(state, []).maximum, 0);
  assert.equal(operatorState({ points: 7, maximum: 12, start: 4 }, learnedSkills(items)).maximum, 12);
  assert.deepEqual(skillDefinition(skill("liberator", [])).methods, []);
  assert.throws(() => skillDefinition(skill("invalid", ["unknown"])), /valid charging/);
  assert.throws(() => skillDefinition(skill("invalid", [], 10, 0, "0 Rounds")), /at least one/);
});

test("Offensive attacks deduplicate across damage parts and targets, but separate Attacks charge", () => {
  let state = pool();
  state = chargeOperatorState(state, damage("immune", { positive: false })).state;
  assert.equal(state.points, 0);
  state = chargeOperatorState(state, damage("absorbed-by-temp")).state;
  assert.equal(state.points, 2);
  assert.equal(chargeOperatorState(state, damage("other-target")).reason, "duplicate");
  state = chargeOperatorState(state, damage("second", { attackId: "attack-two" })).state;
  assert.equal(state.points, 4);
  assert.equal(chargeOperatorState(state, damage("off-turn", { ownTurn: false, attackId: "third" })).reason, "offTurn");
  assert.equal(chargeOperatorState(state, damage("neutral", { hostile: null, attackId: "fourth" })).reason, "confirmation");
  assert.equal(chargeOperatorState(state, damage("unidentified", { attackId: null })).reason, "confirmation");
});

test("healing requires actual HP, someone else, and own turn; temporary HP additionally requires an Art", () => {
  const event = { type: "offensiveHealing", id: "heal", ownTurn: true, positive: true, self: false };
  assert.equal(chargeOperatorState(pool(), event).gained, 2);
  assert.equal(chargeOperatorState(pool(), { ...event, self: true }).reason, "self");
  assert.equal(chargeOperatorState(pool(), { ...event, positive: false }).reason, "noChange");
  assert.equal(chargeOperatorState(pool(), { ...event, ownTurn: false }).reason, "offTurn");
  assert.equal(chargeOperatorState(pool(), { ...event, type: "offensiveTemp", art: false }).reason, "notArt");
  assert.equal(chargeOperatorState(pool(), { ...event, type: "offensiveTemp", art: null }).reason, "confirmation");
  assert.equal(chargeOperatorState(pool(), { ...event, type: "offensiveTemp", art: true }).gained, 2);
});

test("Defensive misses charge, attack damage never charges twice, and hostile non-Attack damage charges off turn", () => {
  let state = chargeOperatorState(pool(), { type: "defensiveAttack", id: "miss", attackId: "attack", hostile: true }).state;
  assert.equal(state.points, 2);
  assert.equal(chargeOperatorState(state, { type: "defensiveAttack", id: "repeat", attackId: "attack", hostile: true }).reason, "duplicate");
  state = chargeOperatorState(state, { type: "defensiveDamage", id: "damage", hostile: true, attack: true, positive: true }).state;
  assert.equal(state.points, 2);
  assert.equal(chargeOperatorState(state, { type: "defensiveDamage", id: "save", hostile: true, attack: false, positive: true, ownTurn: false }).gained, 2);
  assert.equal(chargeOperatorState(state, { type: "defensiveDamage", id: "immune", hostile: true, attack: false, positive: false }).gained, 0);
});

test("blocked and capped turn receipts survive spending, while delayed Skill effects never charge", () => {
  const event = { type: "automatic", id: "combat:round:combatant", ownTurn: true };
  let state = chargeOperatorState(pool(40), event).state;
  assert.equal(state.lastEvent.reason, "capped");
  assert.equal(chargeOperatorState({ ...state, points: 0 }, event).reason, "duplicate");
  state = chargeOperatorState({ ...pool(), active: { name: "Skill" } }, event).state;
  assert.equal(state.lastEvent.reason, "active");
  assert.equal(chargeOperatorState({ ...state, active: null }, event).reason, "duplicate");
  assert.equal(chargeOperatorState(pool(), damage("delayed", { skillOrigin: { skillUuid: "old" } })).reason, "skillOrigin");
  assert.equal(chargeOperatorState(pool(), damage("unknown", { provenanceUnknown: true })).reason, "confirmation");
});

test("activation spends once, enforces one active Skill, and Long Rest preserves surplus SP", () => {
  const entry = skill("active", ["automatic"], 10, 5);
  assert.throws(() => activateSkillState(pool(9), entry), /Not enough/);
  let state = activateSkillState(pool(30), entry, { worldTime: 50 });
  assert.equal(state.points, 20); assert.equal(state.active.name, "active");
  assert.throws(() => activateSkillState(state, entry), /Only one/);
  assert.equal(recoverOperatorState(state).points, 20);
  state = activateSkillState(pool(30), { ...entry, duration: "Instant" });
  assert.equal(state.active, null); assert.equal(state.lastSkill.name, "active");
  state = activateSkillState(pool(30), { ...entry, duration: "Until Long Rest" });
  assert.equal(recoverOperatorState(state).active, null);
  assert.equal(recoverOperatorState(pool()).points, 10);
});

test("round expiration follows the activation initiative point, initiative edits, world time, and manual endings", () => {
  const combat = { uuid: "Combat.a", started: true, round: 2, turn: 1, combatant: { id: "reacted-on" }, turns: [{ id: "a" }, { id: "reacted-on" }] };
  const state = activateSkillState(pool(40), skill("reaction", [], 10, 0, "2 Rounds"), { combat, worldTime: 100, roundTime: 10 });
  assert.equal(skillExpired(state.active, { combats: [{ ...combat, round: 4, turn: 0 }] }), false);
  assert.equal(skillExpired(state.active, { combats: [{ ...combat, round: 4, turn: 1 }] }), true);
  assert.equal(skillExpired(state.active, { combats: [{ ...combat, round: 4, turn: 0, turns: [{ id: "reacted-on" }, { id: "a" }] }] }), true);
  assert.equal(skillExpired(state.active, { combats: [], worldTime: 119 }), false);
  assert.equal(skillExpired(state.active, { combats: [], worldTime: 120 }), true);
  assert.equal(skillExpired(activateSkillState(pool(40), skill("manual", [], 10, 0, "1 Attack")).active, { worldTime: 9999 }), false);
});

test("all 320 Skill records exactly retain source cells and distinct Continued sections", async () => {
  const source = await readFile(new URL("../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt", import.meta.url), "utf8");
  const records = CHAPTER_THREE_CLASSES.filter(entry => entry.operatorSkill);
  assert.equal(records.length, 320);
  assert.equal(new Set(records.map(entry => entry.id)).size, 320);
  const counts = { automatic: 0, offensive: 0, defensive: 0 };
  for (const entry of records) {
    assert.ok(source.includes(entry.rawSource));
    const row = entry.rawSource.replace(/^\|/, "").replace(/\|$/, "").split("|").map(cell => cell.trim());
    if (entry.operatorSkill.mapping) row.splice(6, 1);
    assert.equal(entry.operatorSkill.effect, row[5]); assert.equal(entry.operatorSkill.duration, row[6]);
    assert.equal(entry.operatorSkill.cost, Number(row[1])); assert.equal(entry.operatorSkill.start, Number(row[2]));
    assert.equal(entry.operatorSkill.activation, row[4]); counts[entry.operatorSkill.methods[0]]++;
  }
  assert.deepEqual(counts, { automatic: 212, offensive: 79, defensive: 29 });
  assert.equal(records.filter(entry => entry.operatorSkill.mapping).length, 1);
  const continued = splitSourceSections(source, 5).filter(section => section.name === "Advanced Guard Skills Continued");
  assert.equal(continued.length, 2);
  const parsed = continued.flatMap(section => operatorSkillRecords(section, "Guard"));
  assert.equal(new Set(parsed.map(entry => entry.id)).size, parsed.length);
});
