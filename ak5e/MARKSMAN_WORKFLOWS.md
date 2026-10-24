# Marksman workflow implementation checkpoint — 2026-10-18

Development checkpoint requested by the user before API limits. This is not full
class acceptance or a release. Existing unrelated checkout edits are preserved.

## Coverage

| Area | Implemented behavior | Remaining acceptance / manual boundary |
| --- | --- | --- |
| Setup/progression | Preview/confirm sheet dialog, source-ID grants, styles, milestone Talent/module choices, gear/LMD, stale-preview and retry protection | Rendered progression acceptance; all 35 Skills and 42 Talents/modules retain source descriptions and manual effects unless separately automated |
| Shared resolution | Recorded target/weapon/turn snapshots, individual owner rolls, target-owner saves, confirmed typed HP/effect application, GM coordination, target serialization, descendant undo | Complete two-client failure/retry, encounter locks and older-receipt conflict-preview acceptance |
| Weapon properties | Generated tableData, legacy and native property reader, numeric Splash/Crush/range | Broader native activity/mixed-damage weapon coverage |
| Base styles/actions | Guided Brace reroll, Spread miss damage, Defensive d4/AC, Two-Weapon attack; corrected Smooth Operator modifier; recorded Unerring result and Steel Rain attack steps | Native attack/damage end-to-end acceptance; Unerring damage continuation and explicit Defensive end control need finishing |
| Anti-Air | Bound repeat attacks, manual turn identity, guided Option damage/saves/effects, area triggers and Last Option state | Air Tracking fact-entry command and stable native target integration; per-Attack-Action Last Option allowances; initiative recovery serialization |
| Artilleryman | No-attack Splash, typed damage and per-target saves/DCs, shared blast roll, munition records, secondary readings, collision descriptors | Complete geometry/collision inputs and damage-recipient evidence, native Thunder defense/Loading integration, inactive-timer suppression and restart acceptance |
| Besieger | Turn-scoped Siege effects, weapon/size boundaries, one-attack Deliberate workflow, Siege Bolt saves/ticks, Goliath condition and confirmed Godpiercer HP loss | Live expiry/ongoing save acceptance; mitigation policy completeness and native attack/damage provenance |

Automatic means hooks calculate a scoped modifier or observe a recorded trigger.
Guided means a player must click each roll/save/application. Manual means the
table adjudicates geometry, trigger facts, unsupported selected Skill/Talent
effects or explicitly identified incomplete integration. No trigger rolls dice.

## Verification at checkpoint

- `npm run test:marksman`: all 15 test files pass, including the new resolution
  and progression sheet regressions. This is a file count, not an assertion count.
- `npm run check:generated`: passes; generated Chapters 1–6, tables and content
  map remain unchanged.
- File validation passes: manifest, language JSON and 284 `.mjs` files. The initial
  sandbox run failed to spawn Node; the approved retry passed that stage. The
  whole `npm test` suite subsequently completed successfully (exit 0), with one
  existing optional skip. Separate Guard and base-class regression runs also pass.
- Independent Sol review identified target concurrent-write and authenticated
  encounter-undo defects; parent fixes and focused regressions pass. Partial
  target-write undo and missing-save rejection also have regression coverage.
- Private Foundry 13.351 / D&D5e 5.3.3 validation uses a copy of `standard-test`,
  `launchTestBrowser()`, GM and U7 Player, and ANGLE (Mesa, AMD CEDAR,
  OpenGL ES 3.1). Luna viewed the two initial board screenshots. These do not
  establish feature-dialog acceptance. Luna additionally viewed player controls
  and setup confirmation (`10-player-marksman-controls-before-setup.png`,
  `11-player-setup-confirmation.png`) and verified six source-ID Item grants.
  A later module syntax error was fixed and syntax-checked. After resync/restart,
  the GM API smoke passed without AK5e/page errors; Luna viewed `diag.png`.
  The private browser and server were shut down cleanly. Progression and feature
  resolution acceptance remain pending.

## Resume priorities

1. Finish the coverage-table gaps before claiming the requested plan complete.
2. Resolve B-301 (plain recovery context and Anti-Air recovery coordination).
3. Resolve B-300 (persisted dice publication retry). Extend parent undo previews
   to descendants.
4. Recheck offline-source payload reconstruction, manual successful-save ending
   evidence, and tokenless Actor snapshots (do not invent elevation).
5. Add grouped mixed-recipient blast tests, per-occurrence saves, stale/repeated
   native callbacks and full failed-write/duplicate relay coverage.
6. Finish private GM/player controls, screenshot review, reload/restart and clean
   import acceptance; close corresponding bug records only with verified evidence.

Temporary logs: `/tmp/ak5e-marksman-final-{focused,generated,files,full}.log`.
Private runtime/evidence: `/tmp/ak5e-marksman-validation/`. Release packs remain
an independent blocker. No commit, publication or production-World mutation.
