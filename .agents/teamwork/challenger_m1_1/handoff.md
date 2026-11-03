# Adversarial Handoff Report — Milestone 1: Base Classes Fixture

## 1. Observation

Direct observations and verbatim test execution outputs across `ak5e/test/base-classes-fixture.mjs`:

### Observation 1: Critical Prototype Pollution in `setPropertyByPath`
- **File & Lines**: `ak5e/test/base-classes-fixture.mjs:24-41`
- **Code**:
  ```javascript
  29:   for (const part of parts) {
  30:     current = current[part] ??= {};
  31:   }
  ...
  39:     current[last] = forceKeys(structuredClone(value));
  ```
- **Test execution command**:
  `node -e 'import("./ak5e/test/base-classes-fixture.mjs").then(({ setPropertyByPath }) => { setPropertyByPath({}, "__proto__.polluted", "hacked"); console.log(({}).polluted); });'`
- **Observed output**:
  `hacked`
  Setting `__proto__.polluted` or `constructor.prototype.polluted` directly mutates `Object.prototype`, polluting every JavaScript object in the Node.js runtime process.

### Observation 2: Fatal Crash `DOMException: DataCloneError` in `toObject()`
- **File & Lines**: `ak5e/test/base-classes-fixture.mjs:139` and `ak5e/test/base-classes-fixture.mjs:280`
- **Code**:
  ```javascript
  138:   toObject() {
  139:     return structuredClone(this);
  140:   }
  ...
  279:   toObject() {
  280:     return structuredClone(this);
  281:   }
  ```
- **Test execution command**:
  `node -e 'import("./ak5e/test/base-classes-fixture.mjs").then(({ createTestActor, createTestItem }) => { createTestActor().toObject(); });'`
- **Verbatim Error**:
  ```
  DOMException [DataCloneError]: getFlag(scope, key) {
        return this.flags?.[scope]?.[key];
      } could not be cloned.
      at new DOMException (node:internal/per_context/domexception:76:18)
      at structuredClone (node:internal/worker/js_transferable:127:26)
      at Object.toObject (file:///home/patch/AK5e-Foundry/ak5e/test/base-classes-fixture.mjs:280:14)
  ```
  Both `actor.toObject()` and `item.toObject()` crash unconditionally because `this` holds own function properties (`getFlag`, `setFlag`, `update`, etc.) which `structuredClone()` cannot clone.

### Observation 3: Force-Keys `==` Ineffective and Produces Corrupt Property Keys
- **File & Lines**: `ak5e/test/base-classes-fixture.mjs:11-18, 34-40`
- **Code**:
  ```javascript
  11: function forceKeys(value) {
  12:   if (!isPlainObject(value)) return value;
  13:   const out = {};
  14:   for (const [k, v] of Object.entries(value)) {
  15:     out[k.replace(/^==/, "")] = forceKeys(v);
  16:   }
  17:   return out;
  18: }
  ```
- **Test execution command**:
  `node -e 'import("./ak5e/test/base-classes-fixture.mjs").then(({ setPropertyByPath }) => { const a = { flags: { ak5e: { state: { x: 1 } } } }; setPropertyByPath(a, "flags.ak5e", { "==state": { y: 2 } }); console.log(JSON.stringify(a)); });'`
- **Observed output**:
  `{"flags":{"ak5e":{"state":{"x":1},"==state":{"y":2}}}}`
  Instead of replacing `flags.ak5e.state` with `{ y: 2 }`, it leaves `state` intact and injects a bogus literal key `"==state"`. Dotted path `flags.ak5e.==state` likewise injects `"==state"`.

### Observation 4: Deletion Syntax `-=flags.ak5e` Fails and Injects Literal `-=flags`
- **File & Lines**: `ak5e/test/base-classes-fixture.mjs:26-33`
- **Test execution command**:
  `node -e 'import("./ak5e/test/base-classes-fixture.mjs").then(({ setPropertyByPath }) => { const a = { flags: { ak5e: 1 } }; setPropertyByPath(a, "-=flags.ak5e", null); console.log(JSON.stringify(a)); });'`
- **Observed output**:
  `{"flags":{"ak5e":1},"-=flags":{"ak5e":null}}`
  The path segment `"-=flags"` is created as an object, and original `flags.ak5e` is untouched.

