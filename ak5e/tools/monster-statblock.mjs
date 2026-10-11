export function extractMonsterBlocks(text) {
  return [...text.matchAll(/^\{\{monster[^\n]*\n([\s\S]*?)^}}\s*$/gm)].map(match => ({
    index: match.index,
    raw: match[1].trim()
  }));
}

export function parseMonsterStatblock(raw) {
  const typeLine = raw.match(/^\*([^*]+)\*$/m)?.[1]?.trim() ?? "";
  const { category, size, type, typeCustom, subtype, alignment } = parseTypeLine(typeLine);
  const armorText = fieldValue(raw, "Armor Class");
  const hpText = fieldValue(raw, "Hit Points");
  const speedText = fieldValue(raw, "Speed");
  const challengeText = fieldValue(raw, "Challenge");
  const sensesText = fieldValue(raw, "Senses");
  return {
    category,
    size,
    type,
    typeCustom,
    subtype,
    alignment,
    armorClass: parseArmorClass(armorText),
    hitPoints: parseHitPoints(hpText),
    movement: parseMovement(speedText),
    challenge: { value: parseChallenge(challengeText), text: challengeText },
    senses: { passive: numberFrom(sensesText?.match(/passive\s+Perception\s+(\d+)/i)?.[1]), text: sensesText },
    defenses: {
      damageResistances: fieldValue(raw, "Damage Resistances") || fieldValue(raw, "Resistances"),
      damageImmunities: fieldValue(raw, "Damage Immunities"),
      damageVulnerabilities: fieldValue(raw, "Damage Vulnerabilities"),
      conditionImmunities: fieldValue(raw, "Condition Immunities") || fieldValue(raw, "Condition Immunity")
    },
    languages: fieldValue(raw, "Languages"),
    savingThrows: fieldValue(raw, "Saving Throws"),
    skills: fieldValue(raw, "Skills"),
    abilityScores: parseAbilityScores(raw)
  };
}

function parseTypeLine(value) {
  const match = value.match(/^(?:(Normal|Elite|Leader)\s+)?(Tiny|Small|Medium|Large|Huge|Gargantuan)\s+(.+?),\s*(.+)$/i);
  if (!match) return { category: null, size: null, type: "custom", typeCustom: value, subtype: "", alignment: "" };
  const typeText = match[3].trim();
  const typeMatch = typeText.match(/^([^()]+?)(?:\s*\(([^)]+)\))?$/);
  return {
    category: match[1] ? titleCase(match[1]) : null,
    size: sizeKey(match[2]),
    type: "custom",
    subtype: typeMatch?.[2]?.trim() ?? "",
    alignment: match[4].trim(),
    typeCustom: typeMatch?.[1]?.trim() ?? typeText
  };
}

function parseHitPoints(value) {
  const match = String(value ?? "").match(/^\s*(\d+)\s*(?:\(([^)]+)\))?\s*$/);
  return {
    maximum: match ? Number(match[1]) : null,
    formula: match?.[2] ?? "",
    text: value
  };
}

function parseArmorClass(value) {
  const match = String(value ?? "").match(/^\s*(\d+)\s*(?:\([^)]*\))?\s*$/);
  return { value: match ? Number(match[1]) : null, text: value };
}

export function sizeKey(value) {
  return {
    tiny: "tiny", small: "sm", medium: "med", large: "lg", huge: "huge", gargantuan: "grg"
  }[String(value).toLowerCase()] ?? "med";
}

export function fieldValue(raw, label) {
  const escaped = escapeRegExp(label);
  return raw.match(new RegExp(`^\\*\\*${escaped}\\*\\*\\s*::\\s*(.+)$`, "mi"))?.[1]
    ?.replace(/\{\{[^}]*}}/g, "")
    .trim() ?? "";
}

function parseAbilityScores(raw) {
  const match = raw.match(/^\|\s*STR\s*\|[^\n]*\n^\|[-:|\s]+\|\n^\|(.+)\|$/m);
  if (!match) return [null, null, null, null, null, null];
  return match[1].split("|").map(value => numberFrom(value)).slice(0, 6);
}

function parseMovement(speedText) {
  const movement = { walk: 0, burrow: 0, climb: 0, fly: 0, swim: 0, hover: false, units: "ft", special: "" };
  if (!speedText) return movement;
  const unparsed = [];
  for (const segment of speedText.split(/[,;]/)) {
    const normalized = segment.trim().toLowerCase();
    const distance = numberFrom(normalized);
    if (distance === null) {
      if (segment.trim()) unparsed.push(segment.trim());
      continue;
    }
    if (/hover/.test(normalized)) {
      movement.fly = distance;
      movement.hover = true;
    } else if (/\bfly\b/.test(normalized)) movement.fly = distance;
    else if (/\bburrow\b/.test(normalized)) movement.burrow = distance;
    else if (/\bclimb\b/.test(normalized)) movement.climb = distance;
    else if (/\bswim\b/.test(normalized)) movement.swim = distance;
    else movement.walk = distance;
    const annotation = segment.match(/\(([^)]+)\)/)?.[1];
    if (annotation) unparsed.push(annotation);
  }
  movement.special = unparsed.join("; ");
  return movement;
}

function parseChallenge(value) {
  const challenge = value?.match(/^([0-9]+(?:\/[0-9]+)?)/)?.[1];
  if (!challenge) return null;
  if (!challenge.includes("/")) return Number(challenge);
  const [numerator, denominator] = challenge.split("/").map(Number);
  return numerator / denominator;
}

function numberFrom(value) {
  const match = String(value ?? "").match(/-?\d+/);
  return match ? Number(match[0]) : null;
}

function titleCase(value) {
  return value.toLowerCase().replace(/^./, character => character.toUpperCase());
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
