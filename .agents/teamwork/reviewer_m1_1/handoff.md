# Review & Adversarial Challenge Report: Milestone 1 — Test Track Infrastructure & Fixtures

## Review Summary

**Verdict**: **REQUEST_CHANGES**

---

## 1. Observation

### 1.1 Authored Work & Verified Commands
1. **`TEST_INFRA.md`** (208 lines):
   - Outlines 4-tier testing methodology (Tier 1: Feature Coverage >=5/feature, Tier 2: Boundary & Edge Cases >=5/feature, Tier 3: Multi-Feature & System Combinations, Tier 4: Real-World Scenarios).
   - Accurately details runner commands, pass/fail semantics, and feature checklists for Vanguard, Supporter, Specialist, and Medic.
2. **`package.json`**:
   - Added scripts `"test:vanguard"`, `"test:supporter"`, `"test:specialist"`, `"test:medic"`, and `"test:base-classes"`.
   - Included `"npm run test:base-classes"` in `"test"` script.
3. **`ak5e/test/base-classes-fixture.mjs`** (694 lines):
   - Exported helpers: `setPropertyByPath`, `getPropertyByPath`, `TestCollection`, `createTestItem`, `createTestActor`, `setupFoundryGlobals`, `teardownFoundryGlobals`, `triggerShortRest`, `triggerLongRest`, `createTestCombat`, `world`, `fixture`.
4. **Independent Test Execution Outcomes**:
   - `node --test ak5e/test/resource-pools.test.mjs ak5e/test/operation-kernel.test.mjs`:
     ```
     ℹ tests 71
     ℹ suites 0
     ℹ pass 71
     ℹ fail 0
     ```
   - `npm run test:base-classes`:
     ```
     > test:vanguard -> 37 tests, 37 pass, 0 fail
     > test:supporter -> 0 tests, 0 fail
     > test:specialist -> 0 tests, 0 fail
     > test:medic -> 0 tests, 0 fail
     ```
   - `node ak5e/tools/validate-files.mjs`:
     ```
     Validated module.json, lang/en.json, and 220 .mjs files.
     ```
   - `npm test`:
     Passed all suites (including content, parsers, rules, installers, origins, deployment, caster, defender, guard, marksman, base-classes).

---

### 1.2 Observed Defects & Failures in `ak5e/test/base-classes-fixture.mjs`

#### Observation O1: `toObject()` throws fatal `DOMException [DataCloneError]` on Item and Actor mocks
- **Location:** `ak5e/test/base-classes-fixture.mjs:139-140` and `280-281`.
- **Code:**
  ```javascript
  // Line 139 (createTestItem)
  toObject() {
    return structuredClone(this);
  }
  // Line 280 (createTestActor)
  toObject() {
    return structuredClone(this);
  }
  ```
- **Execution & Verbatim Error:**
  Running `item.toObject()` or `actor.toObject()` in Node:
  ```
  DOMException [DataCloneError]: getFlag(scope, key) {
        return this.flags?.[scope]?.[key];
      } could not be cloned.
      at new DOMException (node:internal/per_context/domexception:76:18)
      at structuredClone (node:internal/worker/js_transferable:127:26)
      at Object.toObject (file:///home/patch/AK5e-Foundry/ak5e/test/base-classes-fixture.mjs:139:14)
  ```
- In JavaScript/Node.js, `structuredClone` strictly rejects functions and methods. Because `this` contains methods (`getFlag`, `setFlag`, `update`, `delete`, etc.), calling `toObject()` on either an Actor or Item mock unconditionally crashes.

#### Observation O2: `setPropertyByPath` fails to implement the claimed `==` force-replace contract
- **Location:** `ak5e/test/base-classes-fixture.mjs:24-41`.
- **Claim:** Handoff line 17 and docstring line 22 state:
  `Supports Foundry's "-=key" deletion syntax and "==key" force-replace keys.`
- **Code:**
  ```javascript
  export function setPropertyByPath(object, path, value) {
    if (!object || typeof path !== "string") return;
    const parts = path.split(".");
    const last = parts.pop();
    let current = object;
    for (const part of parts) {
      current = current[part] ??= {};
    }
    if (last.startsWith("-=")) {
      delete current[last.slice(2)];
    } else if (isPlainObject(value) && isPlainObject(current[last])) {
      for (const [k, v] of Object.entries(value)) {
        setPropertyByPath(current[last], k, v);
      }
    } else {
      current[last] = forceKeys(structuredClone(value));
    }
  }
  ```
