# B-287 · Medium · Unverified: Retaliator checks no Go Forth prerequisite and cannot select Iai

Area: Guard / Musha / Warrior Spirit

**Found:** Guard audit unit 13 (Musha), 2026-10-12.

**Evidence:** [musha-features.mjs](../../ak5e/scripts/musha-features.mjs#L258) mushaRetaliator warns only on Aggression and level. Source [Ch.3 L3303](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3303): usable "after you have used your Go Forth Feature"; the Iai alternative is a Blood Price option, which carries the HP loss. Nothing looks for a live mushaGoForth receipt. mode is unvalidated (L269) and the sheet sends no mode ([guard-sheet.mjs](../../ak5e/scripts/guard-sheet.mjs#L284) uses the default dispatch at L1133), so Iai is unreachable and any string is accepted. Choosing Iai records no Blood Price cost.

**Reproduce:** Probe, level 10 Musha, no Go Forth used: mushaRetaliator succeeds with only the 2 Aggression spend; mode "banana" is accepted and reported as a melee attack.

**Verification limits:** Node probe against the real module and guard-fixture. Go Forth itself is also hit by existing [B-135](B-135-medium-unverified-guard-reaction-spent-before-receipt.md) (probe: an injected receipt-write failure left 0 Reactions and no receipt).

**Fixed means:** A warning appears when no un-undone Go Forth exists in the window; the dialog offers melee attack or Iai and validates it; the Iai choice links to a Blood Price use (see B-281, B-282).
