# B-082 · Low · Long Rest leaves the Eye of the Storm template on the map

Area: Defender, Dreadnought and Artshield

**B-082 (fixed 2026-10-10, 0.5.1) · Low · Long Rest leaves the Eye of the Storm template on the map.**
`defender-features.mjs:281` clears `state.barrier` before the Artshield rest handler runs, so
`endBarrier` (`artshield-features.mjs:268`) returns early and never deletes the MeasuredTemplate.
Reported by static review; not reproduced live.
**Resolution:** Already fixed by B-F08; removed from Open during this reconciliation. The current Defender regression suite includes the Long Rest template cleanup case.
