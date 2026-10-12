# B-090 · Medium · Damage Reduction is applied after the automatic halving and Resistance

Area: Juggernaut, Protector and Sentry
Context: found by the independent review (critical-reviewer, Opus) and the live runs of `ak5e/tools/test-defender-jps-live.mjs`, 2026-10-11. Rulings: `ak5e/DECISIONS.md` "Juggernaut, Protector and Sentry branches"; checks still to run: `VERIFY.md`.

**B-090 · Medium · Damage Reduction is applied after the automatic halving and Resistance.**
- Chapter 1 L208 applies DR before Resistance. DR is still a manual step in this module.
- Superheavy, Improved Taunt and Greater Improved Shelter change the native amount first (`defender-damage-mods.mjs`).
- Example: 20 Damage with DR 4 and Resistance should leave 8; the native result is 10, and a hand-applied DR then gives 6.
- Juggernaut Armour has 5 DR against all Damage, so this affects every hit on a Juggernaut.
- Workaround: the shatter card and the public "AK5e Defender: Damage to …" note state the DR-first rule, and the table corrects HP by hand.
- Fixed means: equipped DR is applied in the hook before these modifiers (a world-rule decision for the owner), or the card shows the exact corrected figure.