- **Execution & Verbatim Result:**
  ```javascript
  const actor = createTestActor();
  actor.flags.ak5e = {
    reactions: {
      triggers: { t1: { id: "t1" } },
      receipts: { r1: { id: "r1" } },
      other: 123
    }
  };
  await actor.update({
    "flags.ak5e.reactions": {
      other: 456,
      "==triggers": {},
      "==receipts": {}
    }
  });
  ```
  Produces:
  ```json
  {
    "triggers": { "t1": { "id": "t1" } },
    "receipts": { "r1": { "id": "r1" } },
    "other": 456,
    "==triggers": {},
    "==receipts": {}
  }
  ```
- `setPropertyByPath` does not check `last.startsWith("==")`. When passed an object with `"==triggers"`, it recursively calls `setPropertyByPath(current[last], "==triggers", {})`. Since `current["==triggers"]` does not exist, it falls to `else` and sets `current["==triggers"] = {}`, leaving `current["triggers"]` completely untouched and un-replaced!

#### Observation O3: Missing `updateEmbeddedDocuments` on Actor mock
- **Location:** `ak5e/test/base-classes-fixture.mjs:230-282`.
- `createTestActor` defines `update`, `createEmbeddedDocuments`, and `deleteEmbeddedDocuments`, but omits `updateEmbeddedDocuments(type, updates, options)`.
- In `ak5e/scripts/guard-progression.mjs:563`, `ak5e/scripts/arts-casting.mjs:135`, and `ak5e/scripts/feature-trackers.mjs:247`, embedded items and talents are updated via:
  `await actor.updateEmbeddedDocuments("Item", plan.updateItems);`
- Any progression or feature tests for base classes invoking this method will fail with:
  `TypeError: actor.updateEmbeddedDocuments is not a function`.

#### Observation O4: `deleteEmbeddedDocuments` returns string IDs instead of Document instances
- **Location:** `ak5e/test/base-classes-fixture.mjs:262-278`.
- In Foundry Document API, `deleteEmbeddedDocuments(embeddedName, ids, [options])` returns `Promise<Document[]>`.
- In `base-classes-fixture.mjs`, line 269 & 274 do `deleted.push(docId)` and return `deleted` (an array of strings), violating the Foundry Document interface contract.

#### Observation O5: `createTestCombat` creates `combatants` as plain `Map` instead of `TestCollection`
- **Location:** `ak5e/test/base-classes-fixture.mjs:644`.
- `const combatantsMap = new Map(turns.map(t => [t.id, t]));`
- In Foundry VTT, `combat.combatants` is an EmbeddedCollection with collection methods (`find`, `filter`, `map`). Using a plain `Map` prevents calling `combat.combatants.find(...)`.

---

## 2. Logic Chain

1. **Premise 1:** The test harness fixture (`base-classes-fixture.mjs`) is the foundational mocking substrate for all 4 base classes across Milestones M2 (Vanguard), M3 (Supporter), M4 (Specialist), and M5 (Medic).
2. **Premise 2 (Observation O1):** Base class setup and progression logic (`<class>-setup.mjs`, `<class>-progression.mjs`, and `arts-rules.mjs:171`) frequently invoke `item.toObject()` or `actor.toObject()` to snapshot data before mutations or to create clean embedded document payloads. Because `toObject()` currently runs `structuredClone(this)` on objects containing functions, every call throws `DataCloneError`, breaking downstream unit and integration tests.
3. **Premise 3 (Observation O2):** AK5e table play and reaction management (`trigger-events.mjs:472`, `guard-uses.mjs`) use Foundry's `"==key"` force-replace semantics to reset maps and trigger stores. Because `setPropertyByPath` does not recognize `"=="` prefixes on keys, old stores are retained and dummy `"==key"` fields are added.
4. **Premise 4 (Observation O3 & O4):** Actor embedded document lifecycle requires `createEmbeddedDocuments`, `updateEmbeddedDocuments`, and `deleteEmbeddedDocuments` adhering to Foundry Document contracts (including returning document arrays). Missing `updateEmbeddedDocuments` will cause runtime crashes during progression tests.
5. **Conclusion:** While `TEST_INFRA.md` and `package.json` are well-constructed and adhere to project standards, `ak5e/test/base-classes-fixture.mjs` has critical runtime and contract defects that will block Milestones 2–5. Therefore, changes must be requested before proceeding to Milestone 2.

