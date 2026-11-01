# AK5e Foundry VTT — Codex Orchestration Pipeline

> How an OpenAI Codex parent session runs and manages work in this repository. Revised 2026-10-31 (v2: lane copies, batch planning, worker self-test loop, checkpoint verification).
> Read after [WORKFLOW.md](WORKFLOW.md) and [AGENTS.md](AGENTS.md). WORKFLOW.md wins on conflict. For Codex orchestration this file replaces the delegation and escalation defaults in AGENTS.md §4.4 and §6 (including the §6.2 "same validator rechecks" rule, see §7); every other AGENTS.md rule still applies.
> Role files: `.codex/agents/*.toml`. Parent defaults: `.codex/config.toml`. Lane tool: `.codex/tools/lane.mjs`. Claude Code and Antigravity do not use this file.

## 0. Why it is shaped this way

The 2026-10-31 Vanguard run took 250 minutes and 183M tokens for about a tenth of its queue. Tests ran in under a second; the cost was coordination. The parent spent 76% of the time waiting because lanes never started (the sandbox blocks git worktrees, §9), every small step got its own tester round, candidate, reviewer and re-plan (30 spawns, 113 follow-ups, 6 reviewer spawns for one segment), testers churned on fixtures before code existed, and two long-lived visual validators carried their screenshots through every turn (86% of child log bytes, 48% of child tokens). This version keeps the checks (tests first, attack, review, visual inspection, final QA) and removes most of the round trips around them:

- **Plan once**, as big work packages in a dependency queue, and run ready independent work in parallel, with at most 2 active lanes.
- **Tests first, drafted once**, proven to load and fail for the right reason before any code exists.
- **The worker runs the frozen tests itself** and submits only when green; the parent gates with one command.
- **One adversarial pass and one review per work package, run in parallel**, not per candidate.
- **Foundry visual inspection and final QA once per checkpoint**, on the merged tree, by short-lived agents with small images.

## 1. Roles

| Role | `agent_type` | Model / effort | Writes? |
| --- | --- | --- | --- |
| Orchestrator (parent) | session default | `gpt-6-luna` / `xhigh` | integration, shared files, ledger |
| Planner / architect | `planner` | `gpt-6.1-sol` / `xhigh` | no (read-only sandbox) |
| Implementer, tier 1 | `worker` | `gpt-6.1-terra` / `high` | owned files in its lane |
| Implementer, tier 2 | `worker_sol` | `gpt-6.1-sol` / `high` | owned files in its lane |
| Adversarial tester | `tester` | `gpt-6-luna` / `high` | its own test file(s) in its lane |
| Review gate / adjudicator | `reviewer` | `gpt-6.1-terra` / `high` | no (read-only sandbox) |
| Final independent QA | `final_qa` | `gpt-6.1-sol` / `high` | no (read-only sandbox) |
| Discovery, rules | `explorer`, `rules_mapper` | `gpt-6-luna` / `high` | no (read-only sandbox) |
| Foundry and visual inspection | `foundry_validator` | `gpt-6-luna` / `high` | `/tmp/ak5e-visual/<checkpoint>/` only |
| Last resort, owner-gated | `critical_reviewer` | `gpt-6-astra` / `high` | no (read-only sandbox) |

The design spec named "GPT-6 Terra" for review; this client has no such model, so the gate uses `gpt-6.1-terra`. The `spawn_agent` role list showed each `agent_type` with a fixed model and effort (2026-10-29 rollout), which is why each implementer tier is a separate role; §12 re-checks it. If a role's model is unavailable, say so, use the nearest model of the same family through an explicit `model` override, and record the substitution in the ledger. Never report that a model ran when it did not.

## 2. Choose the path (per work package)

| Path | When | Pipeline |
| --- | --- | --- |
| Light | docs, comments, one-file fix with no gameplay or data effect | parent writes its checks first; parent or one `worker` in a lane; parent gate |
| Moderate | bounded feature or fix inside existing modules | `tester` drafts → `worker` self-loop → gate → `tester` attack pass → `reviewer` (skippable, see below) |
| Full | cross-module work, new mechanics, sockets / GM relay, undo, chat-card flows, pack or UUID changes | batch `planner`, then Moderate with the `reviewer` always, then `final_qa` at the checkpoint |
| Critical | world-data migration, stable-ID / UUID rewrites, release packaging, permission or GM-gating changes | Full, plus owner approval before merge |

