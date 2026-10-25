# B-304 · High · Infuser target changes bypass relay and undo

Area: Specialist / Infuser

Found by the adversarial Luna pair and verified by parent source/code inspection, 2026-10-25.

Evidence: Infuser plans directly call target Actor updates without recorded target operations. The shared relay processes receipt targets only.

Reproduce: as a player, apply an infusion or To Defy Science to an unowned target, then undo. The target path lacks a validated automatic GM operation and complete restoration.

**Fixed means:** every target change is bounded, validated, recorded and awaited; unowned changes relay automatically. No-GM/partial failures remain visibly retryable; duplicate requests and target-state changes do not cause double application or erase authored changes on undo.
