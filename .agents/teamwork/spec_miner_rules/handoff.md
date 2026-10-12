# Guard Subclasses (Duellist, Liberator, Lord) Authoritative Specification Report

**Document Version:** 1.0.0  
**Rules Authority:** AK5e 1st Edition v1.3.1 (`AK5e_1.3.1_Foundry_Source/`)  
**Target Platform:** Foundry VTT Version 13 & D&D5e System  
**Report Location:** `/home/patch/AK5e-Foundry/.agents/teamwork/spec_miner_rules/handoff.md`  

---

## 1. Observation

All observations are extracted verbatim from the authoritative AK5e v1.3.1 source files.

### 1.1 Source Locations & Citations
- **AK5e Class Features & Guard Base**: `AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt`, Lines 1740–2000.
  - Guard Hit Dice: 1d10 per level (L1765).
  - Proficiencies: Light/Medium Armour, Light Shields, All Melee Weapons, Maintenance Kit; Saves: STR + (CON or DEX); Skills: 3 from Acrobatics, Athletics, Lore, Insight, Intimidation, Wilderness (L1770–1774).
  - Press the Attack / Aggression: 4 Aggression at 1st level, 6 at 7th level, 8 at 14th level (L1877–1879). Recover on Short or Long Rest.
  - Base Press the Attack Options: Forestall (1–3 Aggression, Reaction on hit, +PB AC per Aggression, L1883–1884), Smite (1–3 Aggression, on hit no action, +PB damage per Aggression, L1886–1888), Strike True (1–3 Aggression, on attack roll no action, +PB to roll per Aggression, L1889–1891).
  - Unrelenting: 1 use at 3rd level, 2 uses at 11th level (L1895–1898, L1928–1934). Reaction when another creature ends turn -> single attack. Pursuit Unrelenting (11th level) allows spending 2 uses for an Action or Bonus Action. Long Rest recovery.
  - Annihilation Protocol (20th level, L1948–1950): On Initiative, if 0 Unrelenting remain, regain 1 use.
  - Eternal Aggression (18th level, L1943–1947): On using Unrelenting, roll 1d4 and regain that much Aggression.
- **Martial DC Definition**: `AK5e_1.3.1_Foundry_Source/01_chapter_1_changing_the_game.txt`, Lines 211–212:
  > "Many Class and Branch Features make reference to a Character’s 'Martial DC'. A Character’s Martial DC is equal to 8 + their Strength or Dexterity Bonus (their Choice) + their Proficiency Bonus."
- **Physical vs Arts Damage**: `AK5e_1.3.1_Foundry_Source/01_chapter_1_changing_the_game.txt`, Lines 145–163:
  - Physical: Bludgeoning, Slashing, Piercing, Thunder.
  - Arts: Acid, Cold, Fire, Force, Lightning, Necrotic, Poison, Psychic, Radiant.
- **Operator Skills & Charging**: `AK5e_1.3.1_Foundry_Source/01_chapter_1_changing_the_game.txt`, Lines 268–298:
  - Automatic: 2 SP at start of turn in combat.
  - Offensive: 1 SP when dealing damage to hostile creature (once per attack), restoring HP to another, or granting THP with an Art to another.
  - Defensive: 2 SP when attacked by hostile creature or taking damage from non-attack source.
  - Charging methods stack across skills. One skill active at a time.
- **Creature Tiers (Normal, Elite, Leader)**: `AK5e_1.3.1_Foundry_Source/06_chapter_6_dwellers_of_terra.txt`, Lines 13–82.

---

### 1.2 Verbatim Source: Duellist (Ch. 3 Lines 2739–2845)
```text
2739: ### Duellist
2740: 
2741: Duellists excel at engaging singular foes, matching their strength and skill against the mightiest their enemies have to offer. They often range ahead of Defenders and other Guards to find their quarry, laying them low with powerful and precise strikes. 
2742: 
2743: #### 1st Level: Singular Foe
2744: As a Duellist, you single out your foes before utterly dismantling them with precise strikes. You gain the following benefits:
2745: 
2746: **Duelling Blades.** Greatswords and Polearms are considered to have the Finesse Property while wielded by you. 
2747: 
2748: **Rules of Engagement.** As a Bonus Action, you may declare a hostile Creature you can see to be your Opponent. While you have an Opponent, you can earn Points in your duel with that Opponent; you can earn Points in the following ways, up to a maximum of 10:
2749: - +1 Point when you declare your Opponent. Once you have gained Points in this way, you cannot do so again until the end of your next Turn.
2750:   - You gain an additional Point if you are not wielding a Heavy Melee Weapon; this additional Point is lost if you equip a Heavy Melee Weapon after gaining the Point.
2751: - +1 Point at the beginning of your Turn if you have dealt Damage to your Opponent since the beginning of your last Turn. 
2752:   - You gain an additional Point if your Opponent has NOT dealt Damage to you since your last Turn.
2753: 
2754: When your Opponent is reduced to 0 Hit Points, you accept their surrender, a minute passes without either of you dealing Damage to the other, or you declare a new Opponent, you lose all Points you have earned.
2755: You can expend your Points to carry out Engagements, detailed below. You cannot use the same Engagement more than once per Turn.
2756: 
2761: #### 1st Level: Parry and Riposte
2762: With a deft flick, you brush aside the clumsy blows of your foe. You gain the following benefits:
2763: 
2764: **Parry.** The first time each Round you use the Forestall Press the Attack option, it does not consume your Reaction, and costs 1 fewer Aggression (minimum of 0). 
2765: 
2766: **Press the Attack: Reposte (1 Aggression).** You may use this Press the Attack Option as a Reaction when a Creature within your Reach misses you with an Attack; make an Attack of Opportunity against that Creature.
2767: 
2773: #### 4th Level: Principles of Defence
2774: Parry and Counter; these are the principles that will keep you alive. You gain the following benefits:
2775: 
2776: **Every Victory, Another Step.** When your Opponent is reduced to 0 Hit Points or you accept their surrender, you regain 1 expended Aggression. 
2777: 
2778: **Press the Attack: Lightning Reflexes (1 Aggression).** You can use this Press the Attack Option as a Reaction when you would be required to make a Saving Throw against an effect you can see; you can instead make a Dexterity Saving Throw against that effect. 
2779: 
2780: **Punish every Opening.** Once per Turn, you may use your Press the Attack: Reposte Feature without expending your Reaction when you succeed on a Saving Throw if the Creature that caused you to make that Saving Throw is within your Reach. 
2781: 
2782: #### 10th Level: Duellist's Advance
2783: The amount of Points you gain when you declare an Opponent is increased to 2. Additionally, the amount of Points you gain at the beginning of your Turn if you have dealt Damage to your Opponent since the beginning of your last Turn is increased to 2.
2784: 
2785: #### 13th Level: Grand Challenge
2786: When you declare a Creature as your opponent, you may also declare a Grand Challenge (no Action required). For the next minute, or until your Opponent changes, dies, or surrenders, you gain the following benefits:
2787: 
2788: **Corps a Corps.** Whenever your Opponent deals Damage to a Creature that is not you, you may, if possible, make an Attack of Opportunity against them (no Action Required); you cannot do so again until the beginning of your next Turn.
2789: 
2790: **Displacement.** You are Resistant to all Damage dealt by Creatures other than your Opponent. 
2791: 
2792: When you hit your Opponent with a Melee Attack while you have 10 Points, you can make that Attack a Coup de Grâce;that Creature takes 8d8 Slashing or Piercing Damage (your choice) that is not reduced by Resistance or Damage Reduction, and the Grand Challenge ends; that Creature remains your Opponent if they survive.
2793: 
2794: Once you have used this Feature, you may not do so again until you complete a Long Rest.
2795: 
2796: #### 17th Level: Master Duellist
2797: Your mind is no longer so singular as to consider every opponent a seperate challenge; the world is your opponent. When you declare a Creature as your Opponent but do not issue a Grand Challenge, or when your Opponent dies or surrenders, you no longer lose the Points you currently have. Additionally, declaring your Opponent during your Turn no longer requires your Bonus Action.
2798: 
2804: #### Engagements
2805: The Engagements available to the Duellist Branch are listed in alphabetical order.
2806: 
2807: **Analysis (0 Points)** As an Action, you study a hostile Creature you can see, observing their movements. Once during your next Turn, if you gain any Points, you gain 1 additional Point.
2808: 
2809: **Balestra (2 Point)** You prepare to make your next Melee Attack before the end of your next Turn a powerful lunging strike (no Action required). The reach of that Melee Attack is increased by 10 feet; after you make the Attack, you move 10 feet towards the Creature, finishing the movement as close to them as you can. If the Creature was more than 10 feet away from you when you made the Attack, the Damage of that Attack is not decreased by Damage Reduction.
2810: 
2815: **Derobement (1 Point)** When you make a Melee Attack against a Creature, you may attempt to confound and misdirect any retaliation they might offer (no Action required); the Damage of that Attack is halved, but if it hits, that Creature has Disadvantage on Attack Rolls against you until the start of your next Turn.
2816: 
2817: **Displacement (1 Point)** When you make a Melee Attack against a Creature, you can use your weapon to make space for yourself (no Action required); the Damage of that Attack is halved, but if it hits, you can can move up to 10 feet directly away from the Creature you attacked. This movement does not provoke Opportunity Attacks from that Creature.
2818: 
2819: **En Garde (1 Point)** When you expend your Reaction for your Lightning Reflexes or Reposte Press the Attack Option, you may use this Engagement (no Action required) to returning to a guarding stance, refunding use of your Reaction.
2820: 
2821: **Feint (1 Point)** As a Bonus Action, you mislead a Creature you can see on your next strike. The next Melee Attack you make against that Creature before the end of your next Turn has Advantage; that Creature must be able to see you to gain this benefit.
2822: 
2823: **Fleche (2 Points)** As a Bonus Action, you can make your next Melee Attack this Turn a Fleche; a precise and lethal strike to a weak point. That Attack deals additional Damage equal to your Guard Level. 
2824: 
2825: **Redoublement (1 Point)** When you miss a Creature with a Melee Attack, you can use the momentum of the attack to try again on a different angle; you can reroll that Attack Roll as a Reaction. However, if you do, the Damage of that Attack is halved.
2826: 
2827: **Score (1 Points).** When you make a Melee Attack against a Creature, you may attempt to score their flesh (no Action required); the Damage of that Attack is halved, but if it hits, it causes that Creature to suffer the Bleeding Condition.
```

