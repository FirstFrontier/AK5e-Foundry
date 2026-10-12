# B-293 · Medium · Unverified: Reaper Reap/Curtainfall crit ranges and crit riders are never applied to any roll

Area: Guard / Reaper / Critical Scaling, Critical Death's Design, Ruin gain

**Found:** Guard audit unit 14 (Reaper), 2026-10-12.

**Evidence:** The Reaper Table matches the source (11/11 rows, [source](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3350)) and the threshold = 20 - bonus ruling is DECISIONS L1977. But [getReapCritThreshold](../../ak5e/scripts/reaper-features.mjs#L74) and [getCurtainfallCritThreshold](../../ak5e/scripts/reaper-features.mjs#L86) only feed the sheet badge ([guard-sheet.mjs](../../ak5e/scripts/guard-sheet.mjs#L60)) and card text. No Reaper `dnd5e.preRollAttack*` hook exists, so the native Curtainfall Attack Roll uses the weapon's normal crit range; "ignores Resistance to Physical Damage" on a Curtainfall crit and Reap's Vulnerability are text only. Crits and kills never add Ruin (only the manual button does, [guard-sheet.mjs](../../ak5e/scripts/guard-sheet.mjs#L297)); `calculateSwarmKills` is exported but unused.

**Reproduce:** Static review plus probe: no Reaper attack-roll hook exists; a Reaper at Ruin 6 shows "Curtainfall Crit: 14+" but a native weapon d20 of 15 is not a crit.

**Verification limits:** Static review and Node probe. Manual Ruin buttons can be acceptable if documented, but the sheet implies the thresholds are in force.

**Fixed means:** Either the thresholds patch the owner's own Reap/Curtainfall attack roll (threshold/formula part only; never starting the roll) and crit riders are carried to the card, or the sheet and cards say these are reminders and the Ruin triggers are documented as manual.
