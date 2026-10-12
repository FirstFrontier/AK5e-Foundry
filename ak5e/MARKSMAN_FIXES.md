# Marksman bug repair — 2026-10-11

Scope: `bugs/fixed/` B-110–128 (Marksman, Anti-Air and Artilleryman).
Source: Chapter 3 Marksman and branches; Chapter 1 Martial DC; Chapter 4 Splash,
Deadly and ranged weapon properties. Stable generated records/packs are unchanged.

## Changed behavior

- B-110/112: native V13 header control; actual confirm/cancel with cost and target
  summary; warnings/readings reuse the shared callback interface. Cards render
  Undo/Retry/Roll and explicit owner weapon/save controls. Target owners can roll
  their own saves without owning the source Actor.
- B-111/128: record returned flag/resource updates before applying them. The
  applied marker commits in the same update as costs/benefits. Deferred Reactions
  use a stable ledger receipt. Retry never double-spends or replays costs over a
  later use; undo refunds only committed costs. Flag undo restores prior values
  (including absent/deleted keys), preserving later edits with a visible conflict
  note. This does not solve simultaneous writes from separate clients.
- B-113: use all six generated Artilleryman subclass-feature identities. Repair
  only exact old generated placeholders, retaining embedded Item IDs. Preserve
  authored legacy text/source IDs and report it rather than replacing it.
- B-114/116: retain existing HP/abilities; add only selected new gains and track
  applied levels. Migrate version-1 saved ASIs as already included. Preview binds
  complete choices/current state; malformed inputs fail, source budgets/skill
  counts/caps warn. Existing HP defaults to already included; for a new character,
  explicitly select missing level gains.
- B-115: native tool/launcher proficiency grants; visible complete manual
  Fighting Style, Talent/module and starting-equipment procedures. These choices
  are not all automatically added as inventory Items.
- B-117/118: lock and retarget retain a single expiry and selected bonus;
  predicates reject expired or legacy durationless locks. Initiative events use
  `raw.actor`, canonical resource pools and event receipts. One adapter applies
  each recovery; the general pool hook cannot double-grant it.
- B-119/120: Deadly Fighter applies to the first completed Deadly attack each
  combat Turn; cancellation retains it. Close and Personal handles opposing
  advantage/disadvantage flags. Weight of Fire changes no later roll; the owner
  turns off Advantage for the chosen roll and starts the repeat from the card.
- B-121/122: airborne means an explicit off-ground fact/status, not elevation or
  fly speed. Last-Turn movement facts remain separate. Last Option expires at a
  minute, grants one free Option on each own Turn and exposes manual extra attacks.
  The owner can end it explicitly for manual timing outside combat.
- B-123/124: trigger/repeat warnings, guided resolution notes, real damage-instance
  input and owner-operated damage/save/weapon buttons. Area Denial timing/height,
  immunity nominations, lingering saves, cumulative reductions and movement are
  complete manual procedures, not automatic target changes.
- B-125–127: extra dice affect only definite Thunder damage components. Unknown
  or alternative types are untouched. Siege doubling is applied manually per
  recipient (the native damage API does not read `options.multiply`). Deployment
  never silently chooses `(0,0)`; unspecified secondary damage stays unspecified.
  Visible procedures cover Splash, ten-minute automatic detonation, disarm,
  no chaining, collision, DC/radius, Loading and Thunder/self-damage defenses.
  Deployment preserves damage-source identity for manual self-immunity.
  Detonation and Secondary Detonation cards omit native attack controls because
  Splash requires saves and makes no Attack Rolls (C4:197–198).

## Decisions and manual boundaries

Martial DC requires an explicit STR/DEX choice, made reversibly from the panel;
Anti-Air also accepts a temporary per-use selection. At level 11, Target Lock
offers the source table's 11 vs heading's 12 reading. A GM ruling wins; a player's
choice applies only to that lock. Without a ruling, level-11 initiative recovery
is explicitly manual; level 12 is unambiguous. No new permanent ruling is made.

Native roll dialogs remain owner-operated. The manual procedures above change
no target documents; target saves/movement/conditions must be resolved by the
table. Outside combat, track Turn-based allowances manually. Source descriptions
remain authoritative for every feature; this repair is not a complete Marksman
automation audit.

