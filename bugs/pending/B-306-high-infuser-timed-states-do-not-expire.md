# B-306 · High · Infuser timed states do not expire

Area: Specialist / Infuser

Found by the adversarial Luna pair and checked against Chapter 3:5697–5699, 5752–5768, 5783–5822, 2026-10-25.

Evidence: active-infusion reads ignore `expiresAt`; invulnerability checks ignore `invulnerableUntil`; failed Leverage toggles Dazed without removing it at the recipient's next Turn.

Reproduce: advance world time beyond one minute, or advance a failed-save recipient to its next Turn. States continue until manual removal/undo.

**Fixed means:** Infusions and To Defy Science expire after one minute, Leverage riders use their printed turn boundaries, and Dazed expires at the recipient's next Turn. Reload/restart preserve expiration evidence. Replacement and undo preserve unrelated conditions and prior effects.
