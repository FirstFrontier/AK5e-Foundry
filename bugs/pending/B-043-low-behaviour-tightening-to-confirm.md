# B-043 · Low · Behaviour tightening to confirm

Area: SI-4 damage pipeline and Standard Bearer wiring

**B-043 · Low · Behaviour tightening to confirm.** `confirmedDamage` now throws before any write
on an undefined `hp.value` or negative `hp.temp` (previously wrote `NaN`/extra damage); a
fractional manual total would now be floored (the UI only accepts whole numbers).