- A Moderate work package may skip the `reviewer` when all hold: the diff is under about 150 changed lines, it settles no rules interpretation, and it does not touch a use flow, chat card, socket or GM relay, undo receipt or resource change (the WORKFLOW.md §3.2 surface). The tester's attack pass is then its independent gate. Record the skip and why.
- Mark every work package `ui: yes` or `ui: no`. It is `yes` when the change can alter anything a user sees or does in Foundry (WORKFLOW.md §5.2): manifests, packs, sheets, item activities, chat cards, dialogs, compendium navigation, importers, presentation, or any gameplay use. `ui: yes` work gets the checkpoint visual inspection (§7) on every path, light included. When unsure, mark `yes`.
- Pick the cheapest adequate path and record why. Raise it when new risk appears; never lower it mid-task. Rules interpretation is never "light".

## 3. Plan once: work packages and the queue

1. **One plan per request.** Full or Critical requests (or any request with more than one work package) go to `planner` **once**, with the whole request. It returns every work package, its dependencies, paths, `ui` flags, frozen interfaces and visual checklists. Do not re-plan per phase. Re-plan only for a classified plan flaw (§6), and send the planner only the affected part.
2. **Size work packages for the pipeline, not for the reader.** A work package is a coherent slice a worker can finish in one sitting: typically one subclass or feature, several hundred changed lines across its owned files, 5–15 acceptance criteria. Merge tiny related items into one package; a package under about 100 lines is justified only when it is genuinely independent. Each package carries fixed overhead (a tester, a gate, a review), so fewer, larger packages are faster.
3. **Disjoint ownership.** Each package lists its owned files: production files for the worker and named test files for the tester (frozen file and post-candidate file). Two packages that are not yet accepted never own the same file: `lane.mjs create` refuses an overlap with any lane that has not been removed, merged lanes included, because a merged package may still be fixed or reverted. Packages needing the same file are merged into one or ordered by dependency.
4. **Parent-owned files.** Lanes never own `TODO.md`, `ak5e/DECISIONS.md`, `bugs/`, manifests, `package.json`, generated pack output, test registries or runners, or helpers shared by several packages. The parent edits those in the main tree at integration, or one package owns a shared helper and the others depend on it.
5. **Dependency queue, not lockstep waves.** Each package lists the packages it depends on. A package may start once all its dependencies are **merged** (§5 step 7); it need not wait for their checkpoint. Prefer parallel work and keep up to **2 lanes** busy when independent packages are ready: whenever a lane frees, start the next ready package. Don't split work just to fill lanes; a tightly coupled change stays one package.
6. **Discovery is bounded.** The planner reads the code and rules itself. Spawn `explorer` or `rules_mapper` only for a gap the plan names, at most two at a time, each with a complete question; interrupt each one once it answers. A follow-up question goes to a fresh agent with a brief, never to a long-lived Q&A thread.

## 4. Spawn and wait rules

- Always pass `agent_type` and `fork_turns: "none"`. The default `fork_turns` is `all`, which copies this whole conversation into the child: it breaks tester and reviewer independence and multiplies cost. A child needs a written brief, not your history.
- Every brief is self-contained (AGENTS.md §6): work-package ID, spec version, the lane path, scope, source chapter lines, owned files, deliverable, acceptance criteria, tests, required evidence, open decisions. Put the brief in one message; don't send corrections in pieces.
- No agent spawns agents. The `spawn_agent` description says children can; this policy forbids it. Do not pass `model` or `reasoning_effort` except for a recorded unavailable-model fallback.
- `wait_agent` with `timeout_ms: 1800000` (30 minutes), on every live agent when the client accepts several. When it returns, handle each finished agent's result for its lane and wait again. A timeout with no result means the agents are still working: check `list_agents` once, then wait again. Never nudge, poll or relay status chatter. Use `send_message` only for content the receiver needs.
- **Hung agents.** If one agent shows no progress through two full waits while others finish, or `list_agents` shows it errored, interrupt it and spawn a fresh agent of the same role with the original brief and a note of what is already in the lane. That is an environment failure, not a counted one; a second hang on the same package goes to the owner.
- **Close agents when their part is done.** Interrupt the planner and discovery agents once they answer, the package's tester, worker and reviewer once it merges, and the validator and `final_qa` once they report. A checkpoint fix uses fresh agents (§5 step 9).
- **Lanes and the cap.** At most 2 lanes have live agents at once; merged lanes waiting for a checkpoint hold none and don't count. The runtime thread limit is separate from this lane cap. If a spawn fails at the thread cap, interrupt the oldest idle agent that is not a live lane's tester or worker, and retry once.
- No agent reviews or approves work it produced. Until merge, the tester and reviewer stay with their package across tiers (`followup_task`), so they keep the history of every candidate.

