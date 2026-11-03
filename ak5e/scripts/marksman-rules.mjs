/**
 * Marksman class rules (Ch.3 L3521-3876), Artilleryman (L3968-4035), and Besieger (L4040-4100).
 * Pure and read-only: nothing here writes Actor state, imports records or touches Foundry globals.
 */

export const MARKSMAN_CLASS_ID = "class-marksman";

export const MARKSMAN_BRANCH_IDS = Object.freeze({
  "subclass-marksman-anti-air": "antiAir",
  "subclass-marksman-artilleryman": "artilleryman",
  "subclass-marksman-besieger": "besieger",
  "subclass-marksman-deadeye": "deadeye",
  "subclass-marksman-flinger": "flinger",
  "subclass-marksman-heavyshot": "heavyshot",
  "subclass-marksman-hunter": "hunter",
  "subclass-marksman-spreadshot": "spreadshot"
});

export const IMPLEMENTED_MARKSMAN_BRANCHES = Object.freeze([
  "antiAir", "artilleryman", "besieger", "deadeye", "flinger",
  "heavyshot", "hunter", "spreadshot"
]);

/** Target Lock attack roll bonus: +1 at 1st level, +2 with Enhanced Target Lock. */
export const TARGET_LOCK_BONUS = Object.freeze({ 1: 1, 12: 2 });

/** Explosive Expertise Thunder damage dice on Splash(X) weapons: 1 at 1st, 2 at 7th, 3 at 14th (L3978). */
export const EXPLOSIVE_EXPERTISE_DICE = Object.freeze({ 1: 1, 7: 2, 14: 3 });

/** Flinger Arts Points table by Marksman level (L4192-4214). */
export const FLINGER_ARTS_POINTS = Object.freeze({
  1: 3, 2: 3, 3: 3,
  4: 4, 5: 4, 6: 4,
  7: 6, 8: 6, 9: 6,
  10: 7, 11: 7, 12: 7,
  13: 10, 14: 10, 15: 10,
  16: 11, 17: 11, 18: 11,
  19: 12, 20: 12
});

/** Flinger Maximum Art Level by Marksman level (L4192-4214). */
export const FLINGER_MAX_ART_LEVEL = Object.freeze({
  1: 1, 7: 2, 13: 3, 19: 4
});

/** Flinger Maximum Bound Weapons by Marksman level (L4247). */
export const FLINGER_BOUND_WEAPONS_MAX = Object.freeze({
  1: 1, 5: 2, 14: 3
});

/** Deadeye Vital Strike bonus damage dice by Marksman level (L4126-4128). */
export const DEADEYE_VITAL_STRIKE_DICE = Object.freeze({
  4: "2d6", 7: "3d6", 14: "4d6"
});

/** Hunter Charges maximum pool by Marksman level (L4399). */
export const HUNTER_CHARGES_MAX = Object.freeze({
  1: 2, 7: 4, 14: 6
});

/** Spreadshot Shell Ammunition types (L4506-4511). */
export const SPREADSHOT_SHELL_TYPES = Object.freeze({
  dragonsBreath: { id: "dragonsBreath", name: "Dragon's Breath", damageType: "fire", dcSave: "dex" },
  flechette: { id: "flechette", name: "Flechette", damageType: "piercing", dcSave: "dex" },
  slug: { id: "slug", name: "Slug", damageType: "piercing", dcSave: "con" },
  beanbag: { id: "beanbag", name: "Beanbag", damageType: "bludgeoning", dcSave: "dex" }
});

/** Fighting Styles available to the Marksman Class (L3615-3642). */
export const FIGHTING_STYLES = Object.freeze({
  bracedForAction: {
    id: "class-feature-marksman-braced-for-action-4536",
    name: "Braced for Action",
    description: "Once per Turn, when you make a Damage Roll for a Weapon with the Brace Keyword, you may reroll one of those dice."
  },
  closeAndPersonal: {
    id: "class-feature-marksman-close-and-personal-4675",
    name: "Close and Personal",
    description: "You do not have Disadvantage on Ranged Attack Rolls when there is a hostile Creature within 5 feet of you."
  },
  coneOfFire: {
    id: "class-feature-marksman-cone-of-fire-4808",
    name: "Cone of Fire",
    description: "Whenever you make an Attack using the Spread Quality, you may deal the additional Damage even if the Attack misses."
  },
  deadlyFighter: {
    id: "class-feature-marksman-deadly-fighter-4945",
    name: "Deadly Fighter",
    description: "The first time each Turn you make an Attack Roll using a Weapon with the Deadly Property, the Critical Range of that Attack is increased by 1."
  },
  defensive: {
    id: "class-feature-marksman-defensive-5110",
    name: "Defensive",
    description: "When you are hit by an Attack while you have a Melee Weapon or Shield equipped, you may use your Reaction to increase your AC by 1d4 for the duration of that Attack, possibly causing that Attack to miss."
  },
  ranger: {
    id: "class-feature-marksman-ranger-5331",
    name: "Ranger",
    description: "You gain a +2 Bonus to Attack Rolls you make with Ranged or Thrown Weapons."
  },
  smoothOperator: {
    id: "class-feature-marksman-smooth-operator-5421",
    name: "Smooth Operator",
    description: "When you make an Attack as a Bonus Action using the Rapid Fire Property, you may add your Ability Modifier to the Damage Roll of the additional Attack(s)."
  },
  twoWeaponFighting: {
    id: "class-feature-marksman-two-weapon-fighting-5600",
    name: "Two-Weapon Fighting",
    description: "When you engage in Two-Weapon Fighting, you can add your Ability Modifier to the Damage of the additional Attack(s), and you may draw or stow two one-handed weapons when you would normally be able to draw or stow only one."
  }
});

