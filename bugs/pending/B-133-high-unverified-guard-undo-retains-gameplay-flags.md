# B-133 · High · Unverified: Guard undo retains gameplay flags

Area: Guard use receipts / Artsblade, Brawler and Centurion

**Found:** Codex Artsblade/Centurion/Brawler audit, 2026-10-12.

**Evidence:** Plans mutate state.data, e.g. [brawler-features.mjs](../../ak5e/scripts/brawler-features.mjs#L159) and [artsblade-features.mjs](../../ak5e/scripts/artsblade-features.mjs#L303); [play-uses.mjs](../../ak5e/scripts/play-uses.mjs#L421) restores returned flag updates, not these internal mutations. No subclass cleanup is registered. Related: [B-111](../fixed/B-111-high-undo-refunds-costs-but-leaves-benefits-active.md).

**Reproduce:** Use and undo Follow Up during one turn, then use it again: the prior probe still received a frequency warning. Undo Ultimate Blade Art: its active flag remained true.

**Verification limits:** Recorded from the prior audit's Node probes and/or static review; no new runtime tests or fresh Foundry reproduction in this tracking change. Historical screenshots alone do not certify player behavior.

**Fixed means:** Undo restores all use-created internal benefits and counters within the encounter window; later conflicts are explained before undo, and encounter locks remain enforced.
