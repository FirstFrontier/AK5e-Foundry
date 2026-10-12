# B-291 · Medium · Unverified: Curtainfall expends all Ruin when the use is confirmed, before any attack or hit

Area: Guard / Reaper / Death's Design: Curtainfall

**Found:** Guard audit unit 14 (Reaper), 2026-10-12.

**Evidence:** Source: "If that Attack hits, that Attack deals 1d6 additional Damage ... for each Ruin ... After you have dealt Damage in this way, all of your Ruin is expended" ([source](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3390)). [reaper-features.mjs](../../ak5e/scripts/reaper-features.mjs#L284) spends all Ruin inside `apply()` at confirm time. The plan never makes, watches or asks about the Attack Roll, so a miss still loses all Ruin. The receipt is `awaitingRoll` with an `Nd6` formula ([L280](../../ak5e/scripts/reaper-features.mjs#L280)); nothing ties the roll button to a hit.

**Reproduce:** Node probe: Reaper level 5 at Ruin 5, `reaperCurtainfall {targetName}`: Ruin reads 0 immediately, receipt `status: "awaitingRoll"`, `formula: "5d6"`, `targets: []`, no hit/miss step. After a miss only a manual Undo restores Ruin.

**Verification limits:** Node probe only. Whether the module detects the hit (native attack hook) or offers an "it hit" step is a design choice; WORKFLOW §3.2.5 forbids auto-rolling the attack. Same confirm-skipping path as B-129 for the sheet button.

**Fixed means:** Ruin is expended only after the player reports/records that the Attack hit and damage was dealt (for example when the damage roll is clicked, with Undo restoring it); a miss or cancelled roll leaves Ruin untouched. The bonus dice stay a player-clicked roll and are not doubled on a crit.