## Verification

- `npm test`: final whole suite passed after enabling Node subprocess checks;
  **604 passed, one existing optional test skipped**. It included Caster, Defender and Guard
  regressions against the shared engine change.
- `npm run test:marksman`: final focused run **80/80** passed, including six shared
  engine failure/undo tests and three sheet confirmation/permission/Splash tests.
- Live GM/player, screenshots and restart acceptance: tracked in the rendered
  record below. Static tests do not substitute for rendered inspection.

Command logs: `/tmp/marksman-fixes-all-test.log` and
`/tmp/marksman-fixes-final-focused.log`. A read-only Sol reviewer checked the
shared engine, rules fidelity and regression evidence; the parent corrected its
remaining confirmation-cost labels and reran both suites. Luna workers handled
scoped core/progression/engine changes; the parent integrated and reviewed them.

No pack generation, manifest/version change, public release or production World
change is included. Locked-release-pack imports remain a project release task.
Unrelated concurrent Guard edits are outside this repair.

## Rendered repair acceptance

The Luna `foundry_validator` agent runs the sanctioned `launchTestBrowser()`
against a private copy of the `standard-test` World, with Foundry **13.351**,
D&D5e **5.3.3** and AK5e **0.5.6**. The measured renderer is
`ANGLE (Mesa, AMD CEDAR, OpenGL ES 3.1)`; vendor `Google Inc. (Mesa)`.
Production data is untouched. Initial header-click evidence is in
`/tmp/ak5e-marksman-live-codex-20261012/results/`; final runtime screenshots and
reports are in `/tmp/ak5e-marksman-live-codex-resume/results/`. Directory names are
retained; the actual inspection date is 2026-10-11.

Verified through rendered player controls:

- All six Artilleryman source feature identities/descriptions are granted. A
  representative Tools of the Trade native Item sheet displays readable rules.
- A non-GM owner clicks the native V13 Marksman menu entry and opens the panel.
  Later harness runs reopen the same panel through its API; those calls are
  panel setup, not additional header-click evidence.
- Cancelling Target Lock leaves flags, resources and chat unchanged. Out-of-turn
  use offers Use anyway/Cancel; override spends the use, posts the public warning
  card and stores a 60-second lock. The new message contains no rolls. Advancing
  World time beyond expiry deactivates its predicates. Confirmed public-card Undo
  restores the prior flags and pool value.
- Player deployment, detonation, confirmed detonation Undo and disarm execute
  through the panel/card dialogs. Public cards retain the complete manual
  point/timer/Splash procedures. Detonation Undo restores the active munition.
- After the source-correct renderer fix, a fresh player detonation card has Undo,
  no native attack control, the no-Attack-Roll instruction and no message rolls.
- Browser reload preserves Actor flags/receipts. The validator stopped and
  restarted its own private server, rejoined as Standard Player and verified the
  disarmed munition, Target Lock pool 1, Delayed Detonation pool 0 and four
  persisted receipts including completed disarm. Restart helper:
  `/tmp/marksman-restart-check.mjs`.

The validator opened the final sheet, panel, confirmation, warning, card, undo
and native Item screenshots with `view_image`. The notes-label wrap it reported
was fixed and rechecked: text now wraps above the textarea, with no stranded text
below it. Its [per-image visual report](/tmp/ak5e-marksman-live-codex-resume/visual-report.md)
records every image and verdict. The parent opened only
`12-final-detonation-card.png` for final acceptance: the entire manual detonation
card and Undo are readable, with no attack shortcut. An unrelated User
Configuration dialog remains over the board; this is not accepted as a clean
whole-screen composition. The collapsed-sidebar cleanup captures `12b`/`12c`
are explicitly failed evidence. All other image checks rest on the validator's
written report. Its browser runs closed in `finally`, and its private server
shut down cleanly.

This focused acceptance does not certify the full class checklist: an independent
GM header click, target-owner save/damage rolls, unowned-target relay, encounter
locking, two-client races and
locked-release-pack import acceptance remain outside this rendered run. The
permission/owner-control behavior has focused static coverage; manual resolution
does not itself mutate targets.
