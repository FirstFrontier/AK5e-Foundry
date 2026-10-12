# B-294 · Medium · Unverified: Fear the Reaper marks a typed name only: no psychic damage, no Frightened-immunity check, no 1-hour expiry

Area: Guard / Reaper / Fear the Reaper (10th), Memento Mori link

**Found:** Guard audit unit 14 (Reaper), 2026-10-12.

**Evidence:** Source: the mark lasts 1 hour; when the marked Creature sees or hears the Reaper gain Ruin it takes 1d6 Psychic Damage unless immune to Frightened; sense direction; see it while Invisible ([source](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3417)). [reaper-features.mjs](../../ak5e/scripts/reaper-features.mjs#L317) spends the pool and stores `flags.ak5e.reaper.reaperMarkTarget = <free-text name>` ([L323](../../ak5e/scripts/reaper-features.mjs#L323)); the sheet asks for a typed name ([guard-sheet.mjs](../../ak5e/scripts/guard-sheet.mjs#L1000)). [reaperGainRuin](../../ak5e/scripts/reaper-features.mjs#L137) never offers the 1d6 roll. The card text promises "Deals 1d6 Psychic on seeing/hearing Ruin gain". The flag has no expiry, no Long Rest clear and no token/UUID, so Memento Mori later reads a stale name. The target is not checked as hostile or visible.

**Reproduce:** Node probe: level 10 Reaper `reaperFearTheReaper {targetName:"Orc"}`, then `reaperGainRuin`: gain receipt has no `formula`, no targets, status `complete`; flag stays `{reaperMarkTarget:"Orc"}` indefinitely. Undo restores flag and pool correctly (clean; B-133 not reproduced here).

**Verification limits:** Node probe and static review. DECISIONS L1916 states the psychic damage as implemented.

**Fixed means:** The mark is a real Creature reference with a 1-hour (or manual) expiry cleared by Undo and rest; a Ruin gain offers a player-clicked 1d6 Psychic roll for the marked Creature (with the Frightened-immunity warning, relayed to the GM client for unowned targets, undoable); or the card and DECISIONS state these effects are manual.