## 5. Work-package lifecycle

States: `PLANNED → LANE → TESTS_FROZEN → SUBMITTED(n) → GATE_PASS → VERIFIED → MERGED → CHECKED → ACCEPTED`, or `BLOCKED` from any state. `VERIFIED` means the attack pass and the review (when not skipped) both passed on the same submission. Light packages skip the tester states and go from `GATE_PASS` to `MERGED`.

1. **Spec.** From the batch plan (Full, Critical, multi-package) or written by the parent (single Moderate or Light package).
2. **Lane.** `node .codex/tools/lane.mjs create <id> --own <worker files> <test files> --note "<WP title>"`. The lane is a private copy of the current main tree at `/tmp/ak5e-lanes/<id>`, with `node_modules` linked. Agents read, edit and run only there. Use `<task>-<wp>` as the id.
3. **Tests first, drafted once** (§6). The tester writes its tests in the lane from the spec only, runs them there against the unchanged code, and returns them only when they load cleanly and fail for the intended reason (missing behaviour, not a harness or fixture error). There is no critique round on drafts. The parent freezes them: `lane.mjs freeze <id> <test files> --reason "draft"`. For `ui: yes`, the plan's visual checklist is frozen too (ledger). Light path: the parent writes its checks from the spec first.
4. **Implement and self-test.** Spawn the current tier's worker with the spec, the lane path and the frozen test paths. The worker runs the frozen tests and the package's existing suite in the lane itself and keeps working until they pass, then submits once. It never edits frozen tests; a test it believes is wrong goes in its handoff as a dispute.
5. **Gate (parent, one command each).** `lane.mjs check <id>` must exit 0 (no out-of-scope writes, frozen files unchanged), then run the frozen tests and the package's suite in the lane. Red is a counted failure unless a dispute is upheld or it is environmental (§8); the failing output is the must-fix list, sent to the same worker with `followup_task`. Do not rerun anything else the worker reported. The parent rules on disputes raised at the gate from the spec (rules questions go to the owner); the reviewer may overturn the ruling.
6. **Attack and review, once, in parallel** on the same gated submission:
   - `followup_task` to the same tester: run the frozen tests, then try to break the candidate in its post-candidate test file. When it reports, freeze that file too (`lane.mjs freeze <id> <file> --reason "attack"`).
   - `reviewer` (Full, Critical, and Moderate unless skipped) gets the spec, the lane path, the command `node .codex/tools/lane.mjs diff <id>` to read the diff itself, the gate results and any disputes. The parent does not paste the diff. Send the attack results when they arrive if the review is still running.
   
   All valid findings from both form one must-fix list and one counted failure. After the fix: rerun the gate and the post-candidate file, then send only the fix to the same reviewer with `followup_task`. The tester is not called again unless the fix rewrote the design.
