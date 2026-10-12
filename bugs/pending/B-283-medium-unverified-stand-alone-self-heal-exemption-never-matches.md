# B-283 · Medium · Unverified: Stand Alone self-heal exemption never matches real dnd5e options

Area: Guard / Musha / Stand Alone

**Found:** Guard audit unit 13 (Musha), 2026-10-12.

**Evidence:** [musha-features.mjs](../../ak5e/scripts/musha-features.mjs#L299) exempts only options.ak5eSelfHeal, options.source, options.origin === actor.uuid or options.subject.actor.uuid. Nothing in the repo sets ak5eSelfHeal (only the test). dnd5e 5.3.3 passes none of the others: the damage tray calls applyDamage with origin set to a ChatMessage object (dnd5e.mjs L63167) and chat cards pass originatingMessage (L69827). Source: [Ch.3 L3262](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3262) converts healing from "another Creature" only. DECISIONS.md L1972 says self-healing heals normally. [musha.test.mjs](../../ak5e/test/musha.test.mjs#L185) uses hand-made option shapes, so it cannot catch this. The same copy exists in reaper-features.mjs L374 (other unit).

**Reproduce:** Probe: heal -15 at 20/50 with options { isDelta: true, originatingMessage: { speaker: { actor: <Musha> } } } gives hp.value 20, temp 15.

**Verification limits:** Node probe calling mushaPreApplyDamageHook with option shapes read from dnd5e 5.3.3 source; not reproduced in Foundry V13.

**Fixed means:** Self-origin healing is recognised from data dnd5e supplies (originating message speaker or actor) or marked by the module's own heal path, restores real HP, and healing from another Creature still becomes Temporary HP. The test uses dnd5e-shaped options.
