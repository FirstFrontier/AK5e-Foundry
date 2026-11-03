# B-F09 · note · Setup re-enabled a Legendary Might effect the GM had
  switched off

**B-F09 (2026-10-10, fixes B-084)** Setup re-enabled a Legendary Might effect the GM had
switched off. `reconcileManagedEffect` now restores only an effect this module itself disabled
(`flags.ak5e.defenderManagedEffect.active === false`); a manual disable is kept.