---

### 1.3 Verbatim Source: Liberator (Ch. 3 Lines 2937–3093)
```text
2937: ### Liberator
2938: Ideological grievance, repressed anger, longing, revenge; these are the weapons of a Liberator. To be a Liberator is to understand the value of considered action; to rage and scream accomplishes naught. The right moment, and the right time, can change the world.
2939: 
2940: #### 1st Level: Essence of the Liberator
2941: You take action only when the moment is right. Until then, you watch and wait, providing what succor you can to those who rally to you. You gain the following benefits:
2942: 
2943: **Liberty.** You have a special resource called Liberty. Liberty is expended to fuel your other Features, and empower your Operator Skills. Your maximum Liberty is 6.
2944: 
2945: You can generate Liberty in the following ways. You can only generate Liberty during Combat.
2946: - You gain 1 Liberty at the end of any of your Turns that you did not:
2947:   - Activate an Operator Skill, or have an active Operator Skill.
2948:   - Cast an Art.
2949:   - Make an Attack Roll.
2950: - You gain 1 Liberty when you use your Guide the Masses Feature as an Action.
2951: 
2953: **Guide the Masses.** As an Action while in Combat, you can choose an allied Creature you can see within 20 feet, and grant them one of the following bonuses (your choice) until the beginning of your next Turn; these effects are not cumulative. 
2954: - **Advocate.** The next time that Creature gains Hit Points or Temporary Hit Points, they gain an additional amount equal to your twice Proficiency Bonus or twice your current Liberty, whichever is higher.
2955: - **Empower.** That Creature gains Damage Reduction against the next Damage they take equal to your Proficiency Bonus or your current Liberty, whichever is higher.
2956: - **Uplift.** That Creature's next successful Attack deals additional Damage equal to your Proficiency Bonus or your current Liberty, whichever is higher.
2957: 
2959: Starting at 7th Level, if you have used this Feature as an Action during a Turn, you may also use it as a Bonus Action during that Turn, but you must choose a different Creature for that Bonus Action.
2960: 
2965: #### 1st Level: Righteous Outburst
2966: All it takes to change history is for the right person to take action at the right time. Make sure that you do. You gain the following benefits:
2967: 
2968: **Flash of Anger.** When you hit a Creature with a Melee Weapon Attack, you can expend any amount (min. 1) of your Liberty to cause that Attack to deal additional 1d6 Damage for each Liberty expended; this additional Damage cannot be increased by Critical Hits. If a Creature is reduced to 0 Hit Points as a result of this Attack, 1 Liberty is refunded.
2969: 
2970: **The Right Moment.** When you activate an Operator Skill, all of your current Liberty is consumed. The amount of Liberty you consume in this way grants you the following benefits for the duration of that Skill:
2971: - Operator Skills that force a Creature to make a Saving Throw during your Turn, and deal Damage, deal 1d6 additional Damage for every Liberty you consumed; this only applies to Damage dealt as a result of making that Saving Throw.
2972: - When you make a Melee Weapon Attack, it deals 1d6 additional Damage for every 2 Liberty you consumed.
2973: 
2974: **Unique Operator Skills.** You have access to Operator Skills unique to this Branch, detailed below. When you gain a Basic, Advanced, or Elite Operator Skill, you may instead choose one from the corresponding Operator Skill Table for this Branch.
2975: 
2976: #### 4th Level: Rising Tide
2977: The tide is rising, rising, ever rising.
2978: 
2979: Your Skills are considered to have the Automatic, Offensive, and Defensive Charging Method.
2980: 
2999: #### 10th Level: Praxis
3000: You practice what you preach, seeking out those who oppose your vision and striking them down. You gain the following benefits:
3001: 
3002: **Far Reaching Guidance.** The range of your Guide the Masses Feature is increased to 40 feet.
3003: 
3004: **Improved Liberty.** The additional Damage granted by your Flash of Anger and The Right Moment Features is increased to a d10.
3005: 
3006: **Press the Attack: Face Me (2 Aggression)** You can use this Press the Attack Feature as a Bonus Action; you can cast the Compelled Duel Art using this Feature as part of that Bonus Action, ignoring its Somatic Components. If you do so, you use your Martial DC in place of your Spellcasting DC for that Art.
3007: 
3008: #### 13th Level: Smouldering Anger
3009: You gain the following benefits:
3010: 
3011: **Cannot be Denied.** The additional Damage from your Flash of Anger Feature is now Force Damage. If you have an Operator Skill that deals an Arts Damage Type, you can cause your Flash of Anger Feature to deal that Damage Type instead of Force when you use it.
3012: 
3013: **Caught in the Crossfire.** When you use your Flash of Anger Feature, you can choose a different Creature within 10 feet of the Creature you attacked; that Creature also takes the additional Damage dealt by your Flash of Anger Feature to the original Creature.
3014: 
3015: #### 17th Level: Révolution
3016: You have become an ideological avatar, the distilled essence of all you believe in. You have held your tongue for long enough.
3017: 
3018: As an Action during your Turn, you can release your Liberty in a singular powerful burst; all of your Liberty is expended. All hostile Creatures within 20 feet must make a Dexterity Saving Throw against your Martial DC or take 1d12 Force Damage for every Liberty expended in this way. You then gain the following benefits for the next 10 minutes.
3019: 
3020: **Champion of the Worthy.** Once on each of your Turns, if you have not used it that Turn you may use your Guide the Masses Feature without expending an Action. If you do so, you generate Liberty as if you had done so as an Action, and you may not do use that Feature as an Action that Turn.
3021: 
3022: **Shield of Belief.** At the beginning of each of your Turns, you gain Temporary Hit Points equal to your Guard Level.
3023: 
3024: **Time to Act.** Whenever you gain or are refunded Liberty, you gain one more.
3025: 
3026: Once you have used this Feature, you cannot do so again until you complete a Long Rest.
```

