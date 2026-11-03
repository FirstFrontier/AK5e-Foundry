# Specification Mining Report: Test Infrastructure & Table Play for AK5e Specialist

**Author**: Read-only Specification Miner for Test Infrastructure and Table Play (`spec_miner_infra_1`)  
**Target Milestone**: Phase 1 — Specialist Class & Subclasses (Executor, Hookmaster, Infuser)  
**Workspace**: `/home/patch/AK5e-Foundry`  
**Date**: 2026-10-16  

---

## Executive Summary

This report establishes the authoritative specification, engineering guardrails, and verification contracts for implementing the **Specialist base class** and its three subclasses (**Executor**, **Hookmaster**, **Infuser**) in the AK5e Foundry VTT module on Foundry V13 and D&D5e 5.3.3.

The investigation rigorously examined:
1. **WORKFLOW.md §3.2 Table-Play Guardrails**: `play-uses.mjs` integration via `createPlayUses({ ns: "specialistUses", label: "Specialist" })`, confirm-before-use semantics, non-blocking warning overrides, zero-clamped resource shortfalls with public chat cards, owner-clicked dice roll buttons (no auto-rolling), automated GM relay with `validateTarget` enforcement for unowned target modifications, and encounter-window reversible undo receipts in `flags.ak5e.specialistUses.undo`.
2. **Live Browser Headless Test Patterns**: `ak5e/tools/test-browser.mjs` requirement (`launchTestBrowser()`), process lifecycle orchestration, `/tmp` disposable copy of `standard-test` world on port 30175, POSIX signal trapping (`EXIT`, `INT`, `TERM`), port release verification via `ss`, and the concrete scenario matrix for `ak5e/tools/test-specialist-live.mjs` spanning Base Specialist, Executor, Hookmaster, and Infuser sheets, controls, dialogs, rolls, GM relay, and undo.
3. **Subagent Visual Inspection Protocol (AGENTS.md §6.2)**: Delegation pattern, path forwarding, visual defect categories (missing text/images, clipping/overflow, dark-theme readability, roll controls, permissions, links), and strict **PASS / FAIL / UNCERTAIN** reporting format.
4. **Static Verification Gates**: `node ak5e/tools/validate-files.mjs`, `node ak5e/tools/verify-generated-content.mjs`, and Node test runner suites (`npm test`, `npm run test:specialist`, `npm run test:base-classes`).

---

## Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Table-Play Engine | `createPlayUses` Initialization | Creates a namespaced, branch-free table-play engine under `specialistUses` tracking undo, cards, and relay. | `{ ns: "specialistUses", label: "Specialist", isMember: fn, ruling: fn }` | Engine object with `command`, `plan`, `execute`, `undo`, `previewUndo`, `uses`, `state`, `register`. | Rejects namespace if not matching `/^[A-Za-z][A-Za-z0-9]{2,40}$/`. | `ak5e/scripts/play-uses.mjs:68-83` |
| 2 | Table-Play Engine | Confirm Before Use | Strictly requires explicit user confirmation before committing any document modifications or resource deductions. | `data.confirmed === true` passed to `command(actor, name, data, opId)` | Persists plan receipt to undo array, commits prepared updates, advances to finish. | Throws `Error("Confirm this use before applying it.")` if `confirmed !== true`. | `ak5e/scripts/play-uses.mjs:316` |
| 3 | Table-Play Engine | Non-Blocking Warnings & "Use anyway" | Checks range, prerequisites, level, reaction availability, and resources before execution; failed checks produce warnings that the player can override. | `plan.warnings: [{ id, text }]`, `data.overrides: [id]` | If overridden, proceeds with execution and records `receipt.overridden`; card displays "Used anyway: ...". | If not overridden, throws `PlayWarnings` with list of warnings to trigger `confirmPlayUse` dialog. | `ak5e/scripts/play-uses.mjs:326`, `play-undo.mjs` |
| 4 | Table-Play Engine | Missing GM Ruling Player Selection | If feature behavior relies on unresolved source text without a GM ruling, presents readings for this use only. | `plan.reading: key`, `data.readings: { key: value }` | Resolves chosen reading for this use, records `receipt.reading`, broadcasts on chat card; never persists as global ruling. | If not chosen and no GM ruling exists, throws `PlayReading` prompting selection dialog. | `ak5e/scripts/play-uses.mjs:327-332` |
| 5 | Table-Play Engine | Resource Shortfall Zero-Clamping | When spending resources (`prowess`, `infusionUses`, AP, etc.), expenditures exceeding current balance clamp at 0 and log shortfalls. | `spendResource(actor, receipt, { pool, path, amount, label, max })` | Resource value updated to `Math.max(0, before - amount)`. Receipt gets `shortfalls: ["<Label> short by <N>"]`. | No negative values permitted. Chat card explicitly displays public shortfall notice. | `ak5e/scripts/play-uses.mjs:57-64` |
| 6 | Table-Play Engine | Interactive Roll Buttons (No Auto-Roll) | Never evaluates damage, healing, attack, save, or feature dice automatically; posts interactive roll button on chat card. | Plan sets `receipt.formula`, `receipt.rollFlavor`, or `receipt.damageParts` during `apply()`. | `receipt.status = "awaitingRoll"`. Chat card renders `<button>Roll ${receipt.formula}</button>` for document owner. | Feature effect waits until owner clicks Roll; clicking executes `useRoll(actor, { useId })`. | `ak5e/scripts/play-uses.mjs:300, 346-373`, `play-uses-sheet.mjs:80` |
| 7 | Table-Play Engine | Automated GM Relay for Unowned Targets | When modifying unowned documents (damage, conditions, mettle, active effects on other actors), automatically relays to active GM client without GM approval prompt. | `changeTarget(source, receipt, entry, command)` where `!canWrite(target)` | Relays via `operation-kernel` socket to GM; GM client executes `relayedTargetChange` and applies modification. | If no active GM is connected, throws `NoGM("no GM is connected")`; receipt status becomes `"pending"` with retry button. | `ak5e/scripts/play-uses.mjs:194-230` |
| 8 | Table-Play Engine | `validateTarget` Target Defense Gate | Security check on GM relay: the GM client verifies the recorded change matches plan constraints before applying. | `PLANS[receipt.command].validateTarget(source, receipt, entry, target)` | Returns boolean `true` if valid; GM client applies target change. | Throws `Error("The recorded change is not one this use can make.")` if `validateTarget` is missing or returns `false`. | `ak5e/scripts/play-uses.mjs:207`, `ak5e/scripts/medic-uses.mjs:704-733` |
| 9 | Table-Play Engine | Reversible Encounter-Window Undo | Every operation writes an undo receipt under `flags.ak5e.specialistUses.undo`; can be undone by owner or GM. | `command(actor, "undoUse", { useId })` | Reverts target changes, refunds spent reaction, restores flags, restores resources to exact prior value (even above max). | Throws `Error("This use is locked: its encounter window has ended.")` if combat started/ended and user is not GM. | `ak5e/scripts/play-uses.mjs:398-439` |
| 10 | Sheet UI | `ActorSheetV2` Specialist Panel & Badges | Injects `.ak5e-specialist-sheet-panel` into Features tab showing badges (`prowess` value/max, DC, subclass, style) and action button. | `renderActorSheetV2` hook, `app.element` | Renders `.ak5e-specialist-badge` elements and "Open Specialist Controls" button. | Read-only render; opening panel or controls makes zero changes to actor. | `ak5e/scripts/medic-sheet.mjs:330-382`, `play-uses-sheet.mjs` |
| 11 | Sheet UI | Header Control Icon | Injects Specialist action button into the application header of `ActorSheetV2`. | `getHeaderControlsApplicationV2` hook | Adds header control with icon and click handler opening `openSpecialistControls(actor)`. | Only shown to actor owner or GM for character actors with Specialist class. | `ak5e/scripts/medic-sheet.mjs:389-399` |
| 12 | Live Browser Test | Chromium Hardware Acceleration Launcher | Launches Playwright Chromium with GPU flags, filtering any caller attempts to disable GPU or force CPU fallbacks. | `launchTestBrowser(chromium, options)` | Playwright `Browser` instance with `--enable-gpu` and `--use-angle=gl-egl`. | Drops any flag matching `/^--(use-angle\|use-gl\|use-vulkan\|enable-unsafe-swiftshader\|disable-gpu)(= \|$)/`. | `ak5e/tools/test-browser.mjs:1-21` |
| 13 | Live Browser Test | Disposable Test Environment Setup | Copies pristine `standard-test` world fixture to a unique timestamped `/tmp` path on port 30175. | `cp -r /tmp/ak5e-standard-test /tmp/ak5e-specialist-live-data-${TIMESTAMP}` | Clean isolated environment with `standard-test` world and `dnd5e` system. | Prevents mutating production or shared data; never reuses a dirty database. | `/tmp/run-medic-live.sh:4-14` |
| 14 | Live Browser Test | Non-Destructive In-Place Module Install | Installs current repository checkout into disposable test instance without importing release packs or auto-activating. | `node ak5e/tools/install-for-testing.mjs --data-path ... --foundry-path ... --port 30175` | Links or copies module files into `Data/modules/ak5e/` inside test directory. | Idempotent; refuses to overwrite if live or invalid; does not auto-activate. | `ak5e/tools/install-for-testing.mjs`, `/tmp/run-medic-live.sh:16-17` |
| 15 | Live Browser Test | POSIX Process Tracking & Signal Trapping | Starts Foundry V13 headless server, tracks PID (`AK5E_TEST_PID`), and traps `EXIT`, `INT`, and `TERM` signals. | Bash `trap cleanup EXIT`, `trap 'exit 130' INT`, `trap 'exit 143' TERM` | Clean shutdown sending `SIGTERM`, polling 50x0.2s, escalating to `SIGKILL` if hung, confirming port release. | If port remains bound (`ss -H -ltn "sport = :30175"`), exits non-zero and prints warning. | `/tmp/run-medic-live.sh:19-58`, `GEMINI.md §5` |
| 16 | Live Browser Test | HTTP Readiness Polling | Polls Foundry `/join` endpoint for HTTP 200 before launching Playwright browser test. | `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:30175/join` (up to 60s) | Loop breaks upon HTTP 200 response; proceeds to browser test. | Exits immediately if server process exits prematurely; outputs `server.log`. | `/tmp/run-medic-live.sh:67-80` |
| 17 | Live Browser Test | Dual-Context GM & Player Execution | Executes actions and sheet inspections across GM and Player sessions to test permissions and relays. | Playwright `browser.newContext({ viewport: { width: 1600, height: 1050 } })` | Validates GM relay execution, player chat card clicks, owner roll permissions, and undo. | Page errors and console errors captured in `report.errors`. | `ak5e/tools/test-medic-live.mjs:28-48`, `test-guard-live.mjs` |
| 18 | Visual Review | Subagent Screenshot Inspection Protocol | Reviewer subagent inspects captured PNGs and produces structured written evaluation per AGENTS.md §6.2. | Absolute image paths, UI surface descriptions, checks list. | Written report per image with path, surface, checks, defects, and PASS / FAIL / UNCERTAIN verdict. | "Images not viewed" reported if subagent viewing tool fails; parent must not assume PASS. | `AGENTS.md §6.2`, `WORKFLOW.md §5.2, §8` |
| 19 | Static Checks | File & Manifest Schema Validation | Validates `module.json` manifest structure, D&D5e compatibility, pack types, `lang/en.json` strings, and JavaScript syntax. | `node ak5e/tools/validate-files.mjs` | Exits 0 if manifest valid, all referenced files exist, and all `.mjs` pass `node --check`. | Exits non-zero with syntax error or missing file assertion. | `ak5e/tools/validate-files.mjs:1-71` |
| 20 | Static Checks | Source Fidelity & Record Coverage | Verifies generated compendium records against raw source chapters 1–6 in `AK5e_1.3.1_Foundry_Source/`. | `node ak5e/tools/verify-generated-content.mjs` | Exits 0 if all slugs/IDs unique, all records match source, and zero uncovered source lines exist. | Exits non-zero if record counts mismatch or uncovered rules text lines detected. | `ak5e/tools/verify-generated-content.mjs:1-218` |

