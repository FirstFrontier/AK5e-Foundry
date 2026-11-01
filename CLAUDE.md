@AGENTS.md

# Claude Code: parallel agent team (owner's standing instruction)

This section applies to Claude Code only. It is the repository owner's explicit standing
instruction, so for Claude it replaces the "delegate selectively" default in AGENTS.md §6 and
WORKFLOW.md §8 step 3. Every other rule in AGENTS.md and WORKFLOW.md still applies.

## Team shape: 1 head + up to 4 workers

- **Head (you, the main session):** owns interpretation, rules decisions, design, acceptance
  criteria, integration, diff review, `TODO.md` / `ak5e/DECISIONS.md` updates and the final
  report. The head plans and splits the work, dispatches it, verifies what comes back and
  integrates it. Keep the head's own hands-on work to what can't be split off or needs judgment.
- **Workers:** **at most 4 running at the same time.** Never exceed 4, and do not let workers
  spawn their own sub-agents.
- **Default to parallel.** For any non-trivial task, split it into independent pieces and launch
  them **in the same message** (several Agent calls in one response) rather than one after
  another. Typical splits: source-chapter inventory ‖ code-path discovery ‖ existing-test
  inventory; then implementation of separate files ‖ test authoring ‖ validation.
- Do the work inline without workers only when it is trivial (a one-file edit, a quick lookup or
  answering a question), or when splitting would cost more than it saves.

## Models: Sonnet implements, Haiku challenges, Opus reviews and escalates

| Worker model | Use for | Agent definitions |
| --- | --- | --- |
| **Haiku** (`haiku`, high effort) | Adversarial test suites written against the spec in parallel with the implementer, bug hunting, searches, inventories, mechanical extraction, simple command checks, narrow re-checks of one screenshot | `tester`, `bug-hunter`, `explorer` |
| **Sonnet** (`sonnet`) | Implementation (high effort), rules mapping, Foundry/browser validation, screenshot review | `implementer`, `rules-mapper`, `foundry-validator` |
| **Opus** (`opus`) | Routine cross-model review (medium effort); taking over a task the Sonnet implementer failed twice (high effort); final bug squashing and high-risk independent review (max effort) | `routine-reviewer`, `problem-solver`, `critical-reviewer` |

- Implementation work runs as adversarial pairs: one Sonnet implementer owns the production files and
  one Haiku challenger owns a separate adversarial test file. Run up to **2 pairs at once, one per
  parallel lane** (see "Parallel lanes" below); that is the whole 4-worker cap.
- Pick the cheapest model that can do the task. Use Haiku when the task is mechanical and Sonnet
  when it needs judgment. Reserve Opus for review and escalation, and Fable for owner-authorized cases. When you use the
  generic `general-purpose`/`Explore` agents, pass `model` explicitly so they don't inherit the
  head's model.
- Check which model actually ran when it matters, and report it.
- The head runs on `opusplan` (`.claude/settings.json`): Opus in plan mode, Sonnet otherwise. Plan anything
  beyond a small change in plan mode or through the Opus `Plan` agent.
- Usage budget: the head's re-read context was ~73% of measured cost. Read line ranges found with Grep
  instead of whole files, send multi-file reading to `explorer`/`Explore`, wait on long commands with a
  timeout instead of polling, rerun tests only after a relevant change, and start a new session for an
  unrelated task. Settings compact at a 200k-token window and cap one file read at 10,000 tokens.

## Parallel safety

- **One writer per file.** Give each editing worker an explicit, non-overlapping list of files it
  owns. Never let two workers edit the same module, compendium pack, manifest, `TODO.md` or
  `DECISIONS.md` (the head edits the last two itself).
- When two or more workers will edit files at the same time, isolate them in separate lanes (see
  "Parallel lanes" below) and merge their diffs yourself. Read-only workers need no isolation.
- Implementation waits on reviewed rules mappings. Order work that depends on other work into
  sequential waves, and run each wave in parallel.
- Every assignment must be self-contained, per AGENTS.md §6: scope, source chapter(s), allowed
  files, read-only or edit, deliverable, acceptance criteria, tests, required evidence and open
  decisions. Workers start cold, so pass paths and short excerpts, not "see above".
- Workers' "done" is a claim, not validation. The head inspects diffs and runs or checks the tests
  before accepting. Screenshot viewing stays with workers (AGENTS.md §6.2).
- If a worker fails twice on the same issue, don't re-send the same prompt. Change approach, take
  it over, or escalate that single task.

## Parallel lanes: up to 2 at once

The owner allows **2 independent work packages ("lanes") in parallel**, each with its own
implementer + challenger pair (4 workers in total, the cap above). Don't split work only to fill
lanes: a tightly coupled change stays one package in one lane.

- **Lane copies, not git worktrees, when the baseline is uncommitted.** A worktree is built from
  HEAD and would miss uncommitted work. Create each lane with
  `node .codex/tools/lane.mjs create <id> --own <production files> <test files> --note "<title>"`; it
  copies the current tree to `/tmp/ak5e-lanes/<id>`. Workers read, edit and run only there. Use
  `isolation: "worktree"` instead only when the baseline is committed and clean.
- **Disjoint ownership.** `lane.mjs create` refuses owned paths that overlap any lane not yet
  `remove`d, merged lanes included. Packages needing the same file are merged into one or ordered by
  dependency. A dependent package starts after its dependency is merged.
- **Head-owned files.** Lanes never own `TODO.md`, `ak5e/DECISIONS.md`, `bugs/`, manifests,
  `package.json`, generated pack output, test runners/registries, or shared wiring such as
  `ak5e/scripts/ak5e.mjs`. The head edits those in the main tree. Never copy a lane's stale
  copy of a head-owned file over main.
- **Per lane:** the challenger drafts tests from the spec first and the head freezes them
  (`lane.mjs freeze`); the implementer works until they pass and never edits frozen tests; the
  challenger then attacks the candidate in its own file. The head runs `lane.mjs check <id>` (no
  out-of-scope writes, frozen files unchanged) and the lane's tests before accepting.
- **Serialised integration.** Merge one lane at a time (`lane.mjs merge <id>`, `--dry-run` first if
  unsure), then run the combined regression suites in main. A failure after a clean merge is an
  integration defect, routed to the lane merged last unless the evidence points elsewhere.
  `lane.mjs refresh <id>` brings a still-open lane up to date after another lane merges.
- **Free ownership.** After a package is accepted (or dropped, with any merge reverted), run
  `lane.mjs remove <id>` so its files can be owned again.
- Preserve what lanes produce: copy lane-owned files to `.codex-work/lanes/<id>/` before any long
  pause, because `/tmp` may be cleared.
