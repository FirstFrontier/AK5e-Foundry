# BRIEFING — 2026-10-24T04:32:00Z

## Mission
Live Foundry V13 headless browser testing for Specialist branches (Skyranger, Dollkeeper, Trapmaster) in `ak5e/tools/test-specialist-live.mjs`, verifying character sheet badges, actions, chat cards, undo, and capturing screenshots.

## 🔒 My Identity
- Archetype: test automation engineer / tester
- Roles: implementer, qa
- Working directory: /home/patch/AK5e-Foundry/.agents/teamwork/worker_live_11
- Original parent: f3fb86fe-a1dd-4c3f-999f-c6fcb92faf07
- Milestone: Milestone 5 - Specialist Branches Live Testing

## 🔒 Key Constraints
- Exclusive file ownership: `ak5e/tools/test-specialist-live.mjs`
- DO NOT modify production script files
- Follow GEMINI.md §5 server lifecycle (unique /tmp dir, free port 30175, trap cleanup, no lingering PID or listener)
- Use launchTestBrowser() from ak5e/tools/test-browser.mjs
- Ensure zero console/page errors (`report.errors.length === 0`)
- Capture screenshots for all required states into evidence directory
- Write handoff.md and send_message to orchestrator

## Current Parent
- Conversation ID: f3fb86fe-a1dd-4c3f-999f-c6fcb92faf07
- Updated: not yet

## Task Summary
- **What to build**: Expand `ak5e/tools/test-specialist-live.mjs` to provision Skyranger, Dollkeeper, and Trapmaster actors, verify badges on sheets, execute branch actions, verify chat cards, test encounter-window undo, capture screenshots. Run in live Foundry V13 headless session.
- **Success criteria**: Server starts and stops cleanly, browser connects and performs all branch tests, 0 errors, screenshots captured, handoff report delivered.
- **Interface contracts**: WORKFLOW.md §5.2/§5.3, GEMINI.md §5, AGENTS.md §6.2
- **Code layout**: `ak5e/tools/test-specialist-live.mjs`

## Key Decisions Made
- [TBD]

## Artifact Index
- ak5e/tools/test-specialist-live.mjs — Live test runner script for Specialist branches

## Change Tracker
- **Files modified**: None yet
- **Build status**: Untested
- **Pending issues**: None

## Quality Status
- **Build/test result**: Not yet run
- **Lint status**: Clean
- **Tests added/modified**: `ak5e/tools/test-specialist-live.mjs`
