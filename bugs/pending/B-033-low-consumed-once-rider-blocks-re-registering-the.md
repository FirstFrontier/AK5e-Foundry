# B-033 · Low · Consumed `once` rider blocks re-registering the same ID

Area: SI-3 trigger events

**B-033 · Low · Consumed `once` rider blocks re-registering the same ID** until a non-attack
expiry pass prunes it, so outside combat it stays; transient matcher functions are keyed by
rider ID across all Actors.
