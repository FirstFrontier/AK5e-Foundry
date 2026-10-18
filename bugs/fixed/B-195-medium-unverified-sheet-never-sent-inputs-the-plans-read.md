# B-195 · Medium · Unverified: The Guard sheet never supplied several inputs the plans read

Area: Guard sheet / Centurion, Brawler, core Pursuit Unrelenting and Unrelenting Aggression

**Found:** Guard unit 04 (sheet audit), 2026-10-18.

**Evidence:** `ferociousFling` reads `targetConMod`, `brutalExecution`, `targetUuid`; `guillotine` reads `eliteOrLeader`; `shredder` reads `targetFrightened`; `pursuitUnrelenting` reads `actionType`; `unrelentingAggression` reads `formula`; `feint` reads `targetUuid`, `tagIn` reads `allyUuid`. The sheet sent none of them (default path), so Fling always dealt 0, Guillotine never showed its Elite/Leader rider, Shredder never doubled, Pursuit always said "Action" and Unrelenting Aggression rolled 1d8.

**Fixed means:** The confirm dialog asks for each input, using the source wording, and sends it; absent inputs are not invented.

**Resolution (fixed 2026-10-18, unreleased):** `ak5e/scripts/guard-sheet.mjs`: Ferocious Fling asks for the launched Creature's Constitution Modifier and the Brutal Execution refund and sends one selected token as `targetUuid`; Guillotine asks "Elite or Leader"; Shredder asks "Frightened of me"; Pursuit Unrelenting asks Action or Bonus Action; Unrelenting Aggression asks for the weapon dice (blank is not sent; engine default remains B-193); Feint and Tag In send the sole selected token. Tests: `ak5e/test/guard-sheet.test.mjs`.
