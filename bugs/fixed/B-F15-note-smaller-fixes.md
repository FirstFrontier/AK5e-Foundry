# B-F15 · note · Smaller fixes

**B-F15 (2026-10-11, review and visual review) · Smaller fixes.**
- The Advance and Fire prompt never fired in Foundry, because D&D5e target descriptors carry Actor UUIDs.
- The GM relay refused Protector effects when a player had used a level warning's "Use anyway" (WORKFLOW §3.2); it now checks only which effects each use may create.
- Undoing a Reaction refund left the Reaction available; it is now spent again.
- Undoing Retributor kept the once-per-Round marker.
- Greater Improved Shelter and Punishment use-ups could not be undone; they are now disabled only, and re-enabling restores them.
- Greater Improved Shelter was not used up by an already-resisted first instance.
- A later hit did not renew Punishment.
- Improved Shelter text named the wrong Creature as the one who must see the effect.
- A re-planted Pavise could lose track of its unequipped shield.
- The Protector and Sentry panels ran off the bottom of the viewport.
- The Shatterstorm "result" card body was empty.
