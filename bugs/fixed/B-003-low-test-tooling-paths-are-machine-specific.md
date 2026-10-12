# B-003 · Low · Test tooling paths are machine-specific

Area: Live testing / environment

**B-003 (fixed 2026-10-10, 0.5.1) · Low · Test tooling paths are machine-specific.** Playwright lives only in
`/tmp/frontier-browser-check/node_modules`, Chromium is the snap binary, and `playwright`
cannot be imported by directory from ESM (`AK5E_PLAYWRIGHT` must point at an `.mjs` wrapper that
re-exports `chromium`). Document this in `ak5e/README.md` or add a `package.json` dev dependency.
**Resolution:** README now documents an ESM file path (playwright/index.mjs or a wrapper), executable override, configurable localhost port, and private test copies. No dependency installation is required.
