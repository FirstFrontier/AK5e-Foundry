# Engine & Codebase Architecture Survey Report: Vanguard, Supporter, Specialist, and Medic

## 1. Observation

### 1.1 Class Representation & Progression Foundation
- **Source Compilation & Compendium Foundation:**
  - `ak5e/scripts/chapter-three-content.mjs` is compiled from `AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt` via `ak5e/tools/build-chapter-three-content.mjs`.
  - The 4 target base classes already exist in `CHAPTER_THREE_CLASSES` with pre-assigned stable source IDs and HTML content:
    - **Medic:** ID `"class-medic"` (`chapter-three-content.mjs:17818`), HD `d6`, level 1–20 features (`class-feature-medic-*`), operator skills, and talents.
    - **Specialist:** ID `"class-specialist"` (`chapter-three-content.mjs:21246`), HD `d8`, level 1–20 features (`class-feature-specialist-*`), operator skills, and talents.
    - **Supporter:** ID `"class-supporter"` (`chapter-three-content.mjs:26262`), HD `d6`, level 1–20 features (`class-feature-supporter-*`), operator skills, and talents.
    - **Vanguard:** ID `"class-vanguard"` (`chapter-three-content.mjs:30915`), HD `d8`, level 1–20 features (`class-feature-vanguard-*`), operator skills, and talents.
- **Idempotent Character Setup (`<class>-setup.mjs`):**
  - Observed in `ak5e/scripts/guard-setup.mjs:8–24`, `GUARD_CORE_FEATURES` maps level to feature IDs.
  - `previewGuardSetup(actor)` (`guard-setup.mjs:63–90`) checks existing actor items:
    ```javascript
    const owned = existing.find(i => flag(i, "chapterThreeId") === feat.id || i.name === feat.name);
    if (owned) kept.push(feat.name);
    else creates.push(featureItemData(feat));
    ```
  - It generates a snapshot hash `contextKey = JSON.stringify([actor.uuid, level, creates.map(c => c.name), kept])`.
  - `applyGuardSetup(actor, { confirmed, contextKey })` (`guard-setup.mjs:92–109`) enforces `confirmed === true` and `plan.contextKey === contextKey`, defines pools, and calls `actor.createEmbeddedDocuments("Item", plan.creates)` for missing features only.
- **Idempotent Progression Engine (`<class>-progression.mjs`):**
  - Observed in `ak5e/scripts/guard-progression.mjs`:
    - Stores progression state under `flags.ak5e.guardProgression` (`guard-progression.mjs:15`).
    - `inspectGuardFields(actor, choices)` (`guard-progression.mjs:242–306`) dynamically populates choice options for saves, skills, tools, starting equipment, HP, ASIs, and talents.
    - HP and ASI options support `mode: "existing"` (`guard-progression.mjs:184–185, 212, 223`) to prevent double-counting previously applied levels.
    - `previewGuardProgression(actor, suppliedChoices)` (`guard-progression.mjs:325–536`) is purely calculating; it validates pending choices, resolves ability score increases, hit point maximum additions, and embeds only new talent/gear items. It generates `contextKey` (`guard-progression.mjs:514`).
    - `applyGuardProgression` (`guard-progression.mjs:539–572`) checks confirmation, verifies `contextKey`, and atomically updates actor flags and embedded items.
- **Operator Skills Integration:**
  - `ak5e/scripts/operator-progression.mjs:10–66` (`getOperatorSkillChoices`) manages Basic (Lv 2), Advanced (Lv 7), and Elite (Lv 14) skill slots across all AK5e classes.
  - Automatically queries `CHAPTER_THREE_CLASSES` where `entry.operatorSkill` is defined and `entry.parentClass === className`.

### 1.2 Resource Pools Kernel (`ak5e/scripts/resource-pools.mjs`)
- **Architecture & Registration:**
  - `definePool(definition, { replace })` (`resource-pools.mjs:170–186`):
    - `id`: identifier (must start with letter, e.g. `"aggression"`, `"prowess"`, `"aidDie"`, `"lifeSupport"`).
    - `max`: normalized by `normalizeMax` (`resource-pools.mjs:138–156`), supports integer, safe mathematical formula string (e.g. `"@prof"`, `"@abilities.wis.mod"`), array indexed by level, or step object `{ 1: 20, 2: 35, ... }`.
    - `overMax`: boolean (`resource-pools.mjs:177`). When true, pool can exceed max (excess spent first).
    - `initial`: `"max"` or whole integer (`resource-pools.mjs:178`).
    - `recovery`: array of `{ on: trigger, amount: "full" | "toMax" | "toInitial" | number, when: (actor, ctx) => boolean }` (`resource-pools.mjs:158–165`).
      - Allowed triggers: `"sr"`, `"lr"`, `"initiative"`, `"turnStart"`, `"turnEnd"`, `"combatEnd"` (`resource-pools.mjs:21`).
    - `appliesTo`: function `(actor) => boolean` (`resource-pools.mjs:179`).
