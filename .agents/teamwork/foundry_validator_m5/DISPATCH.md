## 2026-10-12T01:12:48Z
You are the Foundry Validator subagent for visual inspection of captured Foundry V13 screenshots.
Your assigned working directory is: /home/patch/AK5e-Foundry/.agents/teamwork/foundry_validator_m5/

MANDATORY INSTRUCTIONS:
1. Read ORIGINAL_REQUEST.md at /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md.
2. Read AGENTS.md §6.2 in full. You MUST use your image viewing tool (`view_file`) to open and inspect every single screenshot file listed below. Judging from filenames, sizes, or logs does NOT count.
3. List of screenshot paths to inspect:
   - /tmp/ak5e-guard-live/24-duellist-sheet-features-tab.png
   - /tmp/ak5e-guard-live/25-duellist-guard-controls-dialog.png
   - /tmp/ak5e-guard-live/26-duellist-engagement-prompt.png
   - /tmp/ak5e-guard-live/27-duellist-engagement-chat-card.png
   - /tmp/ak5e-guard-live/28-liberator-sheet-features-tab.png
   - /tmp/ak5e-guard-live/29-liberator-guard-controls-dialog.png
   - /tmp/ak5e-guard-live/30-liberator-guide-the-masses-prompt.png
   - /tmp/ak5e-guard-live/31-liberator-guide-the-masses-chat-card.png
   - /tmp/ak5e-guard-live/32-liberator-flash-of-anger-card-awaiting-roll.png
   - /tmp/ak5e-guard-live/33-liberator-flash-of-anger-card-rolled.png
   - /tmp/ak5e-guard-live/34-lord-sheet-features-tab.png
   - /tmp/ak5e-guard-live/35-lord-guard-controls-dialog.png
   - /tmp/ak5e-guard-live/36-lord-manifest-will-dialog.png
   - /tmp/ak5e-guard-live/37-lord-manifest-will-chat-card.png
   - /tmp/ak5e-guard-live/38-lord-make-it-so-prompt.png
   - /tmp/ak5e-guard-live/39-lord-make-it-so-chat-card.png
   - /tmp/ak5e-guard-live/40-guard-subclasses-undo-flow.png
4. Inspection Checks to perform on each image (per WORKFLOW.md §5.2 and §8):
   - Missing text or broken image placeholders.
   - Text clipping, horizontal or vertical overflow.
   - Dark-theme readability, contrast, and alignment.
   - Proper roll controls and buttons rendered (no auto-rolled dice; roll buttons rendered on cards).
   - Permission badges, badges readability, and action buttons.
   - Undo badges, cards, and state indicators.
5. Deliverable:
   Write a comprehensive visual review report to `/home/patch/AK5e-Foundry/.agents/teamwork/foundry_validator_m5/handoff.md`.
   Include a detailed entry for EACH of the 17 screenshots:
   - Path
   - Window/document/state shown
   - Checks performed
   - Defects identified (if any, with location and cause)
   - Verdict: PASS / FAIL / UNCERTAIN
   Provide an overall verdict across all screenshots.
6. Send a completion message to orchestrator with your findings and report path.
