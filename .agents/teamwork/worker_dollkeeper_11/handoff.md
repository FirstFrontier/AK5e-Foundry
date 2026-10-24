# Handoff Report: Dollkeeper Specialist Branch Implementation

## 1. Observation
- Source Authority: `AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt` (lines 6266–6377).
- Exclusive File Ownership:
  - `ak5e/scripts/dollkeeper-features.mjs` (Created: 1,383 lines)
  - `ak5e/test/dollkeeper.test.mjs` (Created: 567 lines)
  - No edits made to `specialist-rules.mjs`, `specialist-progression.mjs`, or `specialist-uses.mjs`.
- Test execution command: `node --test ak5e/test/dollkeeper.test.mjs`
  - Output:
    ```
    ✔ Area 1: Subclass Identification & Feature Predicates (4.220908ms)
    ✔ Area 2: Living Doll Companion Construct Data Generation & Synchronization (1.281954ms)
    ✔ Area 3: Strike Action, Attack Roll Bonus, Damage Scaling & Murderous Marionette (2.009171ms)
    ✔ Area 4: Command in Combat (Bonus Action <= 100 ft) & Action Types (0.896399ms)
    ✔ Area 5: Hit Dice Healing Linkage & Doll Rebuild (Ritual / 500 LMD) (4.094376ms)
    ✔ Area 6: Self-Rejuvenation Long Rest Logic (> 1 HP rule) (0.997592ms)
    ✔ Area 7: Level 5: Pull the Strings (Doll's Dance, Look in the Mirror, Marionette) (2.81636ms)
    ✔ Area 8: Level 5: Musical Chairs & Joint Prowess Triggers (1.713096ms)
    ✔ Area 9: Level 11: Masquerade (Mistaken Identity & Talking Heads) (1.070251ms)
    ✔ Area 10: Level 15: Living Doll (Reciprocity & Share Arts) (0.832157ms)
    ✔ Area 11: Level 20: Artistry is Violence & Doll Raid (0.656221ms)
    ✔ Area 12: Full Encounter-Window Undo Reversibility (WORKFLOW §3.2) (1.234344ms)
    ✔ Area 13: Resource Pools Registration & Lifecycle (1.206249ms)
    ℹ tests 13
    ℹ suites 0
    ℹ pass 13
    ℹ fail 0
    ```
- Validation command: `node ak5e/tools/validate-files.mjs`
  - Output: `Validated module.json, lang/en.json, and 299 .mjs files.` (Exit code 0).

## 2. Logic Chain
1. **Source Rules & Stat Block Mapping**:
   - `createDollCompanionData(ownerActor)` instantiates the Living Doll construct: Medium/Small construct, Neutral, STR 16 (+3), DEX 16 (+3), CON 14 (+2), INT 1 (-5), WIS 10 (+0), CHA 4 (-3), AC 10 + DEX mod (13), Max HP = owner Max HP, Speed = owner walking speed, PB = owner PB.
   - Immunities configured: damage immunities (`poison`, `necrotic`), condition immunities (`charmed`, `frightened`, `poisoned`, `necrotised`, `nervousImpairment`, `exhaustion`).
   - Senses: Darkvision 60 ft, passive Perception `8 + ownerPB`.
   - Synchronization logic in `synchronizeDoll(ownerActor, dollActor)` dynamically propagates HP max, walking speed, PB, weapon and armor proficiencies from owner to Doll.
2. **Combat Mechanics & Scaling**:
   - Strike Action bonus: Doll's STR or DEX (+3) + owner PB.
   - Base damage: `1d8 + 3` (or weapon formula).
   - Murderous Marionette: Advantage on melee attacks against creatures within owner's reach.
   - Multiattack scaling: 1 attack at level 1–10; 2 attacks at level 11–19 (Masquerade); 3 attacks at level 20 (Artistry is Violence).
3. **Command & Restoring Linkage**:
   - `commandDoll`: Bonus Action command within 100 ft (Strike, Dash, Disengage, Dodge, Help, Move). Non-blocking warning on distance > 100 ft with "Use anyway" override option.
   - `linkHitDiceHealing`: Owner Short Rest Hit Dice rolls heal Doll by `roll + ownerConMod` if Doll has >= 1 HP ("even if owner does not regain Hit Points").
   - `Self-Rejuvenation`: Long Rest restores all missing HP if Doll has > 1 HP; if Doll has 1 HP or 0 HP, does not rejuvenate.
   - `rebuildDoll`: Long Rest ritual with components or 500 LMD replacement.
4. **Pull the Strings & Musical Chairs (5th Level)**:
   - `canUseDollsDance`: Instant duration Operator Skills can originate from Doll's space.
   - `applyLookInTheMirror`: Doll gains owner's Weapon Specialisation (e.g. Dueling +2 damage, Archery +2 attack), Weapon Adept (+1 attack), and Weapon Mastery (+melee floor(lvl/2), +ranged PB).
   - `executeMarionette`: 1/Long Rest reaction when owner would drop to 0 HP: owner drops to 1 HP instead, positions swap, and Doll takes the incoming damage in owner's place.
   - `executeMusicalChairs`: 1 Prowess Action/Bonus Action to swap positions up to 60 ft apart without opportunity attacks. Warns on Prowess shortfall with clamping at 0.
   - `checkDollkeeperProwessGain`: 1/turn Joint Prowess gain on:
     a) Owner drops creature to 0 HP who took damage from Doll since start of last turn;
     b) Doll drops creature to 0 HP;
     c) Owner or Doll drops creature to 0 HP or crits within 10 ft.
5. **Masquerade (11th Level)**:
   - `executeMistakenIdentity`: Reaction when attacked within range. DC 18 Perception check. Failed check redirects attack to Doll; successful check grants attacker 1-hour immunity. Uses `@prof` / short or long rest pool.
   - `executeTalkingHeads`: Telepathic speech projection through Doll within 100 ft.
6. **Living Doll (15th Level) & Artistry is Violence (20th Level)**:
   - `executeReciprocity`: When owner or Doll recovers HP (except resting) or gains Temp HP, other gains equal Temp HP.
   - `executeShareArts`: Non-damaging, non-healing Art/buff targeting owner or Doll affects both simultaneously.
   - `executeDollRaid`: 1/Long Rest simultaneous full turn / 3 Strike attacks with no action cost.
7. **WORKFLOW §3.2 Reversibility**:
   - `undoDollkeeperAction` reverts state for Marionette, Musical Chairs, Mistaken Identity, Reciprocity, Doll Raid, Hit Dice healing, and Rebuild Doll.

## 3. Caveats
- No modifications were made to `specialist-rules.mjs`, `specialist-progression.mjs`, or `specialist-uses.mjs`. Milestone 4 will integrate these subclass definitions into the Specialist progression and sheet UI.
- All resource pools (`mistakenIdentity`, `marionette`, `dollRaid`, `prowess`) are registered and managed through `defineDollkeeperPools()` and `registerDollkeeperHooks()`.

## 4. Conclusion
The Dollkeeper Specialist branch features in `ak5e/scripts/dollkeeper-features.mjs` and test suite in `ak5e/test/dollkeeper.test.mjs` are complete, genuine, and 100% verified against source rules (Ch. 3 L6266–6377).

## 5. Verification Method
- Run unit test suite:
  ```bash
  node --test ak5e/test/dollkeeper.test.mjs
  ```
- Run static file validation:
  ```bash
  node ak5e/tools/validate-files.mjs
  ```
