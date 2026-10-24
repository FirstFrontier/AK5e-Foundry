# Progress — worker_trapmaster_11

Last visited: 2026-10-24T03:43:40Z

## Current Status
- Successfully implemented complete Trapmaster Specialist branch in `ak5e/scripts/trapmaster-features.mjs`.
- Authored comprehensive test suite in `ak5e/test/trapmaster.test.mjs` with 27/27 tests passing cleanly (100% pass rate).
- Validated all repository files via `node ak5e/tools/validate-files.mjs` (0 errors).
- Maintained strict exclusive file ownership: only `trapmaster-features.mjs` and `trapmaster.test.mjs`.

## Completed Deliverables
1. Environmental Warfare (1st level):
   - `traps` resource pool: Max = 2 * PB, Long Rest recovery.
   - Sleight of Hand Expertise grant: `applySleightOfHandGrant(actor)` & `hasSleightOfHandExpertise(actor)`.
   - Trap DC: `8 + PB + max(Dex, Int) + (level >= 20 ? 5 : 0)`, with character preference override.
2. Devil's Own Luck (1st level):
   - 1/SR or LR Action to scout / suggest environmental trap (strictly rejects Timed Explosive per source rules).
3. 8 Trap Schemas with base mechanics, triggers, saves, conditions, and Level 7 & 14 damage scaling:
   - Alarm: 20-ft perimeter / 10-ft line, loud sound 300 ft / mental ping 1 mile, multi-trigger.
   - Explosive: 5-ft square, 15-ft radius sphere. Dispatch: 2d8/4d8/6d8 Fire; Source: 4d8/6d8/8d8 Thunder; DEX save for half.
   - Gas: 10-ft radius cloud / 15-ft sphere, 1 min. Dispatch: 2d6/4d6/6d6 Poison; Source: 2d8/3d8/4d8 Poison; CON save for half + Poisoned.
   - Incendiary: 5-ft square, 15-ft sphere. Dispatch: 2d6/4d6/6d6 Fire; Source: 2d8/3d8/4d8 Fire; DEX save for half + Burning.
   - Paddle: 10-ft line. Dispatch: 1d10/2d10/3d10 Bludgeoning + STR save or push 15 ft & Prone; Source: 4d8/6d8/8d8 Bludgeoning + DEX save or Dazed 1 min; non-lethal (unconscious at 0 HP).
   - Snare: 10-ft line, DEX save or Restrained. Athletics (STR) / Acrobatics (DEX) vs Trap DC to escape; ally bladed cut or Sleight of Hand vs Trap DC.
   - Spike: 10-ft line, multi-trigger. Dispatch: 2d10/4d10/6d10 Piercing + speed halved; Source: 1d8 Piercing + Bleeding (-10 ft speed at Lv 7+).
   - Timed Explosive: 1-5 rounds / 10s-1h countdown, 15/20-ft sphere (corners, 2x to vehicles/structures). Dispatch: 3d8/6d8/9d8 Force; Source: 6d10 Thunder; DEX save for half.
4. Detecting & Disarming:
   - Detection DC = Trap DC (passive perception or active perception/investigation).
   - Disarm DC = Trap DC (Sleight of Hand check within 5 ft; failure by 5 or more immediately triggers the trap).
5. Panic Inducer (5th level):
   - Irritating Distraction: attacked creature has Disadvantage on saves against trapmaster's traps and Warning Point.
   - Jester's Grace: trigger immunity to own/ally traps, Advantage on saves against traps.
   - Warning Point: INT save vs Trap DC on trigger or speed reduced to 0; trap delayed and triggerable as Reaction.
6. Here's One I Made Earlier (5th level):
   - 1 Prowess Action to plant trap up to 60 ft away.
   - Trapmaster Prowess triggers: +1 Prowess on 0 HP kill by trap (1/turn), +1 on save failed by 5+, +1 at turn start if 2+ creatures failed saves.
7. Bait the Trap (11th level):
   - Come and Get Me: PB/SR or LR taunt within 60 ft; WIS save vs Trap DC or must spend movement heading towards trapmaster/designated point.
8. Agent of Chaos (15th level):
   - Trap damage ignores Damage Reduction (DR = 0) and treats Damage Resistance as normal damage.
9. House of Horrors (20th level):
   - Permanent +5 bonus to Trap DC.
   - Party Favours: 1/LR Action to plant up to 6 hidden traps simultaneously within 100 ft without expending Traps pool uses.
10. Encounter-Window Undo Reversibility (WORKFLOW §3.2):
   - Full undo support for `plantTrap`, `executeDevilsOwnLuck`, and `executePartyFavours`.
