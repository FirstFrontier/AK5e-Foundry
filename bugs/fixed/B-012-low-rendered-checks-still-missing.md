# B-012 · Low · Rendered checks still missing

Area: Standard Bearer UI

**B-012 (fixed 2026-10-10, 0.5.1) · Low · Rendered checks still missing.** Player-side panel, the Retry-pending button,
the Cry/Tip/Projection dialogs and server-restart persistence have not been re-inspected since
the SI-1/SI-12/SI-4 rewiring. `README.md` still labels the helpers "rendered validation pending".
**Resolution:** GM/player panels, Cry/Tip/Projection dialogs, the real Retry-pending button, browser reload, and server-restart persistence were checked in 0.5.1. See the smoke-test record for exact scope.
