# Character-sheet resource review

The scan covers all six generated chapters: 1,442 top-level records and 801
embedded creature features. Keyword matches are candidates, including container
entries and repeated references; they are not a count of distinct resources.
Reproduce the inventory without changing World data:

```bash
node ak5e/tools/audit-feature-resources.mjs
node ak5e/tools/audit-feature-resources.mjs --json
```

Chapter 2 and Chapter 1 were read for the implemented Origin rules; Chapters 4
and 5 were subsequently read in full for the tag-profile implementation.
Chapters 3 and 6 were scanned to identify further review work. Their class-specific
values and special gain/spend triggers are not inferred by the runtime.

## Reviewed Origin trackers

The catalogue in `scripts/feature-trackers.mjs` defines 33 native use pools.
New wizard grants receive native D&D5e uses/recovery. Older attached features
display the reviewed default without a migration; their first counter edit
initializes native uses. Existing native maxima and spent values take precedence.
Native rest recovery applies after initialization. Source text remains on the
feature card, accessible with **Rules**.

| Origins | Tracked pools |
| --- | --- |
| Anura, Archosauria, Caprinae, Durin, Kuranta | Toxin Glands; Exult in Violence; Inherent Magic free casting; Don't Look Down on Me!; Until the Last Breath |
| Liberi, Oni, Perro, Sankta | Preening Feathers; Bloodfury; Survive and Adapt; Lawbringers |
| Sarkaz, Clanless, Cyclopes, Gargoyle, Nachzehrer | Witchcraft free casting; Born Survivors; Divine the Spirits; Earthen Golem; To Speak with Stone free casting; corpse consumption |
| Vouivre, Vulpo, Zalak, Abyssal Hunter | Tough as Nails; Inescapable; Spring-Loaded; shared Battle Rhythm / Dance Partner use |
| Elf, Draco, K'uk'ulkan, Lung, Nightzmora Kuranta | Elven Magic, Dragon's Rage, Stormborne and Illusory Arts free casting; Learn From the Past |
| Kjerag, Yan | One Nation under Kjeragandr; Wide, Vast Land |
| Ægir Sage, Military School Graduate, Samurai | Legacy of the Predecessors; Officer Acumen; Pride |
| Pontifica Cohors Lateran, Taran Nationalist, Martial Arts Practitioner, Entertainer | Legion of Heaven; Great Flame of Tara; Wuxia; Finger on the Pulse |

Ten further definitions store choices, lists, or additional counters:

| Feature | Tracker behavior |
| --- | --- |
| Ægir: Ever the Student, Ever the Master | One role, creature and skill. Optional linked creature applies a removable proficiency/expertise effect; replacing or ending the choice removes the previous benefit. |
| Ægir: Logic Engine | Studied-item list, capacity one or two at level 7. Proficiency remains manual. |
| Liberi: Birds of a Feather | Flock member notes and source counters remain in Details. Linked membership tags enforce one Flock and half-PB other-member capacity, with two independent Short Rest counters on each recipient. |
| Nachzehrer: In Death, Life; In Life, Death | Rot counter starts at zero, capped at level; no rest refill. Corpse use is a separate pool. |
| Cyclopes: Bad Luck | Duplicate-preserving d20 list; clears on Long Rest. Matching rolls are resolved manually. |
| Vampire: Haematophage | Bloody Inspiration availability record. Success-triggered expenditure is manual. |
| Phidia: Agendum | Agenda and special Inspiration notes. |
| Lung: Xue Wu Zhi Jing | Written/studied notes, plus an optional removable borrowed-feature card through the Treatise profile. Replacement removes the old card; its derived tags end with it. |
| Abyssal Hunter: Battle Rhythm | Current Rhythm choice. Initiative, On Beat and combat-end clearing are manual. The recovery paragraph is parsed into Dance Partner, so only that card owns the shared use pool. |
| Knight of Kazimierz | Active vow, recipient, and remaining +10/+5/+0 bonus. |

Officer's separate counter is hidden when a Tactician Branch is attached. The
GM must merge its +3 into the existing Acumen pool; the runtime never invents a
second pool or resets spent uses.

## Further resources found

| Chapter | Candidate resources and present workflow |
| --- | --- |
| 1: Changing the Game | Opt-in learned-Skill SP derives its pool and stacked rates, charges reliable combat events, and tracks activation/expiry/rests in Details (NPC header). Ambiguous events and native temporary-HP grants use confirmation. Legacy manual SP and active Dying Mettle remain available. AP stays in the existing Spells tracker. Native HP, hit dice and ammunition retain their system controls. |
| 3: Character Classes | Mystic Charge, Resilience, Munitions Dice, Liberty, Empowered Shot charges, Life Support, Skyranger Fuel, Aid Dice, Sparks of Creation, Momentum, Fervour and Acumen. Use **Configure a feature counter** on the owning AK5e feature, with values/recovery reviewed against its card and class table. Rest-limited features also use this control. |
| 4: Equipment | Ammunition, consumable quantities, and limited-use magic items, including Blacksteel and The Black Lock and The White Key. Equipment uses/quantity remain in native item controls; the new feature-counter control is for feat Items. |
| 5: Arts | Shared AP and the ninth-level limit use the existing Arts adapter. Reviewed tag profiles link native concentration and durations; conditional Damage/saves/use stay manual, with scoped confirmation buttons. No per-Art AP pool is added. |
| 6: Dwellers of Terra | Recharge and daily-use creature features are candidates for native NPC item uses/recharge review. The character tracker does not rewrite their stat blocks. Temporary tag effects and removal controls work on owned NPCs and unlinked token Actors. |