- **Actor State Storage & Operations:**
  - Stored strictly under `flags.ak5e.resourcePools.<poolId> = { value, last: { op, amount, reason, before, after }, receipts: [...] }` (`resource-pools.mjs:228, 291`).
  - Mutators: `spendPool`, `refundPool`, `setPool`, `recoverPool` (`resource-pools.mjs:296–298, 313`).
  - Rest recovery hook `onRestCompleted` (`resource-pools.mjs:447–452`) hooks `dnd5e.restCompleted` and calls `recoverPool(actor, ["lr", "sr"])`.
  - Combat hooks `onUpdateCombat`, `onUpdateCombatant`, `onDeleteCombat` (`resource-pools.mjs:415–438`) automatically process `turnStart`, `turnEnd`, `initiative`, and `combatEnd`.

### 1.3 Operation Kernel, Table-Play Philosophy & Undo (`ak5e/scripts/operation-kernel.mjs`, `play-uses.mjs`, `play-undo.mjs`)
- **Low-level Transactional Kernel:**
  - `createOperationKernel(config)` (`operation-kernel.mjs:68–185`) enforces:
    - Single-flight promise queue per Actor UUID: `keyedSerial()` (`operation-kernel.mjs:32–39`).
    - Player request -> active GM commit via ChatMessage whisper socket transport: `submit` (`operation-kernel.mjs:170–182`), `handle` (`operation-kernel.mjs:159–168`), and `execute` (`operation-kernel.mjs:119–157`).
    - Replay protection and idempotency via `opaqueKey` fingerprinting (`operation-kernel.mjs:25–29, 130–135`).
- **Table-Play Uses Engine (`createPlayUses` in `play-uses.mjs:68–458`):**
  - **Plan Execution:** Each feature defines a pure plan: `plan(actor, state, data, operationId) => { warnings, title, reading?, apply(next, receipt, reading) }`.
  - **Confirm Before Use:** `command(actor, name, data, opId)` (`play-uses.mjs:310–344`) asserts `data.confirmed === true`.
  - **Warnings & Overrides:**
    - Plans collect non-blocking warnings via `warn(warnings, id, text)` (`play-uses.mjs:50`).
    - `requireOverrides(plan.warnings, data.overrides)` (`play-undo.mjs:34–39`) throws `PlayWarnings` until the user submits matching override IDs ("Use anyway").
  - **Zero Clamping & Public Shortfall Cards:**
    - `spendResource(actor, receipt, { pool, path, amount, label })` (`play-uses.mjs:57–64`):
      `after = Math.max(0, before - amount)`. Clamped at 0, never negative.
      If `amount > before`: `receipt.shortfalls.push(`${label} short by ${amount - before}`)`.
    - `cardHtml(receipt)` (`play-uses.mjs:234–243`) prints:
      - `<p><strong>Used anyway:</strong> ${receipt.overridden.join(" ")}</p>`
      - `<p><strong>${shortfall}.</strong></p>`
  - **Unowned Target Automatic GM Relay:**
    - Changes to target tokens (HP heal, temp HP, active effects) are recorded in `receipt.targets`.
    - `changeTarget(source, receipt, entry, command)` (`play-uses.mjs:221–230`):
      - If player owns target (`canWrite(target)`), applied directly.
      - If player does not own target, dispatches `relay.submit(source, command, { useId, targetUuid, confirmation: true }, ...)`.
      - GM client's `relayedTargetChange` (`play-uses.mjs:194–209`) verifies that `receipt.targets` specifically recorded that target change and runs `PLANS[receipt.command].validateTarget(source, receipt, entry, target) === true`.
      - Applied automatically with NO human GM prompt.
      - If no GM is active, throws `NoGM`; the use is marked `"pending"` ("Not applied yet: no GM is connected") and can be retried without re-spending resources (`play-uses.mjs:239, 295–298`).
  - **Encounter-Window Undo Receipts:**
    - Every action records a receipt in `flags.ak5e.<ns>.undo` (`play-uses.mjs:333–341`).
    - `currentEpoch()` (`play-undo.mjs:47–54`) reads hidden world setting `encounterEpoch`.
    - `advanceEpoch()` advances on `combatStart`, round changes, and `deleteCombat` (`play-undo.mjs:56–72`).
    - Receipts from prior epochs are marked locked (`isLocked(receipt)`, `play-undo.mjs:50`). Players cannot undo locked receipts; GMs can undo locked receipts (`play-uses.mjs:380, 402`).
    - `undoUse(actor, data)` (`play-uses.mjs:398–439`) restores resources by exact delta (`updates[resource.path] = Math.max(0, Math.min(max, current + (before - after)))`), reverts target changes (via GM relay if needed), refunds reactions, restores flags if unchanged, and marks `receipt.status = "undone"`.

