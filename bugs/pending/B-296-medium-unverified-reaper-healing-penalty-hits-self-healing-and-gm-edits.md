# B-296 · Medium · Unverified: Reaper healing penalty applies to self-healing and GM HP edits; its self-heal exemption is never triggered by dnd5e

Area: Guard / Reaper / healing reduction (Reaper Table "Healing Recieved")

**Found:** Guard audit unit 14 (Reaper), 2026-10-12.

**Evidence:** Source: the penalty applies "when another Creature attempts to restore Hit Points to you" ([source](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3340)). [reaper-features.mjs](../../ak5e/scripts/reaper-features.mjs#L374) exempts only `options.ak5eSelfHeal`, `options.source`, `options.origin === actor.uuid` or `options.subject`. `ak5eSelfHeal` is set nowhere in `ak5e/scripts`. dnd5e 5.3.3 passes `origin: <ChatMessage>` ([dnd5e.mjs](/tmp/ak5e-guard-test-data/Data/systems/dnd5e/dnd5e.mjs) L63167) or `originatingMessage`, and token-bar HP edits call `applyDamage(delta,{isDelta, ignore:true})` (L36686): none identify the healer. No production caller sets the exempt options (only tests do), so the Reaper's own potion/feature healing and GM corrections lose up to 20 HP. The same pattern sits in Musha ([musha-features.mjs](../../ak5e/scripts/musha-features.mjs#L299)). The floor at 0 is a logged ruling (DECISIONS L1979).

**Reproduce:** Node probe with real option shapes: Ruin 4, hp 20/45, `reaperPreApplyDamageHook(actor,-10,{hp.value:30},{isDelta:true,origin:{uuid:"ChatMessage.m"}})` gives 22 (expected 30 for self-heal); `{isDelta:true,ignore:true}` also gives 22.

**Verification limits:** Node probe plus a read of the installed dnd5e 5.3.3 source; not exercised in Foundry. Healer identity may need the chat message author/speaker.

**Fixed means:** The penalty applies only when the source of the healing is another Creature (derive the healer from the originating message or offer the player's per-use reading), self-healing and `ignore` GM edits are exempt, and the written hp.value is clamped to the maximum (today 40/45 plus a 20 heal writes 52 into source data at L387; dnd5e's derived data hides it, but a later max increase would expose it).
