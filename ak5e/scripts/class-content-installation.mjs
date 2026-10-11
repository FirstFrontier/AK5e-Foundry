import { sha256Hex } from "./content-hash.mjs";

/** Source metadata and conservative P0 updates; Actor inventories are never touched. */
export function classContentFlags(entry, defaultVersion = "0.2.4") {
  return {
    chapterThreeId: entry.id,
    classContentKind: entry.kind,
    ...(entry.operatorSkill ? { operatorSkill: entry.operatorSkill } : {}),
    ...(entry.classOption ? { classOption: entry.classOption } : {}),
    parentClass: entry.parentClass,
    parentBranch: entry.parentBranch,
    classLevel: entry.level,
    sourceHeading: entry.sourceHeading,
    sourceFile: entry.sourceFile ?? "03_chapter_3_character_classes.txt",
    ...(entry.sourceLine ? { sourceLine: entry.sourceLine } : {}),
    ...(entry.sourceHeadingLine ? { sourceHeadingLine: entry.sourceHeadingLine } : {}),
    ...(entry.sourceRow ? { sourceRow: entry.sourceRow } : {}),
    ...(entry.ruleContext ? { ruleContext: entry.ruleContext } : {}),
    contentVersion: entry.contentVersion ?? defaultVersion,
    rawSource: entry.rawSource,
    ...(entry.rawSources ? { rawSources: entry.rawSources } : {})
  };
}

export async function contentHash(value) {
  const bytes = new TextEncoder().encode(String(value ?? ""));
  if (!globalThis.crypto?.subtle) return sha256Hex(bytes);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

/** V13 HTML fields serialize void line-break tags with an optional slash. */
export function canonicalDescription(value) {
  return String(value ?? "").replace(/<br\s*\/?>/g, "<br>");
}

/** Only descriptions proven canonical may be refreshed. All other fields stay authored. */
export async function classContentUpdate(item, entry) {
  const description = item.system?.description?.value ?? "";
  const canonical = canonicalDescription(description) === canonicalDescription(entry.content) ||
    (entry.previousContentHash && (await contentHash(description) === entry.previousContentHash ||
      await contentHash(canonicalDescription(description)) === entry.previousContentHash));
  if (!canonical) return null;
  const changes = Object.fromEntries(Object.entries(classContentFlags(entry))
    .map(([key, value]) => [`flags.ak5e.${key}`, value]));
  if (description !== entry.content) changes["system.description.value"] = entry.content;
  return changes;
}
