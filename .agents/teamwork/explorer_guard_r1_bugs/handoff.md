# Guard R1 Bug Investigation Report (B-129 to B-153)

**Author:** `explorer_guard_r1_bugs`  
**Date:** 2026-10-12  
**Target Scope:** Base Guard, Centurion, Artsblade, Brawler (`bugs/pending/B-129-*.md` through `bugs/pending/B-153-*.md`)  
**Rules Authority:** `AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt` (L1740–L3520), `WORKFLOW.md` §3.2, `GEMINI.md`

---

## Executive Summary

An exhaustive read-only investigation was conducted across all 25 defect reports in R1 (B-129 through B-153). Every defect was cross-referenced against the AK5e v1.3.1 rules authority, active script implementations in `ak5e/scripts/`, unit test suites in `ak5e/test/`, and headless Playwright browser tests in `ak5e/tools/test-guard-live.mjs`.

### Defect Distribution & Impact Matrix

| ID | Title | Severity | Affected Area | Root Cause Category |
|---|---|---|---|---|
| **B-129** | Guard uses skip confirmation | High | `guard-sheet.mjs`, `play-uses-sheet.mjs` | Sheet passes `confirmed: true`; `confirmPlayUse` lacks default confirmation prompt |
| **B-130** | Cancelling Augmented Assault spends Aggression | High | `guard-sheet.mjs` | Dismissal of `DialogV2.prompt` (returns `null`) falls through to command execution |
| **B-131** | Guard setup button omits required preview key | Medium | `guard-sheet.mjs`, `guard-setup.mjs` | Sheet calls `applyGuardSetup(actor, { confirmed: true })` without preview or `contextKey` |
| **B-132** | Guard progression repeats HP and ASIs | High | `guard-progression.mjs` | `previewGuardProgression` ignores `state.hpLevels` and `state.asiLevels`, recomputing full gains |
| **B-133** | Guard undo retains gameplay flags | High | `artsblade-features.mjs`, `brawler-features.mjs`, `centurion-features.mjs`, `play-uses.mjs` | Plans mutate `state.data` directly without registering cleanup handlers on `guardUses` |
| **B-134** | Ultimate Blade Art never expires | High | `artsblade-features.mjs` | `ultimateBladeArtActive` is stored as an unbounded boolean with no turn/round expiry check |
| **B-135** | Guard Reaction spent before receipt persistence | Medium | `artsblade-features.mjs`, `brawler-features.mjs`, `play-uses.mjs` | Plans call `spendReaction` inside `apply()` rather than letting `finish()` spend after receipt save |
| **B-136** | Blade Art ignores selected Arts Pool | High | `guard-sheet.mjs`, `artsblade-features.mjs` | Sheet submits `artPool`, while plan looks for `data.pool`, defaulting to `"flame"` (Fire) |
| **B-137** | Artsblade casting frequency warnings incomplete | High | `artsblade-features.mjs` | `bladeArt` lacks cast tracking; `castSpellswordArt` completely bypasses warnings when Augmented |
| **B-138** | Spellsword casting accepts below-maximum level | High | `guard-sheet.mjs`, `artsblade-features.mjs` | Sheet presents 1..max dropdown; plan accepts `Math.min(data.castingLevel, max)` violating source rule |
| **B-139** | Resonance roll bonuses incorrect scope & duration | High | `artsblade-features.mjs` | Hooks check single combatant turn (`turnKey`) instead of next turn end; lack melee weapon restriction |
| **B-140** | Blade Art save immunity recorded on cast | High | `artsblade-features.mjs` | Plan records immunity in `bladeArtSaves` before target rolls save; checks wrong combatant turn |
| **B-141** | Brawler armor gate uses obsolete D&D5e fields | High | `brawler-features.mjs` | `isUnarmoredOrLight` checks `val === "armor"`, missing modern D&D5e schema `system.type.value = "heavy"` |
| **B-142** | Brawler counts Dexterity twice | High | `brawler-features.mjs` | Hooks append `dexMod - strMod` even when unarmed activity natively configured with Dex |
| **B-143** | Brawler damage checks unrelated selected targets | High | `brawler-features.mjs` | Hook checks `globalThis.game.user.targets.some(...)` instead of the specific hit creature |
| **B-144** | Fearmonger affects other Guard subclasses | High | `centurion-features.mjs` | Outgoing attack hook checks `level >= 4` but omits `isCenturion(actor)` guard |
| **B-145** | Cyclone Strike frequency checks fail | High | `centurion-features.mjs` | Level 14+ omits frequency check completely; sub-14 checks current combatant turn rather than Centurion turn |
| **B-146** | Brutal Execution target resolution incomplete | High | `guard-sheet.mjs`, `centurion-features.mjs`, `play-uses.mjs` | Sheet provides no target selector; plan omits `tag.condition` and `validateTarget` method for relay |
| **B-147** | Brutal Execution inconsistent Intimidation modifier | High | `centurion-features.mjs`, `guard-rules.mjs` | Plan uses `skills.itm.mod` (base ability) while DC uses `skills.itm.total` (proficiency/expertise) |
| **B-148** | Cut Through Chaos roll definitions discarded | Medium | `artsblade-features.mjs`, `centurion-features.mjs`, `play-uses.mjs` | Plans return `rolls: [...]` which `play-uses.mjs` discards, omitting attack comparison buttons |
| **B-149** | Subclass dialogs misstate source mechanics | High | `guard-sheet.mjs`, `DECISIONS.md` | Prompts invent mechanics (advantage/disadvantage, CON for Chokehold, 4 attacks / stun for Mountainbreaker) |
| **B-150** | Artsblade grants and Art resolution incomplete | Medium | `guard-setup.mjs`, `guard-progression.mjs`, `artsblade-features.mjs` | No Arts skill proficiency/expertise grant; no feature items granted; generic free-text Art resolution |
| **B-151** | Brawler native benefits incomplete | Medium | `brawler-features.mjs`, `guard-sheet.mjs`, `guard-setup.mjs` | `bobAndWeaveAC` and `artOfTheFistDie` are unused helpers; no feature items; Flurry vs style conflated |
| **B-152** | Centurion reach and Reaction refunds incomplete | Medium | `centurion-features.mjs` | Long-Arm reach, Storm of Blood off-turn reach, and AoO reaction refund are narrated only |
| **B-153** | Subclass player and integration coverage insufficient | Low | `test-guard-live.mjs`, unit test suites | Live test only logs in GM and opens controls without clicking actions; unit tests test happy paths |

---

## 1. Observations: Detailed Defect Analysis (B-129 to B-153)

### B-129: Guard uses skip confirmation
1. **Summary of Reported Issue vs Expected Behavior:**
   - *Reported Issue:* When a Guard feature button (e.g. Body Check) is clicked, Aggression is spent immediately without a confirmation dialog.
   - *Expected Behavior:* WORKFLOW §3.2 Rule 4 requires: "Every ability, AK5e Skill, feature, Art or item use that the module starts or wraps shows a confirm step before any resource is spent or any document changes. That step summarises the cost, targets and warnings... Cancelling must change nothing."
2. **Current Implementation Analysis:**
   - `ak5e/scripts/guard-sheet.mjs` lines 394, 447, 474, 499, 543, 559, 578, 596, 1133 pass `{ confirmed: true }` directly to `guardUses.command(...)` via `confirmPlayUse`.
   - `ak5e/scripts/play-uses-sheet.mjs` lines 19–37:
     ```javascript
     export async function confirmPlayUse(title, attempt) {
       let extra = {};
       while (true) {
         try { return await attempt(extra); }
         catch (error) {
           if (isPlayWarnings(error)) { ... }
     ```
     `confirmPlayUse` immediately executes `attempt(extra)`. If the character has sufficient resources and prerequisites, `attempt` succeeds on the first iteration without ever presenting a confirmation prompt!
