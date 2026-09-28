/**
 * Shared launcher for repository and temporary Playwright browser tests.
 * The caller supplies its Playwright Chromium instance so Node-only tests do
 * not acquire a browser dependency. GPU use still requires working host access
 * and drivers; --enable-gpu requests acceleration, it does not prove it.
 */
export function launchTestBrowser(chromium, options = {}) {
  return chromium.launch({
    headless: true,
    channel: "chromium",
    ...options,
    args: [...new Set([...(options.args ?? []), "--enable-gpu"])]
  });
}
