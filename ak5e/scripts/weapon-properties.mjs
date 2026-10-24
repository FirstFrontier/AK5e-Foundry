/** Read AK5e properties from imported source metadata as well as native/legacy Items. */
const aliases = Object.freeze({ brace: ["brace"], deadly: ["deadly"], rapidfire: ["rapid", "rapidFire"],
  splash: ["splash"], crush: ["crush"], spread: ["spread"], thrown: ["thr", "thrown"],
  loading: ["lod", "loading"], firearm: ["fir", "firearm"], twohanded: ["two"], light: ["lgt", "light"] });
const keyOf = value => String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const flag = (item, key) => item?.getFlag?.("ak5e", key) ?? item?.flags?.ak5e?.[key];
const native = item => Array.from(item?.system?.properties?.values?.() ?? item?.system?.properties ?? []);

export function weaponProperties(item) {
  const result = new Map();
  const text = flag(item, "tableData")?.properties;
  if (typeof text === "string") {
    // Commas inside a parameter list do not split a property.
    for (const token of text.match(/[^,]+(?:\([^)]*\))?/g) ?? []) {
      const match = token.trim().match(/^([^()]+?)(?:\s*\(([^)]*)\))?$/);
      if (!match) continue;
      const value = match[2] == null ? true : /^\d+(?:\.\d+)?$/.test(match[2].trim()) ? Number(match[2]) : match[2].trim();
      result.set(keyOf(match[1]), value);
    }
  }
  for (const [key, names] of Object.entries(aliases)) {
    for (const name of names) {
      if (native(item).some(value => keyOf(value) === keyOf(name))) result.set(key, result.get(key) ?? true);
      const value = flag(item, name);
      if (value !== undefined && value !== false && value !== null) result.set(key, value);
    }
  }
  return result;
}

export function hasWeaponProperty(item, property) { return Boolean(weaponProperties(item).get(keyOf(property))); }
export function weaponPropertyValue(item, property, fallback = 0) {
  const value = weaponProperties(item).get(keyOf(property));
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
export function weaponRange(item) {
  const nativeRange = item?.system?.range ?? {};
  const source = weaponProperties(item).get("range") ?? weaponProperties(item).get("thrown");
  const match = typeof source === "string" ? source.match(/^(\d+)(?:\s*\/\s*(\d+|-))?$/) : null;
  const normal = Number(nativeRange.value ?? (typeof source === "number" ? source : match?.[1])) || 0;
  const long = Number(nativeRange.long ?? match?.[2]) || normal;
  return { normal, long };
}
export function weaponDamageParts(item) {
  const base = item?.system?.damage?.base;
  let formula = base?.formula || (base?.number && base?.denomination ? `${base.number}d${base.denomination}${Number(base.bonus) ? ` + ${base.bonus}` : ""}` : null);
  const source = flag(item, "tableData")?.damage;
  const match = typeof source === "string" ? source.match(/^(\d+d\d+(?:\s*[+-]\s*\d+)?)\s+(\w+)/i) : null;
  formula ??= match?.[1];
  const types = Array.from(base?.types ?? []);
  const type = types.length === 1 ? types[0] : match?.[2]?.toLowerCase();
  return formula && type ? [{ formula, type }] : [];
}