### 1.4 ActorSheetV2 Integration (`ak5e/scripts/guard-sheet.mjs`, `play-uses-sheet.mjs`)
- **ActorSheetV2 Injection (`guard-sheet.mjs:1140–1181`):**
  - Targets `.tab[data-tab="features"]` on `renderActorSheetV2`.
  - Prepends a `<section class="ak5e-<class>-sheet-panel">`.
  - Renders resource badges: `<span class="ak5e-pool-badge">Aggression: 4/4</span>`, `<span class="ak5e-pool-badge">Unrelenting: 1/1</span>`.
  - Provides a single primary button: `"Open <Class> Controls"` (or `"Set up <Class>"` if unconfigured).
  - Explicit table notice: `"Opening this panel makes no changes (confirm before use)."`
- **Window Header Controls (`guard-sheet.mjs:1169–1179`):**
  - Hooks `getHeaderControlsApplicationV2`.
  - Inserts top-level action `{ action: "ak5e<Class>", icon: "fa-solid fa-...", label: "<Class>", ownership: "OWNER", onClick: () => open<Class>Controls(actor) }`.
- **Interactive Controls Dialog (`openGuardControls` in `guard-sheet.mjs:36–150`):**
  - Interactive DialogV2 showing martial DC, active pools, categorized action buttons, and an `"Undo Recent Uses"` button (`openPlayUndoList`).
  - Clicking an action opens a confirmation dialog via `confirmPlayUse(title, attempt)` (`play-uses-sheet.mjs:19–38`) which traps `PlayWarnings` ("Use anyway" / "Cancel") or `PlayReading` (player reading choices).
- **Chat Card Button Injection (`play-uses-sheet.mjs:66–85`):**
  - `renderPlayUseCard(engine, message, html)` on `renderChatMessageHTML`.
  - Adds Roll buttons (for `awaitingRoll`), Retry buttons (for `pending`), and Undo buttons directly onto public chat cards for owners and GMs.

---

## 2. Logic Chain

1. **Class Architecture Uniformity:**
   - From observing `guard-rules.mjs`, `guard-setup.mjs`, `guard-progression.mjs`, `guard-features.mjs`, `guard-uses.mjs`, and `guard-sheet.mjs`, as well as equivalent architectures in Defender and Marksman, the codebase has established a clean, battle-tested 6-module architecture for each character class.
   - Therefore, Vanguard, Supporter, Specialist, and Medic should follow this exact 6-module design pattern rather than inventing disparate abstractions.

2. **Idempotency Guarantee for Progression:**
   - From `guard-setup.mjs` and `guard-progression.mjs`, idempotency is achieved by:
     1. Checking existing embedded items by source `chapterThreeId` or name before creation;
     2. Retaining authored customizations and existing items in `kept`;
     3. Providing an explicit `"mode": "existing"` option for HP and ASI levels so re-running or migrating a character does not re-add hit points or ability scores;
     4. Generating a deterministic `contextKey` hash between preview and apply to prevent stale or race-condition writes.
   - Therefore, all four new classes must implement the exact same `preview<Class>Setup` / `apply<Class>Setup` and `preview<Class>Progression` / `apply<Class>Progression` contract.

