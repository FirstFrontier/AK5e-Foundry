# Five subclass workflows

User-authorized development work: Guard/Artsblade, Specialist/Infuser, Supporter/Artificer/Bard, Medic/Witchcraft. Source authority is AK5e 1st Edition v1.3.1, primarily Chapter 3, with referenced Chapters 1/4/5/6. Public release and LevelDB pack acceptance are separate; this development manifest declares no release packs.

## Baseline and integration

The 2026-10-25 baseline contained uncommitted Vanguard implementation and shared-engine changes. Those edits are preserved. Implementation copies are isolated under `/tmp/ak5e-five-branches-x6z5x8s1`; only the integrating parent changes shared files in the main checkout. Pairs use GPT-6 Luna, with a scoped builder and independent challenger. This is same-model adversarial review.

All four existing class test commands passed before implementation. They did not establish sheet inputs, target-owned saves, relay, expiry, or rendered acceptance. The Guard challenger added regressions that fail the baseline for progression, source casting, state undo and Resonance. No implementation is marked accepted solely from helper tests.

## Source inventory

Requested branch records in generated Chapter 3 content: Artsblade 9, Infuser 19, Artificer 33, Bard 7, Witchcraft 5 (73 total). These include feature headings and tables/options; source transcription is not automated behavior. Parent class grants, Talents and Operator Skills are audited alongside each branch.

| Workstream | Source spans | State |
|---|---|---|
| Guard / Artsblade | C3:1740–2417 | Implementation and adversarial tests in progress |
| Specialist / Infuser | C3:5161–5840 | B-303–307 (renumbered; remote owns B-302); implementation pending |
| Supporter / Artificer / Bard | C3:6548–7211; C6:6577–6677 | Helpers disconnected; branch implementation pending |
| Medic / Witchcraft | C3:4560–5146 | Base helpers exist; branch implementation pending |

## Shared contract

Play-use previews expose costs, targets, warnings and readings without executing a plan. Confirmation precedes commitment even when no warning exists. Owner-clicked native saving throws are matched to the recorded target, ability, author and encounter receipt; no supplied success checkbox substitutes for a save. State undo records changed leaves and preserves later unrelated edits. Keyed target operations distinguish multiple changes to one target.

The new `test:play` runner includes shared behavior regressions in the full test command. Existing Vanguard behavior must remain green. Source-specific cards must explicitly identify any manual damage/effect or spatial procedure; instructions do not count as automated application.

## Acceptance evidence

Private Foundry acceptance is staged under the task directory using Foundry 13.351 and D&D5e 5.3.3. Rendered GM/player checks, actual renderer identification, screenshot viewing, reload/restart and per-workstream outcomes remain pending. The validator must open every screenshot it reports. Production Worlds are not used.

The final report will replace pending states with exact command results, coverage classifications, evidence paths and remaining limitations. TODO.md and individual bug records remain the live checklist.
