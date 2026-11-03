# Gemini 3.8 — Bulk Implementer Guide

> Gemini 3.8 Flash implements; Codex and Claude review. Updated 2026-10-12.
> Read separately, in full, after [WORKFLOW.md](WORKFLOW.md) and [AGENTS.md](AGENTS.md).
> Project policy, user instructions and higher-priority constraints prevail.

## 1. Your role and working loop

Applies across content, classes/branches, engines and UI.

**Understand → implement → test → inspect → review → revise.**

- Verify model/tools, permissions and routing; prompts cannot switch models.
- Read the authorized task, `git status`, [TODO.md](TODO.md), [bugs/README.md](bugs/README.md) (then `ls bugs/pending`; open only the bugs your task touches),
  [VERIFY.md](VERIFY.md) and [DECISIONS.md](ak5e/DECISIONS.md). Preserve edits.
- Batch by capability/class/branch; build prerequisites and validate a vertical slice.
- Record batch/revision, acceptance, ownership and baseline commit/patch/hashes.
- Distinguish implemented/tested/inspected/pending/accepted; continue independent
  authorized work while waiting for review.
- Delegate bounded source/scope/ownership/evidence. Avoid overlapping writers;
  preserve uncommitted baselines in isolated workspaces.

## 2. Establish rules and behavior before coding

Read source README, full chapters/references; reopen truncated output.
Verify [platform contracts](ak5e/README.md). Map IDs/text/levels/formulas,
costs/recovery/prerequisites/targets/range/duration, behavior and evidence. Label:

- **Explicit rule:** source text and file/lines.
- **Faithful representation:** native fields or reviewed code.
- **Manual procedure:** visible, usable table instructions.
- **Unresolved interpretation:** alternatives needing a decision.

Compare tables, prose and decisions. Log conflicts; follow ruling/per-use-choice
policy without inventing rules or substituting D&D5e conventions. Advance other
work instead of guessing. Label manual behavior honestly.

## 3. Build complete, maintainable workflows

- Verify native/shared signatures, callers, hooks and registration. Separate
  calculations/plans/writes/UI; use `flags.ak5e` and canonical play services.
- Complete setup/progression → grants → inputs → confirm → engine → state/card
  → owner rolls/saves → undo → recovery/persistence, including renderer wiring.
- Preserve IDs/UUIDs, authored Items/activities/HP and choices. Prevent repeated
  grants/contributions; resolve identities without placeholder substitution.
- Bind previews to choices and before/after values; revalidate stale/malformed
  input before writes. Cancellation changes nothing.
- Snapshot resources/flags/effects/targets, including absence; plan receipts,
  recovery, partial-write/retry handling and older-undo conflicts before writes.
- Use gameplay time and proper combat/Turn/attack scope; preserve retarget expiry.
  Qualify effects by actual type/recipient/weapon/trigger, not capability assumptions.
- Avoid speculative abstractions, unrelated rewrites and unfinished placeholders.
  Document non-obvious source/API constraints.

**WORKFLOW §3.2:** confirm uses, not checks/saves; publish overridden warnings,
clamp overspend at zero and undo prior values. No play approval/turn gates or
auto-rolled dice. Relay unowned-target operations automatically; report unavailable
relay. Administration is GM-only; play stays undoable within the encounter window.

## 4. Test behavior, then hand off for review

Test source-derived positive/negative cases, levels, resources, rests/expiry,
repetition, cancellation, invalid inputs, failures and concurrency. Exercise real
entrypoints/hooks/shared regressions; never weaken assertions or conceal defects.

`check:generated` regenerates files; `npm test` invokes it. Inspect command side
effects; avoid builders in read-only work. Authorized generation needs baseline,
diff and ID checks. Focused root commands:

```bash
node --test ak5e/test/resource-pools.test.mjs ak5e/test/operation-kernel.test.mjs
node ak5e/tools/validate-files.mjs
node ak5e/tools/verify-generated-content.mjs
```

Add affected subsystem tests; record commands, exit status and assertion results.
Mocks alone do not prove rendered behavior or clean-World imports.