3. **Resource Pool Modeling:**
   - From `resource-pools.mjs`, the kernel natively handles formulas, step tables, over-max limits, and rest triggers.
   - **Specialist (`prowess`):** Source Ch. 3 L5315 specifies max equals PB, regaining 1 on Short/Long rest. Formula `"@prof"` and rest triggers `{ on: "sr", amount: 1 }, { on: "lr", amount: 1 }` directly satisfy this.
   - **Supporter (`aidDie`):** Source Ch. 3 L6637 specifies pool size equals chosen INT, WIS, or CHA mod, regaining on Long rest. Formula `"@abilities.<mod>.mod"` with `{ on: "lr", amount: "toMax" }` directly satisfies this. Level 15 Ever Reliable adds Short Rest half-max recovery and turn-start regeneration if empty. Die size scales d8 -> d10 (Lv 7) -> d12 (Lv 14).
   - **Medic (`lifeSupport`):** Source Ch. 3 L4622–4648 specifies a level table from 20 to 170, replenishing on Long rest. Source L5104 (Healing through Harm) explicitly permits exceeding maximum Life Support. Therefore, a step table with `overMax: true` and `{ on: "lr", amount: "toMax" }` directly satisfies this.

4. **Table-Play Philosophy Compliance (WORKFLOW §3.2):**
   - From `play-uses.mjs` and `play-undo.mjs`:
     1. Confirm before use is enforced by `command` requiring `data.confirmed === true` and wrapping in `confirmPlayUse`.
     2. Player dice are never auto-rolled: plans return `status = "awaitingRoll"` and store roll formulas; user clicks "Roll" on the chat card via `useRoll`.
     3. Overrides are public and resources clamp at 0: `spendResource` clamps at 0, records shortfall, and `cardHtml` prints "Used anyway" and shortfall text.
     4. Unowned targets relay automatically: `changeTarget` dispatches to GM via `relay.submit`, which executes on GM client without human approval.
     5. Everything is reversible within the encounter window: receipts store prior values, epochs lock upon combat start/end, and `undoUse` reverts target changes, reactions, flags, and resources by delta.
   - Therefore, creating `<class>Uses = createPlayUses({ ns: "<class>Uses", label: "<Class>", ... })` for each class guarantees full WORKFLOW §3.2 compliance out-of-the-box.

5. **UI & Sheet Integration:**
   - From `guard-sheet.mjs`, injecting an ActorSheetV2 panel into `.tab[data-tab="features"]` with resource summary badges, an "Open <Class> Controls" button, and header controls provides an ergonomic, non-intrusive sheet interface.
   - Card controls (Roll, Retry, Undo) are handled automatically by `renderPlayUseCard` on `renderChatMessageHTML`.

---

## 3. Caveats

1. **Subclass Depth:**
   - This investigation focuses on the **base character classes (Levels 1–20)** for Vanguard, Supporter, Specialist, and Medic as requested in the follow-up prompt. Specific subclass plans (e.g. Tactician, Agent, Bard, Hexer, Physician, Trapmaster) should be housed in dedicated subclass feature files (`<subclass>-features.mjs`) when subclasses are tackled, registering their plans with the parent class's `playUses` engine.
2. **Standard Bearer Prototype:**
   - Note that `standard-bearer.mjs` exists from earlier prototype development. When Vanguard base class is built, `vanguardUses` will become the canonical parent engine, and Standard Bearer should be aligned with it.
3. **No Unresolved Rules Inventions:**
   - As documented in `DECISIONS.md`, Supporter Aid Die modifier does not invent an automatic minimum of 1 if the chosen ability modifier is 0 or negative; it uses the exact modifier or lets the player/GM rule on it. Medic Revivify (Ch. 3 L4712) retains its exact feature text without inventing non-existent Arts.

---

## 4. Conclusion

The AK5e Foundry VTT codebase contains a mature, thoroughly tested architectural foundation:
- **`CHAPTER_THREE_CLASSES`** already holds complete source entries for Vanguard, Supporter, Specialist, and Medic.
- **`resource-pools.mjs`** handles all formula, table-based, over-max, and rest recovery needs for `prowess`, `aidDie`, and `lifeSupport`.
- **`play-uses.mjs`** and **`play-undo.mjs`** handle all WORKFLOW §3.2 player agency requirements (confirmations, non-blocking warnings, public shortfall cards, zero-clamping, unowned target GM relay, and encounter-window epoch undo).
- **`play-uses-sheet.mjs`** handles dialog rendering and chat card interactive roll/retry/undo buttons.

### Actionable Implementation Architecture for Upcoming Classes:

