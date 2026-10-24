# Handoff Report: Milestone 1 Test Track Remediation (Iteration 2)

- **Worker**: `worker_m1_it2` (Roles: Implementer, QA)
- **Target Files Owned & Modified**:
  - `ak5e/test/base-classes-fixture.mjs`
  - `ak5e/test/base-classes-fixture-stress.test.mjs`
- **Working Directory**: `/home/patch/AK5e-Foundry/.agents/teamwork/worker_m1_it2/`
- **Status**: COMPLETE — ALL DEFECTS RESOLVED & VERIFIED

---

## 1. Observation

### 1.1 Pre-Remediation Baseline & Defects Observed
Reviewer reports (`reviewer_m1_1/handoff.md`, `reviewer_m1_2/handoff.md`) and challenger report (`challenger_m1_1/handoff.md`) identified 7 distinct defect categories in `ak5e/test/base-classes-fixture.mjs`:

1. **Prototype Pollution**:
   - `setPropertyByPath(victim, "__proto__.polluted_proto", "POLLUTED")` polluted `Object.prototype.polluted_proto`.
   - `setPropertyByPath(victim, "constructor.prototype.polluted_ctor", "POLLUTED")` polluted `Object.prototype.polluted_ctor`.
2. **Intermediate Primitives in Dotted Paths**:
   - `setPropertyByPath({ system: 123 }, "system.attributes.hp", 10)` threw `TypeError: Cannot create property 'attributes' on number '123'`.
3. **Serialization `toObject()` Fatal Crash**:
   - `actor.toObject()` and `item.toObject()` ran `structuredClone(this)` which threw `DOMException [DataCloneError]: getFlag(scope, key) ... could not be cloned`.
4. **Force-Keys (`==`) Malfunction**:
   - `setPropertyByPath(actor, "flags.ak5e", { "==state": { c: 3 } })` and `setPropertyByPath(actor, "flags.ak5e.==state", { c: 3 })` created literal keys `"==state"` instead of replacing the property without recursive merging.
5. **Deletion Syntax (`-=`) on Paths**:
   - `setPropertyByPath(actor, "-=flags.ak5e", null)` created a literal key `"-=flags"` rather than deleting `flags.ak5e`.
6. **Missing and Incompliant Embedded Document Methods**:
   - `actor.updateEmbeddedDocuments` was missing entirely, throwing `TypeError: actor.updateEmbeddedDocuments is not a function`.
   - `actor.deleteEmbeddedDocuments` returned string IDs (`["itemA"]`) rather than Document instances (`Document[]`), violating Foundry Document API contracts.
   - `actor.created` retained references indefinitely across create/delete cycles (memory leak).
   - `createEmbeddedDocuments("ActiveEffect", ...)` set `documentName: "Item"` and generated item UUIDs; `effect.delete()` failed to remove the effect from `parent.effects`.
7. **Permission Checks & Collection Methods**:
   - `testUserPermission` hardcoded `lvl >= 3` and fell back to `this.isOwner` (default `true`), allowing unlisted non-GM players to pass `OWNER` checks while failing valid `OBSERVER` and `LIMITED` requests.
   - `game.users` was a plain `Map` missing `find`, `filter`, `map`, `some`, `every`.
   - `game.messages` was a plain array missing `get(id)`.
   - `createTestCombat` instantiated `combatants` as a plain `Map` missing collection methods (`find`, etc.).

---

### 1.2 Remediations Implemented in `ak5e/test/base-classes-fixture.mjs`

1. **Prototype Pollution & Path Hardening (`setPropertyByPath`, `getPropertyByPath`)**:
   - Added `const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);`.
   - In `setPropertyByPath`, checked `DANGEROUS_KEYS` on every path segment, leaf key, and object entry key. If a dangerous key is encountered, it is safely skipped/aborted without modifying `Object.prototype`.
   - Guarded intermediate path traversal: if `!isPlainObject(current[part])`, replaced with `{}`.
