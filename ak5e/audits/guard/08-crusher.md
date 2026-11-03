# Guard audit 08: Crusher subclass

Date 2026-10-12. Auditor: Claude Sonnet 5.5 (single agent, no sub-agents). Audit only; no production code or tests changed.

## Scope and reading
- Source: `AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt` L2633-2738 in full. Referenced: `04_chapter_4_equipment.txt` L60-130, L170-185 (Heavy Melee category, Crush), `01_chapter_1_changing_the_game.txt` L236 (Dazed), Hit Die text.
- Code read in full: `ak5e/scripts/crusher-features.mjs`, `ak5e/test/crusher.test.mjs`, `ak5e/scripts/guard-uses.mjs`, `guard-rules.mjs`, `play-uses.mjs`, `ak5e/test/guard-fixture.mjs`. Crusher paths read in `guard-sheet.mjs` (L100-140, L340-450, L1128-1133), `play-uses-sheet.mjs#confirmPlayUse`, `guard-progression.mjs` (HP / Maximum Bulk), `ak5e.mjs` (hook registration, item flags), `chapter-four-content.mjs` (Greatsword data).
- Docs: AGENTS.md, WORKFLOW.md, bugs/README.md, DECISIONS.md L1390-1440, TODO.md Crusher entries.

## Checks run
- `npm run test:guard`: 118/118 pass, before filing. `npm run check:files`: pass, also after adding `ak5e/audits/` (the folder is accepted). `npm ci` is unusable (no package-lock.json); tests run without node_modules.
- Node probes (throwaway, outside the repo, real modules + guard-fixture): sheet payloads for the four input-less commands; Renewing roll, heal and undo; Foecrusher and Overbear shortfall + override; invalid riders; heavy-weapon detection on module-shaped items; `crusherPreRollDamage`; progression Maximum Bulk; `isCrusher` mixed case. No live Foundry, no Playwright.

## Bugs filed (B-230..B-239)
- B-230 High: Heavy Melee detection uses `hvy`; module Greatsword/Polearm never match, heavy ranged does; die-size fallback.
- B-231 High: Sheet buttons for Death's Passing, Horde Breaker, Heroic Blow, Heroic Killing Blow send no inputs (0 damage, always throws, never executes, Crush ignores weapon).
- B-232 High: Renewing Strike spends no Hit Die and warns about none.
- B-233 Medium: Extreme Fortitude not implemented anywhere (marked done).
- B-234 Medium: Singular Strike helper unused; no enforcement or damage.
- B-235 Medium: Overbear accepts any rider names and is not tied to a Foecrusher use.
- B-236 Low: Additional Reach, Realmrending Blow, Execution have no mechanics; card wording reads as applied.
- B-237 Low: `isCrusher` true for another subclass owning a stray Crusher Item.
- B-238 Low: Question: Heroic Blow rider, Singular Strike scope, Horde Breaker "excess" unruled and unlogged.
- B-239 Low: No equipment or timing warnings (wielded Heavy Melee Weapon, own Turn, Heroic Blow before Killing Blow).

## Existing bugs re-verified
- B-129 (no confirm): confirmed on the Crusher path. Foecrusher/Overbear open a choice dialog only; the other four commands run on click. Linked from B-231, not duplicated.
- B-132 (progression repeats HP): same code path applies to Crusher (static; the +3/level in guard-progression.mjs#L464 sits in the same loop). Not re-probed, not duplicated.
- B-133 (undo retains flags): not reproducible for Crusher. No plan mutates `state.data`; undo restores pools and heal (probe).
- B-135 (Reaction spent before receipt): not applicable; Crusher plans never spend Reactions.
- B-144 (other-subclass leakage): same pattern seen via B-237.
- B-153 (coverage): confirmed; `crusher.test.mjs` fakes an `hvy` weapon, never calls the hook, warnings, overrides or undo.

## Verified clean
- Foecrusher pool: max `@prof` (3 at PB 3), Short/Long Rest recovery, spend 1, warning at 0 uses, override clamps at 0 with "short by 1" shortfall, level 4 gate warns only.
- Four rider names and the one-rider choice per Foecrusher; invalid rider rejected.
- Overbear: 2 Aggression, shortfall warning and override clamp, 1d10 only via the card Roll button (not auto-rolled), riders must differ.
- Renewing heal: formula `1d10 + CON`, rolled only from the button, applied to self, undo restores HP and the use.
- Heroic Blow Crush = existing + 2xPB (L2698) when the number is supplied; Execution threshold < 50; level-13/17 warnings are warn-only.
- Horde Breaker arithmetic: excess damage is not rolled.
- Singular Strike helper arithmetic matches the L2655-2661 example.
- Maximum Bulk arithmetic: +3 per level when HP choices are non-existing (probe: +12 over Centurion at L4). Caveat, not filed: the default choice is "existing" (nothing added), a deliberate opt-in shared with other classes; `guardChoices` fills missing levels with "existing", so the undefined-choice path is unreachable. Noted under B-233.

## Limits
- Node only; nothing rendered in Foundry V13. dnd5e 5.x field shapes (roll config, `DamageData.formula`, Hit Die fields) come from static knowledge.
- Relay / GM-client paths not exercised (Crusher only ever changes the source Actor).
- Rider effects (Slow, Dazed, push) are text only; judged under B-236/B-238, not as separate defects.
