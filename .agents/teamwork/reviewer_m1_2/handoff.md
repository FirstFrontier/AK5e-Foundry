# Handoff Report: Milestone 1 Independent Review & Adversarial Challenge

- **Reviewer**: `reviewer_m1_2` (Roles: Reviewer, Adversarial Critic)
- **Work Product Under Review**: Milestone 1 Deliverables (`ak5e/test/base-classes-fixture.mjs`, `package.json`, `TEST_INFRA.md`, `.agents/teamwork/worker_m1/handoff.md`)
- **Review Verdict**: **REQUEST_CHANGES**

---

## 1. Observation

### 1.1 Authored Work & Modifications Observed
1. **`package.json`** (Lines 27–32):
   ```json
   "test:vanguard": "node --test ak5e/test/vanguard-*.test.mjs ak5e/test/tip-of-the-spear.test.mjs ak5e/test/standard-bearer.test.mjs",
   "test:supporter": "node --test ak5e/test/supporter-*.test.mjs",
   "test:specialist": "node --test ak5e/test/specialist-*.test.mjs",
   "test:medic": "node --test ak5e/test/medic-*.test.mjs",
   "test:base-classes": "npm run test:vanguard && npm run test:supporter && npm run test:specialist && npm run test:medic",
   "test": "npm run check:files && npm run check:generated && npm run test:content && npm run test:parsers && npm run test:rules && npm run test:installers && npm run test:origins && npm run test:deployment && npm run test:caster && npm run test:defender && npm run test:guard && npm run test:marksman && npm run test:base-classes"
   ```
2. **`TEST_INFRA.md`** (208 lines):
   - Detailed four-tier testing architecture (Tier 1: Feature Coverage, Tier 2: Boundary & Edge Cases, Tier 3: Multi-Feature & System Combinations, Tier 4: Real-World Scenarios).
   - Test runner command inventory and feature checklists for Vanguard, Supporter, Specialist, and Medic.
3. **`ak5e/test/base-classes-fixture.mjs`** (694 lines):
   - Exports: `setPropertyByPath`, `getPropertyByPath`, `TestCollection`, `createTestItem`, `createTestActor`, `setupFoundryGlobals`, `teardownFoundryGlobals`, `triggerShortRest`, `triggerLongRest`, `createTestCombat`, `world`, `fixture`.

### 1.2 Automated Tool Commands & Verbatim Execution Results
1. **Base Classes Test Suite:**
   - Command: `npm run test:base-classes`
   - Output:
     ```
     > test:vanguard
     > node --test ak5e/test/vanguard-*.test.mjs ak5e/test/tip-of-the-spear.test.mjs ak5e/test/standard-bearer.test.mjs
     ...
     ℹ tests 37
     ℹ pass 37
     ℹ fail 0

     > test:supporter
     ℹ tests 0, pass 0, fail 0

     > test:specialist
     ℹ tests 0, pass 0, fail 0

     > test:medic
     ℹ tests 0, pass 0, fail 0
     ```
   - Exit code: 0.

2. **File & Syntax Validation:**
   - Command: `node ak5e/tools/validate-files.mjs`
   - Output: `Validated module.json, lang/en.json, and 220 .mjs files.`
   - Exit code: 0.

3. **Full Repository Test Suite Regression Check:**
   - Command: `npm test`
   - Output: All unit test suites passed (`test:content`, `test:parsers`, `test:rules`, `test:installers`, `test:origins`, `test:deployment`, `test:caster`, `test:defender`, `test:guard`, `test:marksman`, `test:base-classes`).
   - Exit code: 0. Zero regressions introduced.

4. **Resource Pools & Operation Kernel Verification:**
   - Command: `node --test ak5e/test/resource-pools.test.mjs ak5e/test/operation-kernel.test.mjs`
   - Output: `ℹ tests 71, ℹ pass 71, ℹ fail 0, duration_ms 219.73ms`.
   - Exit code: 0.

### 1.3 Adversarial Stress-Test Observations (Concrete Failure Reproductions)

