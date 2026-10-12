# B-297 · Low · Unverified: Reaper plans accept invalid input and skip prerequisite warnings (Gain amount, Reap area, Memento Mori mode and mark)

Area: Guard / Reaper / plan validation (WORKFLOW §3.2.3: warn, do not block)

**Found:** Guard audit unit 14 (Reaper), 2026-10-12.

**Evidence:** [reaperGainRuin](../../ak5e/scripts/reaper-features.mjs#L141) takes `Number(data.amount ?? 1)` with no integer/positive check. A fractional or non-numeric amount makes [getReaperTableEntry](../../ak5e/scripts/reaper-features.mjs#L158) return undefined and `apply` throws a TypeError; `-2` posts "gains +-2 Ruin". [reaperReap](../../ak5e/scripts/reaper-features.mjs#L236) lets a free-text `data.area` bypass the 13th-level sphere gate, and `areaSphere` below 13th is silently ignored with no warning. Reap and Curtainfall never warn when no Melee Weapon is wielded (source: "While you are wielding a Melee Weapon", [source](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3388)). [reaperMementoMori](../../ak5e/scripts/reaper-features.mjs#L340) treats any `mode` other than "vulnerability" as splash, and with no mark stored it silently uses "Marked Target" (source needs a Creature with your Mark taking Psychic Damage from the Mark, [source](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3425)). Ruin decay at 0 raises a "Use anyway" warning and records a bogus "Ruin short by 1" (a gain at 10 raises the "caps" warning, see B-290).

**Reproduce:** Node probe: `reaperGainRuin {amount:1.5}` throws "Cannot read properties of undefined (reading 'reapCritBonus')"; level 5 `reaperReap {area:"10-foot sphere"}` records a sphere; level 17 `reaperMementoMori {mode:"bogus"}` succeeds with target "Marked Target"; `reaperDecayRuin` at 0 stores shortfall "Ruin short by 1".

**Verification limits:** Node probe; the sheet itself sends fixed amounts, so exposure is any other caller of `guardUses.command`. Nothing is persisted on the TypeError.

**Fixed means:** Amounts and modes are validated (`need`), the sphere option is level-gated, missing weapon/mark/level become listed warnings with "Use anyway", and a no-op decay does not record a shortfall.