**Codex or Claude reviews each batch; both review completed classes and major
shared-engine changes.** Review fidelity, integration, data loss, agency/security,
undo, concurrency, UI and tests. Gemini fixes/retests; reviewers accept.

Batch handoff:

```text
Batch/revision/goal; changed files and exact baseline/patch/hashes
Source mappings; behavior/manual limits; commands/results/environment
Reports/screenshots/inspection; findings/rules/gaps/reproduction
Reviewer/platform/revision/verdict/follow-up
```

Self-review cannot cross-verify; unavailable external review stays pending.
Tick checkpoints only with current-scope external evidence; record both milestone
reviews and re-review changed behavior without erasing history.

## 5. Open, exercise and close a Foundry test instance

### Prepare and install

Copy a verified stopped disposable D&D5e `standard-test` fixture to a unique
`/tmp` User Data root with `Data/` and independent World/system copies. Never use
production links, live databases or shared servers. Verify D&D5e/test access;
no licensing/authentication bypass or logged secrets. Discover binaries,
Playwright's ESM **file** and a free localhost port:

```bash
export AK5E_FOUNDRY_PATH=/home/patch/FoundryV13
export AK5E_TEST_DATA=/tmp/your-unique-test-copy
export AK5E_TEST_PORT=30175
export AK5E_TEST_OUTPUT=/tmp/your-unique-test-evidence
export AK5E_PLAYWRIGHT=/absolute/path/node_modules/playwright/index.mjs
```

Replace placeholders, verify the port is free, then install while stopped:

```bash
npm run install:foundry -- --dry-run --data-path "$AK5E_TEST_DATA" \
  --foundry-path "$AK5E_FOUNDRY_PATH" --port "$AK5E_TEST_PORT"
npm run install:foundry -- --data-path "$AK5E_TEST_DATA" \
  --foundry-path "$AK5E_FOUNDRY_PATH" --port "$AK5E_TEST_PORT"
```

This installer neither imports nor activates AK5e and refuses release packs;
use the separate release workflow for those.

### Start and track the server

Wrap the whole session in an orchestration `try/finally` or exit trap. Track the
spawned handle/PID and log; verify command/data path before signalling it:

```bash
mkdir -p "$AK5E_TEST_OUTPUT"
node "$AK5E_FOUNDRY_PATH/main.js" \
  --dataPath="$AK5E_TEST_DATA" --port="$AK5E_TEST_PORT" \
  --hostname=127.0.0.1 --world=standard-test --noupnp \
  > "$AK5E_TEST_OUTPUT/server.log" 2>&1 &
AK5E_TEST_PID=$!
```

Poll HTTP readiness with timeout/exit checks; inspect failures. Setup/license
screens are not readiness. Reinstall/restart only your instance; track new PIDs.

### Open and interact through Chromium

Use [launchTestBrowser()](ak5e/tools/test-browser.mjs); no GPU disabling/software
forcing. Record actual renderer. Save this baseline scaffold as `.mjs`; set
`AK5E_REPO`, `AK5E_TEST_USER` and private password. Add real assertions/interactions
and separate GM/player/observer contexts; baseline capture is not gameplay testing.