---

## Edge Cases

| # | Feature | Input / Condition | Observed / Required Behavior |
|---|---------|-------------------|-----------------------------|
| 1 | `spendResource` | Resource shortfall (current 0, amount 1 or more) with "Use anyway" override | Balance is clamped at 0 (`Math.max(0, before - amount)`); `receipt.shortfalls` records shortfall text; chat card renders public notice `<p><strong>Prowess short by 1.</strong></p>`. |
| 2 | `undoUse` | Undoing a use where resource shortfall was overridden (e.g., spent 1 from 0, resulting in 0) | Undo calculates `current + (resource.before - resource.after)` = `0 + (0 - 0) = 0`, restoring exact prior value (`0`), NOT erroneously adding the theoretical cost (`1`). |
| 3 | `undoUse` | Undoing a use after resource was restored above max (e.g. temporary boost) | Undo restores `Math.max(0, Math.min(Math.max(pool.max, resource.before), current + (before - after)))`, cleanly preserving values above maximum. |
| 4 | `changeTarget` | Relaying an unowned target change when no GM client is connected | Throws `NoGM("no GM is connected")`. Receipt status becomes `"pending"`, card displays "Not applied yet: no GM is connected. Retry this use from the panel.", and a "Retry" button renders on the card. |
| 5 | `relayedTargetChange` | Relaying a forged target modification (e.g., client modified receipt amount or target kind) | GM client calls `PLANS[receipt.command].validateTarget(source, receipt, entry, target)`. If validation returns `false` or throws, operation is aborted with `Error("The recorded change is not one this use can make.")`. |
| 6 | `command` | User closes/cancels confirmation dialog without clicking "Confirm" or "Use anyway" | `confirmPlayUse` returns `null`. `command()` is never invoked. Document attributes, resource pools, flags, and chat messages remain 100% untouched. |
| 7 | `finish` | Network interruption or client crash during state save (`updatesApplied` interrupted) | Re-invoking `command()` with the same operation ID detects existing receipt with status `"applying"` or `"pending"`, safely re-applies prepared updates without duplicating deductions, and posts the card. |
| 8 | `useRoll` | Non-owner clicks "Roll" button on chat card | `renderPlayUseCard` only renders control buttons if `actor.isOwner`. If triggered directly via API, `need(actor.isOwner, ...)` blocks unauthorized users. |
| 9 | `undoUse` | Attempting to undo an action from a combat encounter after combat has ended | `isLocked(receipt)` checks `receipt.epoch === currentEpoch()`. Returns `true` (locked). Player dialog shows "Locked: this use's encounter window has ended." Only a GM user is allowed to proceed with undo. |
| 10 | `undoUse` | Target actor or document deleted after the use was applied | `revertTargetChange` detects `!target`. Returns `{ missing: true }`. Undo continues cleanly for the source actor and logs an undo note: `<TargetName> no longer exists; nothing to revert there.` |
| 11 | `undoUse` | Reaction was spent by feature, but combat turn refreshed reactions before undo was triggered | `refundReaction` returns `{ ok: false, reason: "missing" }`. Undo detects reaction already refreshed, leaves reaction available, and logs note: "The Reaction had already refreshed at a Turn start, so it remains available." |
| 12 | Subclass Rulings | Feature with ambiguous source rule (e.g., Infuser DC `20 - INT - PB` vs `8 + INT + PB`) | If GM has recorded a ruling via `recordSpecialistRuling`, that ruling is automatically applied. If no GM ruling exists, the confirm dialog displays radio buttons for both readings; player chooses for this use only; choice is displayed on chat card. |
| 13 | Live Browser Test | Foundry server process hangs or fails to exit upon `SIGTERM` during test teardown | The `cleanup()` trap loops 50 times (10s total); if `kill -0 "$AK5E_TEST_PID"` is still true, issues `kill -9 "$AK5E_TEST_PID"`, verifies port release via `ss`, and exits non-zero if the port cannot be freed. |
| 14 | Live Browser Test | Chromium test script throws uncaught exception or assertion failure | `browser.close()` is guaranteed via `finally` block in `test-specialist-live.mjs`; `browser-report.json` records error stack; bash `cleanup()` trap terminates the Foundry background process cleanly. |

