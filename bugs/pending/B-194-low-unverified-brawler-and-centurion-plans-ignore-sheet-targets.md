# B-194 · Low · Unverified: Most Brawler and Centurion plans do not read the targets the sheet now sends

Area: Brawler and Centurion plans / Guard sheet

**Found:** Guard unit 04 (sheet audit and code review), 2026-10-18.

**Evidence:** `guard-sheet.mjs` sends `data.targets = [{ uuid, name }]` (selected tokens) for Body Check, Feint, Follow Up, Tag In, Chokehold, CQC, Disarm, Human Shield, Menace, Skullshaker, Weigh In, Mountainbreaker, Blade Art, Cyclone Strike, Brutal Execution, Ferocious Fling, Guillotine, Shredder and Storm of Blood. Only `brutalExecution` in `centurion-features.mjs` reads `data.targets`; `cycloneStrike` counts `data.targetUuids` (not sent: the sheet cannot tell the original Creature from the cleaved ones), and `feint`/`tagIn`/`bladeArt`/`ferociousFling` read a single uuid. The other plans record the targets only in `receipt.data`, so no save, condition or relay is attached.

**Verification limits:** static review. The saves and conditions in these Brawler techniques (Disarm, Human Shield, Menace, Weigh In, Guillotine, Storm of Blood) are manual at the table today.

**Fixed means:** Each plan either consumes `data.targets` (owner-clicked saves, relay and undo per WORKFLOW §3.2) or the confirm dialog says the effect is resolved manually. Cyclone Strike gets an explicit way to name the secondary Creatures.
