# B-309 · High · Agent proficiency and Closing the Case scaling
Area: Vanguard — Agent

**Found:** Independent final QA of the merged Agent candidate reproduced two source-fidelity defects. Consummate Professional contributes `system.tools.mechanism`, while the registered Mechanism Kit key is `ak5emechanismkit`. Closing the Case uses an editable Agent Level value for its level-14 damage scaling, so a level-10 Vanguard can obtain 2d8 per hit without a warning. The source's undefined Agent Level wording applies to Second Strike; Closing the Case scales at Vanguard level 14.

QA also found that a recorded GM ruling for the undefined Agent Level reading cannot be registered or applied. An Expertise choice for an unproficient Skill warns but rejects even when its warning is overridden; assess that against the trust-the-table rule.

**Fixed means:** the registered Mechanism Kit proficiency is granted, Closing the Case uses the actual applicable Vanguard level, recorded GM rulings supersede per-use Agent Level choices, and player-directed prerequisite overrides work consistently. Regression coverage and a private Foundry checkpoint must verify the corrections.