7. **Merge.** Critical: owner approval first. `lane.mjs merge <id>` copies the owned changes into the main tree. It refuses out-of-scope writes, and it refuses everything if the main copy of any changed file moved since the lane was made (exit 2: an integration conflict, a plan flaw, not the worker's failure). It saves the replaced files and writes the merge diff to `.codex-work/lanes/<id>/merge-<n>.diff`, the file `final_qa` reads. Merge one lane at a time, then run the combined relevant suite in the main tree once. A failure after a clean merge is an integration defect, routed to the lane merged last unless evidence points elsewhere. The parent then makes its shared-file edits (TODO.md, DECISIONS.md, registries) for that package and interrupts the package's agents.
8. **Revert** when a merged package must come out: it ends BLOCKED, or the combined suite fails and the fix is not quick. `lane.mjs revert <id>` restores the files its last merge replaced. It refuses (exit 2) if anything changed those files since the merge; then undo the later change first or fix forward. Rerun the combined suite after a revert. A BLOCKED package keeps its lane and its file ownership until the owner decides; if they drop it, revert any merge, then `lane.mjs remove <id>` to free its files.
9. **Checkpoint** (§7): visual inspection of merged `ui: yes` packages and `final_qa` of merged Full and Critical packages, batched. A finding goes back to that package's lane as a fix round, and counts like any other implementation defect:
   - `lane.mjs refresh <id>` brings the lane's other files up to date with the main tree.
   - Where the finding can be automated, a fresh tester writes a failing regression test for it first (spec plus finding, no diff), and the parent freezes it.
   - A fresh worker of the package's current tier gets the spec, the lane, the finding, the frozen tests and the last merge diff. Its tier's counted failures carry over.
   - Gate, then a fresh reviewer for the fix diff (when the package has review), merge again. The next checkpoint rechecks the finding.
10. **Accept.** The package is ACCEPTED when its checkpoint passes. Update the ledger and `lane.mjs remove <id>`. Agents never commit, merge branches, push or touch real Foundry worlds; "accepted" means integrated into the working tree and reported. Commits stay with the owner unless they ask.

## 6. Tests before code

Tests are written before any candidate code exists, so what gets tested stays independent of what was built.

1. **Spec only.** The tester's brief holds the spec, acceptance criteria, source-rule excerpts, the interface names and signatures the spec fixes, the lane path and the test-harness and fixture paths. It holds no design notes, implementation hints or worker output. The tester may read the spec, the source chapter, test helpers, fixtures and existing tests for conventions; it may not read the bodies of the production functions the package changes.
2. **Red for the right reason.** Before returning, the tester runs its draft in the lane against the unchanged code and fixes every load, import, fixture and harness error itself. It returns the test files, a criterion→test map and an expected red/green table. That self-check replaces the old draft-critique rounds.
3. **Freeze**, then spawn the worker. Within one package this is sequential by design; other lanes keep moving.
4. **Changing frozen tests.** A harness or fixture fix that changes no expected outcome: the tester makes it and the parent re-freezes with the reason; no adjudication. A change to an assertion or expected outcome: the reviewer adjudicates (the parent when the package has no reviewer; parent and owner for rules), recorded with old and new hash. If a tester's own errors invalidate frozen tests twice, replace the tester with a phase-1 brief.
5. **Honest limit.** Reading production code is not technically blocked, so "spec only" rests on the prompt. The candidate's absence while the tests are drafted is real, and the session log proves the order.
6. **Tests written after code exists.** A replacement tester, tests for a spec revision (v+1) and checkpoint regression tests are drafted while a candidate exists. Brief them as in step 1, never with the diff, and mark them post-candidate in the ledger. This is a known exception, not a reason to discard the candidate.

## 7. Checkpoints: visual inspection and final QA

A checkpoint verifies a batch of merged packages on the integrated main tree. Run one when every package of the plan is merged, when three merged packages are waiting, or when no other lane can start. A package is never reported as accepted before its checkpoint.

**Visual inspection** (`ui: yes` packages):
- Spawn one **fresh** `foundry_validator` per checkpoint with the merged packages' frozen visual checklists, their changed files and the AGENTS.md §6.2 report format. It runs Foundry V13 + D&D5e from a private data copy under `/tmp/ak5e-visual/<checkpoint>/` (never the owner's worlds or user data), drives the browser only with `launchTestBrowser()` from `ak5e/tools/test-browser.mjs`, records the renderer and works through every checklist as GM and as a player.
- When validating an existing World, use the same private User Data directory on every launch and restart, and explicitly select the World. For example:
  ```sh
  FOUNDRY_VTT_DATA_PATH=/path/to/private-userdata node /path/to/FoundryV13/main.js --world=<world-id> --port=<port>
  ```
  Without `FOUNDRY_VTT_DATA_PATH`, Foundry may open a different data tree; without `--world=<world-id>`, it stays on setup and `/join` has no active World. Reuse a saved launcher with these values instead of rebuilding or recopying the test data on each restart. V0's private World is `vanguard-v0-check`.
- The persistent private Playwright installation is `.codex-work/browser-tools/node_modules/playwright/index.mjs`; set `AK5E_PLAYWRIGHT` to its absolute path for scripts that consume that variable. Its installed version must match a locally available Playwright Chromium; check the executable before attempting installation. Continue to use `launchTestBrowser()`.
- **Small images.** Assert text, state, console errors and DOM structure programmatically first. Capture a screenshot only for a state that needs eyes (layout, clipping, theme, readability), as an element or clipped screenshot (`locator.screenshot()` or `clip`), JPEG at about quality 70, viewport no wider than 1280 px. Open each with `view_image` once. About 15 viewed images per validator: a checkpoint needing more gets a second validator for the remaining checklists.
- **Rechecks go to a fresh validator** with only the affected checklist items and the previous finding. A long-lived validator re-sends every earlier image on every turn, which is where most of the old run's tokens went.
- If Foundry or the browser cannot run, record *visual inspection not performed* with the reason; those packages are reported as "implemented, UI unverified" with a `TODO.md` entry, never as accepted.