const DEFAULT_STATE = Object.freeze({
  version: 1,
  enabled: false,
  targetLock: null,
  siegeMode: false,
  fightingStyle: null,
  rulings: {}
});

export const flag = (document, key) => document?.getFlag?.("ak5e", key) ?? document?.flags?.ak5e?.[key];
const list = collection => Array.from(collection?.values?.() ?? collection ?? []);

function stepValue(steps, level) {
  const keys = Object.keys(steps).map(Number).sort((a, b) => a - b).filter(key => key <= level);
  return keys.length ? steps[keys.at(-1)] : 0;
}

export function checkLevel(level) {
  const n = Number(level);
  return Number.isInteger(n) && n >= 1 && n <= 20 ? n : null;
}

export function marksmanProfile(actor) {
  const items = list(actor?.items);
  const classItem = items.find(i => i.type === "class" && (flag(i, "chapterThreeId") === MARKSMAN_CLASS_ID || i.name?.toLowerCase() === "marksman"));
  if (!classItem) return { applicable: false, reason: "No Marksman class item on actor." };

  const level = checkLevel(classItem.system?.levels) ?? 1;
  const branchItem = items.find(i => i.type === "subclass" && (Object.keys(MARKSMAN_BRANCH_IDS).includes(flag(i, "chapterThreeId")) || i.system?.classIdentifier === classItem.system?.identifier));
  const branchSourceId = flag(branchItem, "chapterThreeId");
  const branch = MARKSMAN_BRANCH_IDS[branchSourceId] ?? branchItem?.name?.toLowerCase() ?? null;

  return {
    applicable: true,
    level,
    branch,
    classItem,
    branchItem,
    pb: Math.floor((level - 1) / 4) + 2
  };
}

export function isMarksman(actor) {
  return marksmanProfile(actor).applicable;
}

export function marksmanLevel(actor) {
  return marksmanProfile(actor).level ?? 0;
}

export function marksmanBranch(actor) {
  return marksmanProfile(actor).branch ?? null;
}

export function marksmanEnabled(actor) {
  return Boolean(flag(actor, "marksman")?.enabled || flag(actor, "marksmanEnabled"));
}

export function marksmanState(actor) {
  const raw = flag(actor, "marksman") ?? {};
  return { ...DEFAULT_STATE, ...raw };
}

/** Martial DC: 8 + PB + the chosen STR or DEX modifier (Ch.1 L211). */
export function martialDC(actor, ability = flag(actor, "marksman")?.martialDcAbility) {
  const prof = Number(actor?.system?.attributes?.prof ?? 2);
  const selected = ability === "str" || ability === "dex" ? ability : null;
  if (!selected) return null;
  return 8 + prof + Number(actor?.system?.abilities?.[selected]?.mod ?? 0);
}

/** Target Lock attack bonus: +1 at 1st, +2 at 12th, or at 11th by GM ruling. */
export function targetLockBonus(actor, enhancedLevel = null) {
  const level = marksmanLevel(actor);
  const rulingLevel = Number(marksmanState(actor).rulings?.enhancedTargetLockLevel?.value);
  const selectedLevel = Number(enhancedLevel);
  const unlock = selectedLevel === 11 || selectedLevel === 12 ? selectedLevel
    : level >= 12 ? 12
      : level === 11 && rulingLevel === 11 ? 11 : 12;
  return level >= unlock ? 2 : 1;
}

/** Explosive Expertise Thunder damage dice count for Splash(X) weapons. */
export function explosiveExpertiseDice(actor) {
  const level = marksmanLevel(actor);
  return stepValue(EXPLOSIVE_EXPERTISE_DICE, level);
}

/** World time in seconds, matching Foundry's one-minute duration convention. */
export function marksmanWorldTime() {
  const value = Number(globalThis.game?.time?.worldTime);
  return Number.isFinite(value) ? value : Date.now() / 1000;
}