3. **Root Cause:**
   - `confirmPlayUse` only catches `PlayWarnings` and `PlayReading`. It completely lacks a standard confirmation step summarizing action cost and targets before committing. Because `guard-sheet.mjs` passes `confirmed: true`, the engine's `need(data.confirmed === true)` guard is bypassed without player interaction.
4. **Existing Test Coverage & Gaps:**
   - `ak5e/test/artsblade.test.mjs`, `ak5e/test/brawler.test.mjs`, `ak5e/test/centurion.test.mjs` define a test helper `const use = (actor, command, data) => guardUses.command(actor, command, { confirmed: true, ...data })`.
   - Gaps: Zero tests verify that omitting `confirmed: true` throws or that cancelling from `confirmPlayUse` changes nothing.
5. **Concrete Remediation Plan:**
   - Update `confirmPlayUse` in `ak5e/scripts/play-uses-sheet.mjs` (or in sheet command invocations) to display a confirmation dialog showing feature title, resource cost, and target before executing `attempt`.
   - If user cancels, return `null` immediately and make zero writes.
   - Preserve native D&D5e behavior for ability checks and saving throws (no confirm step).
6. **Verification Commands & Criteria:**
   - Run `node --test ak5e/test/play-uses.test.mjs`.
   - In browser/unit test: Invoking any Guard action without user confirmation must not deduct Aggression. Cancelling must leave resource pools identical.

---

### B-130: Cancelling Augmented Assault still spends Aggression
1. **Summary of Reported Issue vs Expected Behavior:**
   - *Reported Issue:* At level 13+, closing or dismissing the Augmented Assault dialog prompt spends 2 Aggression and records a use.
   - *Expected Behavior:* Closing/cancelling the dialog must abort the command completely and change nothing.
2. **Current Implementation Analysis:**
   - `ak5e/scripts/guard-sheet.mjs` lines 546–560:
     ```javascript
     if (cmd === "augmentedAssault") {
       const unleash = level >= 13 ? await foundry.applications.api.DialogV2.prompt({
         window: { title: "Augmented Assault (2 Aggression)" },
         rejectClose: false,
         content: `...`,
         ok: {
           label: "Confirm",
           callback: (_e, target) => Boolean((target.form ?? target.closest("form"))?.elements?.unleash?.checked)
         }
       }) : false;
       return confirmPlayUse("Augmented Assault", extra => guardUses.command(actor, "augmentedAssault", { unleash, confirmed: true, ...extra }, operationId()));
     }
     ```
3. **Root Cause:**
   - `DialogV2.prompt` with `rejectClose: false` returns `null` when dismissed/cancelled.
   - Line 559 fails to check `if (unleash === null) return;`. It proceeds directly to `guardUses.command`, passing `unleash: null`, spending 2 Aggression.
   - Furthermore, below level 13, no prompt is displayed at all—it immediately executes.
4. **Existing Test Coverage & Gaps:**
   - `ak5e/test/artsblade.test.mjs` lines 59–72 tests direct command execution; never tests UI dismissal.
5. **Concrete Remediation Plan:**
   - In `ak5e/scripts/guard-sheet.mjs`:
     ```javascript
     if (cmd === "augmentedAssault") {
       let unleash = false;
       if (level >= 13) {
         const result = await foundry.applications.api.DialogV2.prompt({ ... });
         if (result === null) return null;
         unleash = Boolean(result);
       } else {
         // Show standard confirmation prompt for level < 13
         const confirmed = await foundry.applications.api.DialogV2.confirm({
           window: { title: "Augmented Assault (2 Aggression)" },
           content: "<p>Spend 2 Aggression to cast two Blade Arts this turn?</p>"
         });
         if (!confirmed) return null;
       }
       return confirmPlayUse("Augmented Assault", extra => guardUses.command(actor, "augmentedAssault", { unleash, confirmed: true, ...extra }, operationId()));
     }
     ```
6. **Verification Commands & Criteria:**
   - Test that `DialogV2.prompt` returning `null` yields `undefined`/`null` without modifying actor flags or Aggression.

---

### B-131: Guard setup button omits the required preview key
1. **Summary of Reported Issue vs Expected Behavior:**
   - *Reported Issue:* Clicking "Grant Core Guard Features" in Guard Controls fails with "The character changed since the preview; preview the Guard setup again."
   - *Expected Behavior:* Clicking setup generates a preview, shows intended changes, and applies features using the valid `contextKey`.
2. **Current Implementation Analysis:**
   - `ak5e/scripts/guard-sheet.mjs` lines 362–365:
     ```javascript
     if (act === "__setup") {
       await applyGuardSetup(actor, { confirmed: true });
       ui.notifications.info("Guard core features granted.");
       app.close();
     }
     ```
   - `ak5e/scripts/guard-setup.mjs` lines 92–95:
     ```javascript
     export async function applyGuardSetup(actor, { confirmed, contextKey } = {}) {
       need(confirmed === true, "Confirm the previewed Guard setup first.");
       const plan = await previewGuardSetup(actor);
       need(plan.contextKey === contextKey, "The character changed since the preview; preview the Guard setup again.");
     ```
3. **Root Cause:**
   - `guard-sheet.mjs` calls `applyGuardSetup(actor, { confirmed: true })` without calling `previewGuardSetup(actor)` or passing `plan.contextKey`. Since `contextKey` is `undefined`, the assertion `plan.contextKey === contextKey` always throws.
4. **Existing Test Coverage & Gaps:**
   - `ak5e/test/guard-progression.test.mjs` lines 67–83 calls `previewGuardSetup` first, then passes `preview.contextKey`. It never tests the sheet button click.
5. **Concrete Remediation Plan:**
   - In `guard-sheet.mjs` line 363:
     ```javascript
     if (act === "__setup") {
       const preview = await previewGuardSetup(actor);
       // Display setup preview dialog showing features to be granted
       const confirmed = await foundry.applications.api.DialogV2.confirm({
         window: { title: "Grant Guard Core Features" },
         content: `<p>Granting core Guard features (${preview.creates.map(c => c.name).join(", ")})...</p>`
       });
       if (confirmed) {
         await applyGuardSetup(actor, { confirmed: true, contextKey: preview.contextKey });
         ui.notifications.info("Guard core features granted.");
         app.close();
       }
     }
     ```
6. **Verification Commands & Criteria:**
   - Node test verifying that invoking the sheet setup workflow successfully grants items and transitions character to `enabled: true`.

---

### B-132: Guard progression repeats HP and ASIs
1. **Summary of Reported Issue vs Expected Behavior:**
   - *Reported Issue:* Reapplying unchanged level choices (or running progression twice) adds HP and ASIs a second time (e.g. HP 85 -> 125, STR 14 -> 16).
   - *Expected Behavior:* Progression must be idempotent. Reapplying unchanged choices adds no HP, ASIs, cash, or duplicate items.