### Observation 5: Intermediate Primitives in Dotted Paths Throw Unhandled `TypeError`
- **File & Lines**: `ak5e/test/base-classes-fixture.mjs:30`
- **Code**: `current = current[part] ??= {};`
- **Test execution command**:
  `node -e 'import("./ak5e/test/base-classes-fixture.mjs").then(({ setPropertyByPath }) => { setPropertyByPath({ system: 123 }, "system.attributes.hp", 10); });'`
- **Verbatim Error**:
  `TypeError: Cannot create property 'attributes' on number '123' at setPropertyByPath`

### Observation 6: Security & Permission Bypass in `testUserPermission`
- **File & Lines**: `ak5e/test/base-classes-fixture.mjs:223-230`
- **Code**:
  ```javascript
  223:     testUserPermission(user, permission = "OWNER") {
  224:       if (user?.isGM) return true;
  225:       if (this.ownership && user?.id in this.ownership) {
  226:         const lvl = this.ownership[user.id];
  227:         return typeof lvl === "number" ? lvl >= 3 : Boolean(lvl);
  228:       }
  229:       return this.isOwner;
  230:     },
  ```
- **Test execution results**:
  - `actor.testUserPermission(observerUser, "OBSERVER")` returns `false` when `ownership[user.id] === 2` because `lvl >= 3` is hardcoded and `permission` is completely ignored.
  - When an unlisted non-GM player is tested against an actor with `ownership: { default: 0, player1: 3 }`, `user.id in this.ownership` is false, so it falls back to `return this.isOwner` (which defaults to `true`). Unrelated players are falsely granted OWNER permission.

### Observation 7: ActiveEffect Mock Defect and `delete()` Failure
- **File & Lines**: `ak5e/test/base-classes-fixture.mjs:129-137, 240-258`
- **Code**:
  ```javascript
  129:     async delete(options = {}) {
  130:       if (this.parent?.items?.has(this.id)) {
  131:         this.parent.items.delete(this.id);
  132:       }
  ...
  ```
- **Observed behavior**:
  `createEmbeddedDocuments("ActiveEffect", ...)` creates a mock where `documentName` is `"Item"` and `uuid` contains `.Item.`. Calling `await effect.delete()` does nothing because it only inspects `this.parent.items`. The effect remains in `parent.effects` indefinitely.

### Observation 8: Memory Leak in `actor.created`
- **File & Lines**: `ak5e/test/base-classes-fixture.mjs:259, 262-277`
- `actor.created` retains all created embedded documents without ever pruning deleted documents.

---

## 2. Logic Chain

1. **Premise 1 (Prototype Pollution)**: `setPropertyByPath` splits the given path on `.` and iterates without guarding against sensitive property keys (`__proto__`, `constructor`, `prototype`). When `part` is `"__proto__"`, `current[part]` accesses `Object.prototype`. The subsequent assignment directly writes onto `Object.prototype`. (Supported by Observation 1).
2. **Premise 2 (Serialization Crash)**: `actor.toObject()` and `item.toObject()` invoke `structuredClone(this)`. In JavaScript, `structuredClone` throws `DataCloneError` when an object contains functions. Because `createTestActor` and `createTestItem` define methods directly on `actor`/`item`, calling `toObject()` crashes unconditionally. (Supported by Observation 2).
3. **Premise 3 (Force-Keys `==`)**: `forceKeys()` is only called in `setPropertyByPath`'s leaf assignment when the target is not an object. When updating nested objects, `setPropertyByPath` recurses with key `"==state"`, creating a literal property named `"==state"` instead of stripping `"=="` and replacing `"state"`. (Supported by Observation 3).
4. **Premise 4 (Deletion Syntax `-=`)**: Deletion logic only checks `if (last.startsWith("-="))`. If `-=` appears in an intermediate path segment (e.g., `"-=flags.ak5e"`), the loop creates a dictionary named `"-=flags"`. (Supported by Observation 4).
5. **Premise 5 (Permissions)**: `testUserPermission` hardcodes `lvl >= 3`, ignoring the `permission` argument entirely, and falls back to `this.isOwner` (default `true`) rather than `this.ownership.default`. This causes permission tests for OBSERVER or LIMITED to fail, while unauthorized users bypass ownership gates. (Supported by Observation 6).
6. **Premise 6 (ActiveEffect & Embedded Documents)**: `createEmbeddedDocuments` reuses `createTestItem` without setting `documentName: "ActiveEffect"` or updating UUID generation, and `effect.delete()` lacks handling for `parent.effects`. (Supported by Observation 7).
7. **Deduction**: Because the test fixture suffers from critical security vulnerabilities (prototype pollution), fatal serialization crashes (`toObject` DataCloneError), broken update mechanics (`==`, `-=`), permission check flaws, and embedded document discrepancies, downstream tests and implementations relying on `base-classes-fixture.mjs` will either produce false positives, bypass security rules, or crash.
8. **Conclusion**: `base-classes-fixture.mjs` cannot be approved in its current state. The verdict is **REQUEST_CHANGES**.

