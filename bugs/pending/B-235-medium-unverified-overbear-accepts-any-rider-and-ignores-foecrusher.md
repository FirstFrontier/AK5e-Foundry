# B-235 · Medium · Unverified: Overbear accepts any rider names and is not tied to a Foecrusher attack

Area: Crusher / Press the Attack: Overbear

**Found:** Crusher audit (unit 8), 2026-10-12. Probe: Node, real module + guard-fixture.

**Evidence:** [Overbear](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2680): usable "when you make an Attack a Foecrusher"; the second effect must differ from "the original" and be one of the four Foecrusher Effects. The plan ([crusher-features.mjs](../../ak5e/scripts/crusher-features.mjs#L189)) only checks `primaryRider !== secondaryRider`, unlike `foecrusher`, which validates against the four names ([L144](../../ak5e/scripts/crusher-features.mjs#L144)). It never looks for a Foecrusher use on this attack, so no prerequisite warning exists, and the sheet dialog ([guard-sheet.mjs](../../ak5e/scripts/guard-sheet.mjs#L416)) asks again for the primary rider with defaults staggering/dazing, so the Foecrusher card and the Overbear card can name different "original" effects. If either rider is `renewing`, the Overbear summary reads as applied but the plan creates no heal entry or Hit Die cost (unlike `foecrusher`). The plan's `rolls` array is not read by the engine; the 1d10 works only via `receipt.formula`.

**Reproduce:** Probe: `overbear` with riders `bogus`/`xyz`, 0 Foecrusher uses and no Foecrusher receipt succeeds and spends 2 Aggression. After a Foecrusher `dazing` use, Overbear with primary `staggering` succeeds with no warning about the mismatch. (Aggression shortfall, override and the 1d10 roll button behave correctly.)

**Verification limits:** Node only.

**Fixed means:** Riders must be among the four effects and differ; Overbear warns when no non-undone Foecrusher use is recorded for this attack and takes the original rider from that use (or from the same dialog as Foecrusher); undo restores Aggression as today.
