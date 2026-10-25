# B-302 · High · Infuser Leverage skips the recipient's native save

Area: Specialist / Infuser

Found by the adversarial Luna pair and verified against the source by the parent, 2026-10-25.

Evidence: `specialist-uses.mjs` defaults missing `saveFailed` to false. Normal sheet use has no recipient-owned CON save stage. Chapter 3:5699 requires an immediate save; both outcomes still grant the benefit.

Reproduce: leverage an active infusion from the sheet without supplying a test-only save result. It reports success without a saving throw.

**Fixed means:** the recipient chooses Leverage, clicks its native CON save without an extra feature confirmation, and only an authorized matching native result resolves the use. Failure applies Dazed until the recipient's next Turn; Leverage is unavailable only while Dazed, as an overridable source warning. Cover duplicate/forged results, cancellation, and undo.
