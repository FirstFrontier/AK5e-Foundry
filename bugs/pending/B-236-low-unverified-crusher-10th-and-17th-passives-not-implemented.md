# B-236 · Low · Unverified: Additional Reach, Realmrending Blow and Execution have no mechanics but are recorded as done

Area: Crusher / Divided when Conquered, Heroic Killing Blow

**Found:** Crusher audit (unit 8), 2026-10-12. Static review plus probe.

**Evidence:** [Additional Reach](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2693) gives Heavy Melee Weapons the Reach Property; nothing in crusher-features.mjs grants it (grep "reach": comments only). [Realmrending Blow](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2705) is only a flag, `ignoresPhysicalResistance:true`, on a chat receipt ([crusher-features.mjs](../../ak5e/scripts/crusher-features.mjs#L284)); the damage pipeline never reads it. Execution ([L2703](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2703)) only prints "dies instantly" on the card; no target is selected or changed, and Heroic Killing Blow does not check that a Heroic Blow was made. [DECISIONS.md](../../ak5e/DECISIONS.md#L1435) states Heroic Killing Blow "executes foes ... and ignores Physical Damage resistance".

**Reproduce:** Probe: `heroicKillingBlow` with `targetHp:10` returns `executed:true` on a fresh actor that never used Heroic Blow; no Actor or token is changed. Crusher Heavy weapons show no Reach.

**Verification limits:** Node only. The item descriptions carry the source text, so a manual procedure exists; the defect is the "done" claim and the card wording ("dies instantly") that reads as an applied effect (WORKFLOW §4.4: do not label manual instructions as automatic).

**Fixed means:** Either implement (Reach on wielded Heavy Melee Weapons, resistance bypass on a Heroic Blow, GM-relayed kill with undo) or label these as manual on the card and correct DECISIONS/TODO.
