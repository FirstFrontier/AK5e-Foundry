# Handoff Report — Skyranger Specialist Branch

## 1. Observation
- Source Authority: `AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt` lines 6145–6262.
- Exclusive file ownership:
  - Created: `/home/patch/AK5e-Foundry/ak5e/scripts/skyranger-features.mjs`
  - Created: `/home/patch/AK5e-Foundry/ak5e/test/skyranger.test.mjs`
  - Untouched: `specialist-rules.mjs`, `specialist-progression.mjs`, `specialist-uses.mjs`, and other project files.
- Command executed: `node --test ak5e/test/skyranger.test.mjs`
  - Output:
    ```
    ✔ Skyranger subclass identification and level feature gates (4.477907ms)
    ✔ Flight Suit item schema, AC, DR, weight, and wearing detection (1.838796ms)
    ✔ Fuel resource pool level progression matches Ch. 3 L6161–6184 exactly (0.561992ms)
    ✔ Fuel pool initialization, spending, shortfall handling, and refunding (6.092326ms)
    ✔ Take Off bonus action spends 1 Fuel, grants flight equal to walk speed, and undos cleanly (1.571036ms)
    ✔ Take Off without Flight Suit requires override or throws (0.65568ms)
    ✔ Strafe Damage dice and formulas match Ch. 3 L6161–6184 exactly (0.52466ms)
    ✔ Air Doctrine rest selection and active doctrine query (1.029393ms)
    ✔ AA Missile requires Air Superiority, spends 1 Fuel, and maximizes dice vs aerial target (1.275151ms)
    ✔ Bombing Run range extends when flying, and 11th level Advanced modifications apply (1.612164ms)
    ✔ Swooping Dive grants speed, Advantage within 10 ft, +Strafe Damage, and Lv 11 Frighten rider (1.125696ms)
    ✔ Evasive Manoeuvres spends 1 Prowess, increases AC by +PB, and halves damage if attack still hits (1.066032ms)
    ✔ Evasive Manoeuvres damage halving hook in preApplyDamage (0.342734ms)
    ✔ Aerial Prowess gain triggers: flying ground kill and aerial target kill (1/turn limit) (1.04925ms)
    ✔ Crash AoE calculates 2x height distance limit, 10 ft radius, and half Strafe Damage (0.516244ms)
    ✔ Afterburners reaction movement and 1/turn Fire damage aura within 10 ft (0.902751ms)
    ✔ Skyscreamer Combat Mode grants multirole doctrines, free Fuel, and special weapons (0.745511ms)
    ✔ Long Rest restores Fuel pool to max and cleans up Combat Mode and Flight states (0.552414ms)
    ✔ Adversarial damage halving, non-skyranger gating, and boundary checks (1.684141ms)
    ℹ tests 19
    ℹ suites 0
    ℹ pass 19
    ℹ fail 0
    ```
- Command executed: `node ak5e/tools/validate-files.mjs`
  - Output: `Validated module.json, lang/en.json, and 299 .mjs files.`
- Command executed: `node --test ak5e/test/specialist-rules.test.mjs ak5e/test/specialist-progression.test.mjs ak5e/test/specialist-features.test.mjs ak5e/test/specialist-adversarial.test.mjs`
  - Output: `ℹ tests 48, ℹ pass 48, ℹ fail 0`

## 2. Logic Chain
1. *Flight Suit starting equipment*: Source line 6151–6154 states: "Light Armour with an AC of 12 + your Dexterity Modifier, 0 DR, and a weight of 25lb... replacing costs 650 LMD and 24 hours of crafting time. While any Creature with Light Armour Proficiency can wear a Flight Suit, only Creatures with the Take Flight Feature can use it to fly."
   - Implemented `createFlightSuitItem()`, `isFlightSuit(item)`, `isWearingFlightSuit(actor)`, and `canUseFlightSuitToFly(actor)` matching all properties and restrictions.
2. *Fuel resource pool*: Source lines 6157–6184 define maximum Fuel scaling across levels 1–20: Lv 1–2: 2, Lv 3–5: 3, Lv 6–8: 4, Lv 9–11: 5, Lv 12–14: 6, Lv 15–17: 7, Lv 18–20: 8, restored on Long Rest.
   - Implemented via `FUEL_PROGRESSION_TABLE`, `calculateFuelMax()`, and registered with `defineSkyrangerPools()` using `{ on: "lr", amount: "toMax" }`.
3. *Take Off*: Source line 6159 specifies bonus action, 1 Fuel spend, and granting Flying Speed equal to Walking Speed for 1 minute while wearing Flight Suit.
   - Implemented via `executeTakeOff()`, managing `flags.ak5e.skyranger.isFlying`, duration, speed, and undo receipts.
