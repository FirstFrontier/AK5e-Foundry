# AK5e — Things that still need verification

This file lists behaviour that is **implemented but not yet verified** the way WORKFLOW.md §5 requires: in a
rendered Foundry VTT 13 + D&D5e session, as a player, in a clean World, or by a human at the table.

**Where other things go:**
- Known defects: `bugs/pending/` (rules in `bugs/README.md`).
- Open rules questions: `ak5e/DECISIONS.md`.
- Planned work: `TODO.md`.
- Evidence from completed runs: `ak5e/FOUNDRY_SMOKE_TEST.md`.

**How to use:**
- Add items under the relevant heading. Name what was already verified and how, so the gap is clear.
- When an item is verified, tick it and note the date, the run and where the evidence lives.
- If verification finds a defect, open a `bugs/pending/` file instead (see `bugs/README.md`).
- Use only disposable or private copies of test Worlds, and `launchTestBrowser()` for every Playwright Chromium run.

## Juggernaut, Protector and Sentry (2026-10-11)

**Already verified:**
- Unit tests: `ak5e/test/juggernaut.test.mjs`, `protector.test.mjs`, `sentry.test.mjs` and the Sentry tests in `defender-progression.test.mjs`.
- 8/8 live checks in `ak5e/tools/test-defender-jps-live.mjs` with 0 console errors, on a private copy of `standard-test`: Foundry 13.351, D&D5e 5.3.3, renderer `ANGLE (Mesa, AMD CEDAR, OpenGL ES 3.1)`.
- Browser reload and server-restart persistence.
- Screenshot review by the foundry-validator sub-agent.

**Not yet verified (run 5 did not cover these):**

### Juggernaut

- [ ] Groundbreaker used live: the Strength save link at the Martial DC, the 8d12 Thunder roll, and native Apply Damage.
- [ ] Bullrush restore (2 Resilience) and Short Rest recovery of Bullrush in Foundry's rest dialog.
- [ ] Reform a layer as a Bonus Action (1 Resilience) from the panel dialog. So far it has been exercised only through the API.
- [ ] Overwhelming Might on a **critical hit**: the extra Force roll should double like the weapon's dice. It is added as a separate roll configuration copied from the first roll.
- [ ] Superheavy while not wearing Heavy Armour, rendered: no halving, and the panel says the Barrier does not protect.
- [ ] Shatterstorm applied to several chosen Creatures with the roll card's native damage controls.
- [ ] Superheavy when the GM and the Juggernaut's player apply Damage at the same moment (cross-client race; see bugs/pending B-092).

### Protector

- [ ] Centre of Attention from the panel dialog with several targets, as a Bonus Action (2 Resilience). Then Taunt from the dialog on each Creature that failed.
- [ ] The Taunt reminder toast when a Taunted Creature attacks someone else.
- [ ] Punishment applied automatically on a real hit by the Protector, its Disadvantage on the target's next attack roll, and its use-up.
- [ ] Re-enabling a used-up Punishment or Greater Improved Shelter effect from the Effects tab restores it.
- [ ] Stone Wall's whispered prompt after a real enemy melee hit, and its button opening the prefilled dialog.
- [ ] Impenetrable from the panel:
  - the rounding reading;
  - the Bulwark (Bastion) warning without a Bastion shield;
  - the refund, and undoing the refund spending the Reaction again.
- [ ] Unending Defence firing at the end of the Protector's Turn in a running combat (GM client).
- [ ] Greater Improved Shelter expiring at the start of the Protector's next Turn in combat.
- [ ] Improved Taunt halving Damage dealt by a Taunted Creature, applied from that Creature's own damage card.
- [ ] The Improved Shelter Advantage toast text on a save rolled from a save button in a chat card (it has only been tested with `rollSavingThrow`).

### Sentry

- [ ] Progression in Foundry's setup dialog:
  - the Equipment Exchange (a ranged weapon granted instead of the Light Melee Weapon or Light Shield);
  - the Marksman Fighting Style choice at 4th level;
  - the ranged proficiencies on a real Actor.
- [ ] Link a placed token as the Pavise:
  - a prop creature placed by the GM and by a player;
  - Shelter following the token after it is moved on the canvas.
- [ ] Recover Pavise and Bar the Gates from the panel:
  - the template removed or moved;
  - the shield re-equipped;
  - undo putting the old marker back.
- [ ] The Advance and Fire whispered prompt after a real enemy attack on the Sentry, a sheltered ally and a Pavise ally (the run-5 prompt came from the attack event in the live run).
- [ ] Retributor in a running combat: once per Round, reset in the next Round, and undo clearing the marker.
- [ ] Torrent of Lead, Wall of Steel lasting until the end of the Sentry's next Turn in a running combat.
- [ ] Heads Down from the panel: the range warning and the card text.
- [ ] The Half Cover reminder and Disadvantage toast on attacks from beyond the shield, rolled by a player-owned attacker.

### All three Branches

- [ ] Import from **locked release packs in a clean World** (WORKFLOW §3.1, §5.1 item 7). The live runs used source records created by script in a development World.
- [ ] A second player client that owns neither the Defender nor the target (observer view): cards, prompts and panel permissions.
- [ ] Encounter-window locking of these receipts at combat start and end (undo shown as locked).
- [ ] Cards and dialogs in the light theme. The screenshots were reviewed in the default dark interface with parchment cards.
- [ ] A visible scroll affordance on the Defender panel once bugs/pending B-095 is addressed.
