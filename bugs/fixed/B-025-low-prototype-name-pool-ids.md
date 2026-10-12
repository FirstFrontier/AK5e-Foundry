# B-025 · Low · Prototype-name pool IDs

Area: SI-2 resource pools

**B-025 · Low · Prototype-name pool IDs.** IDs such as `constructor` or `toString` pass the ID
regex and `stored()`/`_limits[key]` use plain-object lookup (harmless today). Use
`Object.hasOwn` or a `Map`.

**Resolution (fixed 2026-10-12, 0.5.6):** `stored()` and the `_limits` reads in `once()` use `Object.hasOwn` (`ownEntry`/`storedLimit`), so ids and keys such as `constructor`, `toString` or `valueOf` read as fresh own-property state. Tests cover those names and simulated inherited records.
