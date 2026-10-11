/** Explicit Chapter 3 mappings, reviewed at 7994–8007 and 8490–8645.
 * No prose parser or global D&D5e rules replacement is used. */
import { CHAPTER_THREE_CLASSES } from "./chapter-three-content.mjs";

export const STANDARD_VERSION = 1;
export const STANDARD_BRANCH_ID = "subclass-vanguard-standard-bearer";
export const STANDARD_ENTRIES = CHAPTER_THREE_CLASSES.filter(e => e.parentBranch === "Standard Bearer");
export const BATTLECRIES = Object.freeze({
  belligerant: { name: "Belligerant Exultation", cost: 3, trigger: "turnStart", instructions: "Until the start of the bearer's next Turn, use a Bonus Action to Dash or make a Weapon Attack. Chorus: use a Reaction now to do one; that action cannot be taken using this benefit as a Bonus Action next Turn." },
  havoc: { name: "Cry Havoc", cost: 5, instructions: "Wisdom save against Standard Bearer DC. Failed: Psychic Damage and Frightened of the bearer; repeat the save at turn end. Successful: half Damage, no Frightened. At 0 HP this breaks morale, rather than killing. Each confirmed Chorus Reaction adds 10 feet to the cone and 1d4 Damage." },
  defiant: { name: "Defiant Roar", cost: 10, trigger: "nextTurnEnd", extend: true, instructions: "Physical Damage Reduction equal to the bearer's Charisma Modifier, applied before Resistance/Vulnerability; Damage cannot be reduced below 1. Chorus: Resistance to the next instance of Damage within a minute. Confirm consumption after that instance." },
  heroic: { name: "Heroic Proclamation", cost: 5, trigger: "nextTurnEnd", extend: true, instructions: "Immune to Frightened; an existing Frightened condition is suspended while affected. You may add 1d4 to an Attack Roll. Chorus: Reaction grants additive 1d8 Temporary HP." },
  rallying: { name: "Rallying Cry", cost: 3, instructions: "Expend and roll one Hit Die, regaining that roll + the bearer's Charisma Modifier (not your Constitution Modifier). Chorus: after regaining HP, expend your Reaction to do this again. Constructs cannot regain HP from Class Features without an explicit exception." },
  strident: { name: "Strident Boast", cost: 10, instructions: "Gain SP equal to the bearer's Vanguard Level. Chorus: immediately after that gain, expend a Reaction to gain that amount again. Review Chapter 1 active-Skill restrictions; no exception is invented." }
});
export const FERVOUR_TRIGGERS = ["alliedCritical", "alliedKill", "hostileDefeated", "alliedSkill"];
export const TIP_INSTRUCTIONS = [
  "Add the bearer's Proficiency Bonus to one Damage Roll of your choice; confirm Used after that roll.",
  "Gain additive 1d6 Temporary HP. These stack with your existing Temporary HP.",
  "Speed increases by 10 feet.",
  "+2 to Attack Rolls.",
  "Critical Range increases by 1; the scoped attack-roll helper adjusts the current threshold.",
  "Whenever you gain a Skill Point, gain 1 more. Confirm the qualifying gain before applying the additional SP; distinguish an individual point from a grouped award with the GM."
];
export { flag, values } from "./operation-kernel.mjs";
import { flag, values } from "./operation-kernel.mjs";
export function hasStandardBranch(actor) {
  return values(actor?.items).some(i => flag(i, "chapterThreeId") === STANDARD_BRANCH_ID);
}
export function vanguardLevel(actor) {
  return values(actor?.items).filter(i => flag(i, "chapterThreeId") === "class-vanguard")
    .reduce((sum, item) => sum + Number(item.system?.levels ?? 0), 0);
}
export function standardState(actor) {
  return { version: STANDARD_VERSION, mode: "carried", fervour: 0, triggers: {}, tips: {}, duty: {},
    operations: [], cries: {}, ...structuredClone(flag(actor, "standardBearer") ?? {}) };
}
export function standardDC(actor) {
  return 8 + Number(actor.system?.abilities?.cha?.mod ?? 0) + Number(actor.system?.attributes?.prof ?? 0);
}
export function integer(value, label, minimum = 0) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum) throw new Error(`${label} must be an integer of at least ${minimum}.`);
  return number;
}
export function grantFervour(state, trigger, cycle) {
  if (!FERVOUR_TRIGGERS.includes(trigger)) throw new Error("Choose a source Fervour trigger.");
  if (state.triggers[trigger] === cycle) throw new Error("This Fervour trigger was already used before your next Turn.");
  return { ...state, fervour: integer(state.fervour, "Fervour") + 1, triggers: { ...state.triggers, [trigger]: cycle } };
}
export function spendFervour(state, cry) {
  if (!BATTLECRIES[cry]) throw new Error("Unknown Battlecry.");
  if (state.fervour < BATTLECRIES[cry].cost) throw new Error("Not enough Fervour.");
  return { ...state, fervour: state.fervour - BATTLECRIES[cry].cost };
}
export function standardWeaponData(actorUuid) {
  const source = STANDARD_ENTRIES.find(e => /1st Level: Battle Standard$/.test(e.name));
  return { name: "Battle Standard", type: "weapon", img: "icons/svg/tower-flag.svg",
    system: { quantity: 1, type: { value: "simpleM", baseItem: "" }, properties: ["fin", "two"],
      weight: { value: 5, units: "lb" }, price: { value: 200, denomination: "cp" },
      damage: { base: { number: 1, denomination: 8, bonus: "", types: ["piercing"], custom: { enabled: false, formula: "" } } },
      range: { reach: 5, units: "ft" }, description: { value: source.content, chat: "" } },
    flags: { ak5e: { standardWeapon: actorUuid, sourceHeading: source.sourceHeading,
      sourceFile: "03_chapter_3_character_classes.txt", rawSource: source.rawSource } } };
}
export function standardFeatureActions(entry) {
  const name = entry?.sourceHeading ?? "";
  if (/Battle Standard$/.test(name)) return ["setup", "wield", "stow", "plant", "pickup"];
  if (/Battle Cry$/.test(name)) return ["fervour", "clearFervour"];
  if (/Symbol of Authority$/.test(name)) return ["kingHill", "herald"];
  if (/Power Projection$/.test(name)) return ["projection"];
  if (/Proclaimer$/.test(name)) return ["duty", "expertise"];
  if (/The Last Stand$/.test(name)) return ["lastStand", "endStand", "extraTurn", "redirect"];
  const cry = Object.entries(BATTLECRIES).find(([, c]) => name.startsWith(c.name));
  return cry ? [`cry:${cry[0]}`, "chorus", ...(cry[1].extend ? ["extend"] : [])] : [];
}
export function featureHelperActivity(entry) {
  if (!standardFeatureActions(entry).length) return {};
  const bonus = /Battle Standard$/.test(entry.sourceHeading);
  return { ak5eStandardHelp1: { _id: "ak5eStandardHelp1", type: "utility", name: "Standard Bearer helpers",
    activation: { type: bonus ? "bonus" : "action", value: 1 }, consumption: { targets: [] } } };
}
/** Scene units are converted explicitly; source distances stay feet. */
export function distanceFeet(scene, a, b) {
  const units = String(scene.grid.units ?? "ft").toLowerCase();
  const factor = /^(m|meter|meters|metre|metres)$/.test(units) ? 3.280839895 : 1;
  return Math.hypot((a.x - b.x) * scene.grid.distance / scene.grid.size,
    (a.y - b.y) * scene.grid.distance / scene.grid.size, Number(a.elevation ?? 0) - Number(b.elevation ?? 0)) * factor;
}
export function tokenPoint(token) {
  return { ...(token.getCenterPoint?.() ?? { x: token.x + token.width * token.parent.grid.size / 2,
    y: token.y + token.height * token.parent.grid.size / 2 }), elevation: Number(token.elevation ?? 0) };
}
export function withinFeet(scene, origin, token, feet) {
  const offsets = token.getOccupiedGridSpaceOffsets?.();
  const points = scene.grid.type && offsets?.length ? offsets.map(offset => scene.grid.getCenterPoint(offset)) : [tokenPoint(token)];
  return points.some(point => distanceFeet(scene, origin, { ...point, elevation: Number(token.elevation ?? 0) }) <= feet + 1e-6);
}
export function reductionPreview(amount, reduction, { resistance = false, vulnerability = false } = {}) {
  if (Number(amount) <= 0) return 0;
  const reduced = Math.max(1, Number(amount) - Math.max(0, Number(reduction)));
  return Math.max(1, Math.floor(reduced * (resistance ? 0.5 : 1) * (vulnerability ? 2 : 1)));
}