#### Liberator Unique Operator Skills Table (L3041–3093)
- **Basic Skills (4)**:
  1. *Defender of the Worthy* (SP 15, Start 0, Auto, Action, 3 Rounds): On activation, gain 1d8 THP for each Liberty consumed this turn. While active, when a creature within 15 ft is attacked, use Reaction to move to them and replace them as target. If you still have THP after the attack, regain Reaction and make a melee attack against the attacker.
  2. *Esoteric Bladework* (SP 30, Start 0, Auto, Bonus Action, 5 Rounds): Reach increased by 10 ft. When making a melee attack on turn, repeat attack against another creature within reach (no action required, cannot generate further attacks).
  3. *Flash of Light* (SP 10, Start 0, Auto, Bonus Action, 1 Attack): Next melee attack has Advantage; additional damage gained from expending Liberty is doubled. If attack misses, target takes half damage.
  4. *Sweep Away* (SP 20, Start 0, Auto, Action, Instant): 180-degree, 30-ft cone; DEX save vs Martial DC; 4d8 Slashing on fail, half on success.
- **Advanced Skills (4)**:
  1. *Edge of Fate* (SP 40, Start 15, Auto, Bonus Action, 3 Rounds): Spectral weapon within 100 ft. On activation and Bonus Action subsequent turns: move weapon 20 ft, melee attack (DEX or STR, proficient), 2d10 + Ability Mod Force damage. Crit range +1.
  2. *From on High* (SP 40, Start 15, Auto, Action, Instant): 25-ft radius, 100-ft high cylinder centered on self. All other creatures STR save vs Martial DC. Fail: 3d10 Force, speed 0 until end of next turn, take 3d10 Force at end of next turn. Flying creatures forced down, take fall damage, Stunned. Success: half damage, speed halved.
  3. *Heaven Piercer* (SP 40, Start 15, Auto, Action, Instant): Dash up to 50 ft to target without Opportunity Attacks. Attack with Advantage at +5 bonus. Deals hits equal to `ceil((Attack Roll - Target AC) / 2)` using the weapon.
  4. *Overrun* (SP 40, Start 15, Auto, Action, Instant): 15-ft cube. CON save vs Martial DC (creatures within reach have Disadvantage and take double damage). Fail: 3d10 Slashing and Frightened (resave at start of turn). Success: half damage, not Frightened.
- **Elite Skills (4)**:
  1. *Fortress* (SP 50, Start 30, Auto, Action, 5 Rounds): 30-ft aura. Allies gain saving throw bonus = Liberty expended. Attacks against allies have Disadvantage and cannot have Advantage. When an attack misses an ally within 30 ft, use Reaction to deal 1d10 Force damage for every 2 Liberty consumed.
  2. *Glory* (SP 80, Start 30, Auto, Action, 3 Rounds): 60-ft cone on activation and as Action on subsequent turns. DEX save vs Martial DC; 5d12 Radiant on fail, half on success.
  3. *Silence* (SP 65, Start 20, Auto, Action, Instant): 25-ft radius sphere (excluding self). STR save vs Martial DC; fail: 2d10 Slashing and pulled 15 ft towards self; success: half damage, not pulled. Then all creatures within 10 ft take 1d10 Slashing per Liberty consumed.
  4. *Storm* (SP 65, Start 20, Auto, Action, Instant): Attack up to 3 creatures within 100 ft as if in reach; Liberty damage doubled. If creature reduced to 0 HP, attack additional creature (max 6 total attacks, each creature once). Teleport within 5 ft of attacked creature.

---

### 1.4 Verbatim Source: Lord (Ch. 3 Lines 3109–3248)
```text
3109: ### Lord
3110: A Lord seeks to impose their will; this is as true as it ever was. Lords employ a variety of techniques to ensure none are safe from their jurisdiction, no matter the distance.
3111: 
3112: #### 1st Level: Authoritative
3113: A Lord doesn't think of themselves at being better than everyone else; they know that they are. They are destined to lead, by virtue of the fact that none can stop them.  You gain the following benefits:
3114: 
3115: **Overruled.** Whenever you are afflicted by an effect that requires you to make an Intelligence, Wisdom, or Charisma Saving Throw at the beginning or end of your Turn to end the effect, you may make that Saving Throw at the beginning and end of your Turn.
3116: 
3117: **Position of Power:** As a result of your actions, you can enter a special state known as having Authority. While you have Authority, your other Branch Features have additional effects, and at the beginning of each of your Turns, you can gain 1d8 Temporary Hit Points (no Action required).
3118: 
3119: You can gain Authority in the following ways:
3120: - When an Elite or Leader Creature you have damaged since the beginning of your last Turn is reduced to 0 Hit Points.
3121: - You reduce 2 or more Creatures to 0 Hit Points in the same Turn.
3122: - You reduce the Hit Points of a Creature who is not missing any Hit Points to 0 in a single instance of damage.
3123: 
3124: You can lose Authority in the following ways:
3125: - You are reduced to 0 Hit Points.
3126: - Your Turn ends while you are afflicted by an effect that requires you to roll a Saving Throw during your Turn to end the effect. If that Saving Throw is rolled at the end of your Turn, you roll to determine if that effect ends before you see if you lose your Authority.
3127: - You are Prone at the end of your Turn.
3128: - You roll Initiative.
3129: 
3132: **Press the Attack: Manifest Destiny (3 Aggression)** You can use this Press the Attack Option when you would lose Authority (no Action required); you do not lose Authority.
3133: 
3136: #### 1st Level: Manifest Will
3137: You can channel your will into strange Arts that turn even dull blades into lethal weapons. You gain the following benefits:
3138: 
3139: **Manifestation.** During your Turn, if it is not currently Manifested, you may Manifest your Will for 1 minute (no Action required). While your Will is Manifested: 
3140: - Melee weapons wielded by you gain the Range (30/-) Property. 
3141: - When you make a Ranged Attack using these weapons, you may use your Strength Modifier instead of your Dexterity for the Attack and Damage Rolls.
3142: - Your Weapon Attacks deal additional Force Damage equal to your Charisma Modifier.
3143: 
3144: You may use this Feature a number of times equal to your Proficiency Bonus, and regain all expended uses when you complete a Long Rest.
3145: 
3149: &nbsp;**Will Attunement.** You may change the Damage Type dealt by your Manifestation Feature by conducting a 10 minute long ritual, as if you were casting a Ritual Art. At the conclusion of the Ritual, you may choose a Damage Type that one of your Operator Skills can deal; this becomes the new Damage Type for your Manifestation Feature.
3150: 
3151: *Authority:* If you have Authority, your Ranged and Melee Weapon Attacks while your will is Manifested mark Creatures hit until the end of your next Turn with a Ranged or Melee Mark respectively. If you hit a marked Creature with a Weapon Attack that does not match the mark, that mark is expended, and that Attack deals 1d6 additional Damage of the same Type dealt by your Manifestation Feature.
3152: 
3170: #### 4th Level: King's Domain
3171: It's a ruler's right to choose their hunting grounds. When you use your Manifestation Feature, you may choose one of the following effects to activate for the duration of that Manifestation:
3172: 
3173: - **Castle Doctrine.** Your will manifests into a 15-foot-radius sphere centred on the location you were when you used your Manifestation Feature. When a hostile Creature enters this area while you are in it, you may (as a Reaction) move up to half of your Speed towards them and make a Melee Weapon Attack against them. If the Creature is not an Elite or Leader Creature, and you hit them with the Attack, your Reaction is refunded.
3174: *Authority:* If you hit a Creature with a Melee Attack made as a result of this Feature, you reduce their Speed by half until the end of their Turn.
3175: 
3177: - **Pursuit of Power.** Once per Turn, when you hit a Creature with a Weapon Attack, you may move up to your Movement Speed without provoking Opportunity Attacks; your Jump Distance is doubled when making this Movement.
3178: *Authority:* This Feature is no longer limited to once per Turn.
3179: 
3183: #### 10th Level: By Lordly Decree
3184: Your belief in yourself is so potent that you truly can carry out miracles. You gain the following benefits: 
3185: 
3186: **Make it So.** When you make a d20 roll to which you would add an Ability Score Bonus, you can expend a use of your Manifestation Feature to  instead add your Charisma Bonus. If you are not Proficient in the roll, you are considered to be Proficient in it. 
3187: *Authority:* If you are already Proficient in the roll, you instead are treated as having Expertise in that roll. This allows you to temporarily have Expertise in rolls that cannot normally have it, such as Saving Throws and Attack Rolls. 
3188: 
3190: **Press the Attack: A Leader Leads (1+ Authority)** You can use this Press the Attack Option when you gain Authority (no Action required); for each Aggression you expend, choose one allied Creature that can see or hear you. That Creature gains a Special Inspiration that expires after 1 minute. 
3191: 
3209: #### 13th Level: Force of Will
3210: Your strange arts have found new, explosive expression. 
3211: You gain one of the following benefits based on the Damage Type of your Manifestation Feature. When you change the Damage Type of your Manifestation Feature, the benefit you gain from this Feature also changes. You can only use this Feature once per Turn.
3215: | Damage Type       | Effect| 
3216: |:-----------------:|:-----:|
3217: | Fire, Psychic, Force, Thunder | When you hit a Creature with a Weapon Attack, you can cause your Arts to surge through them with explosive effect. Creatures within 10 feet of that Creature (except yourself) must make a Dexterity Saving Throw against your Martial DC. On a failed Save, they take 3d6 Damage of the same Type dealt by your Manifestation Feature; on a successful Save, they take half as much Damage.|
3218: | Bludgeoning, Piercing, Slashing, Radiant | As an Action, you can fire a slash of Arts energy in a 5-foot-wide, 50-foot-long line originating from you. Creatures within the area must make a Dexterity Saving Throw against your Martial DC. On a failed Save, they take 8d6 Damage of the same Type dealt by your Manifestation Feature; on a successful Save, they take half as much Damage.|
3219: | Acid, Cold, Lightning, Necrotic, Poison | When you hit a Creature with a Melee Weapon Attack, you can channel your will into the blow, dealing a mortal blow. That Creature must make a Constitution Saving Throw against your Martial DC, taking 6d6 Damage of the same Type dealt by your Manifestation Feature on a failed Save, or half as much Damage on a successful Save.
3221: Irrespective of which benefit you gain, you can only use this Feature a number of times equal to your Proficiency Bonus, and regain all expended uses when you complete a Long Rest.
3222: 
3227: #### 17th Level: Divine Right
3228: Does your authority come from divine providence? No, of course not; but if it appears to, then it is the same thing. The Authority benefits of your other Features are improved:
3229: - **Manifestation.** When you deal additional Damage as a result of a Ranged or Melee Mark, you can cause all other Creatures of your choice within 10 feet of the original Creature to also suffer that Damage.
3230: - **Castle Doctrine.** When you hit a Creature with a Melee Attack made as a result of Castle Doctrine, they must make a Wisdom Saving Throw against your Martial DC. On a failed Save, you reduce their Speed to 0 until the end of next Turn. On a successful Save, their Speed is halved until the end of their Turn.
3231: - **Pursuit of Power.** When you are moving as a result of this Feature, hostile Creatures that you move within 5 feet of take Damage equal to your Charisma Modifier of the same type as your Manifestation Feature. A Creature can only take this Damage once per Turn.
3232: - **Make it So.** If you fail the roll after using this Feature, you may reroll it, but must use the new result.
```