---

## 3. Caveats

- In-memory mock tests execute in Node.js, not within a live Foundry VTT web browser process. Differences between Node.js V8 execution and browser Chromium V8 are negligible for pure object manipulation and Promise concurrency.
- Live Foundry V13 headless browser testing (`test-base-classes-live.mjs`) is scheduled for Milestone 7 and was not executed for this mock-tier challenge.
- Multi-pool rest recovery hook execution was verified to work correctly for normal scenarios when pools are properly configured on owner actors.

---

## 4. Conclusion & Verdict

**VERDICT: REQUEST_CHANGES**

`base-classes-fixture.mjs` exhibits:
1. **[CRITICAL] Prototype Pollution**: Unsanitized path keys (`__proto__`, `constructor.prototype`) mutate `Object.prototype`.
2. **[FATAL / HIGH] Serialization Crash**: `actor.toObject()` and `item.toObject()` unconditionally throw `DOMException [DataCloneError]`.
3. **[HIGH] Force-Keys (`==`) Malfunction**: `==` keys fail to replace existing properties and pollute actor state with `"==key"` literal keys.
4. **[HIGH] Permission Logic Flaws**: `testUserPermission` ignores permission levels ("OBSERVER", "LIMITED") and permits unauthorized players to pass OWNER checks.
5. **[MEDIUM] Deletion (`-=`) Path Failure**: Paths formatted as `"-=flags.ak5e"` corrupt the actor with `"-=flags"` objects.
6. **[MEDIUM] ActiveEffect Lifecycle Defect**: `ActiveEffect` mocks carry `documentName: "Item"` and fail to delete when `effect.delete()` is invoked.
7. **[LOW/MEDIUM] Unhandled Primitives & Memory Leaks**: TypeError on intermediate primitives and unbound growth in `actor.created`.

### Required Mitigations:
1. Guard `setPropertyByPath` against `"__proto__"`, `"constructor"`, and `"prototype"`. If intermediate properties are primitives, initialize an object `{}`.
2. In `setPropertyByPath`, parse `==` prefix: strip `==` and force-replace the property without merging.
3. In `setPropertyByPath`, detect `-=` in intermediate segments and delete the target accordingly.
4. Implement proper `toObject()` serialization on `actor` and `item` by extracting pure state properties (`id`, `name`, `type`, `system`, `flags`, `items`, `effects`, `ownership`) rather than calling `structuredClone(this)`.
5. Fix `testUserPermission(user, permission)` to parse numeric levels (0=NONE, 1=LIMITED, 2=OBSERVER, 3=OWNER), resolve `user.id` or `ownership.default`, and compare against required permission level.
6. In `createEmbeddedDocuments`, set `documentName: type` and generate UUIDs according to `type`. Update `item.delete()` to check and delete from `parent.effects` if `parent.effects.has(this.id)`.

---

## 5. Verification Method

To independently verify all findings and test passes:

```bash
# Run the empirical adversarial stress test suite
node --test ak5e/test/base-classes-fixture-stress.test.mjs

# Run static validation check
node ak5e/tools/validate-files.mjs

# Run source verification check
node ak5e/tools/verify-generated-content.mjs
```

### Invalidation Conditions:
- If `node --test ak5e/test/base-classes-fixture-stress.test.mjs` fails or any of the 17 bug assertions fail, re-verify the specific assertion logic.
- If `base-classes-fixture.mjs` is updated with the required mitigations, the tests in `base-classes-fixture-stress.test.mjs` asserting buggy behavior should be updated to assert the corrected behavior.