#### Defect 1: Broken `"==key"` Force-Replace Update Semantics
- In `ak5e/test/base-classes-fixture.mjs:20-41`:
  ```javascript
  /**
   * Merges nested objects by dotted path and replaces arrays/primitives.
   * Supports Foundry's "-=key" deletion syntax and "==key" force-replace keys.
   */
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
- Worker handoff explicitly claims:
  > `update(changes, options) supporting dotted paths, -= deletion, and == force keys` (§1.1, Line 17; §2 Premise 3, Line 72).
- Verbatim Reproduction Command:
  ```bash
  node -e '
  import { setPropertyByPath } from "./ak5e/test/base-classes-fixture.mjs";
  const target = { flags: { ak5e: { reactions: { triggers: { t1: 1 }, receipts: { r1: 2 } } } } };
  setPropertyByPath(target, "flags.ak5e.reactions", { "==triggers": {}, "==receipts": {} });
  console.log(JSON.stringify(target));
  '
  ```
- Verbatim Output:
  ```json
  {"flags":{"ak5e":{"reactions":{"triggers":{"t1":1},"receipts":{"r1":2},"==triggers":{},"==receipts":{}}}}}
  ```
- **Result:** The existing `triggers` and `receipts` properties were **never replaced**; instead, literal properties named `"==triggers"` and `"==receipts"` were created. Similarly, calling `setPropertyByPath(target, "flags.ak5e.reactions.==triggers", {})` creates literal key `"==triggers": {}`.

#### Defect 2: Collection Inconsistencies & Runtime TypeErrors in `game.users` and `game.messages`
- In `ak5e/test/base-classes-fixture.mjs:410-423`:
  ```javascript
  const usersMap = new Map();
  usersMap.set(gmUser.id, gmUser);
  usersMap.set(playerUser.id, playerUser);
  ...
  Object.defineProperty(usersMap, "activeGM", { ... });
  ```
  `usersMap` is instantiated as a plain `new Map()`, NOT as a `TestCollection`.
- Verbatim Reproduction Command:
  ```bash
  node -e '
  import { setupFoundryGlobals, teardownFoundryGlobals } from "./ak5e/test/base-classes-fixture.mjs";
  setupFoundryGlobals();
  console.log("users.find:", typeof globalThis.game.users.find);
  console.log("users.filter:", typeof globalThis.game.users.filter);
  console.log("users.some:", typeof globalThis.game.users.some);
  teardownFoundryGlobals();
  '
  ```
- Verbatim Output:
  ```
  users.find: undefined
  users.filter: undefined
  users.some: undefined
  ```
- **Impact in Codebase:**
  - `ak5e/scripts/world-rules.mjs:208`: `game.users?.some(user => user.active && user.isGM)` throws `TypeError: game.users.some is not a function`.
  - `ak5e/scripts/defender-features.mjs:325`: `game.users.filter(u => ...)` throws `TypeError: game.users.filter is not a function`.
- In `ak5e/test/base-classes-fixture.mjs:425, 451`:
  `messages` is instantiated as `messages = []` (Array).
  Verbatim Reproduction Command:
  ```bash
  node -e '
  import { setupFoundryGlobals, teardownFoundryGlobals } from "./ak5e/test/base-classes-fixture.mjs";
  setupFoundryGlobals();
  console.log("game.messages.get:", typeof globalThis.game.messages.get);
  teardownFoundryGlobals();
  '
  ```
- Verbatim Output:
  ```
  game.messages.get: undefined
  ```
- **Impact in Codebase:**
  - `ak5e/scripts/artshield-features.mjs:41`: `return id ? game.messages?.get?.(id) ?? null : null;`
  - `ak5e/scripts/operator-skills.mjs:555, 568`: `current = game.messages.get(...)` throws `TypeError: game.messages.get is not a function`.

#### Defect 3: Prototype Pollution Vulnerability in `setPropertyByPath`
- In `ak5e/test/base-classes-fixture.mjs:29-31`:
  ```javascript
  for (const part of parts) {
    current = current[part] ??= {};
  }
  ```
- Verbatim Reproduction Command:
  ```bash
  node -e '
  import { setPropertyByPath } from "./ak5e/test/base-classes-fixture.mjs";
  const obj = {};
  setPropertyByPath(obj, "__proto__.polluted", "yes");
  console.log("obj.polluted:", obj.polluted);
  console.log("({}).polluted:", ({}).polluted);
  '
  ```
- Verbatim Output:
  ```
  obj.polluted: yes
  ({}).polluted: yes
  ```
- **Result:** Passing `__proto__` pollutes `Object.prototype` globally across the Node.js test process.

---

## 2. Logic Chain

1. **Premise 1 (Contract Claim vs Reality):**
   The worker's handoff report asserts in Section 1.1 and Section 2 that `update(changes, options)` supports `==` force keys, and `ak5e/test/base-classes-fixture.mjs:20-23` documents that it supports `"==key" force-replace keys`.
2. **Premise 2 (Failure to Implement Force Replacement):**
   Direct execution (Observation 1.3, Defect 1) proves that when an existing sub-object is updated with `{"==key": value}`, `setPropertyByPath` recurses into `current[last]` without checking `last.startsWith("==")`. It evaluates `isPlainObject(current["==key"])` as false, enters the `else` branch, and assigns `current["==key"] = forceKeys(value)`. The existing key remains unreplaced and a spurious `"==key"` property is created.
3. **Premise 3 (Relevance to Table-Play and Reaction Stores):**
   In AK5e (`ak5e/scripts/trigger-events.mjs:469-472` and `ak5e/audits/guard/13-musha.md:37`), Foundry's `"=="` force-replace syntax is required to clear reaction stores, undo receipts, and triggers without recursive merging. Failing to implement this correctly leaves the test fixture unable to accurately simulate reaction ledger clears and resets for upcoming class implementations (Milestones 2–5).
4. **Premise 4 (Collection Contract Deficiencies):**
   In Foundry VTT, collections like `game.users` and `game.messages` are `Collection` instances with Map lookups and Array-like iteration. Initializing `game.users` as a plain `Map` breaks `game.users.some()` and `game.users.filter()`, and initializing `game.messages` as a plain `Array` breaks `game.messages.get(id)`.
5. **Premise 5 (Zero Regressions on Existing Code):**
   The changes to `package.json` (`test:vanguard`, `test:supporter`, `test:specialist`, `test:medic`, `test:base-classes`) run cleanly, do not break existing test commands, and all 100% of existing tests in `npm test` pass. The documentation in `TEST_INFRA.md` is high quality and comprehensive.
6. **Conclusion:**
   Because `base-classes-fixture.mjs` contains critical mock contract defects (broken `"=="` force-replace, collection method gaps in `game.users` and `game.messages`, and prototype pollution), the work product cannot be approved in its current state. The reviewer verdict must be **REQUEST_CHANGES**.

---

## 3. Caveats

- **Existing Tests Not Currently Breaking:** The current 37 passing Vanguard tests in `tip-of-the-spear.test.mjs` and `standard-bearer.test.mjs` do not invoke `setPropertyByPath` with `"=="` force keys or call `game.users.some()`. Therefore, existing tests remain green. However, as documented in `PROJECT.md` and `WORKFLOW.md`, base class features for Vanguard, Supporter, Specialist, and Medic require table-play uses, undo receipts, and reaction handling that will depend directly on these contracts.
- **Node Test Runner Wildcard Behavior:** Running `node --test ak5e/test/supporter-*.test.mjs` when no files exist yet currently exits with code 0 in Node 22 (0 tests run). This is expected placeholder behavior until M3–M5 test files are authored.

---

## 4. Conclusion & Review Summary

**Verdict**: **REQUEST_CHANGES**

### Findings Summary

#### [Critical] Finding 1: Broken `"==key"` Force-Replace in `setPropertyByPath`
- **What**: In `base-classes-fixture.mjs:24-41`, `setPropertyByPath` fails to replace existing properties when given `"==key"`, instead creating a literal property named `"==key"`.
- **Where**: `ak5e/test/base-classes-fixture.mjs`, Lines 24–41.
- **Why**: Breaches the explicit contract claimed in `base-classes-fixture.mjs:22` and worker handoff §1.1. Directly impacts reaction stores, undo receipts, and flag reset mechanisms that rely on Foundry's force-replace semantics (`trigger-events.mjs:469-472`).
- **Suggestion**: In `setPropertyByPath`, handle `last.startsWith("==")` before recursive object merging:
  ```javascript
  if (last.startsWith("-=")) {
    delete current[last.slice(2)];
  } else if (last.startsWith("==")) {
    current[last.slice(2)] = forceKeys(structuredClone(value));
  } else if (isPlainObject(value) && isPlainObject(current[last])) {
    for (const [k, v] of Object.entries(value)) {
      setPropertyByPath(current[last], k, v);
    }
  } else {
    current[last] = forceKeys(structuredClone(value));
  }
  ```

#### [Major] Finding 2: `game.users` and `game.messages` Missing Collection Methods
- **What**: `game.users` is instantiated as a plain `Map` (missing `some`, `filter`, `find`), and `game.messages` is instantiated as an Array `[]` (missing `get(id)`).
- **Where**: `ak5e/test/base-classes-fixture.mjs`, Lines 410, 425, 451.
- **Why**: Calling `game.users.some()` (`world-rules.mjs:208`) or `game.users.filter()` (`defender-features.mjs:325`) throws `TypeError`. Calling `game.messages.get(id)` (`artshield-features.mjs:41`, `operator-skills.mjs:555`) throws `TypeError`.
- **Suggestion**:
  1. Instantiate `usersMap` as `new TestCollection()` (and preserve the `activeGM` getter).
  2. Implement `game.messages` as a Map/Collection (or hybrid array with `.get(id)`).

#### [Major] Finding 3: Prototype Pollution in `setPropertyByPath`
- **What**: `current[part] ??= {}` allows traversal of `__proto__`, `constructor`, and `prototype`, polluting `Object.prototype`.
- **Where**: `ak5e/test/base-classes-fixture.mjs`, Lines 29–31.
- **Why**: Security and isolation risk in test runners when processing arbitrary or user-supplied flag structures.
- **Suggestion**: Guard each segment:
  ```javascript
  if (part === "__proto__" || part === "constructor" || part === "prototype") continue;
  ```

#### [Minor] Finding 4: `TestCollection` Missing Standard Foundry Methods
- **What**: `TestCollection` does not implement `.getName(name)` or `.contents`.
- **Where**: `ak5e/test/base-classes-fixture.mjs`, Lines 54–90.
- **Suggestion**: Add `getName(name) { return this.find(e => e.name === name); }` and `get contents() { return Array.from(this.values()); }`.

### Verified Claims
- `dnd5e.restCompleted` hook handling (`triggerShortRest`, `triggerLongRest`) → Verified with `resource-pools.mjs` SR/LR recovery → **PASS**
- Dotted property paths (`setPropertyByPath`, `getPropertyByPath`) → Verified deep object access and assignment → **PASS**
- `-=` deletion syntax (`flags.ak5e.-=key` and `{ "-=key": null }`) → Verified property deletion → **PASS**
- `package.json` test scripts (`npm run test:base-classes`) → Verified 37 passing Vanguard tests, 0 failures → **PASS**
- Full test suite regressions (`npm test`) → Verified 100% pass across repository → **PASS**
- Static file validation (`node ak5e/tools/validate-files.mjs`) → 220 files validated → **PASS**

---

## 5. Verification Method

To independently reproduce the findings and verify this review:

1. **Verify the `"==key"` Force-Replace Defect:**
   ```bash
   node -e '
   import { setPropertyByPath } from "./ak5e/test/base-classes-fixture.mjs";
   const target = { flags: { ak5e: { reactions: { triggers: { t1: 1 } } } } };
   setPropertyByPath(target, "flags.ak5e.reactions", { "==triggers": {} });
   if ("==triggers" in target.flags.ak5e.reactions && "t1" in target.flags.ak5e.reactions.triggers) {
     console.error("FAIL: ==triggers became a literal key, old triggers was not replaced!");
     process.exit(1);
   }
   console.log("PASS");
   '
   ```
   *Actual Result:* Exits with code 1 and prints `FAIL`.

2. **Verify `game.users` Missing Collection Methods:**
   ```bash
   node -e '
   import { setupFoundryGlobals, teardownFoundryGlobals } from "./ak5e/test/base-classes-fixture.mjs";
   setupFoundryGlobals();
   try {
     globalThis.game.users.some(u => u.isGM);
     console.log("PASS");
   } catch (err) {
     console.error("FAIL:", err.message);
   } finally {
     teardownFoundryGlobals();
   }
   '
   ```
   *Actual Result:* Prints `FAIL: globalThis.game.users.some is not a function`.

3. **Verify Prototype Pollution:**
   ```bash
   node -e '
   import { setPropertyByPath } from "./ak5e/test/base-classes-fixture.mjs";
   const obj = {};
   setPropertyByPath(obj, "__proto__.polluted", true);
   if (({}).polluted === true) {
     console.error("FAIL: Object.prototype polluted!");
   }
   '
   ```
   *Actual Result:* Prints `FAIL: Object.prototype polluted!`.