---

## 5-Component Handoff Report

### 1. Observation

#### 1.1 Table-Play Philosophy & Play-Uses Architecture
Direct inspection of `ak5e/scripts/play-uses.mjs`:
- Lines 57–63:
  ```js
  export function spendResource(actor, receipt, { pool, path, amount, label, max }) {
    const record = pool ? getPool(actor, pool) : null;
    const resourcePath = pool ? `flags.ak5e.resourcePools.${pool}.value` : path;
    const before = record ? record.value : Number(getPath(actor, path)) || 0, after = Math.max(0, before - amount);
    (receipt.resources ??= []).push({ pool: pool ?? null, path: resourcePath, before, after, max: record?.max ?? max ?? null, label });
    if (amount > before) receipt.shortfalls = [...(receipt.shortfalls ?? []), `${label} short by ${amount - before}`];
    return { [resourcePath]: after };
  }
  ```
- Lines 194–209:
  ```js
  async function relayedTargetChange(source, command, data, user = game.user) {
    need(["apply", "revert"].includes(command), `Unknown relayed ${label} change.`);
    const receipt = readState(source).undo.find(entry => entry.id === data.useId);
    need(receipt, `No recorded ${label} use matches this relayed change.`);
    const entry = receipt.targets?.find(change => change.uuid === data.targetUuid);
    need(entry && KINDS[entry.kind], "That Creature is not part of the recorded use.");
    need(!KINDS[entry.kind].local, "That change is never applied through the GM relay.");
    if (command === "apply") need(receipt.status !== "undone" && entry.ready, "That change is not ready to apply.");
    else need(!isLocked(receipt) || user.isGM, "This use is locked: its encounter window has ended.");
    const target = await globalThis.fromUuid(entry.uuid);
    if (!target && command === "revert") return { missing: true };
    need(target?.documentName === targetDocument(entry), "The target no longer exists.");
    if (command === "apply") need(PLANS[receipt.command]?.validateTarget?.(source, receipt, entry, target) === true, "The recorded change is not one this use can make.");
    return command === "apply" ? applyTargetChange(source, receipt.id, entry, target) : revertTargetChange(source, receipt.id, entry, target);
  }
  ```
