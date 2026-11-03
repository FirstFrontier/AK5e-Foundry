# B-004 · Low · Hardware acceleration unverified

Area: Live testing / environment

**B-004 · Low · Hardware acceleration unverified.** The earlier live runs reported the ANGLE Vulkan
**llvmpipe** software renderer. `launchTestBrowser()` requests `--enable-gpu` only. Record the
real renderer on a machine with a working GPU before claiming acceleration.
The 0.5.1 repair runs report `ANGLE (Mesa, AMD CEDAR, OpenGL ES 3.1)` through the actual
WebGL renderer query. No acceleration benchmark or specific acceleration mode is claimed.

**Resolution (fixed 2026-10-12, 0.5.6):** No code change. The 0.5.1 repair runs already recorded the real WebGL renderer (`ANGLE (Mesa, AMD CEDAR, OpenGL ES 3.1)`) through the renderer query, and `launchTestBrowser()` (`ak5e/tools/test-browser.mjs`) documents that `--enable-gpu` requests acceleration without proving it. No acceleration is claimed anywhere. Closed as satisfied; a benchmark is not claimed.
