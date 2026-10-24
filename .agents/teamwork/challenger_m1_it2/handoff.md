# Adversarial Handoff Report — Milestone 1 Iteration 2: Base Classes Fixture

- **Agent**: `challenger_m1_it2` (Roles: Critic, Specialist)
- **Target Files Audited**:
  - `ak5e/test/base-classes-fixture.mjs`
  - `ak5e/test/base-classes-fixture-stress.test.mjs`
- **Working Directory**: `/home/patch/AK5e-Foundry/.agents/teamwork/challenger_m1_it2/`
- **Verdict**: **APPROVE**

---

## 1. Observation

Direct empirical observations, code inspection, and verbatim tool commands and results across `ak5e/test/base-classes-fixture.mjs` and `ak5e/test/base-classes-fixture-stress.test.mjs`:

### Observation 1: Defect Category 1 — Prototype Pollution Defense
- **File & Lines**: `ak5e/test/base-classes-fixture.mjs:9, 13-22, 56, 63, 70, 75, 88-94`
- **Code**:
  ```javascript
  const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);
  ...
  function forceKeys(value) {
    if (!isPlainObject(value)) return value;
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const cleanKey = k.replace(/^==/, "");
      if (DANGEROUS_KEYS.has(cleanKey)) continue;
      out[cleanKey] = forceKeys(v);
    }
    return out;
  }
  ...
  if (DANGEROUS_KEYS.has(last)) return;
  ...
  if (DANGEROUS_KEYS.has(part)) return;
  ```
- **Empirical Adversarial Test Command**:
  ```bash
  node -e '
  import assert from "node:assert/strict";
  import { setPropertyByPath } from "./ak5e/test/base-classes-fixture.mjs";
  const p = {};
  setPropertyByPath(p, "__proto__.evil1", "polluted");
  setPropertyByPath(p, "constructor.prototype.evil2", "polluted");
  setPropertyByPath(p, "prototype.evil3", "polluted");
  setPropertyByPath(p, "flags.__proto__.evil4", "polluted");
  setPropertyByPath(p, "flags.constructor.prototype.evil5", "polluted");
  setPropertyByPath(p, "==__proto__.evil6", "polluted");
  setPropertyByPath(p, "-=__proto__.evil7", null);
  setPropertyByPath(p, "flags.==__proto__.evil8", "polluted");
  setPropertyByPath(p, "flags.-=__proto__.evil9", null);
  const jsonPayload = JSON.parse("{\"__proto__\":{\"evil10\":\"polluted\"},\"constructor\":{\"prototype\":{\"evil11\":\"polluted\"}}}");
  setPropertyByPath(p, "flags", jsonPayload);
  setPropertyByPath(p, "==flags", jsonPayload);
  for (let i = 1; i <= 11; i++) {
    assert.equal(({})[`evil${i}`], undefined);
    assert.equal(Object.prototype[`evil${i}`], undefined);
  }
  console.log("All 11 prototype pollution attack vectors blocked cleanly.");
  '
  ```
- **Observed Output**:
  `All 11 prototype pollution attack vectors blocked cleanly.`
  All 11 attack vectors targeting `Object.prototype` were stopped without error or prototype leakage.

### Observation 2: Defect Category 2 — Serialization via `actor.toObject()` and `item.toObject()`
- **File & Lines**: `ak5e/test/base-classes-fixture.mjs:224-236` and `425-438`
- **Code**:
  ```javascript
  toObject(source = true) {
    return {
      _id: this._id,
      id: this.id,
      name: this.name,
      type: this.type,
      img: this.img,
      system: structuredClone(this.system ?? {}),
      flags: structuredClone(this.flags ?? {}),
      ownership: structuredClone(this.ownership ?? {}),
      items: Array.from(this.items?.values?.() ?? []).map(i => (typeof i.toObject === "function" ? i.toObject(source) : structuredClone(i))),
      effects: Array.from(this.effects?.values?.() ?? []).map(e => (typeof e.toObject === "function" ? e.toObject(source) : structuredClone(e)))
    };
  }
  ```