2. **Force-Keys (`==`) and Deletion (`-=`):**
   - Normalized path prefixes: if `path.startsWith("-=")`, sets `isDelete = true` and strips prefix; if `path.startsWith("==")`, sets `isForce = true` and strips prefix.
   - Handled `last.startsWith("-=")` and `last.startsWith("==")` cleanly.
   - When traversing intermediate parts, if an intermediate part starts with `"-="`, deleted that part from `current` and stopped; if it starts with `"=="`, initialized a fresh `{}`.
   - If `isForce` is true, property is directly replaced with `forceKeys(structuredClone(value))` without recursive merging.
   - In object updates (`isPlainObject(value)`), handled entries starting with `"=="` by force-replacing the stripped key, and entries starting with `"-="` by deleting the stripped key.
3. **Clean Serialization (`toObject`)**:
   - Implemented `toObject(source = true)` on `createTestItem` and `createTestActor` returning pure data dictionaries containing `_id`, `id`, `name`, `type`, `img`, `system`, `flags`, `ownership`, `items` (for actor), and `effects` without functions.
   - Confirmed output can be safely passed to `structuredClone()` and `JSON.stringify()`.
4. **Actor Embedded Document Methods**:
   - Implemented `actor.updateEmbeddedDocuments(type, updates = [], options = {})` updating documents in `this.items` or `this.effects` and returning `Promise<Document[]>`.
   - Updated `actor.deleteEmbeddedDocuments(type, ids = [], options = {})` to collect deleted Document instances and return `Promise<Document[]>`.
   - Pruned deleted documents from `this.created` in both `actor.deleteEmbeddedDocuments` and `item.delete()` / `effect.delete()`.
   - In `createEmbeddedDocuments("ActiveEffect", ...)`, assigned `doc.documentName = "ActiveEffect"`, generated `${this.uuid}.ActiveEffect.${docId}`, and ensured `effect.delete()` deletes from `parent.effects`.
5. **Permissions in `testUserPermission`**:
   - Added `const PERMISSION_LEVELS = { NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3 };`.
   - GMs return `true` immediately.
   - Looked up user level in `this.ownership[user.id] ?? this.ownership?.default ?? (this.isOwner ? 3 : 0)`.
   - Compared against target permission level: `exact ? userLevel === targetLevel : userLevel >= targetLevel`.
6. **Collections and Globals**:
   - Added `getName(name)` and `get contents()` to `TestCollection`.
   - Instantiated `game.users` as `new TestCollection()` in `setupFoundryGlobals`.
   - Added `messages.get(id)` on `game.messages`.
   - Instantiated `combat.combatants` as `new TestCollection()` in `createTestCombat`.

---

### 1.3 Updates to `ak5e/test/base-classes-fixture-stress.test.mjs`
Updated all 17 stress test scenarios and added 4 new coverage tests (total 21 tests) to assert correct, robust behavior:
- Suite 1: Asserted `-=flags.ak5e` cleanly deletes `flags.ak5e` and does not create `"-=flags"`.
- Suite 1: Asserted `==` force-replaces existing objects without creating `"==state"`.
- Suite 1: Asserted intermediate primitives do not throw `TypeError`.
- Suite 2: Asserted `deleteEmbeddedDocuments` returns `Document[]` with Document instances.
- Suite 2: Asserted `ActiveEffect` has correct `documentName`, UUID, and removes from `parent.effects` on `delete()`.
- Suite 2: Asserted `actor.created` is cleaned up without memory leak.
- Suite 2: Asserted `actor.updateEmbeddedDocuments` updates documents and returns `Document[]`.
- Suite 4: Asserted `testUserPermission` properly evaluates `OBSERVER` (2), `LIMITED` (1), and `OWNER` (3).
- Suite 4: Asserted unlisted non-GM users respect `ownership.default: 0`.
- Suite 5: Asserted prototype pollution via `__proto__` and `constructor.prototype` is completely blocked.
- Suite 6: Asserted `actor.toObject()` and `item.toObject()` succeed cleanly without `DataCloneError`.
- Suite 7: Asserted `game.users` is `TestCollection` with `find`, `filter`, `map`, `some`, `every`, and `activeGM`.
- Suite 7: Asserted `game.messages.get(id)` works as expected.
- Suite 7: Asserted `createTestCombat` combatants is a `TestCollection` with `.find()`.

