import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { CHAPTER_THREE_CLASSES } from "../scripts/chapter-three-content.mjs";
import { sha256Hex } from "../scripts/content-hash.mjs";
import { classContentUpdate, contentHash } from "../scripts/class-content-installation.mjs";

const baseline = JSON.parse(await readFile(new URL("./fixtures/p0-chapter-three-baseline.json", import.meta.url), "utf8"));
const sha256 = value => createHash("sha256").update(value, "utf8").digest("hex");

async function withoutWebCrypto(callback) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: undefined });
  try {
    return await callback();
  } finally {
    if (original) Object.defineProperty(globalThis, "crypto", original);
    else delete globalThis.crypto;
  }
}

test("browser-safe SHA-256 matches standard vectors and hashes strings as UTF-8", () => {
  assert.equal(sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(sha256Hex("AK5e — Originium Arts 🧪"), "22dfe7072c44169aa341ebbbdb7edbba55185254d462e3bffc5b89a5681d4c1b");
  assert.equal(sha256Hex(new TextEncoder().encode("é")), "4a99557e4033c3539de2eb65472017cad5f9557f7a0625a09f1c3f6e2ba69c4c");
});

test("all 77 pre-P0 baseline descriptions match their stored migration digests", () => {
  const migrated = CHAPTER_THREE_CLASSES.filter(record => record.previousContentHash);
  assert.equal(migrated.length, 77);
  assert.equal(baseline.migrated.length, 77);
  const oldById = new Map(baseline.migrated.map(record => [record.id, record]));
  for (const record of migrated) {
    const old = oldById.get(record.id);
    assert.ok(old, `missing baseline description for ${record.id}`);
    const expected = sha256(old.content);
    assert.equal(record.previousContentHash, expected, `stored migration digest changed for ${record.id}`);
    assert.equal(sha256Hex(old.content), expected, `browser SHA-256 mismatch for ${record.id}`);
  }
});

test("class content migrates canonical baseline descriptions without WebCrypto and skips edits", async () => {
  await withoutWebCrypto(async () => {
    const record = CHAPTER_THREE_CLASSES.find(candidate => candidate.previousContentHash);
    const old = baseline.migrated.find(candidate => candidate.id === record.id);
    assert.equal(await contentHash(old.content), sha256(old.content));

    const migration = await classContentUpdate({ system: { description: { value: old.content } } }, record);
    assert.equal(migration["system.description.value"], record.content);
    assert.equal(migration["flags.ak5e.chapterThreeId"], record.id);

    const customized = await classContentUpdate({ system: { description: { value: `${old.content}\nGM edit` } } }, record);
    assert.equal(customized, null);
  });
});

test("V13 line-break serialization preserves canonical migrations without admitting authored changes", async () => {
  for (const old of baseline.migrated) {
    const record = CHAPTER_THREE_CLASSES.find(candidate => candidate.id === old.id);
    const serialized = old.content.replace(/<br>/g, "<br />");
    const item = { system: { description: { value: serialized } } };
    assert.equal((await classContentUpdate(item, record))?.["system.description.value"], record.content, old.id);
    item.system.description.value += "<p>Keep this authored note.</p>";
    assert.equal(await classContentUpdate(item, record), null, old.id);
  }
});