- **Empirical Adversarial Test Command**:
  ```bash
  node -e '
  import assert from "node:assert/strict";
  import { createTestActor } from "./ak5e/test/base-classes-fixture.mjs";
  const actor = createTestActor({ class: "Vanguard", level: 5 });
  await actor.createEmbeddedDocuments("ActiveEffect", [{ name: "Buff" }]);
  const [item] = await actor.createEmbeddedDocuments("Item", [{ name: "Sword" }]);
  const obj = actor.toObject();
  assert.equal(typeof obj.getFlag, "undefined");
  assert.equal(typeof obj.update, "undefined");
  assert.equal(typeof obj.items[0].getFlag, "undefined");
  assert.doesNotThrow(() => structuredClone(obj));
  obj.system.attributes.hp.value = 999;
  assert.notEqual(actor.system.attributes.hp.value, 999);
  console.log("Serialization verified pure, function-free, and deep-copied.");
  '
  ```
- **Observed Output**:
  `Serialization verified pure, function-free, and deep-copied.`
  Serialization produces pure, function-free data dictionaries that are 100% compatible with `structuredClone()` and do not allow mutation leaks back to the document instance.

### Observation 3: Defect Category 3 — Force-Key (`==`) Object Updates
- **File & Lines**: `ak5e/test/base-classes-fixture.mjs:33, 39-42, 51-54, 68-74, 84-85, 92-96`
- **Code**:
  ```javascript
  else if (cleanPath.startsWith("==")) {
    isForce = true;
    cleanPath = cleanPath.slice(2);
  }
  ...
  else if (last.startsWith("==")) {
    isForce = true;
    last = last.slice(2);
  }
  ...
  else if (isForce) {
    current[last] = forceKeys(structuredClone(value));
  }
  ...
  else if (k.startsWith("==")) {
    const subKey = k.slice(2);
    if (!DANGEROUS_KEYS.has(subKey)) {
      current[last][subKey] = forceKeys(structuredClone(v));
    }
  }
  ```
- **Empirical Adversarial Test Command**:
  ```bash
  node -e '
  import assert from "node:assert/strict";
  import { setPropertyByPath } from "./ak5e/test/base-classes-fixture.mjs";
  const target = { flags: { ak5e: { state: { a: 1, b: 2 } } } };
  setPropertyByPath(target, "flags.ak5e.==state", { c: 3 });
  assert.deepEqual(target.flags.ak5e.state, { c: 3 });
  assert.equal("==state" in target.flags.ak5e, false);
  setPropertyByPath(target, "flags.ak5e", { "==state": { d: 4 } });
  assert.deepEqual(target.flags.ak5e.state, { d: 4 });
  assert.equal("==state" in target.flags.ak5e, false);
  console.log("Force-key == verified completely replacing target without literal keys.");
  '
  ```
- **Observed Output**:
  `Force-key == verified completely replacing target without literal keys.`

### Observation 4: Defect Category 4 — Path Deletion (`-=`)
- **File & Lines**: `ak5e/test/base-classes-fixture.mjs:32, 36-38, 48-50, 60-67, 82-83, 89-91`
- **Code**:
  ```javascript
  if (cleanPath.startsWith("-=")) {
    isDelete = true;
    cleanPath = cleanPath.slice(2);
  }
  ...
  if (last.startsWith("-=")) {
    isDelete = true;
    last = last.slice(2);
  }
  ...
  if (isDelete) {
    delete current[last];
  }
  ...
  if (k.startsWith("-=")) {
    const subKey = k.slice(2);
    if (!DANGEROUS_KEYS.has(subKey)) delete current[last][subKey];
  }
  ```
