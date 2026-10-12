# B-295 · Medium · Unverified: Ruin reset at 0 HP runs on every client, writes without an owner check, and has no undo receipt or chat note

Area: Guard / Reaper / Reaper's Ruin (lose all Ruin at 0 HP)

**Found:** Guard audit unit 14 (Reaper), 2026-10-12.

**Evidence:** Source: "You lose all Ruin if you are reduced to 0 Hit Points" ([source](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3336)). [reaper-features.mjs](../../ak5e/scripts/reaper-features.mjs#L404) registers `Hooks.on("updateActor")`, which runs on every connected client. Each calls `actor.update(...)` ([L410](../../ak5e/scripts/reaper-features.mjs#L410)) with no `actor.isOwner`, GM-election or `userId` check, so non-owner players raise permission errors and owner plus GM both write. The write is a raw flag update: no `guardUses` receipt, no card, so the loss cannot be undone from the sheet (WORKFLOW §3.2.6; a GM HP correction that briefly hits 0 destroys Ruin permanently). The hook has no test (`Hooks.on` is stubbed).

**Reproduce:** Node probe: capture the `updateActor` handler, call it with a non-owner Reaper actor at hp 0 and Ruin 7: `actor.update({"flags.ak5e.resourcePools.reaperRuin.value":0})` is issued (1 write), Ruin reads 0, `guardUses.state(actor).undo.length` is 0.

**Verification limits:** Node probe only; the Foundry permission error for non-owners is expected but not observed. Related: B-031 (kill detection misses direct HP edits).

**Fixed means:** Only the acting owner's/elected GM client applies the reset, once, through a recorded receipt and public note that Undo can reverse within the encounter window; non-owner clients do nothing.