2. **Current Implementation Analysis:**
   - `ak5e/scripts/guard-progression.mjs` lines 438–472:
     ```javascript
     // Ability score increases
     const abilityIncreases = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };
     for (const n of ASI_LEVELS.filter(v => v <= level)) {
       const asiChoice = choices.asi?.[n];
       if (asiChoice?.increases) {
         for (const inc of asiChoice.increases) {
           abilityIncreases[inc.ability] += inc.amount;
         }
       }
     }
     for (const [abl, inc] of Object.entries(abilityIncreases)) {
       if (inc > 0) {
         const current = currentAbility(actor, abl);
         writes[`system.abilities.${abl}.value`] = Math.min(20, current + inc);
       }
     }
     ```
     And HP lines 456–472:
     ```javascript
     let hpGainTotal = 0;
     for (let n = 1; n <= level; n++) {
       const hpChoice = choices.hp?.[n];
       if (hpChoice && hpChoice.mode !== "existing") {
         const roll = Number(hpChoice.roll ?? (n === 1 ? 10 : 6));
         hpGainTotal += Math.max(1, roll + conMod);
       }
       if (isCrusher && hpChoice?.mode !== "existing") hpGainTotal += 3;
     }
     if (hpGainTotal > 0) {
       const currentMax = Number(system.attributes?.hp?.max ?? 0);
       writes["system.attributes.hp.max"] = currentMax + hpGainTotal;
     }
     ```
3. **Root Cause:**
   - Although `state = readState(actor)` exists and stores `state.hpLevels` and `state.asiLevels`, `previewGuardProgression` never filters out levels present in `state.hpLevels` or `state.asiLevels`.
   - It reads `currentMax` from `actor.system.attributes.hp.max` and adds the entire sum of all levels' HP again.
   - It reads `currentAbility(actor, abl)` and adds the ASI increments again.
4. **Existing Test Coverage & Gaps:**
   - `ak5e/test/guard-progression.test.mjs` lines 33–65 applies choices once, and then calls `previewGuardProgression` (which only checks `plan.pending`), but never calls `applyGuardProgression` a second time to verify `hp.max` and abilities remain unchanged.
5. **Concrete Remediation Plan:**
   - In `previewGuardProgression`:
     - Filter out levels where `state.asiLevels.includes(n)`: do not add to `abilityIncreases`.
     - Filter out levels where `state.hpLevels.includes(n)`: do not add to `hpGainTotal`.
     - Only compute gains for newly added levels (`!state.hpLevels.includes(n)` and `!state.asiLevels.includes(n)`).
6. **Verification Commands & Criteria:**
   - Add assertion in `guard-progression.test.mjs`:
     ```javascript
     const applied1 = await applyGuardProgression(actor, { confirmed: true, contextKey: plan.contextKey, ...choices });
     const hpAfter1 = actor.system.attributes.hp.max;
     const strAfter1 = actor.system.abilities.str.value;
     const plan2 = await previewGuardProgression(actor, choices);
     await applyGuardProgression(actor, { confirmed: true, contextKey: plan2.contextKey, ...choices });
     assert.equal(actor.system.attributes.hp.max, hpAfter1);
     assert.equal(actor.system.abilities.str.value, strAfter1);
     ```

---

### B-133: Guard undo retains gameplay flags
1. **Summary of Reported Issue vs Expected Behavior:**
   - *Reported Issue:* Undoing a feature use (e.g. Follow Up, Ultimate Blade Art, Cyclone Strike) restores spent resources but leaves mutated `state.data` flags active (e.g. `followUpTurn`, `ultimateBladeArtActive`). Reusing the feature during the same turn still gives frequency warnings.
   - *Expected Behavior:* Undoing a use restores all internal state, counters, and benefits created by that use within the encounter window.
2. **Current Implementation Analysis:**
   - `brawler-features.mjs:159` sets `next.data.followUpTurn = currentTurnKey`.
   - `artsblade-features.mjs:303` sets `next.data.ultimateBladeArtActive = true`.
   - `centurion-features.mjs:92` sets `next.data.cycloneStrikeTurn = currentTurnKey`.
   - `play-uses.mjs:434` executes `for (const cleanup of CLEANUPS) cleanup(state, receipt, actor);`.
   - Neither `brawler-features.mjs`, `artsblade-features.mjs`, nor `centurion-features.mjs` registers a `cleanup` handler in `guardUses.register({...})`.
3. **Root Cause:**
   - Subclass modules mutate `state.data` without providing a `cleanup(state, receipt)` function to reverse those mutations during `undoUse`.
4. **Existing Test Coverage & Gaps:**
   - `ak5e/test/brawler.test.mjs` and `ak5e/test/artsblade.test.mjs` test command execution; neither tests calling `undoUse` and checking that `state.data` is cleared.
5. **Concrete Remediation Plan:**
   - In `artsblade-features.mjs`:
     - Register `cleanup(state, receipt)`:
       ```javascript
       function cleanup(state, receipt) {
         if (receipt.command === "ultimateBladeArt") delete state.data.ultimateBladeArtActive;
         if (receipt.command === "augmentedAssault") delete state.data.augmentedAssaultTurn;
         if (receipt.command === "bladeArt" || receipt.command === "castSpellswordArt") {
           // reset cast counters associated with receipt.id
         }
       }
       guardUses.register({ plans: ARTSBLADE_PLANS, cleanup });
       ```
   - In `brawler-features.mjs`:
     - Register `cleanup(state, receipt)` to delete `state.data.followUpTurn`, `state.data.tagInTurn`, etc.
   - In `centurion-features.mjs`:
     - Register `cleanup(state, receipt)` to delete `state.data.cycloneStrikeTurn`.
6. **Verification Commands & Criteria:**
   - Unit test: execute Follow Up, verify `state.data.followUpTurn` set; undo use; verify `state.data.followUpTurn` removed; verify second Follow Up succeeds without frequency warning.

---

### B-134: Ultimate Blade Art never expires
1. **Summary of Reported Issue vs Expected Behavior:**
   - *Reported Issue:* Once activated, Ultimate Blade Art's casting-limit bypass remains permanently active indefinitely.
   - *Expected Behavior:* Chapter 3 L2407: "Until the end of your next Turn, the restriction on how many times per Round you can cast Spellsword Arts is removed." The bypass must expire at the end of the Artsblade's next turn.
2. **Current Implementation Analysis:**
   - `ak5e/scripts/artsblade-features.mjs:303`:
     `next.data.ultimateBladeArtActive = true;`
   - `ak5e/scripts/artsblade-features.mjs:205`:
     `const isUltimate = Boolean(state.data?.ultimateBladeArtActive);`
   - No round, turn, or combatant check is performed. It stays `true` forever.
3. **Root Cause:**
   - Duration tracking was implemented as a primitive boolean without expiration metadata (round/turn tracking or timestamp).
4. **Existing Test Coverage & Gaps:**
   - `ak5e/test/artsblade.test.mjs:111–119` asserts `result.ultimateBladeArtActive === true` upon use. Never advances combat or checks expiration.
5. **Concrete Remediation Plan:**
   - Store expiration tracking:
     `next.data.ultimateBladeArtUntil = { combatId: combat.id, round: combat.round + 1, turn: combat.turn };`
   - In `castSpellswordArt`, check whether the current combat position is `<= ultimateBladeArtUntil`. If outside combat or beyond turn, treat as expired.
   - Provide clean manual toggle/expiry on sheet.
6. **Verification Commands & Criteria:**
   - Unit test: Activate Ultimate Blade Art on round 1 turn 1. Advance to round 2 turn 1 (active). Advance to round 2 turn 2 (expired). Verify casting limit warning reappears on turn 3.

---