- Lines 300:
  ```js
  receipt.status = receipt.targets?.some(entry => !entry.ready) || (receipt.damageParts?.length && receipt.roll === undefined) || (receipt.formula && receipt.roll === undefined) ? "awaitingRoll" : "complete";
  ```
- Direct inspection of `ak5e/scripts/specialist-uses.mjs` lines 25–33:
  ```js
  export const specialistUses = createPlayUses({
    ns: "specialistUses",
    label: "Specialist",
    isMember: actor => specialistEnabled(actor),
    ruling: (actor, key) => {
      const record = specialistState(actor).rulings?.[key];
      return record?.source?.trim?.() && record.value !== undefined ? record.value : undefined;
    }
  });
  ```
- In `ak5e/scripts/medic-uses.mjs:704-733`, every target-modifying plan explicitly attaches `validateTarget`:
  ```js
  MEDIC_PLANS.touchHeal.validateTarget = (source, receipt, entry, targetDoc) =>
    Boolean(targetDoc && entry.kind === "heal" && (entry.amount === receipt.result?.amount || entry.amount <= (receipt.result?.amount ?? 0)));
  ```

#### 1.2 Live Test Harness & Signal Traps
Direct inspection of `/tmp/run-medic-live.sh`:
- Lines 19–58:
  ```bash
  cleanup() {
    result=$?
    trap - EXIT
    echo "Executing cleanup trap (exit code $result)..."
    if [[ -n "${AK5E_TEST_PID:-}" ]] && kill -0 "$AK5E_TEST_PID" 2>/dev/null; then
      args=$(ps -p "$AK5E_TEST_PID" -o args=) || args=
      if [[ "$args" == *"$AK5E_FOUNDRY_PATH/main.js"* && "$args" == *"--dataPath=$UNIQUE_TEST_DATA"* ]]; then
        kill -TERM "$AK5E_TEST_PID" || result=1
        for attempt in {1..50}; do
          kill -0 "$AK5E_TEST_PID" 2>/dev/null || break
          sleep 0.2
        done
        if kill -0 "$AK5E_TEST_PID" 2>/dev/null; then
          echo "Foundry did not terminate cleanly on SIGTERM, sending SIGKILL..."
          kill -9 "$AK5E_TEST_PID" || true
        else
          wait "$AK5E_TEST_PID" 2>/dev/null || true
        fi
      else
        result=1
      fi
    fi
    listeners=$(ss -H -ltn "sport = :$AK5E_TEST_PORT") || result=1
    if [[ -n "$listeners" ]]; then
      echo "Warning: Port $AK5E_TEST_PORT still in use: $listeners" >&2
      result=1
    else
      echo "Port $AK5E_TEST_PORT confirmed released."
    fi
    exit "$result"
  }
  trap cleanup EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  ```
