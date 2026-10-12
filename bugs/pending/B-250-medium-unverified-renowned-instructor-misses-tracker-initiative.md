# B-250 · Medium · Unverified: Renowned Instructor never fires for Combat Tracker initiative rolls

Area: Instructor / Superior Instruction (13th)

**Found:** Guard audit unit 10 (Instructor), 2026-10-12. Static review plus Node probe.

**Evidence:** [instructor-features.mjs](../../ak5e/scripts/instructor-features.mjs#L311) listens only to `dnd5e.rollInitiative`. In the installed D&D5e 5.3.3 (`Data/systems/dnd5e/dnd5e.mjs` L37875-37902) that hook is called only from `Actor5e#rollInitiative`. `Combat5e#rollAll/rollNPC/rollInitiative` (same file, L79092-79120) go through `Combat#rollInitiative` and never call it, so the Combat Tracker dice button, Roll All and Roll NPCs skip the benefit. The pool kernel already has an `initiative` trigger driven by `updateCombatant` ([resource-pools.mjs](../../ak5e/scripts/resource-pools.mjs#L428)). Source: [L2884](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2884) "When you roll Initiative...".

**Reproduce:** Probe (scratchpad, not in repo): `renownedInstructorInitiative` itself is correct (L13, pool 0/5 -> 3). Roll initiative from the Combat Tracker for an Instructor at 0 dice: no hook, pool stays 0.

**Verification limits:** Hook routing read from the installed dnd5e source; not exercised in a running Foundry.

**Fixed means:** Every way of rolling initiative for the Instructor (sheet, tracker, Roll All/NPC) restores dice to ceil(max/2) once per roll, with a test covering both entry points. Related: B-251.