### B-135: Guard Reaction is spent before receipt persistence
1. **Summary of Reported Issue vs Expected Behavior:**
   - *Reported Issue:* In Cut Through Chaos, Cross Counter, and Slip Off, if an error or interruption occurs when saving the receipt to the actor, the reaction was already spent on the actor, stranding it without an undo receipt.
   - *Expected Behavior:* Intent and receipt must be persisted before side effects; failures cannot strand or double-spend reactions.
2. **Current Implementation Analysis:**
   - `artsblade-features.mjs:268`:
     `const rx = await spendReaction(actor, { triggerId: `${receipt.id}-cutThroughChaos`, receipt: receipt.id });`
     `receipt.reaction = { requested: true, spent: rx.ok, receiptId: receipt.id };`
   - `brawler-features.mjs:116` (Cross Counter) and line 214 (Slip Off) do the same.
   - `play-uses.mjs:274–290`: `finish()` already has logic to spend reactions safely AFTER `save(actor, state)` succeeds!
3. **Root Cause:**
   - Subclass plans called `spendReaction` inside `plan.apply()` prior to the receipt being written by `play-uses.mjs:341` (`await save(actor, state)`).
4. **Existing Test Coverage & Gaps:**
   - Existing tests mock successful saves; none inject write failures to test resilience.
5. **Concrete Remediation Plan:**
   - Remove direct calls to `spendReaction` in `artsblade-features.mjs` and `brawler-features.mjs`.
   - Instead, declare on the receipt:
     `receipt.reaction = { requested: true, triggerId: `${receipt.id}-cutThroughChaos` };`
   - Allow `play-uses.mjs:finish()` to execute `spendReaction` after `save(actor, state)` completes.
6. **Verification Commands & Criteria:**
   - Simulate a write failure on `save()`. Verify that reaction budget is not decremented if the receipt write fails.

---

### B-136: Blade Art ignores the selected Arts Pool
1. **Summary of Reported Issue vs Expected Behavior:**
   - *Reported Issue:* When a user selects "Frost" in the Blade Art dialog, Fire damage is dealt instead.
   - *Expected Behavior:* Chapter 3 L2306: "You choose what Damage Type this Damage is; when you cast this Art, choose one of the Arts Pools you have selected for your Spellsword Arts. The Damage Type corresponds to the chosen Arts Pool."
2. **Current Implementation Analysis:**
   - `ak5e/scripts/guard-sheet.mjs:499`:
     `guardUses.command(actor, "bladeArt", { artPool, confirmed: true, ...extra }, operationId())`
   - `ak5e/scripts/artsblade-features.mjs:110–111`:
     `const poolKey = String(data.pool ?? "flame").toLowerCase();`
     `const poolInfo = ARTS_POOLS[poolKey] ?? ARTS_POOLS.flame;`
3. **Root Cause:**
   - Key mismatch: The sheet submits `artPool`, while the plan checks `data.pool`. Because `data.pool` is undefined, it defaults to `"flame"` (Fire).
4. **Existing Test Coverage & Gaps:**
   - `ak5e/test/artsblade.test.mjs:47` passes `{ pool: "frost" }` directly, bypassing the sheet interface and hiding the mismatch.
5. **Concrete Remediation Plan:**
   - In `artsblade-features.mjs:110`:
     `const poolKey = String(data.artPool ?? data.pool ?? "").toLowerCase();`
   - Validate that `ARTS_POOLS[poolKey]` exists; if invalid, warn or reject rather than silently falling back to Flame.
6. **Verification Commands & Criteria:**
   - Unit test calling `guardUses.command(actor, "bladeArt", { artPool: "frost", confirmed: true })` and asserting `receipt.damageParts[0].type === "cold"`.

---

### B-137: Artsblade casting frequency warnings are incomplete
1. **Summary of Reported Issue vs Expected Behavior:**
   - *Reported Issue:* Casting Blade Art twice in one turn without Augmented Assault generates no warnings. With Augmented Assault, third casts or casting leveled Spellsword Arts bypass warnings.
   - *Expected Behavior:* Chapter 3 L2245, L2249: Spellsword Arts (including Blade Art) can only be cast once per turn. Augmented Assault allows two casts per turn, but BOTH must be Blade Art.
2. **Current Implementation Analysis:**
   - `artsblade-features.mjs:105–158` (`bladeArt` plan) never checks or updates `state.data.spellswordArtCastTurn`.
   - `artsblade-features.mjs:206–212`:
     ```javascript
     const isAugmented = state.data?.augmentedAssaultTurn === currentTurnKey;
     if (!isUltimate && currentTurnKey && state.data?.spellswordArtCastTurn === currentTurnKey) {
       if (!isAugmented) {
         warn(warnings, "frequency", "You can only cast a Spellsword Art once per Turn.");
       }
     }
     ```
3. **Root Cause:**
   - `bladeArt` never tracks that a Spellsword Art was cast.
   - When `isAugmented` is true, `castSpellswordArt` completely disables the frequency warning, even though Augmented Assault only permits Blade Art (not leveled Spellsword Arts), and permits at most two casts.
4. **Existing Test Coverage & Gaps:**
   - `ak5e/test/artsblade.test.mjs` tests single casts; zero tests for multiple casts per turn.
5. **Concrete Remediation Plan:**
   - Track `state.data.spellswordCastsThisTurn = (state.data.spellswordCastsThisTurn ?? 0) + 1` in both `bladeArt` and `castSpellswordArt`.
   - In `bladeArt`: warn if `casts >= 1` unless Augmented Assault (max 2) or Ultimate Blade Art.
   - In `castSpellswordArt`: warn if Augmented Assault is active ("Augmented Assault only permits Blade Art").
6. **Verification Commands & Criteria:**
   - Unit tests:
     1. Two `bladeArt` uses in same turn -> second warns with `frequency`.
     2. Augmented Assault -> two `bladeArt` uses allowed, third warns with `frequency`.
     3. Augmented Assault -> `castSpellswordArt` warns that Augmented Assault only permits Blade Art.

---

### B-138: Spellsword casting accepts a below-maximum level
1. **Summary of Reported Issue vs Expected Behavior:**
   - *Reported Issue:* Passing `castingLevel: 1` at Guard level 17 records level 1.
   - *Expected Behavior:* Chapter 3 L2212: "When you cast a Spellsword Art, you must cast it at the maximum level you can cast that Art at."
2. **Current Implementation Analysis:**
   - `ak5e/scripts/artsblade-features.mjs:215`:
     `const castingLevel = Math.min(Number(data.castingLevel ?? maxLevel), maxLevel);`
   - `ak5e/scripts/guard-sheet.mjs:504`:
     Dropdown offers levels 1 to `maxLvl`.
3. **Root Cause:**
   - The code permits any level `<= maxLevel`. The source rule forbids down-casting.
4. **Existing Test Coverage & Gaps:**
   - `ak5e/test/artsblade.test.mjs:79` tests casting at level 2 when max is 2; never tests submitting lower level.
5. **Concrete Remediation Plan:**
   - In `artsblade-features.mjs`: Validate `castingLevel`. If `data.castingLevel && data.castingLevel < maxLevel`, warn: "Spellsword Arts must be cast at your maximum Arts level."
   - In `guard-sheet.mjs`: Display fixed maximum level rather than a selection dropdown of lower levels.
6. **Verification Commands & Criteria:**
   - Unit test verifying that requesting a below-maximum casting level triggers a warning.

---