- Direct inspection of `ak5e/tools/test-browser.mjs`:
  ```js
  const RENDERER_FLAGS = /^--(use-angle|use-gl|use-vulkan|enable-unsafe-swiftshader|disable-gpu)(=|$)/;
  export function launchTestBrowser(chromium, options = {}) {
    const callerArgs = (options.args ?? []).filter(arg => !RENDERER_FLAGS.test(arg));
    return chromium.launch({
      headless: true,
      channel: "chromium",
      ...options,
      args: [...new Set([...callerArgs, "--enable-gpu", "--use-angle=gl-egl"])]
    });
  }
  ```

#### 1.3 Subagent Visual Inspection Protocol
Direct inspection of `AGENTS.md §6.2`:
- "Screenshot and image review: Looking at screenshots is sub-agent work."
- "Delegate rendered inspection to `foundry-validator` (Claude), `foundry_validator` (Codex), or a Gemini 3.8 Flash worker assigned the equivalent Foundry-validator scope."
- "Pass paths, not pictures: give the sub-agent screenshot file paths and the checks to perform. Do not open, paste or base64-embed images in the parent's context."
- "Written visual report, one entry per image: path; window/document/state shown; checks performed (WORKFLOW §5.2 and §8: missing text/images, overflow/clipping, dark-theme readability, roll controls, permissions, links); defects with on-screen location and suggested cause; verdict PASS / FAIL / UNCERTAIN."

#### 1.4 Static Checks Execution & Output
- Command `node ak5e/tools/validate-files.mjs` executed:
  `Validated module.json, lang/en.json, and 266 .mjs files.` (Exit 0)
- Command `node ak5e/tools/verify-generated-content.mjs` executed:
  `Verified all generated AK5e Chapter 1–6 records against the v1.3.1 source. Top-level records: 2193; Chapter 6 embedded features: 801.` (Exit 0)
- Command `npm run test:specialist` executed:
  `48 pass, 0 fail, duration 726ms` (Exit 0)

---

### 2. Logic Chain

1. **Table-Play Compliance**:
   - WORKFLOW.md §3.2 mandates that players must never be gated by GM approval for using their own character features, must always confirm before mutating documents or spending resources, must never have dice rolled automatically, must have shortfalls clamped at zero with public chat notifications, and must have every action reversible within the encounter window.
   - Observation in `ak5e/scripts/play-uses.mjs` reveals that `createPlayUses` inherently handles confirmation (`data.confirmed === true`), warning overrides via `requireOverrides`, zero-clamping via `spendResource`, roll deferral via `receipt.formula`, and undo via `undoUse`.
   - Therefore, implementing Specialist and its subclasses requires registering all Specialist plans in `specialistUses.register({ plans: SPECIALIST_PLANS, targetKinds: ... })`, ensuring every dice-rolling feature sets `receipt.formula`, and ensuring all plans modifying unowned targets implement `validateTarget`.

2. **Target Mutation Defense via `validateTarget`**:
   - Observation in `play-uses.mjs:207` shows that `relayedTargetChange` unconditionally asserts `need(PLANS[receipt.command]?.validateTarget?.(source, receipt, entry, target) === true)`.
   - In Medic implementation (`medic-uses.mjs:704-733`), all 9 target-mutating plans attached `validateTarget` returning boolean validation against receipt parameters, while non-target plans attached `() => false`.
   - For Specialist, features such as Hookmaster's `boundInRope` (grapple), `wrangler` (latch), `mightyPush` (knockback), `scorpionSting` (pull), Executor's `deathmark` transfer, and Infuser's Alchemical Infusions and Toxins target external actors.
   - Therefore, every Specialist plan mutating external tokens/actors MUST have an explicit `validateTarget` method attached to the plan function.

3. **Live Headless In-Foundry Test Rigor**:
   - WORKFLOW.md §5.3 and GEMINI.md §5 require that all browser validation use `launchTestBrowser()` from `ak5e/tools/test-browser.mjs`, run against an isolated `/tmp` copy of `standard-test` on port 30175, and properly manage server lifecycle and signal traps.
   - Observation of `/tmp/run-medic-live.sh` and `/tmp/run-guard-live.sh` establishes the gold standard bash runner script pattern: copying `/tmp/ak5e-standard-test`, running `install-for-testing.mjs`, trapping `EXIT`/`INT`/`TERM`, polling `/join` HTTP 200, executing Playwright, and ensuring port release via `ss`.
   - Therefore, `ak5e/tools/test-specialist-live.mjs` and `/tmp/run-specialist-live.sh` must replicate this exact pattern, exercising Base Specialist, Executor, Hookmaster, and Infuser actors, verifying zero console/page errors, and writing evidence to `/tmp/ak5e-specialist-live-evidence-*/`.

