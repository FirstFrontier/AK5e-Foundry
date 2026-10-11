import { sourceToHtml } from "./source-html.mjs";
import { skillDefinition } from "../scripts/operator-rules.mjs";
import { skillTargetProfile, nativePhaseActivities } from "../scripts/operator-target-profiles.mjs";

const slug = value => value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const cells = line => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(value => value.trim());

/** Parse a single section occurrence: repeated Continued headings are distinct tables. */
export function operatorSkillRecords(section, parentClass, parentBranch = null) {
  const tier = section.name.match(/\b(Basic|Advanced|Elite)\b/)?.[1];
  if (!tier || !/\bSkills(?: Continued)?$/.test(section.name)) return [];
  const lines = section.raw.split("\n");
  const start = lines.findIndex(line => /^\|\s*Name\s*\|SP Cost\|Start SP\|Charging/.test(line));
  if (start < 0) return [];
  const records = [];
  for (const line of lines.slice(start + 2)) {
    if (!line.trim().startsWith("|")) break;
    const values = cells(line);
    // The Specialist Cluster Bombs row alone has an empty cell before Instant.
    const extraEmptyCell = parentClass === "Specialist" && values[0] === "Cluster Bombs" && values.length === 8 && values[6] === "" && values[7] === "Instant";
    if (extraEmptyCell) values.splice(6, 1);
    if (values.length !== 7) throw new Error(`Unexpected Skill cells in ${parentClass}/${section.name}: ${line}`);
    const [name, cost, startSP, charging, activation, effect, duration] = values;
    const id = `operator-skill-${slug([parentClass, parentBranch, tier, name].filter(Boolean).join("-"))}`;
    const operatorSkill = skillDefinition({ sourceId: id, tier, cost: Number(cost), start: Number(startSP), methods: [charging.toLowerCase()],
      activation, duration, effect, source: `${parentClass}${parentBranch ? `: ${parentBranch}` : ""} / ${section.name}`,
      ...(extraEmptyCell ? { mapping: "Removed the extra empty cell preceding Instant; original row retained in rawSource." } : {}) });
    const activationType = { Action: "action", "Bonus Action": "bonus", Reaction: "reaction", "No Action Required": "" }[activation];
    records.push({ id, kind: "operator-skill", name, parentClass, parentBranch, sourceHeading: section.name, itemType: "feat",
      level: { Basic: 2, Advanced: 7, Elite: 14 }[tier], operatorSkill,
      systemData: { source: { custom: "AK5e 1st Edition v1.3.1" }, activities: { ak5eSkillUse0001: { _id: "ak5eSkillUse0001", type: "utility",
        name: "Activate Operator Skill", activation: { type: activationType, value: activationType ? 1 : null }, consumption: { targets: [], spellSlot: false } },
        ...nativePhaseActivities(skillTargetProfile({ name, parentClass, operatorSkill })) } },
      content: sourceToHtml(`##### ${name}\n**SP Cost:** ${cost}<br>\n**Start SP:** ${startSP}<br>\n**Charging:** ${charging}<br>\n**Activation:** ${activation}<br>\n**Duration:** ${duration}\n\n${effect}\n\n**Source:** AK5e 1st Edition v1.3.1, Chapter 3: ${operatorSkill.source}`),
      rawSource: line.trim() });
  }
  return records;
}