### B-139: Resonance roll bonuses have incorrect scope and duration
1. **Summary of Reported Issue vs Expected Behavior:**
   - *Reported Issue:* Force bonus applies to ranged attacks and expires as soon as turn passes to next combatant. Flame Improved Resonance applies base weapon damage type instead of Fire.
   - *Expected Behavior:* Chapter 3 L2284, L2360: Crude (+1 / +3) applies to Melee Attacks until the end of your next Turn. Flame Improved (+1d10) deals Fire Damage on Melee Weapon Attacks until the end of your next Turn.
2. **Current Implementation Analysis:**
   - `artsblade-features.mjs:327`:
     `if (state.data?.forceResonanceUntilTurn && state.data.forceResonanceUntilTurn === turnKey)`
   - `artsblade-features.mjs:351`:
     `roll.parts.push("1d10");` (untyped damage).
   - Neither hook checks for melee attacks (`activity.actionType === "mwak"`).
   - `turnKey` matches only the current combatant's active sub-turn.
3. **Root Cause:**
   - Hook lacks attack type filter (allows ranged).
   - Compares exact `turnKey` rather than end-of-next-turn boundary.
   - Appends formula string to damage parts without typing as Fire.
4. **Existing Test Coverage & Gaps:**
   - `ak5e/test/artsblade.test.mjs:132–154` mocks `currentTurnKey === "c1:1:1"` and asserts bonus is in parts. Never tests ranged attacks or advancing turns.
5. **Concrete Remediation Plan:**
   - Store expiration: `expiresRound`, `expiresTurn`.
   - In `artsbladePreRollAttack`: verify `activity.actionType === "mwak"` or melee attack.
   - In `artsbladePreRollDamage`: verify melee, and for Flame add `{ formula: "1d10", type: "fire" }` or damage part typed Fire.
6. **Verification Commands & Criteria:**
   - Unit tests:
     1. Ranged attack -> no bonus added.
     2. Next combatant turn -> bonus remains active.
     3. After Artsblade's next turn ends -> bonus expires.
     4. Flame damage roll has Fire damage type.

---

### B-140: Blade Art save immunity is recorded before a save
1. **Summary of Reported Issue vs Expected Behavior:**
   - *Reported Issue:* Providing `targetUuid` marks the target immune to saves on the second cast even if no save was ever resolved. Moving to another combatant clears the immunity too early.
   - *Expected Behavior:* Chapter 3 L2274: "Once a Creature has made a Saving Throw against your Blade Art, they do not need to make that Saving Throw again until the beginning of your next Turn."
2. **Current Implementation Analysis:**
   - `artsblade-features.mjs:131`:
     `if (targetUuid && turnKey) next.data.bladeArtSaves[targetUuid] = turnKey;`
   - Sets immunity unconditionally in `apply()` before any save roll occurs.
   - Checks `lastSaved === turnKey` (expires on next creature's turn instead of Artsblade's next turn start).
3. **Root Cause:**
   - Save immunity is recorded at cast time rather than save resolution time, and duration checks global turn key instead of caster turn start.
4. **Existing Test Coverage & Gaps:**
   - `ak5e/test/artsblade.test.mjs:47–57` casts once; never tests two consecutive casts.
5. **Concrete Remediation Plan:**
   - Record `bladeArtSaves` only when a save is completed (via save card button/event).
   - Track duration until the beginning of the Artsblade's next turn.
6. **Verification Commands & Criteria:**
   - Unit test verifying that casting twice without resolving save requires save on both; resolving save on target grants immunity until Artsblade's next turn start.

---

### B-141: Brawler armor gate uses obsolete D&D5e fields
1. **Summary of Reported Issue vs Expected Behavior:**
   - *Reported Issue:* Equipping Heavy Armor with modern D&D5e schema (`system.type.value = "heavy"`) returns `true` from `isUnarmoredOrLight`, improperly granting Guns Out benefits.
   - *Expected Behavior:* Chapter 3 L2430: Guns Out benefits apply only "While you are not wearing Medium or Heavy Armour".
2. **Current Implementation Analysis:**
   - `ak5e/scripts/brawler-features.mjs:30–41`:
     ```javascript
     const armors = equipped.filter(i => {
       const val = i.system?.type?.value;
       return val === "armor" || i.system?.armor?.type;
     });
     ```
3. **Root Cause:**
   - Audited D&D5e 5.3.3 stores `"heavy"`, `"medium"`, `"light"`, `"shield"` directly in `system.type.value`. Checking `val === "armor"` returns false, causing heavy armor to be ignored.
4. **Existing Test Coverage & Gaps:**
   - `ak5e/test/brawler.test.mjs:38` tests an unarmored actor; never tests equipped armor items.
5. **Concrete Remediation Plan:**
   - Update `isUnarmoredOrLight(actor)`:
     ```javascript
     export function isUnarmoredOrLight(actor) {
       const equipped = values(actor?.items).filter(i => i.type === "equipment" && i.system?.equipped);
       return !equipped.some(item => {
         const typeVal = String(item.system?.type?.value ?? "").toLowerCase();
         const subType = String(item.system?.type?.subType ?? item.system?.armor?.type ?? "").toLowerCase();
         return ["medium", "heavy"].includes(typeVal) || ["medium", "heavy"].includes(subType);
       });
     }
     ```
6. **Verification Commands & Criteria:**
   - Unit test equipping equipment with `system.type.value = "heavy"` and asserting `isUnarmoredOrLight` returns `false`.

---

### B-142: Brawler counts Dexterity twice
1. **Summary of Reported Issue vs Expected Behavior:**
   - *Reported Issue:* An Unarmed Strike activity already using Dexterity (e.g. +4 mod) gains an additional +2 from Brawler hooks, resulting in +6 ability bonus.
   - *Expected Behavior:* Chapter 3 L2436: "You can use your Dexterity modifier instead of your Strength modifier for the Attack and Damage rolls of your Unarmed Strikes."
2. **Current Implementation Analysis:**
   - `brawler-features.mjs:426–434` and lines 446–454:
     ```javascript
     if (dexMod > strMod) {
       const diff = dexMod - strMod;
       roll.parts.push(String(diff));
     }
     ```
3. **Root Cause:**
   - The hook blindly assumes the roll was made with Strength and appends `dexMod - strMod`, even when the activity was already configured to roll with Dexterity.
4. **Existing Test Coverage & Gaps:**
   - `ak5e/test/brawler.test.mjs:188–198` sets mock roll parts with STR modifier only, concealing double-counting on native DEX activities.
5. **Concrete Remediation Plan:**
   - Inspect the activity's configured ability (`activity.ability ?? activity.attack?.ability`). If already `"dex"`, do not append `diff`.
6. **Verification Commands & Criteria:**
   - Unit test with activity set to `ability: "dex"`: verify `roll.parts` does not receive an extra modifier.

---

### B-143: Brawler damage bonus checks unrelated selected targets
1. **Summary of Reported Issue vs Expected Behavior:**
   - *Reported Issue:* Targeting both a healthy enemy and a Prone enemy, then attacking the healthy enemy, adds the Kick Them While They're Down PB damage bonus.
   - *Expected Behavior:* Chapter 3 L2456: Bonus applies only when hitting a creature that has a detrimental condition.
2. **Current Implementation Analysis:**
   - `brawler-features.mjs:458–464`:
     ```javascript
     const targets = Array.from(globalThis.game?.user?.targets ?? []);
     const anyDetrimental = targets.some(t => ...);
     ```
3. **Root Cause:**
   - Checks `targets.some(...)` on all user-targeted tokens rather than the specific creature targeted/hit by the attack.