Important unresolved mappings: Mystic Charge is **lost** on Long Rest, so do
not configure it to refill; use manual recovery. Life Support can exceed its
usual maximum under Witchcraft's Halfway House, while the generic bounded
counter requires adjusting its maximum manually. Medic's Stop the Flow can
grant exceptional Mettle up to eight: the new +/- controls preserve recorded
excess, but the pre-existing Chapter 1 Dying helpers still assume the base
six-point cap and need a separate reviewed extension. Initiative regeneration,
action-based reloads, resource conversion, feature upgrades and level-table
maxima remain manual until those full chapters and referenced rules have been
reviewed for source-specific automation.

## Temporary creature tags

An owner or GM chooses an AK5e feature, Art or equipment source and an editable
creature or embedded weapon, then a reviewed profile or a custom tag. Native Active
Effects provide reversible sheet changes; **Edit effect after creation** opens
the system editor for explicitly configured changes. Text alone is a reminder,
and copied feature text does not automatically implement its prose.

Expiry supports manual removal, source/target Short or Long Rest, next turn
start, current/next turn end, distinct next-turn end, combat end, or elapsed game seconds. Long Rest
also satisfies Short Rest expiry. Turn triggers require an active combat;
combat deletion ends its turn tags. Time uses World time, not real clock time.
OR receipts can combine triggers. Concentration profiles bind to the exact
native concentration effect and reconcile deletion/disable/reload. Conditional
saves, matching Damage, use, antidote, repairs and movement are manually confirmed
on the affected tag; applying a tag does not cast, spend resources or roll.

The 53 reviewed profiles include:

| Group | Profiles and behavior |
| --- | --- |
| Origins | Flock membership/counters/capacity; studied Treatise/copy/replacement; normal, gentle and rough Cognitovore probes with timed/save/replacement removal. |
| Lasting Arts | Burden, Galvanise, Inflict Doom, Lacerate, Wither, Power Word Silence/Stop/Stupefy/Despair/Bleed/Kneel/Push, Protect from Cold/Heat, Missile Barrier, Produce Acid, Acid Douse, Snap Freeze, Corrode, Rust, Bloodline, Unstable Plasma and Tug the Heartstrings. Alternate save/HP outcomes are separate profiles. |
| Gear | Alcohol and Painkillers; four weapon coatings, Cytotoxin ingestion, Necrotoxin/Neurotoxin hit and ingestion outcomes. Coatings replace per weapon across creators. |
| Magic items/tools | Banshee's Kiss, Blacksteel restriction, Fearless Blade oath, Black Lock/White Key outcomes and Maintain Weapon variants. Rust and maintenance use native weapon enchantments. |

Known manual boundaries: AK5e condition markers do not calculate all penalties;
conditional damage/healing/DR, range, willingness, saves, AP/charges/actions,
target-specific bonuses and non-stacking adjudication remain explicit. Lacerate
cannot be cleared by healing; its Blood Amber/upcast/HP-loss rolls remain manual.
Protect from Cold/Heat ends only on the confirmed recipient. Unstable Plasma's
already incurred end-of-turn HP cost must be resolved even if its tag ends first.

Instructor, Intravenous Line, Witchcurse, Therapies, infusions, Hexes, Target Lock,
Deathmark, Fade and NPC temporary effects use **Custom tag**, the complete source
card, selected native changes, expiry/events and a shared replacement group.
For fades, combine source next-turn end with source Attack and the confirmed
forced-save event. Range-dependent Shelter, Shield Wall and Cursemark tags are
applied/removed manually when eligibility changes; no spatial aura engine is
claimed. These workflows are available now; source-specific class/NPC automatic
profiles require complete chapter review and live validation.

The target's **Effects → AK5e temporary tags** section offers **Remove tag** to
GMs and owners, including orphaned copies after failed cleanup. Removal deletes
only the tag's own effect and copies. Automatic cleanup is handled by one active
GM, or one active owner if no GM is online; it never elevates permissions.

Ægir's source wording permits one Student or Teacher and ends the old choice
when a new creature is chosen. It states no expiry on Dying, unconsciousness or
death. Linked relationships therefore persist until replaced or manually ended.
A linked choice requires edit access to both participants; otherwise keep a
record-only choice and have the GM/recipient owner apply a tag. Owners can remove
their own received tag without ownership of the source character.

Node tests cover tracker values, ownership, expiry, cleanup failures, item
enchantments, profiles, counters and sheet placement. Full `npm test` passed;
all 51 optional installed D&D5e origin/sheet/tracker/tag tests passed. Clean-World
validation of native effects, rests, concurrent clients
and persistence remains required; see `FOUNDRY_SMOKE_TEST.md`.
