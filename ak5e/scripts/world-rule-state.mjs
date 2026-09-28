/** The existing Chapter 1 setting is the World-wide AK5e rules switch. */
export function worldRulesEnabled() {
  try {
    return globalThis.game?.system?.id === "dnd5e" &&
      globalThis.game.settings.get("ak5e", "chapterOneRules") === true;
  } catch { return false; }
}

export function canMakeDeathSaves(actor) {
  return Boolean(actor?.system?.attributes?.death && actor?.system?.attributes?.hp &&
    ["character", "npc"].includes(actor.type));
}

export function isConstruct(actor) {
  const type = actor?.system?.details?.type;
  return String(typeof type === "object" ? type?.value : type ?? "").toLowerCase() === "construct";
}

export function combinedSkillValue(actor, keys) {
  return Math.max(0, ...keys.map(key => Number(actor?.system?.skills?.[key]?.value) || 0));
}

export function lmdFromCurrency(currency = {}) {
  return (Number(currency.cp) || 0) + 10 * (Number(currency.sp) || 0) +
    100 * (Number(currency.gp) || 0);
}