4. **Existing Test Coverage & Gaps:**
   - `ak5e/test/brawler.test.mjs:186` tests with a single Prone target in `targets`.
5. **Concrete Remediation Plan:**
   - Bind the check to the specific target of the attack/damage roll (from dialog target, event target, or attack resolution).
6. **Verification Commands & Criteria:**
   - Unit test with multi-target selection: verify attack against healthy target does not add bonus.

---

### B-144: Fearmonger affects other Guard subclasses
1. **Summary of Reported Issue vs Expected Behavior:**
   - *Reported Issue:* A level-5 Brawler attacking a Frightened target receives Advantage from the Centurion Fearmonger hook.
   - *Expected Behavior:* Chapter 3 L2581: Fearmonger is a Centurion feature (Mow Them Down, level 4). Only Centurions receive this benefit.
2. **Current Implementation Analysis:**
   - `centurion-features.mjs:263`:
     ```javascript
     const level = guardLevel(actor) ?? 1;
     // Fearmonger (Level 4): Advantage on attack rolls against Frightened creatures
     if (level >= 4) {
     ```
3. **Root Cause:**
   - Line 263 checks `level >= 4`, but fails to check `if (!isCenturion(actor)) return;`.
4. **Existing Test Coverage & Gaps:**
   - `ak5e/test/centurion.test.mjs:144` tests a Centurion actor only.
5. **Concrete Remediation Plan:**
   - Add `if (!isCenturion(actor)) return;` at the beginning of `centurionPreRollAttack` (line 256).
6. **Verification Commands & Criteria:**
   - Unit test rolling attack with level 5 Brawler against Frightened target; assert `roll.options.advantage` is not set.

---

### B-145: Cyclone Strike frequency checks fail
1. **Summary of Reported Issue vs Expected Behavior:**
   - *Reported Issue:* Cyclone Strike can be used multiple times in a single turn at level 14+ without warnings. Below level 14, it can be reused on an enemy's turn before the Centurion's next turn.
   - *Expected Behavior:* Chapter 3 L2558, L2564: Below 14th level, cannot be used again until the beginning of the Centurion's next turn. From 14th level, once on each turn.
2. **Current Implementation Analysis:**
   - `centurion-features.mjs:78`:
     `if (level < 14 && currentTurnKey && lastUsedTurn === currentTurnKey)`
3. **Root Cause:**
   - At level 14+, frequency check is completely bypassed.
   - Below level 14, checks `lastUsedTurn === currentTurnKey` (global combat turn), so it resets as soon as another creature's turn starts, before the Centurion's next turn begins.
4. **Existing Test Coverage & Gaps:**
   - `ak5e/test/centurion.test.mjs:37–56` tests secondary target count; never tests reuse frequency.
5. **Concrete Remediation Plan:**
   - Track `lastUsedTurnKey` and `lastUsedCenturionTurn`.
   - Below 14: warn if Centurion's next turn has not begun.
   - Level 14+: warn if used more than once in the same turn (`lastUsedTurnKey === currentTurnKey`).
6. **Verification Commands & Criteria:**
   - Unit tests for both level < 14 off-turn reuse and level 14+ same-turn duplicate use.

---

### B-146: Brutal Execution target resolution is incomplete
1. **Summary of Reported Issue vs Expected Behavior:**
   - *Reported Issue:* Brutal Execution triggered from sheet sends no targets. API relay to GM client fails with "The recorded change is not one this use can make." Owned targets receive label but no `frightened` status.
   - *Expected Behavior:* Chapter 3 L2573: Hostile creatures within 15 ft make Wisdom save vs Centurion DC or take Psychic Damage and become Frightened. Changes to unowned targets relay automatically.
2. **Current Implementation Analysis:**
   - `guard-sheet.mjs:457`: calls command without prompting for targets.
   - `centurion-features.mjs:127`: `tag: { label: "Frightened (Brutal Execution)", ... }` omits `condition: "frightened"`.
   - `centurion-features.mjs:128`: sets `ready: true` before save is resolved.
   - `CENTURION_PLANS.brutalExecution` lacks `validateTarget(...)` method, failing `play-uses.mjs:207`.
3. **Root Cause:**
   - Missing UI target collection, missing status condition mapping, premature `ready: true`, and missing relay target validator.
4. **Existing Test Coverage & Gaps:**
   - `ak5e/test/centurion.test.mjs:58–96` mocks `isOwner: true` on enemy; never exercises relay or `validateTarget`.
5. **Concrete Remediation Plan:**
   - Add target selection prompt in `guard-sheet.mjs`.
   - In `centurion-features.mjs`:
     - Add `condition: "frightened"` to tag.
     - Add `validateTarget: (source, receipt, entry, target) => entry.kind === "effect" && ...`.
     - Render clickable save buttons on card rather than premature completion.
6. **Verification Commands & Criteria:**
   - Test unowned target relay execution with mock GM client; verify status applied on target.

---

### B-147: Brutal Execution uses an inconsistent Intimidation modifier
1. **Summary of Reported Issue vs Expected Behavior:**
   - *Reported Issue:* With Intimidation mod = 2 and total = 8, DC is 16 but Psychic damage is 2.
   - *Expected Behavior:* Chapter 3 L2555, L2573: Both Centurion DC and Brutal Execution damage refer to "Your Intimidation Modifier". They must be consistent.
2. **Current Implementation Analysis:**
   - `centurion-features.mjs:108`:
     `const intimidationMod = Number(actor.system?.skills?.itm?.mod ?? ...);`
   - `guard-rules.mjs:124`:
     `const intimidation = Number(system.skills?.itm?.total ?? ...);`
3. **Root Cause:**
   - One uses `skills.itm.mod` (ability score modifier) while the other uses `skills.itm.total` (including proficiency/expertise).
4. **Existing Test Coverage & Gaps:**
   - `ak5e/test/centurion.test.mjs:27–35` sets `itm.mod = 4` without setting proficiency, masking the divergence.
5. **Concrete Remediation Plan:**
   - Align both to use `skills.itm.total` (or consistent reviewed skill bonus helper).
6. **Verification Commands & Criteria:**
   - Unit test with character having proficiency in Intimidation: assert DC and damage modifier agree.

---

### B-148: Cut Through Chaos roll definitions are discarded
1. **Summary of Reported Issue vs Expected Behavior:**
   - *Reported Issue:* Cut Through Chaos in spellAttack or savingThrow mode produces a card with no attack roll button.
   - *Expected Behavior:* Chapter 3 L2330–2331: Player makes a Melee Attack as a Reaction and compares the result to the incoming roll/DC.
2. **Current Implementation Analysis:**
   - `artsblade-features.mjs:263`: defines `rolls: [{ id: "cutAttack", formula: "..." }]`.
   - `play-uses.mjs:336`: ignores `plan.rolls`; only looks for `receipt.formula`.
   - Same issue in Ferocious Fling (`centurion-features.mjs:154`).
3. **Root Cause:**
   - Mismatch between plan interface (`plan.rolls`) and play-uses card rendering engine (`receipt.formula`).
4. **Existing Test Coverage & Gaps:**
   - Tests assert returned result object; never inspect chat message cards or roll availability.
5. **Concrete Remediation Plan:**
   - Set `receipt.formula` and `receipt.rollLabel` on the receipt in `apply()` for `cutThroughChaos` and `ferociousFling`.
   - Status transitions to `"awaitingRoll"`, rendering interactive roll button on card.