- **Empirical Adversarial Test Command**:
  ```bash
  node -e '
  import assert from "node:assert/strict";
  import { setPropertyByPath } from "./ak5e/test/base-classes-fixture.mjs";
  const target = { flags: { ak5e: { a: 1, b: 2 } }, system: { details: { x: 10 } } };
  setPropertyByPath(target, "-=flags.ak5e.a", null);
  assert.equal(target.flags.ak5e.a, undefined);
  assert.equal("-=flags" in target, false);
  setPropertyByPath(target, "flags.ak5e.-=b", null);
  assert.equal(target.flags.ak5e.b, undefined);
  setPropertyByPath(target, "system.-=details.x", null);
  assert.equal(target.system.details, undefined);
  console.log("Path deletion -= verified across all path positions.");
  '
  ```
- **Observed Output**:
  `Path deletion -= verified across all path positions.`

### Observation 5: Defect Category 5 — Embedded Documents Lifecycle (`updateEmbeddedDocuments` & `deleteEmbeddedDocuments`)
- **File & Lines**: `ak5e/test/base-classes-fixture.mjs:209-222, 396-424`
- **Code**:
  ```javascript
  async updateEmbeddedDocuments(type, updates = [], options = {}) {
    const collection = type === "Item" ? this.items : (type === "ActiveEffect" ? this.effects : null);
    if (!collection) return [];
    const updated = [];
    for (const update of updates) {
      const id = update._id || update.id;
      const doc = collection.get(id);
      if (doc) {
        await doc.update(update, options);
        updated.push(doc);
      }
    }
    return updated;
  },
  async deleteEmbeddedDocuments(type, ids = [], options = {}) {
    const collection = type === "Item" ? this.items : (type === "ActiveEffect" ? this.effects : null);
    if (!collection) return [];
    const deleted = [];
    for (const docId of ids) {
      if (collection.has(docId)) {
        const doc = collection.get(docId);
        collection.delete(docId);
        if (globalThis._ak5eTestDocs) globalThis._ak5eTestDocs.delete(doc.uuid);
        this.created = this.created.filter(d => d.id !== docId && d._id !== docId);
        deleted.push(doc);
      }
    }
    return deleted;
  }
  ```
- **Empirical Adversarial Test Command**:
  ```bash
  node -e '
  import assert from "node:assert/strict";
  import { setupFoundryGlobals, createTestActor } from "./ak5e/test/base-classes-fixture.mjs";
  setupFoundryGlobals();
  const actor = createTestActor();
  const [it1] = await actor.createEmbeddedDocuments("Item", [{ _id: "it1", name: "Alpha", system: { uses: 1 } }]);
  const updated = await actor.updateEmbeddedDocuments("Item", [{ id: "it1", "system.uses": 5 }]);
  assert.equal(updated[0], it1);
  assert.equal(it1.system.uses, 5);
  const deleted = await actor.deleteEmbeddedDocuments("Item", ["it1", "it1", "ghost"]);
  assert.equal(deleted.length, 1);
  assert.equal(deleted[0], it1);
  assert.equal(actor.items.size, 0);
  assert.equal(actor.created.length, 0);
  console.log("Embedded documents update, delete, and memory cleanup verified.");
  '
  ```
- **Observed Output**:
  `Embedded documents update, delete, and memory cleanup verified.`

### Observation 6: Defect Category 6 — Permission Checks in `testUserPermission`
- **File & Lines**: `ak5e/test/base-classes-fixture.mjs:247-252, 327-359`
- **Code**:
  ```javascript
  const PERMISSION_LEVELS = { NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3 };
  ...
  let userLevel = 0;
  if (this.ownership && user.id && user.id in this.ownership) {
    userLevel = this.ownership[user.id];
  } else if (this.ownership && "default" in this.ownership) {
    userLevel = this.ownership.default;
  } else {
    userLevel = this.isOwner ? 3 : 0;
  }
  ...
  return exact ? userLevel === targetLevel : userLevel >= targetLevel;
  ```