```
ak5e/scripts/
├── vanguard-rules.mjs         # Pure formulas, tables, DCs, profile/level inspectors
├── vanguard-features.mjs      # Landstrider, Tip of the Spear table, Directed Engagement, roll hooks
├── vanguard-setup.mjs         # VANGUARD_CORE_FEATURES, previewVanguardSetup, applyVanguardSetup
├── vanguard-progression.mjs   # inspectVanguardFields, vanguardChoices, preview/applyVanguardProgression
├── vanguard-uses.mjs          # vanguardUses (createPlayUses), Tip of the Spear & Uncanny Dodge plans
├── vanguard-sheet.mjs         # ActorSheetV2 panel, header control, openVanguardControls
│
├── supporter-rules.mjs        # Pure formulas, tables, Aid Die size progression (d8->d10->d12)
├── supporter-features.mjs     # defineSupporterPools (aidDie), Provide Aid, Advanced Aid, Ever Reliable hooks
├── supporter-setup.mjs        # SUPPORTER_CORE_FEATURES, previewSupporterSetup, applySupporterSetup
├── supporter-progression.mjs  # inspectSupporterFields, supporterChoices, preview/applySupporterProgression
├── supporter-uses.mjs         # supporterUses (createPlayUses), Provide Aid & Lighten the Load plans
├── supporter-sheet.mjs        # ActorSheetV2 panel, header control, openSupporterControls
│
├── specialist-rules.mjs       # Pure formulas, tables, Weapon Specialisations (Melee vs Ranged styles)
├── specialist-features.mjs    # defineSpecialistPools (prowess), Show Your Style, Weapon Adept/Expertise, Mastery
├── specialist-setup.mjs       # SPECIALIST_CORE_FEATURES, previewSpecialistSetup, applySpecialistSetup
├── specialist-progression.mjs # inspectSpecialistFields, specialistChoices, preview/applySpecialistProgression
├── specialist-uses.mjs        # specialistUses (createPlayUses), Mark of a Specialist & It's All Skill plans
├── specialist-sheet.mjs       # ActorSheetV2 panel, header control, openSpecialistControls
│
├── medic-rules.mjs            # Pure formulas, tables, AP table, Life Support table (20->170)
├── medic-features.mjs         # defineMedicPools (lifeSupport), Touch Heal, Preserver, Urgency, Resuscitation
├── medic-setup.mjs            # MEDIC_CORE_FEATURES, previewMedicSetup, applyMedicSetup
├── medic-progression.mjs      # inspectMedicFields, medicChoices, preview/applyMedicProgression
├── medic-uses.mjs             # medicUses (createPlayUses), Touch Heal, Preserver, Urgency plans
└── medic-sheet.mjs            # ActorSheetV2 panel, header control, openMedicControls
```

In `ak5e/scripts/ak5e.mjs`:
- Expose `game.ak5e.vanguard`, `game.ak5e.supporter`, `game.ak5e.specialist`, and `game.ak5e.medic`.
- Register sheet hooks (`register<Class>SheetHooks()`) and pool definitions in `ready`.

---

## 5. Verification Method

To independently verify the observations, architecture, and files cited in this report:

1. **Verify Source Compendium Records:**
   ```bash
   node -e '
     import("./ak5e/scripts/chapter-three-content.mjs").then(({ CHAPTER_THREE_CLASSES }) => {
       const classes = ["Vanguard", "Supporter", "Specialist", "Medic"];
       for (const name of classes) {
         const cls = CHAPTER_THREE_CLASSES.find(e => e.kind === "class" && e.name === name);
         const feats = CHAPTER_THREE_CLASSES.filter(e => e.kind === "class-feature" && e.parentClass === name);
         console.log(`${name}: ID=${cls?.id}, Features=${feats.length}`);
       }
     });
   '
   ```
2. **Inspect Reference Implementations:**
   - Inspect `ak5e/scripts/guard-setup.mjs` and `ak5e/scripts/guard-progression.mjs` to verify idempotency and `contextKey` hashing.
   - Inspect `ak5e/scripts/resource-pools.mjs` to verify formula evaluation, clamping, and rest hooks.
   - Inspect `ak5e/scripts/play-uses.mjs` to verify WORKFLOW §3.2 confirm, warnings, shortfall, zero-clamping, and unowned-target relay.
   - Inspect `ak5e/scripts/guard-sheet.mjs` and `ak5e/scripts/play-uses-sheet.mjs` to verify ActorSheetV2 panel and chat card button injections.
3. **Run Existing Test Suites for Baseline Integrity:**
   ```bash
   node --test ak5e/test/resource-pools.test.mjs ak5e/test/operation-kernel.test.mjs ak5e/test/guard-rules.test.mjs
   node ak5e/tools/validate-files.mjs
   node ak5e/tools/verify-generated-content.mjs
   ```
