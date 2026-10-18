# B-146 · High · Unverified: Brutal Execution target resolution is incomplete

Area: Centurion / targets, saves, conditions and GM relay

**Found:** Codex Artsblade/Centurion/Brawler audit, 2026-10-12.

**Evidence:** [guard-sheet.mjs](../../ak5e/scripts/guard-sheet.mjs#L457) supplies no targets. [centurion-features.mjs](../../ak5e/scripts/centurion-features.mjs#L121) marks API targets ready before saves and omits tag.condition; [feature-tags.mjs](../../ak5e/scripts/feature-tags.mjs#L160) therefore supplies no status. Missing validateTarget fails [play-uses.mjs](../../ak5e/scripts/play-uses.mjs#L207). Source: [Chapter 3](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2573).

**Reproduce:** Sheet use spends Aggression with no target changes. The prior API relay probe failed with 'The recorded change is not one this use can make.' Owned targets can receive a label without an actual Frightened status.

**Verification limits:** Recorded from the prior audit's Node probes and/or static review; no new runtime tests or fresh Foundry reproduction in this tracking change. Historical screenshots alone do not certify player behavior.

**Fixed means:** Collect affected targets, provide owner-clicked WIS saves, resolve only the reviewed outcome, and validate automatic unowned-target relay/undo. Show kill/timing/range warnings; do not silently add GM approval.

**Progress (2026-10-18, unit 07):** Plan side done in `ak5e/scripts/centurion-features.mjs`. `brutalExecution` accepts `data.targets` (`[{uuid,name}]`, Actor/Token UUIDs, as the sheet sends them), warns on no kill (`killed`), no targets, range, a missing Reaction and a missing Creature, posts a `[[/save ability=wis]]` link and applies nothing at cast. New command `brutalExecutionFailed` ({ `useId`, `targetUuid`, `failedSave:true` }) applies Frightened (`tag.condition: "frightened"`, expires at the end of the Centurion's next Turn) and posts the Psychic Damage for the owner's Roll button; unowned targets go through the GM relay, guarded by `validateTarget`. Tests and a live Player + GM run (owned and unowned target, undo) pass. **Still open on the sheet:** a kill checkbox (`killed`, optional `killedUuid`), `asReaction`, and a per-Creature "failed save" control that calls `brutalExecutionFailed`; without them every Brutal Execution warns "no kill" and Frightened cannot be applied from the sheet. Close after that lands.
