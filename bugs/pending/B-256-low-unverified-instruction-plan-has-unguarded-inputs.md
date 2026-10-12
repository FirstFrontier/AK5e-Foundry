# B-256 · Low · Unverified: Instruction plan has unguarded inputs (free flag, silent default, stray-feature branch check)

Area: Instructor / Instruction plan, isInstructor

**Found:** Guard audit unit 10 (Instructor), 2026-10-12. Node probe.

**Evidence:** (1) `data.free` skips the Instruction Die cost and its warning ([instructor-features.mjs](../../ak5e/scripts/instructor-features.mjs#L196)), so a free use is never listed as an override on the public card (WORKFLOW §3.2.3). The UI never sends it; the `game.ak5e.guard.use` API and retries (`receipt.data`) do. (2) A missing choice silently becomes `defendYourself` ([L191](../../ak5e/scripts/instructor-features.mjs#L191)) where a malformed operation should hard-stop. (3) `isInstructor` ([L57](../../ak5e/scripts/instructor-features.mjs#L57)) is true for any Guard holding an item whose `chapterThreeId` starts `subclass-feature-guard-instructor`, whatever the actual subclass, so a re-specced Crusher still gets Instructor pools, buttons and plans.

**Reproduce:** Probe: pool 0/4, `instruction` without `free` -> warning; with `free:true` -> succeeds, no warning. A level-10 Crusher plus one stray Kingmaker feature item: `isInstructor` returned `true`.

**Verification limits:** Node only; the stray-item case needs a hand-edited Actor.

**Fixed means:** Free uses are limited to Kingmaker/Breach/From Experience paths (or listed as an override on the card); a missing Instruction is rejected; `isInstructor` follows the Guard subclass only. Tests for each.