---

## 3. Findings & Required Changes

### [Critical] Finding 1: Broken `toObject()` on Actor and Item mocks
- **What:** Calling `item.toObject()` or `actor.toObject()` throws `DOMException [DataCloneError]`.
- **Where:** `ak5e/test/base-classes-fixture.mjs:139-140` and `280-281`.
- **Why:** `structuredClone` cannot serialize functions/methods attached to the mock objects.
- **Remediation:** Replace with plain data extraction:
  ```javascript
  // createTestItem
  toObject(source = true) {
    return {
      _id: this._id,
      id: this.id,
      name: this.name,
      type: this.type,
      system: structuredClone(this.system),
      flags: structuredClone(this.flags),
      effects: Array.from(this.effects?.values?.() ?? []).map(e => e.toObject?.() ?? e)
    };
  }

  // createTestActor
  toObject(source = true) {
    return {
      _id: this._id,
      id: this.id,
      name: this.name,
      type: this.type,
      system: structuredClone(this.system),
      flags: structuredClone(this.flags),
      items: Array.from(this.items.values()).map(i => i.toObject?.() ?? i),
      effects: Array.from(this.effects.values()).map(e => e.toObject?.() ?? e)
    };
  }
  ```

### [Critical] Finding 2: `setPropertyByPath` fails to force-replace `==` keys
- **What:** Updating with `"==key"` creates `"==key"` instead of replacing `key`.
- **Where:** `ak5e/test/base-classes-fixture.mjs:24-41`.
- **Why:** `last.startsWith("==")` is not checked, so it falls into the default property setter rather than replacing the target key without recursive merge.
- **Remediation:** Update `setPropertyByPath` to recognize `"=="` prefixes on keys and paths:
  ```javascript
  export function setPropertyByPath(object, path, value) {
    if (!object || typeof path !== "string") return;
    const parts = path.split(".");
    const last = parts.pop();
    let current = object;
    for (const part of parts) {
      current = current[part] ??= {};
    }
    if (last.startsWith("-=")) {
      delete current[last.slice(2)];
    } else if (last.startsWith("==")) {
      current[last.slice(2)] = forceKeys(structuredClone(value));
    } else if (isPlainObject(value) && isPlainObject(current[last])) {
      for (const [k, v] of Object.entries(value)) {
        if (k.startsWith("==")) {
          current[last][k.slice(2)] = forceKeys(structuredClone(v));
        } else if (k.startsWith("-=")) {
          delete current[last][k.slice(2)];
        } else {
          setPropertyByPath(current[last], k, v);
        }
      }
    } else {
      current[last] = forceKeys(structuredClone(value));
    }
  }
  ```