- **Empirical Adversarial Test Command**:
  Exhaustive test matrix running through all 16 combinations of `(ownershipLevel, requiredLevel)` plus string and numeric permission arguments, `{ exact: true }`, default ownership for unlisted non-GM users, boolean flags, and GM override.
- **Observed Output**:
  `All permission matrix tests PASSED!`

### Observation 7: Defect Category 7 — Collections & ActiveEffect Lifecycle
- **File & Lines**: `ak5e/test/base-classes-fixture.mjs:124-166, 379-387, 567-580, 582-585, 804-805`
- **Code**:
  - `TestCollection` defines `get`, `getName`, `contents`, `find`, `filter`, `map`, `some`, `every`.
  - `actor.effects` is an instance of `TestCollection`.
  - `ActiveEffect` mock sets `documentName = "ActiveEffect"` and `uuid = "${this.uuid}.ActiveEffect.${docId}"`.
  - `effect.delete()` deletes from `parent.effects`, `parent.created`, and `_ak5eTestDocs`.
  - `game.users` is a `TestCollection` with `activeGM` getter.
  - `game.messages` provides `messages.get(id)`.
  - `combat.combatants` is a `TestCollection`.
- **Empirical Adversarial Test Command**:
  Tested `actor.effects.getName("Bless")`, `actor.effects.contents`, `effect.setFlag`, `effect.unsetFlag`, `effect.delete()`, `actor.deleteEmbeddedDocuments("ActiveEffect", ...)`, `game.users.activeGM`, `game.messages.get(id)`, and `combat.combatants.find(...)`.
- **Observed Output**:
  All collection helpers and ActiveEffect lifecycles operated cleanly.

### Observation 8: Full Stress Test Suite & Regression Verification
- **Test Command 1**: `node --test ak5e/test/base-classes-fixture-stress.test.mjs`
  - Result: 21 tests, 0 suites, 21 pass, 0 fail, 160.15ms.
- **Test Command 2**: `node --test ak5e/test/resource-pools.test.mjs ak5e/test/operation-kernel.test.mjs`
  - Result: 71 tests, 0 suites, 71 pass, 0 fail, 213.14ms.
- **Test Command 3**: `npm run test:base-classes`
  - Result: 37 pass, 0 fail (Vanguard).
- **Test Command 4**: `node ak5e/tools/validate-files.mjs`
  - Result: Validated module.json, lang/en.json, and 221 .mjs files.
- **Test Command 5**: `node ak5e/tools/verify-generated-content.mjs`
  - Result: Verified all generated AK5e Chapter 1–6 records against v1.3.1 source (2193 top-level records, 801 Chapter 6 embedded features).

---

## 2. Logic Chain