**Final QA** (Full and Critical packages): one fresh `final_qa` per checkpoint gets the user's original request, the approved plan, the paths of each package's merge diffs (`.codex-work/lanes/<id>/merge-<n>.diff`) and the command evidence (and the validator's per-image report for UI work). It does not get the planner's reasoning or the reviewer's summary in place of evidence.

The parent does not open screenshots, except when a verdict is UNCERTAIN, reports conflict, a defect needs a design or rules decision, or once to accept a substantial UI change (one representative image).

## 8. Failures, counting and escalation

| Classification | Route | Counts against implementer? |
| --- | --- | --- |
| Implementation defect | must-fix list to the worker, or promotion | yes, one per rejected submission |
| Incorrect or outdated test | tester fixes it (§6 step 4) | no |
| Ambiguous or contradictory requirement | parent; `planner` for the affected part | no |
| AK5e rules ambiguity | `rules_mapper`, then parent; log in `ak5e/DECISIONS.md`; ask the owner if gameplay changes | no |
| Architecture or plan flaw | `planner` re-plans the affected part | no |
| Environment or flaky failure | reproduce; the parent or tester reruns; `explorer` or `foundry_validator` diagnoses | not until confirmed as code |
| Security, data-loss or unsafe migration | stop the package; owner decides | stop, not count |
| Out-of-scope write (`lane.mjs check` exit 1) | reject the submission | yes (worker); test defect (tester) |
| Integration conflict (`lane.mjs merge` exit 2, or merged lanes break each other) | parent resolves or re-plans the split, then reruns the combined suite | no, unless evidence shows one lane's code is at fault |

- A WORKFLOW.md §3.2 (trust the table) violation is an implementation defect of at least high severity.
- **Counted failure:** one submission rejected for a demonstrable implementation defect at the gate, attack and review (together), or checkpoint. All findings against one submission are one failure. Iterations the worker runs inside its own self-test loop never count.
- **Ladder:** `worker` (Terra, 2 counted failures) → `worker_sol` (2) → stop. The counter resets on promotion; the history does not. A promoted worker gets the promotion packet (§9) and the same lane. At the stop, report the unresolved blockers, evidence and decisions needed. Offer `critical_reviewer` only as an owner decision, asked in one line with the reason. After an owner-approved diagnosis, `worker_sol` gets at most one more submission built on it; if that fails, stop for good.
- **Skip or halt early** for security or data-loss risk, architectural mismatch, a clear capability mismatch, churn, or two submissions with no progress. Record the reason.
- **Re-plans:** a material spec revision (v+1) resets the current tier's counter and is logged. More than two re-plans of one package go to the owner.
- **Disputes:** the parent rules on gate-time disputes; the reviewer adjudicates from the spec and evidence and may overturn the parent (the parent decides alone when there is no reviewer). A material dispute that remains goes to the owner; on Full and Critical paths the parent may ask `final_qa` first.
- **Deferred findings** (real but non-blocking, accepted by the owner or parent): file `bugs/pending/B-<next>-<severity>-<slug>.md` per `bugs/README.md`.

## 9. Handoffs

Every handoff is evidence, not proof. The original request, the approved spec and the frozen tests are the source of truth. Reports stay within the word limits in the role files.

```text
PLANNER → PARENT   packages: id · title · path · ui · depends on · owned files (worker / tests) · interfaces ·
                   acceptance criteria · visual checklist (ui: yes) · risks · open questions; queue order; overlap check
TESTER (draft)     WP id · lane · test files · criterion → test map · red/green table against unchanged code · assumptions
WORKER → PARENT    WP id · submission n · tier · changed files · self-test commands + exit codes (failing lines only) ·
                   behaviour per criterion · disputed tests with reasons · limitations · requested scope deviations
TESTER (attack)    WP id · submission n · commands + exit codes · expected vs actual · severity · reproducible? ·
                   frozen vs post-candidate · suspected wrong tests
REVIEWER           PASS | FAIL | BLOCKED · classification · must-fix list with paths:lines · dispute rulings
VISUAL REPORT      checkpoint · renderer · per checklist item: programmatic checks; per image: path, state shown,
                   checks, defects with on-screen location and likely cause, PASS/FAIL/UNCERTAIN · console errors · not inspected
FINAL QA           PASS | FAIL | BLOCKED per package · requirement checklist · risks · evidence · merge blockers
PROMOTION PACKET   original request · spec · lane id and path · current diff · frozen tests · reproductions ·
                   prior submissions and verdicts · open blockers ("you may discard the prior candidate")
PARENT → OWNER     changes · objective validation · caveats · escalations · next action needed
```

## 10. Ledger

Keep one file per task at `.codex-work/ledger/<YYYY-MM-DD>-<slug>.md` (git-ignored; `.codex/` is read-only to Codex). Append; never rewrite history. Lane metadata lives beside it in `.codex-work/lanes/`.

```text
# <task> · request <date> · plan: <planner | parent> · packages <n>
## WP <id> · path <p> (reason) · ui yes|no · depends <ids> · lane <id> · owned: <files>
tests frozen: <file> <sha256 prefix> ... · visual checklist frozen: yes|no|n/a
| sub | tier/model | gate → exit | attack | review | checkpoint | finding class | counted? |
promotions / skips / halts / review skipped: <reason>
test changes: <file> <old> → <new> (<who>, <reason>)
post-candidate tests: <file> <hash> (attack | replacement tester | spec v+1 | checkpoint regression)
merged: <time> · combined suite: <command → exit> · reverted: <time, reason> · checkpoint <n>: visual <verdict>, final_qa <verdict>
result: ACCEPTED | BLOCKED · elapsed <time> · tokens <if known>
```

At the end of the task, add a summary line: wall time, packages accepted, submissions per package, counted failures, defects found by gate / attack / review / checkpoint, and time spent waiting on agents. Use it to judge whether each layer pays for itself.

## 11. Isolation and the sandbox

- **What the sandbox allows.** In workspace-write mode `.git/`, `.codex/`, `.agents/` and `.aws/` are read-only, and the repo, `/tmp` and `$TMPDIR` are writable. So `git stash create`, `git worktree add`, `git add` and any write under `.codex/` fail. Read-only git commands (`git diff`, `git status`, `git log`) work. Lanes therefore are plain copies under `/tmp/ak5e-lanes/`, managed by `.codex/tools/lane.mjs`, and the ledger lives in `.codex-work/`.
- **Real boundaries:** `sandbox_mode = "read-only"` on planner, reviewer, final QA, explorer, rules mapper and critical reviewer. Workers and testers can write anywhere writable, so ownership is checked, not trusted: `lane.mjs check` runs at every gate and `lane.mjs merge` copies only owned files. A read-only role may be unable to run commands that write temp files; record that as an environment limit and have the parent or tester produce the evidence.
- **The main tree** is touched only by the parent: merges, shared-file edits, the combined suite and the checkpoint. Lanes never see each other's unmerged work; `lane.mjs refresh` pulls in what has merged since a lane was made.

## 12. Proving the pipeline runs

After changing this file or `.codex/`, check a new session (existing sessions keep their old defaults):

1. The session header shows `gpt-6-luna` and `xhigh`; the `spawn_agent` role list shows each role with the model and effort in §1.
2. `node --test .codex/tools/lane.test.mjs .codex/tools/lane-v2.test.mjs` passes, and `lane.mjs create`, `check`, `diff`, `merge --dry-run` and `remove` work inside the Codex sandbox (no "Read-only file system" errors); `diff` also runs from a read-only reviewer.
3. Run a small multi-package task, then inspect the newest `~/.codex/sessions/**/rollout-*.jsonl`:
   - every `spawn_agent` call has `"fork_turns":"none"` and the intended `agent_type`; no child calls `spawn_agent`;
   - one planner call for the whole request; up to 2 lanes live at once, started in parallel as soon as their dependencies merged;
   - each tester's draft answer comes before its worker's `spawn_agent` call, and the frozen hashes in `.codex-work/lanes/<id>.json` match at the gate;
   - one attack pass and at most one reviewer spawn per package before merge, run in parallel; each worker's submission count is small (most packages pass on the first);
   - `wait_agent` calls use 1800000 ms and few of them time out empty;
   - for `ui: yes` work, one fresh `foundry_validator` per checkpoint, its rollout shows `view_image` on small clipped images, and it was interrupted after its report;
   - the ledger exists under `.codex-work/ledger/` with the end-of-task summary line.
4. Seeded failure drill: tell the first worker to omit one acceptance criterion and to skip its self-test. The gate or attack must catch it, the counter must reach 1, and the fix must go to the same worker through `followup_task`.
