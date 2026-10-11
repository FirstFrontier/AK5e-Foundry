import { CHAPTER_THREE_CLASSES } from "./chapter-three-content.mjs";

export const OPERATOR_SKILL_LEVELS = Object.freeze([{ tier: "Basic", level: 2 }, { tier: "Advanced", level: 7 }, { tier: "Elite", level: 14 }]);
const records = new Map(CHAPTER_THREE_CLASSES.map(entry => [entry.id, entry]));
const catalogue = CHAPTER_THREE_CLASSES.filter(entry => entry.operatorSkill);
const flag = (document, key) => document?.getFlag?.("ak5e", key) ?? document?.flags?.ak5e?.[key];
const list = collection => Array.from(collection?.values?.() ?? collection ?? []);

/** Pure, source-ID-based view. Never adopt Items or write receipts while rendering. */
export function getOperatorSkillChoices(actor) {
  const empty = { applicable: false, slots: [], pending: [], blocked: [], contextKey: null, promptKey: null };
  if (actor?.type !== "character" || actor.pack) return empty;
  const items = list(actor.items);
  const classes = items.filter(item => item.type === "class");
  const managed = classes.filter(item => records.get(flag(item, "chapterThreeId"))?.kind === "class");
  if (!managed.length) return empty;
  if (classes.length !== 1) return { ...empty, applicable: true, blocked: ["MultipleClasses"] };
  const classItem = managed[0], classId = flag(classItem, "chapterThreeId"), entry = records.get(classId);
  const branches = items.filter(item => item.type === "subclass");
  const branchItem = branches[0], branch = records.get(flag(branchItem, "chapterThreeId"));
  if (branches.length > 1 || branchItem && (branch?.kind !== "subclass" || branch.parentClass !== entry.name)) {
    return { ...empty, applicable: true, blocked: ["UnknownBranch"] };
  }
  const level = Number(classItem.system?.levels);
  if (!Number.isInteger(level) || level < 1) return { ...empty, applicable: true, blocked: ["InvalidClassLevel"] };
  const stored = flag(actor, "operatorSkills")?.progression?.choices ?? {};
  const contextKey = JSON.stringify([classId, classItem.id, level, branch?.id ?? null, branchItem?.id ?? null]);
  const slots = OPERATOR_SKILL_LEVELS.map(unlock => {
    const key = `${classId}:${unlock.tier}`;
    const options = catalogue.filter(skill => skill.operatorSkill.tier === unlock.tier && (
      skill.parentClass === entry.name && !skill.parentBranch
      || entry.name === "Guard" && branch?.sourceHeading === "Liberator" && skill.parentClass === "Guard" && skill.parentBranch === "Liberator"
      || unlock.level >= 4 && entry.name === "Defender" && branch?.sourceHeading === "Sentry" && skill.parentClass === "Marksman" && !skill.parentBranch
      || unlock.level >= 4 && entry.name === "Medic" && branch?.sourceHeading === "Witchcraft" && skill.parentClass === "Caster" && !skill.parentBranch
    )).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    // Disabled/customized feats still represent learned Skills. Duplicated source copies count once.
    const candidates = items.filter(item => {
      const definition = flag(item, "operatorSkill");
      return item.type === "feat" && definition && (definition.tier === unlock.tier
        || records.get(definition.sourceId ?? flag(item, "chapterThreeId"))?.operatorSkill?.tier === unlock.tier);
    });
    const marked = items.filter(item => flag(item, "operatorSkillChoice")?.key === key);
    const markedSources = new Set(marked.map(item => flag(item, "operatorSkillChoice")?.sourceId));
    let selection = stored[key], status = level >= unlock.level ? "pending" : "locked";
    if (selection) status = "chosen";
    else if (marked.length) {
      const sourceId = [...markedSources][0];
      if (markedSources.size !== 1 || records.get(sourceId)?.operatorSkill?.tier !== unlock.tier || marked.some(item => flag(item, "operatorSkill")?.sourceId !== sourceId)) status = "ambiguous";
      else { selection = { sourceId, itemId: marked[0].id }; status = "chosen"; }
    } else if (candidates.length) {
      const sources = new Set(candidates.map(item => flag(item, "operatorSkill").sourceId ?? flag(item, "chapterThreeId")));
      const sourceId = [...sources][0];
      if (sources.size !== 1 || !options.some(option => option.id === sourceId)) status = "ambiguous";
      else { selection = { sourceId, itemId: candidates[0].id }; status = "chosen"; }
    }
    const present = selection && items.find(item => item.type === "feat"
      && (flag(item, "operatorSkill")?.sourceId ?? flag(item, "chapterThreeId")) === selection.sourceId);
    if (selection && present && !items.some(item => item.id === selection.itemId)) selection = { ...selection, itemId: present.id };
    return { ...unlock, key, status, selection, missing: status === "chosen" && !present,
      recovery: status === "chosen" && !stored[key] && marked.length > 0, options };
  });
  const pending = slots.filter(slot => slot.status === "pending");
  const blocked = slots.flatMap(slot => slot.status === "ambiguous" ? ["AmbiguousSkills"] : slot.missing ? ["MissingChosenSkill"] : []);
  return { applicable: true, classId, className: entry.name, branchName: branch?.sourceHeading ?? null, level, contextKey,
    slots, pending, blocked: [...new Set(blocked)], promptKey: pending.length ? JSON.stringify([contextKey, pending.map(slot => slot.key)]) : null };
}

/** Prefer the assigned active player, then one deterministic active owner, then the elected GM. */
export function operatorChoiceUser(actor, users) {
  const owners = list(users).filter(user => user.active && !user.isGM && actor.testUserPermission?.(user, "OWNER"))
    .sort((a, b) => a.id.localeCompare(b.id));
  return owners.find(user => user.character?.uuid === actor.uuid) ?? owners[0] ?? users?.activeGM ?? null;
}

export function progressionWithChoices(previous = {}, view) {
  const choices = { ...previous.choices };
  for (const slot of view.slots) if (slot.selection) choices[slot.key] = { ...slot.selection };
  return { ...previous, choices, promptKey: view.promptKey };
}