### [Major] Finding 3: Missing `updateEmbeddedDocuments` on Actor mock
- **What:** `createTestActor` lacks `updateEmbeddedDocuments`.
- **Where:** `ak5e/test/base-classes-fixture.mjs:230-282`.
- **Why:** Base class setup/progression uses `actor.updateEmbeddedDocuments("Item", plan.updateItems)`.
- **Remediation:** Implement on `createTestActor`:
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
  }
  ```

### [Major] Finding 4: `deleteEmbeddedDocuments` return signature contract
- **What:** Returns array of string IDs instead of Document instances.
- **Where:** `ak5e/test/base-classes-fixture.mjs:262-278`.
- **Why:** Foundry Document API specification returns deleted Document instances (`Document[]`).
- **Remediation:** Collect the deleted document before deleting from the Map, and return the array of document objects.

### [Minor] Finding 5: `createTestCombat` creates `combatants` as plain `Map`
- **What:** `combat.combatants` is a plain `Map` lacking Collection methods (`find`, `filter`, etc.).
- **Where:** `ak5e/test/base-classes-fixture.mjs:644`.
- **Remediation:** Use `new TestCollection(turns.map(t => [t.id, t]))`.

---

## 4. Adversarial Challenge & Stress Tests

| Stress Scenario | Expected Behavior | Actual Behavior | Result |
|---|---|---|---|
| Call `item.toObject()` on mock item | Returns plain object without functions | Throws `DOMException [DataCloneError]` | **FAIL** |
| Call `actor.toObject()` on mock actor | Returns plain actor data object | Throws `DOMException [DataCloneError]` | **FAIL** |
| Update actor with `"==triggers": {}` | Replaces `triggers` with `{}` | Adds `"==triggers": {}`, preserves old `triggers` | **FAIL** |
| Update actor with `actor.updateEmbeddedDocuments("Item", updates)` | Updates embedded items | Throws `TypeError: not a function` | **FAIL** |
| Delete embedded items via `deleteEmbeddedDocuments` | Returns array of deleted Item objects | Returns array of string IDs | **FAIL** |
| Call `combat.combatants.find()` | Finds combatant matching predicate | Throws `TypeError: not a function` | **FAIL** |
| Register pool, spend, trigger short rest | Short rest hook recovers pool | Pool recovers cleanly | **PASS** |
| Dotted path update on Actor | Dotted properties update in `actor.system` | Dotted properties update cleanly | **PASS** |
| User permission check for GM user | Returns `true` | Returns `true` | **PASS** |

---

## 5. Caveats

- **Scope:** Review focused exclusively on Milestone 1 deliverables (`TEST_INFRA.md`, `ak5e/test/base-classes-fixture.mjs`, and `package.json`). Concrete base class features (Vanguard, Supporter, Specialist, Medic) are scheduled for Milestones M2–M5.
- **Integrity Check:** No evidence of integrity violations, fabricated logs, or cheating was found. The issues identified are implementation correctness bugs in the mock fixture.

---

## 6. Conclusion

**Verdict: REQUEST_CHANGES**

`TEST_INFRA.md` and `package.json` are fully approved and meet all requirements. However, `ak5e/test/base-classes-fixture.mjs` contains two critical defects (`toObject()` crashing with `DataCloneError`, and `setPropertyByPath` failing to force-replace `==` keys) as well as two major defects (missing `updateEmbeddedDocuments`, and non-compliant `deleteEmbeddedDocuments` return type). These issues must be addressed in `base-classes-fixture.mjs` before proceeding to Milestone 2 (Vanguard).

---

## 7. Verification Method

To independently verify the identified defects and test subsequent fixes:

1. **Verify `toObject()` Fix:**
   ```bash
   node -e '
   import assert from "node:assert/strict";
   import { createTestActor, createTestItem } from "./ak5e/test/base-classes-fixture.mjs";
   const actor = createTestActor({ class: "Vanguard", level: 3 });
   const actorObj = actor.toObject();
   assert.equal(actorObj.name, "Test Actor");
   assert.equal(typeof actorObj.getFlag, "undefined");
   const item = actor.items.get("class_item");
   const itemObj = item.toObject();
   assert.equal(itemObj.name, "Vanguard");
   assert.equal(typeof itemObj.getFlag, "undefined");
   console.log("PASS: toObject()");
   '
   ```

2. **Verify `==` Force-Replace Fix:**
   ```bash
   node -e '
   import assert from "node:assert/strict";
   import { createTestActor } from "./ak5e/test/base-classes-fixture.mjs";
   const actor = createTestActor();
   actor.flags.ak5e = { reactions: { triggers: { t1: 1 }, receipts: { r1: 1 } } };
   await actor.update({ "flags.ak5e.reactions": { "==triggers": {}, "==receipts": {} } });
   assert.deepEqual(actor.flags.ak5e.reactions.triggers, {});
   assert.deepEqual(actor.flags.ak5e.reactions.receipts, {});
   assert.equal(actor.flags.ak5e.reactions["==triggers"], undefined);
   console.log("PASS: == force-replace");
   '
   ```

3. **Verify `updateEmbeddedDocuments` Fix:**
   ```bash
   node -e '
   import assert from "node:assert/strict";
   import { createTestActor, createTestItem } from "./ak5e/test/base-classes-fixture.mjs";
   const actor = createTestActor();
   const [item] = await actor.createEmbeddedDocuments("Item", [{ name: "Old Name" }]);
   await actor.updateEmbeddedDocuments("Item", [{ id: item.id, name: "New Name" }]);
   assert.equal(actor.items.get(item.id).name, "New Name");
   console.log("PASS: updateEmbeddedDocuments");
   '
   ```

4. **Verify Full Regression Suite:**
   ```bash
   npm test
   ```
