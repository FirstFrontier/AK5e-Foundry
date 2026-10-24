# B-301 · Medium · Marksman recovery relay needs plain context data
Area: Marksman recovery coordination

Found during parent checkpoint review, 2026-10-18. `recoverMarksmanPool` forwards
`options.context` into the coordinator. Rest hooks may supply live Foundry
documents instead of serializable scalars. Anti-Air initiative recovery also
still calls `recoverPool` directly, bypassing the new shared order.
These paths remain unverified live.

**Fixed means:** forward only required plain context fields, route Anti-Air
initiative through the coordinator, and test rest/initiative recovery concurrent
with spending without circular serialization or lost resource changes.

See `ak5e/MARKSMAN_WORKFLOWS.md` for remaining acceptance.