4. **Visual Inspection Division of Labor**:
   - AGENTS.md §6.2 prohibits parent agents from repeatedly opening large screenshots due to context bloat.
   - It requires delegating rendered inspection to a subagent that opens every image and produces a structured written report.
   - Therefore, after `test-specialist-live.mjs` executes and captures screenshots (e.g. `01-baseline-world.png` through `15-undo-executed.png`), the parent must invoke or delegate to a reviewer subagent passing image paths and evaluation checklists.

---

### 3. Caveats

1. **Port Availability**: The test runner expects port `30175` to be free. If another background test process is currently holding port 30175, the runner will fail readiness or cleanup checks. The runner checks `ss -H -ltn "sport = :30175"` before and after.
2. **Standard-Test Fixture**: The test script relies on `/tmp/ak5e-standard-test` existing as a valid pristine base fixture. If `/tmp/ak5e-standard-test` is absent or corrupted, it must be re-extracted or verified from the repository test world.
3. **ActorSheetV2 Injection Timing**: In Foundry V13, ActorSheetV2 uses modern template rendering where tabs may render asynchronously. Live browser scripts must use Playwright locators with proper `waitFor` assertions rather than hardcoded timeouts.

---

### 4. Conclusion

The test infrastructure, table-play guardrails, and verification tools for the AK5e Specialist class are fully specified and anchored in existing repository patterns:
1. **Engine**: `specialistUses` in `ak5e/scripts/specialist-uses.mjs` is initialized via `createPlayUses({ ns: "specialistUses", label: "Specialist" })`. Subclass plans for Executor, Hookmaster, and Infuser must be registered into `specialistUses`, must set `receipt.formula` for dice rolls, and must implement `validateTarget` on all external target operations.
2. **Sheet & Dialogs**: `specialist-sheet.mjs` must inject `.ak5e-specialist-sheet-panel` into Features tab of `ActorSheetV2` with Prowess and DC badges, header controls, and `renderPlayUseCard` hook integration for interactive chat card Roll and Undo buttons.
3. **Live Test Script**: `ak5e/tools/test-specialist-live.mjs` must test Base Specialist, Executor, Hookmaster, and Infuser, capturing at least 15 screenshots and confirming zero console/page errors (`report.errors.length === 0`).
4. **Visual Inspection**: All screenshots must be delegated to a reviewer subagent per AGENTS §6.2 with PASS/FAIL/UNCERTAIN verdicts for missing text/images, clipping, dark theme readability, roll controls, permissions, and links.
5. **Static Quality Gates**: Zero errors across `validate-files.mjs`, `verify-generated-content.mjs`, and unit test suites.

---

### 5. Verification Method

To independently verify all findings and test infrastructure requirements:

1. **Validate Module Syntax and Manifest Integrity**:
   ```bash
   node ak5e/tools/validate-files.mjs
   ```
   *Expected output*: Validates `module.json`, `lang/en.json`, and 266+ `.mjs` files with exit code 0.

2. **Verify Compendium Records against Source Text**:
   ```bash
   node ak5e/tools/verify-generated-content.mjs
   ```
   *Expected output*: 0 uncovered lines in Chapters 1–6, exit code 0.

3. **Run Specialist Unit Tests**:
   ```bash
   npm run test:specialist
   ```
   *Expected output*: All unit test suites pass cleanly with 0 failures.

4. **Verify Live Browser Test Script Architecture**:
   Inspect `ak5e/tools/test-browser.mjs`, `/tmp/run-medic-live.sh`, and `ak5e/tools/test-medic-live.mjs` to confirm launcher options, process traps, signal handling, and Playwright execution flow.

5. **Execute In-Foundry Live Headless Validation (when runner is deployed)**:
   ```bash
   /tmp/run-specialist-live.sh
   ```
   *Expected output*: Clean startup, 0 page errors, 0 console errors in `report.json`, all screenshots captured, clean server termination and port 30175 release.
