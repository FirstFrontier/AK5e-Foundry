# DISPATCH — challenger_m3
Timestamp: 2026-10-20T03:11:50Z
Role: Contraptions Adversarial Challenger
Working Directory: /home/patch/AK5e-Foundry/.agents/teamwork/challenger_m3

## Objective
Author an adversarial stress test suite in `ak5e/test/inventor-contraptions-adversarial.test.mjs` attacking Contraptions, Mobile Modding, Risk Assessment, and The Big One.

## Stress Vectors to Attack:
1. Strange & Stranger Contraptions (Lv 5 & Lv 15):
   - 1/Long Rest per-option limit: using Flashlight burns Flashlight for the day, but other 7 contraptions remain available; Long Rest restores all options.
   - Flashlight: Blinded on fail; Stranger Lv 15 upgrades pass to Dazed until end of next turn.
   - Fun Toy: Construct stats (18 AC, 10 HP, 20 ft, 60 ft Darkvision, 10 min); Stranger Lv 15 applies Invisible condition.
   - Musbeast Remover: 10 ft radius, 4d8 Piercing; Stranger Lv 15 adds Bleeding on failed save.
   - Needlefly Fumigator: 20 ft radius, CON save or 2d8 Poison + Poisoned; Stranger Lv 15 allows nominating immune creatures who take 0 damage and no condition.
   - Portable Firestarter: 10 ft radius, 2d8 Fire + Burning; Stranger Lv 15 adds INT mod to ongoing burn ticks.
   - Unstable Contraption: 10 ft radius, 5d8 Thunder; Stranger Lv 15 deals 8d8 Thunder.
2. Mobile Modding (Lv 5):
   - Costs exactly 1 Prowess and Action (warns/rejects on Prowess shortfall).
   - Target must be willing creature within 5 ft.
   - Costs 0 Inventions (does not decrement Inventor's inventions pool).
   - Exactly 1 minute temporary duration: expires cleanly after duration without refunding inventions.
   - Duplicate mod on target item is rejected.
3. Inventor Prowess Gain Trigger:
   - Creature who activated Inventor's mod reduces enemy to 0 HP -> Inventor gains 1 Prowess.
   - Non-modified creature reducing enemy to 0 HP -> 0 Prowess gained.
   - Creature who did NOT activate a mod this turn reducing enemy to 0 HP -> 0 Prowess gained.
   - Max 1 Prowess gained per turn clamp; clamped at max Prowess.
4. The Big One (Lv 20):
   - 1/Long Rest limit; Action cost; rejected if Inventor level < 20.
   - Mode `FLASH`: 4 points within 100 ft, 10 ft radius, 8d6 Thunder + Burning. Crucial test: creature inside overlapping area of multiple points makes saving throw ONLY ONCE.
   - Mode `SHARD`: 50 ft cone, 10d6 Slashing + Bleeding. Crucial test: ignores cover bonuses to saving throw/AC.
   - Mode `QUASAR`: 100x10 ft line, 14d6 Radiant (half on save).

Allowed write file:
- `ak5e/test/inventor-contraptions-adversarial.test.mjs`
- Files in `/home/patch/AK5e-Foundry/.agents/teamwork/challenger_m3/`

Run verification:
- `node --test ak5e/test/inventor-contraptions-adversarial.test.mjs`
- `node ak5e/tools/validate-files.mjs`

Maintain progress in `progress.md`. When complete, write report in `handoff.md` and notify orchestrator.

## 2026-10-20T03:12:08Z
[Message from orchestrator cf5c8a2a-802f-473e-8274-6566de462e7c]
You are challenger_m3. Your working directory is /home/patch/AK5e-Foundry/.agents/teamwork/challenger_m3/.
Read your dispatch instructions in /home/patch/AK5e-Foundry/.agents/teamwork/challenger_m3/DISPATCH.md.

Implement adversarial stress test suite in ak5e/test/inventor-contraptions-adversarial.test.mjs attacking:
1. Strange/Stranger Contraptions: 1/LR per-option lockout, Stranger Lv 15 upgrades (Dazed on save, Invisible construct, Bleeding rider, ally immunity, Firestarter +INT burn damage, 8d8 Thunder).
2. Mobile Modding: 1 Prowess spend, 0 Inventions cost, 1 min temporary duration, duplicate rejection.
3. Inventor Prowess Trigger: qualification on downing enemy, non-modded downing rejection, 1/turn clamp.
4. The Big One: 1/LR limit, FLASH overlapping single-save invariance, SHARD cover bypass, QUASAR line damage.

Run:
- node --test ak5e/test/inventor-contraptions-adversarial.test.mjs
- node ak5e/tools/validate-files.mjs

Maintain progress in progress.md. Write report in handoff.md and notify orchestrator when complete.