4. *Strafe Damage*: Source lines 6161–6184 define Strafe Damage scaling: Lv 1–4: 0, Lv 5–7: 5d8, Lv 8–10: 6d8, Lv 11–13: 7d8, Lv 14–16: 8d8, Lv 17–19: 9d8, Lv 20: 10d8.
   - Implemented via `getStrafeDamageDiceCount()`, `getStrafeDamageFormula()`, and `calculateStrafeDamage()`, supporting maximized dice (AA Missile aerial target) and reduced dice (-3d8 for Firebomb / Gas Strike).
5. *Air Doctrine selection & features*: Source lines 6188–6198 define Short/Long Rest selection between Air Superiority, Bombardment, and Close Air Support.
   - AA Missile: 100 ft range, 1 Fuel, DEX save vs Martial DC, Thunder damage, maximized dice vs non-ground target.
   - Bombing Run: 30 ft (120 ft if flying), 1 Fuel, 15 ft radius, DEX save vs Martial DC, Thunder damage.
   - Swooping Dive: Attack action, 1 Fuel, move up to Speed, Advantage within 10 ft, +Strafe Damage Thunder (1/turn per creature).
6. *Jink (5th Level)*: Source lines 6199–6207 define Evasive Manoeuvres (Reaction, 1 Prowess -> +PB AC until start of next turn; if triggering attack still hits, damage is halved).
   - Implemented `executeEvasiveManoeuvres()`, `resolveEvasiveManoeuvresIncomingAttack()`, and hook `skyrangerPreApplyDamage()`.
   - Aerial Prowess gain triggers: flying ground target kill or non-ground target kill (1/turn limit).
7. *Advanced Doctrine (11th Level)*: Source lines 6211–6221:
   - Air Superiority Crash AoE: non-ground 0 HP -> crash point <= 2x height, 10 ft radius, DEX save or half Strafe Damage (Thunder).
   - Bombardment: Firebomb (-3d8, Fire damage + Burning) and Gas Strike (-3d8, Poison damage + Poisoned + 15 ft Difficult Terrain for breathing creatures).
   - Close Air Support: hit targets suffer Disadvantage on attacks against Skyranger; Strafe Damage hit forces WIS save vs Martial DC or Frightened until end of target's next turn.
8. *Afterburners (15th Level)*: Source lines 6222–6224: move up to Speed as part of Evasive Manoeuvres reaction; once per turn, moving within 10 ft of a creature forces DEX save vs Martial DC or Fire damage equal to Strafe Damage.
9. *Skyscreamer (20th Level)*: Source lines 6227–6249: 1/Long Rest Action, Combat Mode for 1 minute; Multirole (all 3 doctrines at once); free Fuel for Air Doctrine features; Core Cannon (3d8 Force, Range 100/300, Rapid Fire, Light) and Core Saber (3d8 Force, Deadly, Finesse, Reach, Light).
10. *Table-Play Philosophy (WORKFLOW.md §3.2)*: Confirmed actions, non-blocking warning overrides, shortfall clamping at 0, no auto-rolled dice (cards contain interactive roll formulas), and encounter-window undo receipts.

## 3. Caveats
- Integration with `specialist-rules.mjs`, `specialist-progression.mjs`, and `specialist-uses.mjs` was deliberately not performed by this worker in accordance with explicit dispatch instructions (reserved for Milestone 4). All methods are self-contained and export clean functions and schemas ready for Milestone 4 integration.

## 4. Conclusion
The Skyranger Specialist branch is fully implemented in `ak5e/scripts/skyranger-features.mjs` and verified with 19/19 tests passing in `ak5e/test/skyranger.test.mjs`. All source rules lines 6145–6262 are represented with 100% fidelity, zero regressions, and strict adherence to WORKFLOW §3.2 table-play philosophy.

## 5. Verification Method
Run the following commands in the workspace root:
```bash
# 1. Skyranger automated test suite (19 tests)
node --test ak5e/test/skyranger.test.mjs

# 2. Syntax, schema, and repository file validation
node ak5e/tools/validate-files.mjs

# 3. Core Specialist test suite (48 tests, verifying 0 regressions)
node --test ak5e/test/specialist-rules.test.mjs ak5e/test/specialist-progression.test.mjs ak5e/test/specialist-features.test.mjs ak5e/test/specialist-adversarial.test.mjs
```
Invalidation conditions: any failed assertion, unhandled promise rejection, or syntax violation.
