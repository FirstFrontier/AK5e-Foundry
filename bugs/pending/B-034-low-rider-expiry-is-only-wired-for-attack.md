# B-034 · Low · Rider expiry is only wired for attack, combat turn and combat end

Area: SI-3 trigger events

**B-034 · Low · Rider expiry is only wired for attack, combat turn and combat end.** Time,
rest and concentration expiry exist in `tagHasExpired` but nothing calls `expireRiders` from
those hooks.
