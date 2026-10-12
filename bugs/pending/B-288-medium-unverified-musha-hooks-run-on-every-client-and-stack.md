# B-288 · Medium · Unverified: Musha updateActor hook updates on every client and handlers stack

Area: Guard / Musha / To Laugh at Death hooks

**Found:** Guard audit unit 13 (Musha), 2026-10-12.

**Evidence:** [musha-features.mjs](../../ak5e/scripts/musha-features.mjs#L345) updateActor runs on every connected client; it checks neither actor.isOwner nor GM and calls actor.update (L353) from each. Non-owners get a permission failure, owners and GM write duplicates, and the write has no undo receipt (WORKFLOW §3.1, §3.2.6). registerMushaHooks (L328) has no registered-once guard, unlike registerResourcePoolHooks in resource-pools.mjs, so a second call doubles every handler. Source: [Ch.3 L3316](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3316).

**Reproduce:** Probe: level 17 Musha at full HP, DC 20, actor.isOwner false: the handler still called actor.update once. After a second registerMushaHooks the updateActor handler count went 1 to 2.

**Verification limits:** Node probe; the all-clients fan-out of updateActor is Foundry behaviour taken from the Hooks API, not observed here.

**Fixed means:** Only one client (the owner, else the active GM) applies the reset, once; registration is idempotent; the reset is recorded so it can be undone within the window.