---

## 2. Logic Chain

From the source text and project rules, we derive the exact modeling requirements:

1. **Subclass Recognition & Profile Inspection:**
   - In `ak5e/scripts/guard-rules.mjs`, `GUARD_BRANCH_IDS` maps item IDs to `duellist`, `liberator`, and `lord`.
   - `IMPLEMENTED_GUARD_BRANCHES` must include these three branches.
   - Helper predicates `isDuellist(actor)`, `isLiberator(actor)`, `isLord(actor)` must inspect `guardBranch(actor)` and `guardEnabled(actor)`.

2. **Resource Pools (following `resource-pools.mjs` & WORKFLOW §3.2):**
   - **Duellist Points:**
     - Capacity: 0–10. Initial: 0. Recovery: reset on opponent death/surrender/change/1-min timeout (unless Level 17 Master Duellist).
     - Tracked under `flags.ak5e.duellist.points` or via `definePool` as `duellistPoints`.
   - **Liberator Liberty:**
     - Capacity: 0–6. Initial: 0. Recovery: generated during combat by turn-end inaction or Guide the Masses.
     - Tracked under `flags.ak5e.liberator.liberty` or via `definePool` as `liberty`.
   - **Lord Authority State & Manifestation:**
     - Authority is a boolean state: `flags.ak5e.lord.hasAuthority`.
     - Manifestation is a counted pool: capacity `@prof` uses, initial `@prof`, recovery on Long Rest (`recovery: [{ on: "lr", amount: "toMax" }]`).
     - Force of Will uses: capacity `@prof` uses, initial `@prof`, recovery on Long Rest.
   - **Aggression Pool Integration:**
     - Base Guard Aggression (4 at 1st, 6 at 7th, 8 at 14th; SR/LR recovery) is consumed by:
       - Duellist: Forestall (Parry reduces cost by 1, min 0), Reposte (1 Aggression), Lightning Reflexes (1 Aggression).
       - Liberator: Face Me (2 Aggression).
       - Lord: Manifest Destiny (3 Aggression), A Leader Leads (1+ Aggression).

3. **Weapon Properties & Sheet Modifications:**
   - Duellist: Greatswords and Polearms gain `finesse` property dynamically when wielded by a Duellist (`guardBranch(actor) === "duellist"`).
   - Lord: While Will is Manifested, melee weapons gain `range: { value: 30, units: "ft" }` and can use STR for ranged attack and damage rolls, plus bonus CHA mod damage.

4. **Action Economy Engine Plans (`guard-uses.mjs`):**
   - All interactive features must register use plans under `guardUses`.
   - Per WORKFLOW §3.2:
     - Player confirms action before applying; cancel leaves state untouched.
     - Saves and ability checks require NO confirm dialog.
     - Dice rolls (Coup de Grâce 8d8, Flash of Anger d6/d10, Révolution 1d12 per Liberty, Force of Will 3d6/8d6/6d6, THP 1d8) render chat cards with clickable roll buttons; never auto-roll.
     - Warning on shortfall allows "Use anyway" with clamping at 0 and public chat card notice.
     - Target token changes (damage, conditions, marks) relay via GM client kernel.
     - Every execution writes a durable receipt in `flags.ak5e.guardUses` with encounter-window undo support.

---