```js
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const { chromium } = await import(process.env.AK5E_PLAYWRIGHT);
const { launchTestBrowser } = await import(pathToFileURL(
  `${process.env.AK5E_REPO}/ak5e/tools/test-browser.mjs`).href);
const output = process.env.AK5E_TEST_OUTPUT;
const report = { errors: [], screenshots: [] };
let browser;
try {
  await mkdir(output, { recursive: true });
  browser = await launchTestBrowser(chromium, process.env.AK5E_CHROMIUM
    ? { executablePath: process.env.AK5E_CHROMIUM } : {});
  const context = await browser.newContext({ viewport: { width: 1600, height: 1050 } });
  const page = await context.newPage();
  page.on("pageerror", error => report.errors.push(error.message));
  page.on("console", msg => { if (msg.type() === "error") report.errors.push(msg.text()); });
  await page.goto(`http://127.0.0.1:${process.env.AK5E_TEST_PORT}/join`);
  await page.selectOption('select[name="userid"]', { label: process.env.AK5E_TEST_USER });
  const password = page.locator('input[name="password"]');
  if (await password.count()) await password.fill(process.env.AK5E_TEST_PASSWORD ?? "");
  await page.locator('button[name="join"]').click();
  await page.waitForFunction(() => globalThis.game?.ready && globalThis.canvas?.ready,
    null, { timeout: 60000 });
  report.environment = await page.evaluate(() => ({
    foundry: game.version, system: game.system.id, systemVersion: game.system.version,
    world: game.world.id, module: game.modules.get("ak5e")?.version,
    active: game.modules.get("ak5e")?.active, api: Boolean(game.ak5e)
  }));
  if (report.environment.world !== "standard-test" || report.environment.system !== "dnd5e"
    || !report.environment.active || !report.environment.api) throw Error("Wrong test environment");
  await page.screenshot({ path: `${output}/01-world-baseline.png` });
  report.screenshots.push(`${output}/01-world-baseline.png`);
  if (report.errors.length) throw Error("Browser errors; inspect report");
} catch (error) {
  report.failure = error.message;
  throw error;
} finally {
  try { if (browser) await browser.close(); } // also closes its contexts
  finally { await writeFile(`${output}/browser-report.json`, JSON.stringify(report, null, 2)); }
}
```

Enable only AK5e as GM via Manage Modules/reload; explicitly install fixtures.
Click real controls; no confirmation bypass or hidden force-clicks. Label API
checks; reserve `page.evaluate()` for fixture/state assertions. Check each runner's
variables/users/cleanup/coverage. Exercise omitted workflows, permissions,
overrides, relay, recovery, locks and reload/restart persistence.

### Close on success, failure or interruption

Browser cleanup survives report-write failure; the outer script stops its server.
In a Bash orchestration script, install this trap **before** the launch above
and run your saved `.mjs` with `node` there. Verify `ss`/`ps` availability first:

```bash
set -e
cleanup() {
  result=$?
  trap - EXIT
  if [[ -n "${AK5E_TEST_PID:-}" ]] && kill -0 "$AK5E_TEST_PID" 2>/dev/null; then
    args=$(ps -p "$AK5E_TEST_PID" -o args=) || args=
    if [[ "$args" == *"$AK5E_FOUNDRY_PATH/main.js"* && "$args" == *"--dataPath=$AK5E_TEST_DATA"* ]]; then
      kill -TERM "$AK5E_TEST_PID" || result=1
      for attempt in {1..50}; do
        kill -0 "$AK5E_TEST_PID" 2>/dev/null || break
        sleep 0.2
      done
      if kill -0 "$AK5E_TEST_PID" 2>/dev/null; then result=1
      else wait "$AK5E_TEST_PID" 2>/dev/null || true; fi
    else result=1; fi
  fi
  listeners=$(ss -H -ltn "sport = :$AK5E_TEST_PORT") || result=1
  if [[ -n "$listeners" ]]; then result=1; fi
  if (( result != 0 )); then echo "Failed test/cleanup; inspect logs and tracked PID" >&2; fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
```

If shutdown hangs, report it; reverify ownership before forcing that exact
process. No broad `pkill` or unrelated service/port-owner kills. Keep evidence
and fixtures; never claim closure when a process or listener remains.

## 6. Screenshot inspection and honest completion

Screenshot every UI change: baseline/changed sheets, dialogs, warnings, cards,
roll/save/undo states and relevant roles. Record missing baselines and image
paths/actions/expectations/roles.

Delegate actual viewing per AGENTS §6.2, passing paths/checks. Require per-image
state/checks/defects and **PASS / FAIL / UNCERTAIN** for content, clipping,
readability, links and controls. Fix, recapture and resume the inspector.
Unviewed images stay pending; screenshots alone do not prove gameplay.

Update TODO/`bugs/`/DECISIONS/VERIFY and live evidence logs. Report scope/manual
limits, tests, environment/renderer, inspector, reviews and gaps. Separate
locked-pack clean-World imports, UUIDs, persistence and licensing/release readiness.
Generation, mocks, unviewed images and stale reviews do not establish completion.
