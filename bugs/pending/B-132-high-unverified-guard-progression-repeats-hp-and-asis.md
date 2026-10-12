# B-132 · High · Unverified: Guard progression repeats HP and ASIs

Area: Guard progression / all three subclasses

**Found:** Codex Artsblade/Centurion/Brawler audit, 2026-10-12.

**Evidence:** [guard-progression.mjs](../../ak5e/scripts/guard-progression.mjs#L424) adds selected ASIs to current scores and [guard-progression.mjs](../../ak5e/scripts/guard-progression.mjs#L431) adds all selected HP again; recorded applied levels are not excluded. Related historical Marksman fix: [B-114](../fixed/B-114-high-progression-repeats-asis-and-replaces-authored-hp.md).

**Reproduce:** Apply the same level-4 choices twice. The prior Node probe changed HP 85 to 125 and STR 14 to 16 on the second application.

**Verification limits:** Recorded from the prior audit's Node probes and/or static review; no new runtime tests or fresh Foundry reproduction in this tracking change. Historical screenshots alone do not certify player behavior.

**Fixed means:** Reapplying unchanged choices adds no HP, ASIs, cash or duplicate grants. Level increases apply only new contributions and preserve authored values.
