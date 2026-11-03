# Medic branch development workflows

Owner-authorized increment: Medic casting foundation, Therapist, Ward and Witchcraft through their level-15 branch features. Source authority is AK5e 1st Edition v1.3.1, Chapter 3 (Medic C3:4560–5146), with referenced Chapter 1 and 5 rules. Source descriptions and stable IDs remain unchanged. Publishing, licensing clearance and release-pack creation are separate.

## Implementation and review

Three sequential Terra high implementer / Luna high challenger pairs work in isolated snapshots of the dirty baseline. The parent reviews and integrates their changes. Independent Sol review and Luna rendered validation follow integration. No feature is accepted solely on helper tests.

| Workstream | State |
| --- | --- |
| Medic casting and Witchcraft | Implementation and independent adversarial tests in progress |
| Therapist | Pending |
| Ward | Pending |
| Shared/full regressions | Pending |
| Rendered GM/player, screenshot and restart acceptance | Pending |

The owner's five rules choices are recorded in `DECISIONS.md` under “Medic Therapist, Ward and Witchcraft owner rulings (2026-10-28)”. Existing Witchcraft rulings remain authoritative. Revivify remains unresolved/manual.

## Acceptance evidence

Baseline `npm run test:medic` passed all seven test files during planning. Before implementation integration, `node --test ak5e/test/*.test.mjs` reported 2,681 tests: 2,632 passed, six existing Cut Through Chaos failures, one skipped and 42 TODO cases. `npm test` reached the same six existing Guard/Artsblade failures and stopped there. Logs are retained under the task's private `/tmp` directory. The initial sandbox run could not spawn Node syntax-check subprocesses; the authorized unrestricted test run completed.

Those results do not establish any of the three new branches or rendered play. New test results, feature-level automation/guided boundaries, runtime evidence, screenshot viewers and limitations will be recorded here as work completes.