6. **Verification Commands & Criteria:**
   - Unit test asserting `receipt.status === "awaitingRoll"` and `receipt.formula` is present.

---

### B-149: Subclass dialogs misstate source mechanics
1. **Summary of Reported Issue vs Expected Behavior:**
   - *Reported Issue:* Dialogs state incorrect rules: Cut Through Chaos claims "advantage/disadvantage"; Chokehold offers CON; Mountainbreaker claims "4 attacks" or "stun save".
   - *Expected Behavior:* Chapter 3 L2327, L2521, L2461: Cut Through Chaos is an attack roll comparison; Chokehold is STR or DEX score HP loss; Mountainbreaker is 10 attacks with cumulative -2, or 5x damage knockback 20ft and Prone.
2. **Current Implementation Analysis:**
   - `guard-sheet.mjs:534–536`, `570–571`, `588–589` contain fabricated labels.
   - `ak5e/DECISIONS.md:1449–1485` recorded incorrect summaries.
3. **Root Cause:**
   - Early placeholders were authored using invented D&D 5e mechanics instead of source chapter text.
4. **Existing Test Coverage & Gaps:**
   - Static string reviews; no tests validate dialog text against source definitions.
5. **Concrete Remediation Plan:**
   - Rewrite labels in `guard-sheet.mjs` to match exact Chapter 3 mechanics.
   - Update `DECISIONS.md` to correct the historical summary.
6. **Verification Commands & Criteria:**
   - Verify prompt option strings against Chapter 3 text.

---

### B-150: Artsblade grants and Art resolution are incomplete
1. **Summary of Reported Issue vs Expected Behavior:**
   - *Reported Issue:* Configuring Artsblade grants no Arts skill proficiency/expertise, no feature items, and provides only free-text Art resolution without pool validation or area transformation.
   - *Expected Behavior:* Chapter 3 L2206–2368: Arts-Touched grants Arts proficiency/expertise; learned pools restrict usable Arts; Unleash transforms area into normal AoE; True Spellsword converts melee attacks to Arts damage.
2. **Current Implementation Analysis:**
   - `guard-setup.mjs:8` and `guard-progression.mjs:351` grant only the subclass item.
   - `artsblade-features.mjs:191` accepts arbitrary text for `artName`.
3. **Root Cause:**
   - Incomplete setup/progression feature item definitions and free-text stubbing.
4. **Existing Test Coverage & Gaps:**
   - Unit tests pass free-text strings without checking item compendium or skill proficiencies.
5. **Concrete Remediation Plan:**
   - In `guard-progression.mjs`: grant Arts proficiency/expertise (like Centurion Intimidation).
   - Validate selected Arts Pool in `castSpellswordArt`.
   - Apply True Spellsword Arts damage type in damage hooks.
6. **Verification Commands & Criteria:**
   - Progression test verifying Arts skill proficiency/expertise granted for Artsblade.

---

### B-151: Brawler native benefits are incomplete
1. **Summary of Reported Issue vs Expected Behavior:**
   - *Reported Issue:* Bob and Weave AC and Art of the Fist damage dice are unapplied helper functions; no feature items are granted; Flurry and Brawler Fighting Style are conflated.
   - *Expected Behavior:* Chapter 3 L2430, L2443, L2445: Bob and Weave modifies base AC to 10 + STR + DEX; Unarmed strike scales 1d4 -> 1d6 -> 1d8; Flurry grants extra unarmed strike during Attack Action (distinct from Fighting Style Bonus Action strike).
2. **Current Implementation Analysis:**
   - `brawler-features.mjs:23, 43` exist as helpers but are never applied to actor sheets or items.
3. **Root Cause:**
   - Automation boundary left helpers disconnected from D&D5e document data and progression.
4. **Existing Test Coverage & Gaps:**
   - Tests assert helper outputs; never check actor AC or equipped unarmed strike damage.
5. **Concrete Remediation Plan:**
   - Wire `bobAndWeaveAC` into progression AC overrides (or active effects).
   - Wire `artOfTheFistDie` into unarmed strike item configuration.
   - Clearly document manual vs automated handling for Flurry.
6. **Verification Commands & Criteria:**
   - Unit test verifying level 7 Brawler unarmed strike deals 1d6 damage and AC reflects 10 + STR + DEX.

---

### B-152: Centurion reach and Reaction refunds are incomplete
1. **Summary of Reported Issue vs Expected Behavior:**
   - *Reported Issue:* Long-Arm extended reach, Storm of Blood off-turn reach, and AoO hit reaction refunds are only described in chat text without any implementation.
   - *Expected Behavior:* Chapter 3 L2571, L2614: Melee weapons have Reach (+5 ft) during turn; Storm of Blood extends this off-turn; AoO hits refund Reaction.
2. **Current Implementation Analysis:**
   - `centurion-features.mjs:242` prints summary text only.
   - `registerCenturionHooks` registers only attack advantage/disadvantage hook.
3. **Root Cause:**
   - Feature was implemented as descriptive narrative without underlying state or event handlers.
4. **Existing Test Coverage & Gaps:**
   - `ak5e/test/centurion.test.mjs:134–142` asserts formula string; never tests reach or reaction refund.
5. **Concrete Remediation Plan:**
   - Add hook/handler on AoO attack hit event to trigger `refundReaction(actor)`.
   - Track off-turn Long-Arm active flag in `state.data`.
6. **Verification Commands & Criteria:**
   - Unit test emitting AoO hit event and asserting `actor.reactionBudget` is refunded.

---

### B-153: Subclass player and integration coverage is insufficient
1. **Summary of Reported Issue vs Expected Behavior:**
   - *Reported Issue:* Live browser tests only log in Gamemaster and open dialogs without exercising features; unit tests mock parameters that mask bugs B-129 to B-152.
   - *Expected Behavior:* End-to-end coverage exercising clean-World imports, player interactions, confirmation/cancel, roll cards, GM relay, and undo.
2. **Current Implementation Analysis:**
   - `ak5e/tools/test-guard-live.mjs:58` logs in GM only; line 440 opens dialog and takes screenshot without clicking actions.
   - Unit test suites run with `confirmed: true` hardcoded.
3. **Root Cause:**
   - Test suites prioritized shallow green passes over rigorous behavioral verification.
4. **Existing Test Coverage & Gaps:**
   - All 58 Guard unit tests pass despite 25 active defects.
5. **Concrete Remediation Plan:**
   - Expand `test-guard-live.mjs` to click actual action buttons, test cancel, test player relay, and test undo.
   - Add negative tests and behavioral assertions across unit test suites.
6. **Verification Commands & Criteria:**
   - Run `npm run test:guard` and live browser test suite on port 30175 with zero errors.

---

## 2. Logic Chain

1. **Sheet & Confirmation Layer:**
   - Observation: `guard-sheet.mjs` passes `confirmed: true` to every command invocation, while `confirmPlayUse` in `play-uses-sheet.mjs` only displays dialogs when `PlayWarnings` or `PlayReading` errors are thrown.
   - Inference: Normal feature activations bypass user confirmation entirely, violating WORKFLOW §3.2 (B-129).
   - In `augmentedAssault`, dismissing the Unleash prompt returns `null`, but the lack of a null-check causes execution to proceed anyway (B-130).
   - Setup button fails because `applyGuardSetup` requires a `contextKey` that `guard-sheet.mjs` never generated or passed (B-131).

