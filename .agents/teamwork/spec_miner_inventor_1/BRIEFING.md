# BRIEFING — 2026-10-20T02:17:40Z

## Mission
Mine and document every rule, formula, DC, Instability calculation, breakdown roll mechanic, all modifications, all 8 Strange and 8 Stranger contraptions, Mobile Modding, Risk Assessment, and The Big One for the AK5e Specialist: Inventor subclass.

## 🔒 My Identity
- Archetype: Specification Miner
- Roles: Specification Miner, External domain expert
- Working directory: /home/patch/AK5e-Foundry/.agents/teamwork/spec_miner_inventor_1
- Original parent: cf5c8a2a-802f-473e-8274-6566de462e7c
- Milestone: Specialist: Inventor Subclass Specification Mining

## 🔒 Key Constraints
- Read-only: Do NOT implement anything in production or module files.
- Authority hierarchy: AK5e_1.3.1_Foundry_Source is the rules authority; preserve wording and numbers, never invent mechanics.
- Log uncertain mappings in ak5e/DECISIONS.md (or propose them in handoff).
- Trust the table (WORKFLOW §3.2): no GM approval or turn gating for player actions; warn, never block; confirm before use (except ability checks and saves); never auto-roll damage/healing/attack/save dice; every change undoable.
- Maintain progress.md heartbeat.
- Write full findings to handoff.md following 5-component report protocol.
- Only write files inside working directory `/home/patch/AK5e-Foundry/.agents/teamwork/spec_miner_inventor_1/`.

## Current Parent
- Conversation ID: cf5c8a2a-802f-473e-8274-6566de462e7c
- Updated: 2026-10-20T02:17:40Z

## Task Summary
- **What to build**: Comprehensive specification document (handoff.md) covering the Inventor subclass (Specialist): formulas, instability, breakdown dice matching, all modifications, 16 contraptions, subclass progression features, and Foundry V13 / D&D5e mapping requirements.
- **Success criteria**: Exhaustive extraction of every rule, formula, DC, breakdown condition, all modifications, contraptions, edge cases, and rulings.
- **Interface contracts**: /home/patch/AK5e-Foundry/ak5e/README.md, WORKFLOW.md, DECISIONS.md
- **Code layout**: .agents/teamwork/spec_miner_inventor_1/

## Key Decisions Made
- Reconciled modification count: The source text in Chapter 3 contains 28 total modifications (10 melee [1 dangerous], 8 ranged [1 dangerous], 10 armor [1 dangerous]), matching the 42 database records in `chapter-three-content.mjs` and DECISIONS.md line 443. The mention of "31 modifications" in prompt requests counts 28 standard + 3 dangerous by misclassifying total as standard.
- Detailed probability and clamping formulas for Instability breakdown rolls: duplicate dice detection across Nd6, HP loss formula $1\text{d}8 + \max(0, \text{Instability}-3)\text{d}8$, clamped at $\ge 1$ HP.
- Identified four key rulings for `DECISIONS.md`: Melee Attachment damage reading, Dangerous breakdown rider timing, duplicate Collapsible Weapon handling, and Part-Time Inventor cross-class integration.

## Artifact Index
- DISPATCH.md — incoming dispatch instructions and prompts
- BRIEFING.md — persistent working memory and identity
- progress.md — liveness heartbeat and execution log
- handoff.md — final exhaustive specification report

## Loaded Skills
- None