---

### 1.4 Verbatim Test Execution Outputs

1. **Empirical Stress Test Suite**:
   ```bash
   node --test ak5e/test/base-classes-fixture-stress.test.mjs
   ```
   Output:
   ```
   ✔ Suite 1: Standard nested dotted path updates succeed (1.890375ms)
   ✔ Suite 1: Deletion syntax flags.-=ak5e removes nested key (0.349186ms)
   ✔ Suite 1: Path -=flags.ak5e cleanly deletes nested property without creating -=flags (0.323758ms)
   ✔ Suite 1: Force-key == force-replaces target property without creating == literal key (0.999997ms)
   ✔ Suite 1: Intermediate primitive in dotted path is replaced with object without throwing (0.360167ms)
   ✔ Suite 2: Multiple embedded document additions and duplicate ID collision (1.150203ms)
   ✔ Suite 2: Deletion with duplicate IDs and non-existent IDs returns Document[] (0.344026ms)
   ✔ Suite 2: ActiveEffect embedded document has correct documentName, UUID, and is removed on effect.delete() (0.434298ms)
   ✔ Suite 2: actor.created is cleaned up across create/delete lifecycles preventing memory leaks (0.864208ms)
   ✔ Suite 2: actor.updateEmbeddedDocuments updates matching documents and returns Document[] (0.546022ms)
   ✔ Suite 3: Rest triggers recover multiple registered pools simultaneously (86.73418ms)
   ✔ Suite 4: testUserPermission parses permission levels (NONE, LIMITED, OBSERVER, OWNER) (0.294492ms)
   ✔ Suite 4: testUserPermission respects ownership.default for unlisted non-GM users (0.210912ms)
   ✔ Suite 4: Rapid concurrent updates do not lose writes (0.746554ms)
   ✔ Suite 5: setPropertyByPath guards against prototype pollution via __proto__ (0.153062ms)
   ✔ Suite 5: setPropertyByPath guards against prototype pollution via constructor.prototype (0.148453ms)
   ✔ Suite 6: actor.toObject() serializes document state without functions or DataCloneError (0.489624ms)
   ✔ Suite 6: item.toObject() serializes document state without functions or DataCloneError (0.247612ms)
   ✔ Suite 7: game.users is a TestCollection with find, filter, map, some, every, and activeGM (0.187938ms)
   ✔ Suite 7: game.messages has get(id) method (0.279984ms)
   ✔ Suite 7: createTestCombat combatants is a TestCollection (1.128262ms)
   ℹ tests 21
   ℹ suites 0
   ℹ pass 21
   ℹ fail 0
   ℹ duration_ms 157.17565
   ```

2. **Resource Pools & Operation Kernel Tests**:
   ```bash
   node --test ak5e/test/resource-pools.test.mjs ak5e/test/operation-kernel.test.mjs
   ```
   Output:
   ```
   ℹ tests 71
   ℹ suites 0
   ℹ pass 71
   ℹ fail 0
   ℹ duration_ms 217.368473
   ```

3. **Base Classes Test Script**:
   ```bash
   npm run test:base-classes
   ```
   Output:
   ```
   > test:vanguard -> 37 pass, 0 fail
   > test:supporter -> 0 pass, 0 fail
   > test:specialist -> 0 pass, 0 fail
   > test:medic -> 0 pass, 0 fail
   ```

4. **File Validation**:
   ```bash
   node ak5e/tools/validate-files.mjs
   ```
   Output:
   ```
   Validated module.json, lang/en.json, and 221 .mjs files.
   ```

5. **Source Generation Check**:
   ```bash
   node ak5e/tools/verify-generated-content.mjs
   ```
   Output:
   ```
   Verified all generated AK5e Chapter 1–6 records against the v1.3.1 source.
   Top-level records: 2193; Chapter 6 embedded features: 801.
   ```