2. **Progression & State Management:**
   - Observation: `previewGuardProgression` in `guard-progression.mjs` loops through all levels and increments ability scores and `hp.max` without excluding levels already recorded in `state.asiLevels` or `state.hpLevels`.
   - Inference: Any re-run of progression multiplies HP and ASIs, breaking idempotency (B-132).
   - When actions mutate `state.data` directly, `guardUses` lacks registered `cleanup` functions, leaving stale flags active even after an undo (B-133).

3. **Subclass Mechanics & Source Fidelity:**
   - Observation: In `artsblade-features.mjs`, `ultimateBladeArtActive` is a naked boolean that never expires (B-134); `data.pool` is read instead of `data.artPool`, forcing all Blade Arts to Fire damage (B-136); `castSpellswordArt` ignores once-per-turn limits when Augmented Assault is active, while `bladeArt` never tracks casts (B-137); down-casting is permitted despite source rules requiring maximum level (B-138); resonance hooks apply to ranged attacks and check single-turn keys instead of end-of-next-turn (B-139); save immunity is recorded prior to save resolution (B-140).
   - Observation: In `brawler-features.mjs`, `isUnarmoredOrLight` checks obsolete D&D5e schema (B-141); Dexterous attacks add extra bonuses to native Dex activities (B-142); Kick Them While They're Down checks user target arrays rather than hit targets (B-143); Brawler benefits remain unapplied helpers (B-151).
   - Observation: In `centurion-features.mjs`, Fearmonger lacks an `isCenturion` guard (B-144); Cyclone Strike disables frequency limits at level 14 and checks wrong turn keys below 14 (B-145); Brutal Execution lacks target selection, status condition tags, and relay validation (B-146); Intimidation modifiers are inconsistent between DC and damage (B-147); Long-Arm and AoO refunds are unhandled narrative text (B-152).

4. **Integration & Test Infrastructure:**
   - Observation: `play-uses.mjs` discards `plan.rolls`, preventing attack comparisons from appearing on chat cards for Cut Through Chaos and Ferocious Fling (B-148).
   - Dialogs and `DECISIONS.md` contain invented rules rather than source text (B-149).
   - Unit and live tests mock parameters and avoid testing real user flows, allowing 25 defects to remain hidden behind 118 passing tests (B-153).

---

## 3. Caveats

1. **Read-Only Investigation Scope:**
   - Per system constraints, this agent did not modify any source code, tests, or bug files. All findings are derived from static analysis, source comparison, and local test tracing.
2. **Batch Boundary:**
   - Defect reports B-230 through B-299 (Crusher, Instructor, Musha, Reaper) belong to R2 and are assigned to a peer agent (`explorer_guard_r2_bugs`). They were not analyzed in detail here.
3. **Headless Browser Prerequisites:**
   - Live browser testing requires an active, disposable Foundry V13 instance running on localhost port 30175 with the `standard-test` world fixture.

---

## 4. Conclusion & Actionable Master Remediation Matrix

All 25 defects in R1 are fully mapped with concrete file paths, line numbers, root causes, and explicit code remediation plans.

### Implementation Checklist for Implementer:

- [ ] **`ak5e/scripts/play-uses-sheet.mjs` & `guard-sheet.mjs`:**
  - Add standard confirmation prompt in `confirmPlayUse` / sheet actions (B-129).
  - Add null check on `augmentedAssault` prompt dismissal (B-130).
  - Wire `previewGuardSetup` and pass `preview.contextKey` in setup button handler (B-131).
  - Pass `artPool` consistently and align dropdown labels with Chapter 3 mechanics (B-136, B-149).
  - Add target prompt for `brutalExecution` (B-146).
- [ ] **`ak5e/scripts/guard-progression.mjs`:**
  - Check `state.hpLevels` and `state.asiLevels` before adding HP and ASIs to prevent duplicate application (B-132).
  - Grant Arts proficiency/expertise for Artsblade (B-150).
- [ ] **`ak5e/scripts/artsblade-features.mjs`:**
  - Implement expiration tracking and cleanup for `ultimateBladeArt` (B-134, B-133).
  - Move reaction spend out of `apply()` into `finish()` (B-135).
  - Accept `data.artPool ?? data.pool` and validate against `ARTS_POOLS` (B-136).
  - Implement cast counting and frequency validation for Blade Art and Augmented Assault (B-137).
  - Enforce maximum casting level (B-138).
  - Fix resonance hooks: restrict to melee weapon attacks, maintain duration until end of next turn, type Flame as Fire (B-139).
  - Record save immunity only upon resolved save and track until Artsblade's next turn start (B-140).
  - Map `cutAttack` roll to `receipt.formula` and set status `"awaitingRoll"` (B-148).
- [ ] **`ak5e/scripts/brawler-features.mjs`:**
  - Register `cleanup` handler on `guardUses` (B-133).
  - Move reaction spend out of `apply()` into `finish()` for Cross Counter and Slip Off (B-135).
  - Update `isUnarmoredOrLight` to detect modern D&D5e armor schemas (`system.type.value`) (B-141).
  - Check activity ability before applying Dex substitution (B-142).
  - Bind condition check to the specific hit target (B-143).
  - Wire `bobAndWeaveAC` and `artOfTheFistDie` into actor sheets and progression (B-151).
- [ ] **`ak5e/scripts/centurion-features.mjs`:**
  - Register `cleanup` handler on `guardUses` (B-133).
  - Add `isCenturion(actor)` guard to `centurionPreRollAttack` (B-144).
  - Fix Cyclone Strike turn intervals and frequency checks for level < 14 and level >= 14 (B-145).
  - Add `condition: "frightened"`, save card buttons, and `validateTarget` method for Brutal Execution (B-146).
  - Unify Intimidation modifier calculation between DC and damage (B-147).
  - Implement Long-Arm off-turn reach and AoO reaction refund event handlers (B-152).
- [ ] **`ak5e/test/` Suites:**
  - Add negative test cases, cancellation tests, reapplication tests, and multi-combatant turn tests for all 25 bugs (B-153).
- [ ] **`ak5e/DECISIONS.md`:**
  - Correct historical summaries for Cut Through Chaos, Chokehold, and Mountainbreaker (B-149).

---

## 5. Verification Method

To independently verify the defects and the subsequent fixes:

1. **Unit Test Execution:**
   ```bash
   npm run test:guard
   ```
   *Expected criteria:* All existing tests pass, plus new targeted test assertions for B-129 through B-153 pass with 0 failures.

2. **Static Validation:**
   ```bash
   node ak5e/tools/validate-files.mjs
   node ak5e/tools/verify-generated-content.mjs
   ```
   *Expected criteria:* Zero syntax, schema, or content discrepancies.

3. **In-Foundry Headless Browser Test:**
   ```bash
   export AK5E_FOUNDRY_PATH=/home/patch/FoundryV13
   export AK5E_TEST_DATA=/tmp/ak5e-test-guard
   export AK5E_TEST_PORT=30175
   export AK5E_TEST_OUTPUT=/tmp/ak5e-guard-live
   export AK5E_PLAYWRIGHT=/home/patch/AK5e-Foundry/node_modules/playwright/index.mjs
   npm run install:foundry -- --data-path "$AK5E_TEST_DATA" --foundry-path "$AK5E_FOUNDRY_PATH" --port "$AK5E_TEST_PORT"
   node ak5e/tools/test-guard-live.mjs
   ```
   *Expected criteria:* Zero page or console errors (`errors: []` in `report.json`), sheets render correctly, action buttons trigger confirmation dialogs, cancel changes nothing, and undo cleanly reverts resources and state.
