# B-005 · Low · Unattributed console warnings

Area: Live testing / environment

**B-005 · Low · Unattributed console warnings.** D&D5e 5.3 deprecation warnings
(`senses.darkvision/blindsight/tremorsense/truesight has moved to senses.ranges.*`) and WebGL
"GPU stall due to ReadPixels" appear during live runs. The source of the `senses.*` accesses
(module code, the test fixtures, or the system itself) was not identified. The older D&D5e
ActiveEffect-pack warning is recorded in `FOUNDRY_SMOKE_TEST.md`.

**Resolution (fixed 2026-10-12, 0.5.6):** The only module writer of the pre-5.3 shape was `droneData()` in `ak5e/scripts/caster-drones.mjs`; it now writes `senses.ranges.darkvision` (pinned in `caster-drones.test.mjs`). Live (disposable standard-test, Foundry 13.351 / dnd5e 5.3.3 / ak5e 0.5.6): all 22 drone Actors store `ranges`, and the drone sheet shows Darkvision 60. The remaining `senses.* has moved` warnings come from dnd5e 5.3.3 itself (`getRollData()` legacy getters hit by `deepClone`/`DamageRoll.fromConfig`); a plain character and a plain NPC produce the same four. The ReadPixels GPU-stall warning did not appear in these runs. Not tested with ak5e disabled.
