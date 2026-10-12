# B-002 · Low · Live fixture is not re-runnable

Area: Live testing / environment

**B-002 (fixed 2026-10-10, 0.5.1) · Low · Live fixture is not re-runnable.** The same script leaves state in the
`standard-test` World and fails on the next run with `Retrieve or return the standard before
wielding it.` or `Recipient Speed must be greater than zero.` until the fixture Actors, scene and
combat are deleted. Make the script reset or detect and reuse its fixtures. Also ensure it
closes every browser context and never needs `pkill` (a `pkill -f` on the server command line
killed the agent's own shell once; use the PID).
**Resolution:** Marked fixtures are recreated on each normal run with explicit Speed. Teardown disables support and drains queued refreshes before deleting map/combat documents. Runs 3 and 4 passed consecutively; every context/browser closes through nested finally blocks.
