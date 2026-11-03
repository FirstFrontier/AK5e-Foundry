/** Specialist runtime features and mechanical hooks (Ch. 3 L5161–5493).
 * Weapon Specialisation, Show Your Style (Prowess), Weapon Adept,
 * Weapon Expertise, Falling Upwards, and Weapon Mastery.
 */
import {
  specialistLevel, specialistEnabled, pbForLevel, flag,
  specialistState, WEAPON_SPECIALISATION_CATEGORIES
} from "./specialist-rules.mjs";
import { definePool, getPool, getPoolDefinition, refundPool, recoverPool, registerResourcePoolHooks, registerProwessPool } from "./resource-pools.mjs";
import { need } from "./operation-kernel.mjs";

let hooksInstalled = null;

export function hasWeaponSpecialisation(actor) {
  const lvl = specialistLevel(actor);
  return Boolean(lvl && lvl >= 1);
}

export function getWeaponSpecialisation(actor) {
  const state = specialistState(actor);
  return {
    category: state.weaponCategory ?? null,
    style: state.fightingStyle ?? null
  };
}

export function hasShowYourStyle(actor) {
  const lvl = specialistLevel(actor);
  return Boolean(lvl && lvl >= 4);
}

export function hasWeaponAdept(actor) {
  const lvl = specialistLevel(actor);
  return Boolean(lvl && lvl >= 6);
}

export function hasWeaponExpertise(actor) {
  const lvl = specialistLevel(actor);
  return Boolean(lvl && lvl >= 12);
}

export function hasFallingUpwards(actor) {
  const lvl = specialistLevel(actor);
  return Boolean(lvl && lvl >= 17);
}

export function hasWeaponMastery(actor) {
  const lvl = specialistLevel(actor);
  return Boolean(lvl && lvl >= 18);
}

export function defineSpecialistPools() {
  return registerProwessPool();
}

export async function onSpecialistRest(actor, restType) {
  if (!specialistEnabled(actor) || !hasShowYourStyle(actor)) return;
  const trigger = restType === "long" ? ["lr", "sr"] : "sr";
  await recoverPool(actor, trigger);
}

export function registerSpecialistHooks() {
  if (hooksInstalled === globalThis.Hooks) return;
  hooksInstalled = globalThis.Hooks;
  defineSpecialistPools();
  registerResourcePoolHooks();
}
