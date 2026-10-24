# B-300 · Medium · Marksman persisted-roll message retry is incomplete
Area: shared play-use dice publication

Found during parent checkpoint review, 2026-10-18. `play-uses.mjs` persists a
rolled result before publishing its dice ChatMessage. If message creation fails,
the retry can find the stored roll and skip publishing the missing evidence.
This is a static finding; failed message creation was not reproduced live.

**Fixed means:** retain serialized dice and publish the same result on retry,
without rerolling or duplicating successful messages; inject the message-write
failure and verify resolution evidence and undo remain usable.

See `ak5e/MARKSMAN_WORKFLOWS.md` for the development checkpoint.
