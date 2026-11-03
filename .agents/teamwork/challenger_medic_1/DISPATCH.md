## 2026-10-13T04:38:16Z

You are challenger_medic_1, an adversarial verifier for the AK5e Medic base class and subclasses.
Your assigned working directory is: /home/patch/AK5e-Foundry/.agents/teamwork/challenger_medic_1/

MANDATORY INPUTS:
- Read /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md (under section ## Follow-up — 2026-10-13T03:54:12Z)
- Read /home/patch/AK5e-Foundry/PROJECT.md
- Read /home/patch/AK5e-Foundry/WORKFLOW.md
- Read /home/patch/AK5e-Foundry/GEMINI.md
- Read /home/patch/AK5e-Foundry/.agents/teamwork/worker_medic_impl/handoff.md

YOUR TASK:
Author and execute an independent adversarial test script (e.g., `ak5e/test/medic-challenger-features.test.mjs` or run stress harnesses) that aggressively tests feature edge cases:
1. Touch Heal:
   - 0 or negative spend attempts.
   - Spending more than current Life Support with and without override.
   - Targeting Constructs: verify non-blocking warning and shortfall card.
2. Life Support Pool:
   - Exceeding max (overMax: true) and verifying Long Rest resets value to max (dropping excess), while Short Rest preserves pool.
3. Physician features:
   - Focused Treatment: verify PB adds ONLY to single-target rolls, NOT multi-target or flat heals.
   - Intravenous Line: willing target vs unwilling target CON save (success deals 2d8 Necrotic; fail sets tuning), replacing existing tuned target, +1d6 (Lv 4) / +2d6 (Lv 7) bonus once per turn.
   - Hypocritic Oath: CON save vs DC (failure full Necrotic, success half Necrotic), confirms it counts as restoring HP for triggers.
   - Inpatient Care: 15 LS reaction, delayed heal `max(floor(healed/2), 15)` on turn start.
   - Surgeon-General: 2x multiplier on single-target heal from LS (1:2 Touch Heal ratio), Art, or Skill.
4. Triage features:
   - On the Scene: 10 LS move speed, max PB targets within 5 ft, Heal (1d6+mod / 2d6+mod) and Harm (Melee spell attack, 1d6+mod / 2d6+mod Necrotic).
   - Urgent Care Centre: half heal splash within 10 ft on self-healing levelled Art, no trigger on cantrips.
   - Stop the Flow: 20 LS on Dying creature, +6 Mettle up to 8 hard cap, re-use lock while Dying, warning if target not Dying.
   - Touch of Life and Death: 10 LS rider, condition clear (<=1hr) / pause (>1hr), Poisoned condition on harm.
   - Mobile Hospital: 1/LR BA, 30 ft aura, 3d6+mod HP max 1/round per creature resetting at Medic turn start.
5. Undo Integrity:
   - Execute each feature, undo it, and assert that all actor fields, pools, target HP, Mettle, and conditions return exactly to baseline.

DELIVERABLE:
Write your structured challenge report to:
`/home/patch/AK5e-Foundry/.agents/teamwork/challenger_medic_1/handoff.md`
State your verdict explicitly: APPROVE or REQUEST_CHANGES. Send a message to orchestrator with your verdict and summary.
