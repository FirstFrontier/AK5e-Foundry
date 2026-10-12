# B-298 · Low · Unverified: Reaper cards, table effect text and DECISIONS diverge from the source (invented mechanics, silent Push/Press rename)

Area: Guard / Reaper / source fidelity (WORKFLOW §2.5-2.6)

**Found:** Guard audit unit 14 (Reaper), 2026-10-12.

**Evidence:** (1) The plan title (the chat card) is "Press the Attack: Lingering Violence" ([reaper-features.mjs](../../ak5e/scripts/reaper-features.mjs#L209)); the source heading is "Push the Attack: Lingering Violence (1 Aggression)" ([source](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3342)). DECISIONS L472 says UNRESOLVED, keep original names, but DECISIONS L1948-1950 rules them "verified stylistic variations ... implemented canonically under Press the Attack". The two entries conflict and the rename was done silently. (2) DECISIONS L1905-1918 describe mechanics absent from the source: "+2 Ruin for Elite/Leader", "Advantage on Intimidation at Ruin 3+", "+10 ft Speed at Ruin 6+", "Resistance to Necrotic and Cold at Ruin 9+", "Death's Due", "Master of the Scythe", Fear the Reaper "within 60 ft", Memento Mori "when Curtainfall or Reap crits". None are in code, but the log is wrong. (3) Table effect strings ([L26-33](../../ak5e/scripts/reaper-features.mjs#L26)) shorten the source: Ruin 2 drops "may", Ruin 6 drops "may not finish a movement in the same space", the Reap crit text says "targets gain Vulnerability" ([L248](../../ak5e/scripts/reaper-features.mjs#L248)) instead of "non-Elite, non-Leader ... Vulnerable to its Damage", and the area is stored as "10-foot sphere" ([L236](../../ak5e/scripts/reaper-features.mjs#L236)) where the source says "10-foot-radius Sphere centered on you". (4) Effects are not shown cumulatively: the sheet badge ([guard-sheet.mjs](../../ak5e/scripts/guard-sheet.mjs#L60)) shows Ruin and crit thresholds only, and a gain card lists just the newest tier's effect.

**Reproduce:** Static review; Node probe of the gain card at Ruin 3 shows no Ruin 2 effect.

**Verification limits:** Static review. The audit may not edit DECISIONS.md; this bug asks the owner to correct it.

**Fixed means:** Original names restored (or a single recorded owner ruling), DECISIONS Reaper section matches the source text, effect strings quote the source, and the sheet lists all active cumulative effects and the healing penalty.