6. **Full Regression Test**:
   ```bash
   npm test
   ```
   Output:
   All unit test suites (`test:content`, `test:parsers`, `test:rules`, `test:installers`, `test:origins`, `test:deployment`, `test:caster`, `test:defender`, `test:guard`, `test:marksman`, `test:base-classes`) passed with exit code 0.

---

## 2. Logic Chain

1. **Premise 1 (Prototype Pollution Defense)**: By filtering out keys in `DANGEROUS_KEYS` (`__proto__`, `constructor`, `prototype`) from path segments, leaf property assignments, and plain object key iterations in `setPropertyByPath` and `getPropertyByPath`, arbitrary flag updates can no longer access or mutate `Object.prototype`. Verified by Suite 5 tests.
2. **Premise 2 (Serialization Safety)**: Replacing `structuredClone(this)` with an explicit property extractor that clones only plain data structures (`system`, `flags`, `ownership`, mapped `items` and `effects`) eliminates all functions and DOMException `DataCloneError` failures. Verified by Suite 6 tests.
3. **Premise 3 (Force-Replace and Deletion Semantics)**: Normalizing path prefixes and handling `==` and `-=` in `setPropertyByPath` before recursive object iteration allows clearing nested flag maps (e.g. reaction stores and receipts) without retaining old keys or polluting state with literal `==` or `-=` keys. Verified by Suite 1 tests.
4. **Premise 4 (Contract Compliance for Embedded Documents)**: Adding `actor.updateEmbeddedDocuments` returning `Promise<Document[]>` and updating `actor.deleteEmbeddedDocuments` to return `Promise<Document[]>` matches the Foundry Document API contract expected by downstream setup and progression scripts. Pruning `actor.created` resolves the memory leak. Verified by Suite 2 tests.
5. **Premise 5 (Permissions and Collections)**: Evaluating numeric permission levels against `ownership[user.id] ?? ownership.default` ensures non-GM players cannot bypass permission checks while allowing proper inspection at `OBSERVER` or `LIMITED` levels. Instantiating `game.users` and `combat.combatants` as `TestCollection` instances provides `find`, `filter`, `some`, and `every` without runtime errors. Verified by Suite 4 and Suite 7 tests.
6. **Deduction & Conclusion**: All defects reported by `reviewer_m1_1`, `reviewer_m1_2`, and `challenger_m1_1` have been systematically resolved with genuine implementations, 100% of adversarial stress tests pass, and zero regressions were introduced into existing codebase suites.

---

## 3. Caveats

- In-memory Node.js unit tests exercise document structures, permission checks, collections, and rest hooks purely in-process; browser-specific DOM rendering and WebGL canvas interactions are verified in live browser tests during integration milestones.
- No changes were made outside the authorized scope (`ak5e/test/base-classes-fixture.mjs` and `ak5e/test/base-classes-fixture-stress.test.mjs`).

---

## 4. Conclusion

All Milestone 1 defects in `ak5e/test/base-classes-fixture.mjs` are completely resolved. The fixture provides a secure, fully compliant Foundry VTT V13 document mock substrate ready to support Milestone 2 (Vanguard), Milestone 3 (Supporter), Milestone 4 (Specialist), and Milestone 5 (Medic).

---

## 5. Verification Method

To independently verify all changes:

```bash
# 1. Run the empirical stress test suite (21/21 passing tests)
node --test ak5e/test/base-classes-fixture-stress.test.mjs

# 2. Run core resource pools and operation kernel suites
node --test ak5e/test/resource-pools.test.mjs ak5e/test/operation-kernel.test.mjs

# 3. Run base-classes test suite
npm run test:base-classes

# 4. Run static validation check
node ak5e/tools/validate-files.mjs

# 5. Run full test regression suite
npm test
```

### Invalidation Conditions
- If any test in `base-classes-fixture-stress.test.mjs` fails, or if `npm test` fails, this handoff is invalidated.