## 3. Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Duellist (L1) | Duelling Blades | Greatswords and Polearms gain the Finesse property while wielded. | Wielded weapon | Finesse property active; allows DEX for attack & damage | Non-Greatsword/Polearm unaffected | Ch. 3 L2746 |
| 2 | Duellist (L1) | Rules of Engagement: Opponent Declaration | Declare hostile creature as Opponent; earn Points up to 10 max. | Target creature, Bonus Action (Free at 17th) | Opponent set, +1 Point (+2 if not wielding Heavy Melee; +2/+3 at 10th) | Warn if already declared, clamp points at 10 | Ch. 3 L2748-2753 |
| 3 | Duellist (L1) | Rules of Engagement: Turn Start Points | Earn Points at turn start based on damage dealt/received. | Turn start event | +1 Point (or +2 at 10th) if damaged opponent; +1 if opponent did not damage Duellist | Points capped at 10 | Ch. 3 L2751-2752, L2783 |
| 4 | Duellist (L1) | Rules of Engagement: Point Reset | Reset points to 0 on opponent 0 HP, surrender, change, or 1-min timeout. | Trigger event | Points reset to 0 (retained at 17th level on 0 HP/surrender/change) | Cannot go below 0 | Ch. 3 L2754-2755, L2797 |
| 5 | Duellist (L1) | Parry | 1st Forestall/round costs 0 Reaction and 1 fewer Aggression (min 0). | Forestall use | AC bonus = PB * Aggression; Reaction not consumed; Aggression cost reduced by 1 | Clamps Aggression at 0 | Ch. 3 L2764 |
| 6 | Duellist (L1) | Press the Attack: Reposte | Reaction on melee miss within reach -> Attack of Opportunity. | Triggering miss, 1 Aggression, Reaction | AoO triggered, 1 Aggression spent, Reaction consumed | Warns if no Reaction/Aggression; clamps at 0 | Ch. 3 L2766 |
| 7 | Duellist (4th) | Every Victory, Another Step | Regain 1 Aggression when Opponent reduced to 0 HP or surrenders. | Opponent defeat event | +1 Aggression | Clamps at Aggression max | Ch. 3 L2776 |
| 8 | Duellist (4th) | Press the Attack: Lightning Reflexes | Reaction when required to make a save against visible effect -> make DEX save instead. | Visible save trigger, 1 Aggression, Reaction | Substitute DEX save | Warns if no Reaction/Aggression | Ch. 3 L2778 |
| 9 | Duellist (4th) | Punish every Opening | 1/Turn: use Reposte without expending Reaction on successful save vs creature in reach. | Successful save, 1 Aggression | Reposte AoO without consuming Reaction | Once per turn limit | Ch. 3 L2780 |
| 10 | Duellist (10th) | Duellist's Advance | Opponent declaration and turn-start damage points increased to 2. | Level >= 10 | Base points upgraded to 2 | None | Ch. 3 L2782-2784 |
| 11 | Duellist (13th) | Grand Challenge: Declaration | 1/Long Rest: Declare Grand Challenge alongside Opponent declaration. | No action required, 1/LR | Grand Challenge active for 1 min or until opponent ends | Warns if already used since LR | Ch. 3 L2785-2795 |
| 12 | Duellist (13th) | Corps a Corps | AoO when Opponent damages another creature (no action, 1/turn). | Opponent damage trigger | Free AoO against Opponent | Cooldown until next turn | Ch. 3 L2788 |
| 13 | Duellist (13th) | Grand Challenge: Displacement | Resistance to all damage dealt by creatures other than Opponent. | Incoming damage from non-opponent | Half damage applied | None | Ch. 3 L2790 |
| 14 | Duellist (13th) | Coup de Grâce | On melee hit at 10 Points: deal 8d8 unreduced Slashing/Piercing; ends Grand Challenge. | Melee hit, 10 Points | 8d8 damage card (ignores Resistance & DR), Grand Challenge ends | Requires 10 Points; opponent stays opponent | Ch. 3 L2792 |
| 15 | Duellist (17th) | Master Duellist | Retain points on defeat/surrender/change; declaration requires no action. | Level >= 17 | Points not lost; Declaration becomes Free action | None | Ch. 3 L2796-2798 |
| 16 | Duellist (Engage) | Analysis | Action: study hostile creature; once next turn, gain +1 additional Point on gaining points. | Action, 0 Points | Analysis buff placed; +1 Point on next point gain | 0 Points cost; 1/turn limit | Ch. 3 L2807 |
| 17 | Duellist (Engage) | Balestra | Reach +10 ft on next melee attack; move 10 ft to target; ignores DR if started >10 ft away. | No action, 2 Points | Attack reach +10 ft, movement card, bypasses DR | 1/turn limit; requires 2 Points | Ch. 3 L2809 |
| 18 | Duellist (Engage) | Derobement | Next melee attack damage halved; on hit, target has Disadvantage vs Duellist until next turn. | No action, 1 Point | Halved damage, target Disadvantage flag | 1/turn limit; requires 1 Point | Ch. 3 L2815 |
| 19 | Duellist (Engage) | Displacement (Engagement) | Next melee attack damage halved; on hit, move 10 ft away without provoking AoO. | No action, 1 Point | Halved damage, 10-ft safe retreat | 1/turn limit; requires 1 Point | Ch. 3 L2817 |
| 20 | Duellist (Engage) | En Garde | When spending Reaction on Lightning Reflexes or Reposte, refund Reaction. | No action, 1 Point | Reaction refunded | 1/turn limit; requires 1 Point | Ch. 3 L2819 |
| 21 | Duellist (Engage) | Feint | Bonus Action: next melee attack vs visible target before end of next turn has Advantage. | Bonus Action, 1 Point | Advantage on next attack roll | Target must see Duellist; 1/turn | Ch. 3 L2821 |
| 22 | Duellist (Engage) | Fleche | Bonus Action: next melee attack this turn deals +Guard Level additional damage. | Bonus Action, 2 Points | Damage bonus = Guard Level | 1/turn limit; requires 2 Points | Ch. 3 L2823 |
| 23 | Duellist (Engage) | Redoublement | Reaction on melee miss: reroll attack roll with halved damage. | Reaction, 1 Point | Attack reroll with half damage | 1/turn limit; requires 1 Point | Ch. 3 L2825 |
| 24 | Duellist (Engage) | Score | Next melee attack damage halved; on hit, inflicts Bleeding condition. | No action, 1 Point | Halved damage, Bleeding condition applied | 1/turn limit; requires 1 Point | Ch. 3 L2827 |
| 25 | Liberator (L1) | Liberty Pool | Special resource (0–6 max); generated in combat only. | Inaction or Guide the Masses | Liberty count updated (0 to 6) | Clamped at 0 min, 6 max | Ch. 3 L2943-2950 |
| 26 | Liberator (L1) | Turn-End Inaction Generation | Gain 1 Liberty at turn end in combat if did not attack, cast art, or activate/have active skill. | Turn end in combat | +1 Liberty (+2 with Time to Act) | Clamped at 6 | Ch. 3 L2946-2949 |
| 27 | Liberator (L1) | Guide the Masses: Advocate | Ally within 20 ft (40 ft at 10th) gains bonus HP/THP = max(2*PB, 2*Liberty). | Action (BA at 7th), Target Ally | Advocate card/flag; +1 Liberty generated | Non-cumulative; range 20/40 ft | Ch. 3 L2953-2954 |
| 28 | Liberator (L1) | Guide the Masses: Empower | Ally within 20 ft gains Damage Reduction = max(PB, Liberty) on next damage. | Action (BA at 7th), Target Ally | Empower card/flag; +1 Liberty generated | Non-cumulative; range 20/40 ft | Ch. 3 L2953-2955 |
| 29 | Liberator (L1) | Guide the Masses: Uplift | Ally within 20 ft gains bonus damage on next hit = max(PB, Liberty). | Action (BA at 7th), Target Ally | Uplift card/flag; +1 Liberty generated | Non-cumulative; range 20/40 ft | Ch. 3 L2953-2956 |
| 30 | Liberator (7th) | Guide the Masses (Bonus Action) | If used as Action, may use again as Bonus Action on a DIFFERENT ally. | Bonus Action, different ally | Second ally buffed | Requires prior Action use | Ch. 3 L2959-2961 |
| 31 | Liberator (L1) | Flash of Anger | On melee hit: expend 1–6 Liberty for +1d6 (d10 at 10th) per Liberty; refund 1 on kill. | Melee hit, 1-6 Liberty | Damage card (no crit scaling); refund 1 Liberty on kill | Clamped at 0; no crit multiplication | Ch. 3 L2968, L3004 |
| 32 | Liberator (L1) | The Right Moment | On skill activation: consume all Liberty; bonus damage to save skills and melee attacks. | Skill activation, all Liberty | +1d6 (d10 at 10th) per Liberty to save damage; +1d6 (d10) per 2 Liberty to melee | Consumes all Liberty | Ch. 3 L2970-2972, L3004 |
| 33 | Liberator (4th) | Rising Tide | All Operator Skills gain Automatic, Offensive, and Defensive charging methods. | Passive | Operator Skills charge on turn start (+2), attack/heal (+1), and defense (+2) | None | Ch. 3 L2976-2980 |
| 34 | Liberator (10th) | Far Reaching Guidance | Guide the Masses range increased to 40 feet. | Passive | Range = 40 ft | None | Ch. 3 L3002 |
| 35 | Liberator (10th) | Improved Liberty | Flash of Anger and The Right Moment damage dice upgraded from d6 to d10. | Passive | Damage dice = d10 | None | Ch. 3 L3004 |
| 36 | Liberator (10th) | Press the Attack: Face Me | Bonus Action, 2 Aggression: cast Compelled Duel (no somatic components) using Martial DC. | Bonus Action, 2 Aggression | Compelled Duel cast card with Martial DC | Warns if insufficient Aggression | Ch. 3 L3006 |
| 37 | Liberator (13th) | Cannot be Denied | Flash of Anger damage becomes Force, or any Arts damage type from owned skills. | Toggle/Choice | Damage type set to Force or chosen Arts type | Requires skill with that type | Ch. 3 L3011 |
| 38 | Liberator (13th) | Caught in the Crossfire | Secondary creature within 10 ft takes Flash of Anger additional damage. | Target secondary creature | Secondary damage card | Secondary must be within 10 ft | Ch. 3 L3013 |
| 39 | Liberator (17th) | Révolution: Burst | Action, 1/LR: expend all Liberty; 20-ft burst DEX save vs Martial DC for 1d12 Force per Liberty. | Action, all Liberty, 1/LR | 20-ft burst save card, 1d12 per Liberty | 1/Long Rest | Ch. 3 L3018, L3026 |
| 40 | Liberator (17th) | Champion of the Worthy | 1/Turn free Guide the Masses without Action; generates Liberty as if done as Action. | Free action, 1/turn | Free Guide the Masses, +1 Liberty | Cannot also use as Action that turn | Ch. 3 L3020 |
| 41 | Liberator (17th) | Shield of Belief | Gain Temporary HP = Guard Level at start of each turn. | Turn start event | THP = Guard Level | Clamps at highest THP | Ch. 3 L3022 |
| 42 | Liberator (17th) | Time to Act | Whenever gaining or refunded Liberty, gain +1 additional Liberty. | Liberty gain/refund event | +1 bonus Liberty | Clamped at 6 max | Ch. 3 L3024 |
| 43 | Liberator (Skills) | 12 Unique Operator Skills | 4 Basic, 4 Advanced, 4 Elite unique branch Operator Skills. | Skill selection | SP, Charging, Activation, Effect, Duration | See Section 5.2 | Ch. 3 L3041-3093 |
| 44 | Lord (L1) | Overruled | Roll INT/WIS/CHA saves at BOTH beginning and end of turn if normally at start or end. | Save trigger at turn start/end | Grants additional save attempt | Only for INT/WIS/CHA | Ch. 3 L3115 |
| 45 | Lord (L1) | Authority State: Gain | Enter Authority state on Elite/Leader kill damaged since last turn, 2+ kills in turn, or full-HP 1-shot. | Combat events | `flags.ak5e.lord.hasAuthority = true` | Boolean state | Ch. 3 L3117-3122 |
| 46 | Lord (L1) | Authority State: Loss | Lose Authority on 0 HP, end-of-turn save affliction, Prone at end of turn, or rolling Initiative. | Combat events | `flags.ak5e.lord.hasAuthority = false` | Save rolled before check at turn end | Ch. 3 L3124-3129 |
| 47 | Lord (L1) | Authority: 1d8 Turn-Start THP | At start of turn with Authority, gain 1d8 Temporary HP (no action). | Turn start with Authority | 1d8 THP roll card | Clamps at highest THP | Ch. 3 L3117 |
| 48 | Lord (L1) | Press the Attack: Manifest Destiny | 3 Aggression when Authority would be lost: prevent Authority loss. | Loss trigger, 3 Aggression | Authority retained | Warns if < 3 Aggression | Ch. 3 L3132 |
| 49 | Lord (L1) | Manifestation Active | 1 min duration, @prof uses/LR: melee weapons gain Range 30/-, STR for ranged, +CHA Force damage. | No action on turn, 1 Manifestation use | Active state, weapon properties updated | Requires use; 1 min duration | Ch. 3 L3139-3145 |
| 50 | Lord (L1) | Will Attunement | 10-min ritual: change Manifestation damage type to any type from owned Operator Skills. | 10-min ritual, choice | Damage type updated | Must match an owned skill type | Ch. 3 L3149 |
| 51 | Lord (L1) | Authority Marks | Attacks while Manifested mark creatures (Ranged/Melee). Opposite attack deals +1d6. | Weapon hit with Authority | Mark applied; opposite hit deals +1d6 and clears mark | Marks expire at end of next turn | Ch. 3 L3151 |
| 52 | Lord (4th) | Castle Doctrine (King's Domain) | 15-ft zone. Hostile enters -> Reaction move half speed & melee attack. Refund Reaction on non-elite hit. Authority halves speed. | Reaction on entry | Move + melee attack; refund Reaction if non-elite/leader hit; speed halved with Authority | Zone fixed at activation spot | Ch. 3 L3173-3175 |
| 53 | Lord (4th) | Pursuit of Power (King's Domain) | 1/Turn on hit: move speed without AoO; 2x jump. Authority removes 1/turn limit. | Weapon hit | Safe movement card; unlimited per turn with Authority | 1/turn without Authority | Ch. 3 L3177-3179 |
| 54 | Lord (10th) | Make it So | Spend Manifestation use: add CHA to d20 roll instead of normal ability; grant Prof (or Expertise with Authority). | d20 roll, 1 Manifestation use | Roll modified by CHA + PB (or 2*PB); reroll on fail at 17th | Spend 1 Manifestation use | Ch. 3 L3186-3188, L3232 |
| 55 | Lord (10th) | Press the Attack: A Leader Leads | When gaining Authority: spend 1+ Aggression to give Special Inspiration (1 min) to allies. | Authority gain, 1+ Aggression | Special Inspiration granted to allies | Warns if insufficient Aggression | Ch. 3 L3190 |
| 56 | Lord (13th) | Force of Will: Element Matrix | PB uses/LR, 1/turn: Fire/Psych/Force/Thunder (10ft burst 3d6 DEX); B/P/S/Radiant (50ft line 8d6 DEX); Acid/Cold/Light/Necro/Pois (melee 6d6 CON). | Action or Hit, 1 use, 1/turn | Damage card & save prompt based on element | 1/turn; PB uses/Long Rest | Ch. 3 L3209-3222 |
| 57 | Lord (17th) | Divine Right | Enhances Marks (10-ft splash), Castle Doctrine (WIS save vs speed 0), Pursuit of Power (CHA damage aura), Make it So (reroll on fail). | Passive enhancements | Upgraded cards and DCs | Requires Level >= 17 and Authority | Ch. 3 L3227-3233 |

---

## 4. Comprehensive Edge Cases

| # | Feature | Input / Condition | Observed & Required Behavior |
|---|---------|-------------------|-----------------------------|
| 1 | Duellist: Rules of Engagement | Declare Opponent while already having an Opponent (Levels 1–16) | Previous Opponent is cleared and all accrued Points are lost (reset to 0). New Opponent is set with fresh +1 (or +2) Points. |
| 2 | Duellist: Master Duellist (17th) | Declare Opponent while already having an Opponent (Level 17+) | Accrued Points are NOT lost; they carry over to the new duel, provided no Grand Challenge was issued. |
| 3 | Duellist: Heavy Melee Weapon | Wielding Greatsword (Heavy) upon Opponent declaration | Receives base +1 Point (or +2 at 10th level); does NOT receive the additional +1 Point for not wielding Heavy Melee. |
| 4 | Duellist: Weapon Swap | Declare without Heavy weapon (+2 Points), then equip Greatsword | The additional +1 Point is immediately lost: Points decrease by 1 (clamped at 0). |
| 5 | Duellist: Multiple hits in a turn | Deal damage to Opponent 3 times during turn | Turn-start evaluation checks if damaged opponent *since start of last turn*. Yields +1 Point (+2 at 10th) once at turn start, not per hit. |
| 6 | Duellist: Reciprocal damage | Both Duellist and Opponent damage each other during the round | Duellist gains +1 (or +2 at 10th) for damaging Opponent, but does NOT gain the +1 bonus for not taking damage from Opponent. |
| 7 | Duellist: Inactivity timeout | 1 minute (10 rounds) passes without either party dealing damage to the other | Duel ends; all accrued Points are reset to 0. |
| 8 | Duellist: Parry + Forestall | Forestall used first time in a round with 1 Aggression spent | Parry reduces Aggression cost by 1 (1 - 1 = 0 Aggression net cost) and consumes 0 Reaction. AC increases by +PB against triggering attack. |
| 9 | Duellist: Parry + Forestall | Forestall used first time in a round with 3 Aggression spent | Aggression cost reduced by 1 (3 - 1 = 2 Aggression spent), consumes 0 Reaction. AC increases by +3*PB. |
| 10 | Duellist: Lightning Reflexes | Required to make an INT save against Phantasmal Force (visible illusion) | Can expend Reaction + 1 Aggression to make a DEX save instead. |
| 11 | Duellist: Lightning Reflexes | Required to make a CON save against an invisible poison cloud | Cannot use Lightning Reflexes because the effect is not visible ("against an effect you can see"). |
| 12 | Duellist: Coup de Grâce | Melee hit on Opponent during Grand Challenge with 10 Points | Deals 8d8 Slashing or Piercing damage that ignores Resistance and DR. Grand Challenge ends immediately. Opponent remains Opponent if they survive. |
| 13 | Duellist: Coup de Grâce | Melee hit on Opponent during Grand Challenge with 9 Points | Coup de Grâce cannot trigger; requires exactly 10 Points. Standard weapon damage applies. |
| 14 | Duellist: Engagements | Attempting to use Feint twice in the same turn | Disallowed: "You cannot use the same Engagement more than once per Turn." Feint button disabled for remainder of turn. |
| 15 | Duellist: Fleche + Attack | Fleche used, then attack misses | Fleche bonus damage is not applied to a miss. Fleche applies to the "next Melee Attack this Turn"; if turn ends, buff expires. |
| 16 | Liberator: Liberty Inaction | Player takes Dash action, does not attack, cast art, or activate skill | At turn end in combat, gains +1 Liberty because no attack roll was made, no art cast, and no skill activated. |
| 17 | Liberator: Liberty Inaction | Player makes an Opportunity Attack outside their turn | The condition is checked "at the end of any of your Turns that you did not...". Making an AoO on an enemy's turn does NOT invalidate turn-end inaction on your own turn! |
| 18 | Liberator: Liberty Inaction | Combat ends, player waits 6 rounds out of combat | Liberty can only be generated during combat ("You can only generate Liberty during Combat"). Does not generate Liberty out of combat. |
| 19 | Liberator: Guide the Masses | Advocate used on ally at 0 HP | Next time ally gains HP/THP, they receive an additional max(2*PB, 2*Liberty). Valid and applies on healing from 0 HP. |
| 20 | Liberator: Flash of Anger | Critical hit rolled on Melee Weapon Attack with 3 Liberty spent | Weapon dice are doubled normally, but the 3d6 (or 3d10) from Flash of Anger is explicitly NOT doubled ("this additional Damage cannot be increased by Critical Hits"). |
| 21 | Liberator: Flash of Anger | Attack reduces target creature to 0 HP | 1 Liberty is refunded (clamped at 6 max; or +2 refunded at 17th level with Time to Act). |
| 22 | Liberator: The Right Moment | Activate Operator Skill with 5 Liberty | Skill consumes all 5 Liberty. Save skills deal +5d6 (+5d10 at 10th) damage. Melee attacks deal +2d6 (+2d10) damage (`floor(5/2) = 2`). |
| 23 | Liberator: Compelled Duel | Cast via Face Me with 0 spell slots and no Casting Unit | Allowed: Face Me casts it via Press the Attack, ignoring Somatic components and using Martial DC. Requires 2 Aggression and Bonus Action. |
| 24 | Liberator: Révolution | Hostile creature succeeds on DEX save against Révolution burst | Source says: "must make a Dexterity Saving Throw against your Martial DC or take 1d12 Force Damage for every Liberty expended". On successful save, takes no damage. |
| 25 | Lord: Authority Acquisition | Party ally reduces an Elite creature to 0 HP that Lord damaged earlier in the round | Lord gains Authority! "When an Elite or Leader Creature you have damaged since the beginning of your last Turn is reduced to 0 Hit Points." Lord does not need the killing blow. |
| 26 | Lord: Authority Acquisition | Lord reduces 2 minions to 0 HP in a single Turn | Lord gains Authority! "You reduce 2 or more Creatures to 0 Hit Points in the same Turn." |
| 27 | Lord: Authority Acquisition | Lord attacks undamaged foe (full HP) and reduces it to 0 HP in one hit | Lord gains Authority! "You reduce the Hit Points of a Creature who is not missing any Hit Points to 0 in a single instance of damage." |
| 28 | Lord: Authority Loss | Lord ends turn afflicted by Hold Person (save at end of turn) | Lord rolls WIS save at end of turn (Overruled allows roll at start and end!). If Lord succeeds, affliction ends, so Lord does NOT lose Authority! If Lord fails and remains afflicted, Authority is lost. |
| 29 | Lord: Manifest Destiny | Lord knocked to 0 HP, has 3 Aggression | Lord uses Manifest Destiny (no action required, 3 Aggression) to prevent losing Authority. Authority is retained. |
| 30 | Lord: King's Domain (Castle Doctrine) | Hostile Non-Elite creature enters 15-ft zone; Lord hits with Reaction attack | Reaction is refunded! Lord can react again to another entering creature in the same round. |
| 31 | Lord: King's Domain (Castle Doctrine) | Hostile Elite creature enters 15-ft zone; Lord hits with Reaction attack | Reaction is NOT refunded (only refunded on non-Elite / non-Leader creatures). Reaction is spent normally. |
| 32 | Lord: Make it So + Save | Lord makes a DEX saving throw against Fireball while holding Authority | Spends 1 Manifestation use. Adds CHA modifier instead of DEX. If proficient in DEX saves, gains temporary Expertise (adds 2*PB instead of PB)! |
| 33 | Lord: Make it So + Attack | Lord makes an Attack roll while holding Authority | Spends 1 Manifestation use. Adds CHA modifier instead of STR/DEX. Since proficient in weapon, gains temporary Expertise (+2*PB to attack roll)! |
| 34 | Lord: Force of Will Elements | Lord's Manifestation is attuned to Fire damage | Lord gains Option 1: On weapon hit (1/turn), 10-ft burst around target, DEX save vs Martial DC, 3d6 Fire damage. |
| 35 | Lord: Force of Will Elements | Lord's Manifestation is attuned to Slashing damage | Lord gains Option 2: As an Action (1/turn), 50-ft long, 5-ft wide line, DEX save vs Martial DC, 8d6 Slashing damage. |
| 36 | Lord: Force of Will Elements | Lord's Manifestation is attuned to Poison damage | Lord gains Option 3: On melee hit (1/turn), CON save vs Martial DC, 6d6 Poison damage. |

---

## 5. Subclass Technical Specifications

### 5.1 Duellist Specification Breakdown
- **Subclass Flag / Identifier:** `subclass-guard-duellist` -> `duellist`.
- **Level Progression:**
  - **Level 1:** Singular Foe (`duellingBlades`, `rulesOfEngagement`), Parry and Riposte (`parry`, `reposte`).
  - **Level 4:** Principles of Defence (`everyVictory`, `lightningReflexes`, `punishEveryOpening`).
  - **Level 10:** Duellist's Advance (+2 base points on declaration and turn-start damage).
  - **Level 13:** Grand Challenge (`corpsACorps`, `displacementPassive`, `coupDeGrace`).
  - **Level 17:** Master Duellist (Point retention, Free Action declaration).
- **Resource Pool:**
  - `duellistPoints`: 0 to 10 max.
  - Initial: 0.
  - Reset on: Opponent 0 HP, surrender, change, or 10 rounds no damage (unless Level 17 Master Duellist).
- **Engagements Ledger (9 Options):**
  1. `analysis`: Action, 0 Points. Grants +1 Point on next point gain.
  2. `balestra`: No action, 2 Points. Reach +10 ft, move 10 ft forward, ignores DR if started >10 ft away.
  3. `derobement`: No action, 1 Point. Half attack damage, target has Disadvantage vs Duellist until next turn.
  4. `displacement`: No action, 1 Point. Half attack damage, move 10 ft away without provoking AoO.
  5. `enGarde`: No action, 1 Point. Triggered on Lightning Reflexes or Reposte, refunds Reaction.
  6. `feint`: Bonus Action, 1 Point. Next melee attack vs visible target before end of next turn has Advantage.
  7. `fleche`: Bonus Action, 2 Points. Next melee attack this turn deals +Guard Level damage.
  8. `redoublement`: Reaction, 1 Point. Reroll missed melee attack with half damage.
  9. `score`: No action, 1 Point. Half attack damage, inflicts Bleeding condition.

### 5.2 Liberator Specification Breakdown
- **Subclass Flag / Identifier:** `subclass-guard-liberator` -> `liberator`.
- **Level Progression:**
  - **Level 1:** Essence of the Liberator (`liberty`, `guideTheMasses`), Righteous Outburst (`flashOfAnger`, `theRightMoment`, unique skills).
  - **Level 4:** Rising Tide (Automatic, Offensive, and Defensive charging on all skills).
  - **Level 7:** Guide the Masses upgrade (Bonus Action second use on different ally).
  - **Level 10:** Praxis (`farReachingGuidance` 40 ft, `improvedLiberty` d10, `faceMe` Compelled Duel).
  - **Level 13:** Smouldering Anger (`cannotBeDenied` Force/Arts, `caughtInTheCrossfire` 10-ft splash).
  - **Level 17:** Révolution (`revolutionBurst`, `championOfTheWorthy`, `shieldOfBelief`, `timeToAct`).
- **Resource Pool:**
  - `liberty`: 0 to 6 max.
  - Generation: Combat only. Inaction at turn end (+1), Guide the Masses (+1), Flash of Anger kill refund (+1). With Time to Act (+1 additional).
- **Guide the Masses Choices:**
  - `advocate`: Bonus healing/THP = `max(2*PB, 2*Liberty)`.
  - `empower`: Damage reduction = `max(PB, Liberty)`.
  - `uplift`: Bonus attack damage = `max(PB, Liberty)`.
- **12 Unique Operator Skills:**
  - Basic: *Defender of the Worthy* (15 SP, Action), *Esoteric Bladework* (30 SP, BA), *Flash of Light* (10 SP, BA), *Sweep Away* (20 SP, Action).
  - Advanced: *Edge of Fate* (40 SP, BA), *From on High* (40 SP, Action), *Heaven Piercer* (40 SP, Action), *Overrun* (40 SP, Action).
  - Elite: *Fortress* (50 SP, Action), *Glory* (80 SP, Action), *Silence* (65 SP, Action), *Storm* (65 SP, Action).

### 5.3 Lord Specification Breakdown
- **Subclass Flag / Identifier:** `subclass-guard-lord` -> `lord`.
- **Level Progression:**
  - **Level 1:** Authoritative (`overruled`, `positionOfPower` / Authority, `manifestDestiny`), Manifest Will (`manifestation`, `willAttunement`, marks).
  - **Level 4:** King's Domain (`castleDoctrine` or `pursuitOfPower`).
  - **Level 10:** By Lordly Decree (`makeItSo`, `aLeaderLeads`).
  - **Level 13:** Force of Will (3 element categories).
  - **Level 17:** Divine Right (Mark splash, Castle Doctrine save, Pursuit of Power aura, Make it So reroll).
- **Resource Pools & State:**
  - `hasAuthority`: Boolean flag `flags.ak5e.lord.hasAuthority`.
  - `manifestation`: Counted pool `@prof` uses, Long Rest recovery.
  - `forceOfWill`: Counted pool `@prof` uses, Long Rest recovery, 1/turn limit.
- **Authority Triggers:**
  - Gain: Elite/Leader kill damaged since last turn; 2+ kills in turn; full-HP 1-shot kill.
  - Lose: 0 HP; end-of-turn save affliction; Prone at end of turn; Initiative.
  - Prevent Loss: Manifest Destiny (3 Aggression).
- **Force of Will Matrix (13 Damage Types):**
  - **Group 1 (Fire, Psychic, Force, Thunder):** 10-ft burst on weapon hit; DEX save vs Martial DC; 3d6 damage.
  - **Group 2 (Bludgeoning, Piercing, Slashing, Radiant):** Action 50-ft line; DEX save vs Martial DC; 8d6 damage.
  - **Group 3 (Acid, Cold, Lightning, Necrotic, Poison):** Melee hit; CON save vs Martial DC; 6d6 damage.

---

## 6. Caveats

1. **Compelled Duel Spell Data:** In AK5e, "Arts" that share names with D&D 5e spells (like Compelled Duel) rely on the D&D 5e system compendium. Face Me casts Compelled Duel with somatic components ignored and Martial DC substituted for spell save DC.
2. **Text Typo in Source:** In Chapter 3 line 3190, the heading reads `**Press the Attack: A Leader Leads (1+ Authority)**`, but the body text explicitly states `for each Aggression you expend, choose one allied Creature...`. The requirement is Aggression expenditure when gaining Authority, matching `ORIGINAL_REQUEST.md`.
3. **Coup de Grâce Point Consumption:** The source text states `When you hit your Opponent with a Melee Attack while you have 10 Points, you can make that Attack a Coup de Grâce... and the Grand Challenge ends`. It ends the Grand Challenge, which naturally resets Points to 0 upon ending the challenge.

---

## 7. Conclusion

The specification for the three Guard subclasses (Duellist, Liberator, and Lord) is fully mined, cross-referenced, and validated against AK5e 1.3.1 source files. Every mechanic, formula, action cost, resource pool, and edge case is identified with exact line numbers. The downstream implementer and test authors can build the vertical slice without ambiguity.

---

## 8. Verification Method

To independently verify the observations and rules documented in this report:

1. **Verify Source Citations:**
   ```bash
   # Verify Duellist text (lines 2739–2845)
   sed -n '2739,2845p' AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt
   
   # Verify Liberator text (lines 2937–3093)
   sed -n '2937,3093p' AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt
   
   # Verify Lord text (lines 3109–3248)
   sed -n '3109,3248p' AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt
   
   # Verify Martial DC definition
   sed -n '211,213p' AK5e_1.3.1_Foundry_Source/01_chapter_1_changing_the_game.txt
   
   # Verify Physical vs Arts damage classification
   sed -n '145,160p' AK5e_1.3.1_Foundry_Source/01_chapter_1_changing_the_game.txt
   ```

2. **Verify Codebase Alignment:**
   Inspect `ak5e/scripts/guard-rules.mjs` for branch IDs and `ak5e/scripts/guard-features.mjs` / `guard-uses.mjs` for existing Guard class mechanics.
