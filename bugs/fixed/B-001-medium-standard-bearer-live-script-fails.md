# B-001 · Medium · Standard Bearer live script fails

Area: Live testing / environment

**B-001 (fixed 2026-10-10, 0.5.1) · Medium · Standard Bearer live script fails.** `ak5e/tools/test-standard-bearer-live.mjs`
stops in `syncStandardMap` with `TypeError: Cannot read properties of undefined (reading
'OBJECTS')` raised from `OperatorMeasuredTemplate._onUpdate` → `RenderFlags.set` when it updates
the aura MeasuredTemplate. It happened on the new code and on a restored copy of the old
`standard-bearer*.mjs`/`operator-skills.mjs`, so it is not caused by SI-1. Likely the template
layer is updated before the canvas/scene is drawn, or the `OperatorMeasuredTemplate` class
(`operator-targeting.mjs`) assumes a drawn object. Fixed when the full script passes on a
fresh disposable World.
**Resolution:** The harness waits for the initial and fixture scenes/canvas and actual template graphics before commands. Two consecutive fresh-fixture runs (3 and 4) passed in the private World; no RenderFlags error.