/** Legacy locks without expiry are inactive, so old flags can never grant permanent bonuses. */
export function isTargetLockActive(actor, now = marksmanWorldTime()) {
  const state = marksmanState(actor);
  const lock = state.targetLock;
  const expiresAt = Number(lock?.expiresAt);
  if (!lock?.active || !Number.isFinite(expiresAt)) return false;
  // Earlier Anti-Air code stored Date.now() milliseconds. Honor those only until their real expiry;
  // new Target Locks use world-time seconds and cannot become permanent after a migration.
  const legacyMilliseconds = expiresAt > 10_000_000_000;
  return expiresAt > (legacyMilliseconds ? Date.now() : now);
}

/** Checks whether the actor has an unexpired Target Lock on the given target. */
export function isTargetLocked(actor, targetUuid, now = marksmanWorldTime()) {
  if (!targetUuid || !isTargetLockActive(actor, now)) return false;
  return marksmanState(actor).targetLock.targetUuid === targetUuid;
}

/** Checks whether the actor has a given Fighting Style selected or granted. */
export function hasFightingStyle(actor, styleKey) {
  const state = marksmanState(actor);
  if (state.fightingStyle === styleKey) return true;
  const items = list(actor?.items);
  const styleDef = FIGHTING_STYLES[styleKey];
  if (!styleDef) return false;
  return items.some(i => i.name === styleDef.name || flag(i, "chapterThreeId") === styleDef.id);
}

/** Deadeye Vital Strike bonus damage formula: 2d6 at 4th, 3d6 at 7th, 4d6 at 14th. */
export function deadeyeVitalStrikeDice(actor) {
  const level = marksmanLevel(actor);
  return stepValue(DEADEYE_VITAL_STRIKE_DICE, level) || "2d6";
}

/** Flinger Spellcasting Ability ("int", "wis", or "cha", defaulting to "int"). */
export function flingerSpellcastingAbility(actor) {
  return flag(actor, "marksman")?.flingerAbility ?? "int";
}

/** Flinger Spell Save DC: 8 + PB + Spellcasting Ability Mod (L4186). */
export function flingerSpellDC(actor) {
  const prof = Number(actor?.system?.attributes?.prof ?? 2);
  const ability = flingerSpellcastingAbility(actor);
  const mod = Number(actor?.system?.abilities?.[ability]?.mod ?? 0);
  return 8 + prof + mod;
}

/** Flinger Spell Attack Modifier: PB + Spellcasting Ability Mod. */
export function flingerSpellMod(actor) {
  const ability = flingerSpellcastingAbility(actor);
  return Number(actor?.system?.abilities?.[ability]?.mod ?? 0);
}

/** Flinger Maximum Arts Points. */
export function flingerArtsPoints(actor) {
  const level = marksmanLevel(actor);
  return stepValue(FLINGER_ARTS_POINTS, level);
}

/** Flinger Maximum Art Level. */
export function flingerMaxArtLevel(actor) {
  const level = marksmanLevel(actor);
  return stepValue(FLINGER_MAX_ART_LEVEL, level);
}

/** Flinger Maximum Bound Weapons. */
export function flingerMaxBoundWeapons(actor) {
  const level = marksmanLevel(actor);
  return stepValue(FLINGER_BOUND_WEAPONS_MAX, level);
}

/** Flinger Art cost with self/target discount (-1 AP, min 0; L4182). */
export function flingerArtCost(actor, baseCost, { isSelfOrTarget = false } = {}) {
  const discount = isSelfOrTarget ? 1 : 0;
  return Math.max(0, baseCost - discount);
}

/** Hunter Maximum Charges by Marksman level (L4399). */
export function hunterMaxCharges(actor) {
  const level = marksmanLevel(actor);
  return stepValue(HUNTER_CHARGES_MAX, level);
}

/** Check whether a weapon item is tuned as a Custom Job (Heavyshot L4316). */
export function isCustomJobWeapon(item) {
  if (!item) return false;
  return Boolean(flag(item, "customJob") || item.flags?.ak5e?.customJob);
}

/** Check whether a weapon natively has the Spread property (Ch.4 / L4478). */
export function hasNativeSpreadProperty(item) {
  if (!item) return false;
  return Boolean(item.system?.properties?.has?.("spread") || flag(item, "spread") || flag(item, "nativeSpread"));
}

/** Check whether a weapon has the Spread property natively or via Spreadshot Wide Fire (L4482). */
export function hasSpreadProperty(item, actor = null) {
  if (!item) return false;
  if (hasNativeSpreadProperty(item)) return true;
  if (actor && marksmanBranch(actor) === "spreadshot") {
    const isRanged = item.system?.actionType === "rwak" || item.type === "weapon" && item.system?.weaponType?.includes?.("Ranged");
    const isLightOrHeavy = item.system?.properties?.has?.("lgt") || item.system?.properties?.has?.("hvy") ||
      flag(item, "light") || flag(item, "heavy");
    if (isRanged && isLightOrHeavy) return true;
  }
  return false;
}

/** Check whether distance (in feet) qualifies as Point Blank (<= 15 ft; L4489). */
export function isPointBlankDistance(distanceFt) {
  return typeof distanceFt === "number" && distanceFt <= 15;
}
