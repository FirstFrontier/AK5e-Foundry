/**
 * Shared launcher for repository and temporary Playwright browser tests.
 * The caller supplies its Playwright Chromium instance so Node-only tests do
 * not acquire a browser dependency. GPU use still requires working host access
 * and drivers; --enable-gpu requests acceleration, it does not prove it.
 * --use-angle=gl-egl is needed on Mesa hosts, where headless Chromium otherwise
 * disables WebGL/GL entirely; confirm the renderer via WEBGL_debug_renderer_info.
 * Caller-supplied renderer-selection flags (e.g. the AK5E_NATIVE_VULKAN
 * llvmpipe set) are dropped so a test cannot silently fall back to the CPU.
 */
const RENDERER_FLAGS = /^--(use-angle|use-gl|use-vulkan|enable-unsafe-swiftshader|disable-gpu)(=|$)/;

export function launchTestBrowser(chromium, options = {}) {
  const callerArgs = (options.args ?? []).filter(arg => !RENDERER_FLAGS.test(arg));
  return chromium.launch({
    headless: true,
    channel: "chromium",
    ...options,
    args: [...new Set([...callerArgs, "--enable-gpu", "--use-angle=gl-egl"])]
  });
}