1. **Premise 1 (Prototype Pollution)**: `setPropertyByPath` guards path segments, leaf keys, and object entry keys against `DANGEROUS_KEYS` (`__proto__`, `constructor`, `prototype`). Furthermore, `forceKeys` strips dangerous keys from parsed payloads. Testing 11 distinct attack vectors confirmed zero mutation of `Object.prototype` (Supported by Observation 1).
2. **Premise 2 (Serialization Safety)**: `actor.toObject()` and `item.toObject()` construct plain JavaScript objects containing only primitive data, plain nested objects, and arrays of child objects. No function references or non-cloneable prototypes are included. Tests confirmed `structuredClone()` and `JSON.stringify()` succeed cleanly with full mutation independence (Supported by Observation 2).
3. **Premise 3 (Force-Replace Semantics)**: `==` prefixes in paths and object payloads are recognized before traversal, stripping the prefix and executing an un-merged deep replacement without creating literal `"==key"` properties. Verified across dotted paths, object updates, and primitive/object transitions (Supported by Observation 3).
4. **Premise 4 (Path Deletion)**: `-=` prefixes at path starts, leaves, intermediate segments, and within object payloads are parsed to trigger property deletion without corrupting parent paths with literal `"-=flags"` objects (Supported by Observation 4).
5. **Premise 5 (Embedded Document Contracts)**: `actor.updateEmbeddedDocuments` updates documents and returns `Promise<Document[]>`; `actor.deleteEmbeddedDocuments` deletes documents, cleans up `_ak5eTestDocs`, prunes `actor.created` to eliminate memory leaks, and returns `Promise<Document[]>`. `effect.delete()` deletes from `parent.effects` (Supported by Observation 5).
6. **Premise 6 (Permission Hierarchy)**: `testUserPermission` maps permission identifiers to levels 0..3, correctly resolves `this.ownership[user.id] ?? this.ownership.default`, compares against the target level, supports `{ exact: true }`, and respects GM authority (Supported by Observation 6).
7. **Premise 7 (Collections & ActiveEffects)**: `TestCollection` provides complete array-like functional methods (`getName`, `contents`, `find`, `filter`, `map`, `some`, `every`). `ActiveEffect` mocks have proper type tags, UUID patterns, and deletion lifecycles (Supported by Observation 7).
8. **Premise 8 (Non-Regression)**: The full test suite, static file validation, and source content verification succeed with zero regressions (Supported by Observation 8).
9. **Deduction**: Because all 7 defect categories from Iteration 1 have been remediated with genuine, robust implementations and verified against adversarial stress tests, the fixture is sound and ready for downstream base class milestones.
10. **Conclusion**: The fixture is fully approved. Verdict: **APPROVE**.

---

## 3. Caveats

- In-memory Node.js unit tests exercise document structures, permission checks, collections, and rest hooks purely in-process; browser-specific DOM rendering and WebGL canvas interactions will be verified in live browser tests during integration milestones (Milestone 7).
- No changes were made to implementation or production files during this adversarial review, strictly complying with the review-only constraint.

---

## 4. Conclusion & Verdict

**VERDICT: APPROVE**

All 7 defect categories from Iteration 1 have been thoroughly verified and confirmed resolved:
1. **Prototype Pollution**: Completely mitigated via `DANGEROUS_KEYS` guards across all traversal paths and `forceKeys`.
2. **Serialization**: `actor.toObject()` and `item.toObject()` produce pure data copies with zero functions and zero `DataCloneError` failures.
3. **Force-Keys (`==`)**: Force-replaces target properties without creating literal `"==key"` properties.
4. **Path Deletion (`-=`)**: Deletes target properties cleanly across all syntax configurations without literal `"-=flags"` properties.
5. **Embedded Documents**: `updateEmbeddedDocuments` and `deleteEmbeddedDocuments` return `Promise<Document[]>`, handle multiple updates/deletes, and prune `actor.created`.
6. **User Permissions**: Full permission hierarchy (NONE, LIMITED, OBSERVER, OWNER), numeric levels, default ownership, boolean flags, and GM overrides operate accurately.
7. **Collections & ActiveEffects**: Full `TestCollection` API implemented; ActiveEffects carry correct document types, UUIDs, and lifecycle handlers.

---

## 5. Verification Method

To independently reproduce and verify this review:

```bash
# 1. Run empirical stress test suite (21/21 passing)
node --test ak5e/test/base-classes-fixture-stress.test.mjs

# 2. Run resource pools and operation kernel suites (71/71 passing)
node --test ak5e/test/resource-pools.test.mjs ak5e/test/operation-kernel.test.mjs

# 3. Run base-classes test suite
npm run test:base-classes

# 4. Run static validation check
node ak5e/tools/validate-files.mjs

# 5. Run source generation check
node ak5e/tools/verify-generated-content.mjs
```

### Invalidation Conditions:
- Any failure in `base-classes-fixture-stress.test.mjs`.
- Any prototype pollution leak via `setPropertyByPath`.
- Any `DataCloneError` thrown by `actor.toObject()` or `item.toObject()`.
