# B-300 · Medium · Marksman persisted-roll message retry is incomplete

Area: shared play-use dice publication and descendant undo preview
Context: repaired in Milestone 1 on 2026-10-31. `play-uses.mjs` retains serialized dice in `receipt.serializedRoll` / `receipt.serializedRolls` and tracks publication with `receipt.diceMessagePublished`. On retry when `receipt.roll !== undefined && !receipt.diceMessagePublished`, the evaluated roll is reconstructed and republished without rerolling or duplicating messages. When `receipt.diceMessagePublished === true`, no duplicate message is emitted. Furthermore, `previewUndo` now recursively traverses non-undone descendant child receipts (`entry.parentUseId === receipt.id`) in reverse tree order matching `undoUse`, accumulating target reversals and setting `locked = isLocked(receipt) || descendants.some(isLocked)` and `blocked = locked && !game.user.isGM`.

**B-300 (fixed 2026-10-31) · Medium · Marksman persisted-roll message retry is incomplete.**
Retain serialized dice and publish the same result on retry, without rerolling or duplicating successful messages; inject message-write failure and verify resolution evidence, descendant undo previews, and lock states remain fully consistent and usable.

Verified by: `node --test ak5e/test/play-uses.test.mjs` ("B-300: ChatMessage creation failure retains evaluated roll and retry publishes without rerolling", "B-300: previewUndo reflects target reversals and lock states from descendant child receipts").
