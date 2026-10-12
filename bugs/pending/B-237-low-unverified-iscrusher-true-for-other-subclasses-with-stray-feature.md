# B-237 · Low · Unverified: isCrusher is true for a Guard of another subclass that owns a Crusher feature Item

Area: Crusher / branch identity

**Found:** Crusher audit (unit 8), 2026-10-12. Probe: Node, real module + guard-fixture.

**Evidence:** [isCrusher](../../ak5e/scripts/crusher-features.mjs#L48) returns true when `guardBranch(actor) === "crusher"` or when any Item has a `chapterThreeId` starting `subclass-feature-guard-crusher`, even if the actor's subclass Item is another branch. Related shared-identity bugs: B-144 (Fearmonger affects other subclasses).

**Reproduce:** Probe: a Guard with the Centurion subclass Item plus one leftover Item flagged `subclass-feature-guard-crusher-x` gives `isCrusher` true. That Actor then gets the Crusher panel next to the Centurion panel ([guard-sheet.mjs](../../ak5e/scripts/guard-sheet.mjs#L119)), Heavy Metal on its hook and Foecrusher pool. A Guard with no subclass and no Crusher Item correctly gives false.

**Verification limits:** Node only; how often leftover feature Items remain after a branch change was not observed.

**Fixed means:** When a subclass Item is present, branch identity comes from it alone; the feature-Item fallback applies only when no subclass Item exists. A test covers the mixed case.
