# AK5e v1.3.1 generated-content audit

Audit completed 2026-09-12 against the chapter files in
`AK5e_1.3.1_Foundry_Source/`.

## Scope and method

- Regenerated Chapters 1–6 only from the authoritative source files.
- Compared every meaningful source line with the retained `rawSource` fragments.
- Checked stable ID uniqueness, expected document kinds and counts, rendered HTML,
  native scalar mappings, Art metadata, summon formulas, creature defenses, and
  embedded creature-feature extraction.
- Exercised the Chapter 1 public helpers with a mocked Foundry lifecycle and Actor.
- Excluded the Chapter 6 printable Character Sheet and historical Patch Notes from
  generated rules content; this boundary is recorded in `DECISIONS.md`.

The two repeatable audit commands are:

```bash
node ak5e/tools/verify-generated-content.mjs
node ak5e/tools/verify-chapter-one-helpers.mjs
```

## Verified totals

| Chapter | Top-level generated content |
| --- | ---: |
| 1 | 8 rules journals |
| 2 | 231 Items, 3 guidance journals, 3 summon Actors |
| 3 | 1,097 Items (including 320 Operator Skills), 1 overview journal, 8 summon Actors |
| 4 | 207 Items, 6 reference journals |
| 5 | 128 Items, 4 reference journals |
| 6 | 145 creature Actors, 2 reference journals |

Chapter 6 contains 801 source-preserving embedded feature Items across its 145
Actors. The complete inventory is in `CONTENT_MAP.md`.

## Corrections made during the audit

- Replaced the summarized Chapter 1 journal bodies with generated, exact source
  wording and added source heading/file/raw-source traceability flags.
- Preserved failed Death Saves when a Creature re-enters Dying, rejected omitted
  Death Save results instead of treating them as failures, and validated completed
  Rest kinds.
- Added previously omitted Chapter 2 introductory and Rare Species guidance,
  Chapter 3 class overview, Chapter 4 introduction, and Chapter 5 Art-description
  introduction.
- Made Species size parsing use the explicit size rule rather than incidental prose
  adjectives. Cautus, Oni, K'uk'ulkan, and Lung now correctly map to Medium.
- Prevented source-defined summon HP/AC formulas and blank ability values from
  becoming partial fixed numbers. Formula text remains in descriptions and flags.
- Added native ranges for Thrown weapons and the recognized Light weapon property.
- Parsed rank-prefixed Chapter 6 type lines, singular `Condition Immunity` fields,
  and 16 traits/actions whose punctuation differed from the dominant format.
- Retained Pathshaper Fractal's source-defined `-` HP and CR as non-numeric values.

## Runtime boundary

### Enhanced weapons (0.3.2, 2026-09-27)

Chapter 4 now includes 81 source-backed enhanced weapons: three Staff variants,
three Wand variants, six launcher variants and 69 other weapon variants. Source
fragments preserve both the enhancement paragraph and the base table row.
Staff Conductive is 2/3/4, Wand Conductive is 1/2/3, and launcher upgrades affect
only Martial DC for Splash. Ordinary weapon upgrades use one native magical
bonus; variants preserve versatile damage and thrown/reach/ranged values.
The four original combined entries remain references with their legacy IDs.
Node regressions verify all variants, source fragments, counts, menu exclusions,
and upgrades preserving customized references and Actor inventories. Native
Foundry roll/persistence verification is tracked in `FOUNDRY_SMOKE_TEST.md`.

This audit verifies generated source fidelity and helper behavior in plain Node.js.
It does not replace the clean-World Foundry VTT 13 and D&D5e 5.3.3 tests in TODO
section 3. Activities and Active Effects remain deliberately manual where the
module documentation says they are not automated.

## Description and sheet UI review (2026-09-24)

The root `README.md` UI guidance applies to the interactive Origin and Arts
controls: scope their ActorSheetV2 render hooks to the supplied HTML part, and
test full and partial renders. Generated rules text instead enters native D&D5e
Item, Actor, and Journal descriptions through `sourceToHtml()` in
`tools/source-html.mjs`. A sheet hook should not reformat those descriptions.

The 2026-09-24 read-only audit found 5,417 separate `<pre>` rows across
357 generated records. The shared converter now groups consecutive pipe lines
into semantic tables with column headers and category rows. Its wrapper allows
horizontal scrolling on narrow sheets, and standalone pipe text remains
preformatted. No rules text or numeric value was changed.

| Chapter | Source table blocks | Generated table instances |
| --- | ---: | ---: |
| 1 | 1 | 1 |
| 2 | 11 | 24 |
| 3 | 102 | 328 |
| 4 | 9 | 11 |
| 5 | 18 | 35 |
| 6 | 148 | 148 |
| **Total** | **289** | **547** |

A table can appear in more than one generated entry, so generated instances
outnumber source blocks. Chapter 3's Advanced Specialist Skills has one
redundant empty cell before Cluster Bombs' Duration value; the renderer removes
only that empty cell and retains `Instant` in the Duration column. All six
chapters now regenerate through `npm run regenerate`, including Chapter 1.
The source-wide table test confirms every pipe-table block renders as one
table with no fallback `<pre>` block; the full Node suite passes.

Visual legibility, scroll behavior, headings, and browser-console errors still
need a live clean-World check on Item, Actor, and Journal sheets and on locked
release-pack imports. Existing World documents are refreshed by the explicit
installers only after their content version is advanced; that migration is
still pending live validation.

## Paragraph spacing review (2026-09-27)

The converter removed standalone Homebrewery `:` paragraph separators before
parsing them, merging separate paragraphs with `<br>` tags. Retaining those
separators now produces separate paragraphs, including all five prose paragraphs
in the Ægir nationality shown by origin setup. Ordinary newlines still produce
intentional line breaks. Generated paragraphs carry a module-scoped CSS class
for paragraph margins and a 1.55 line height in native descriptions and journals.
The origin dialog uses normal block flow, with explicit paragraph and heading
margins, instead of applying a grid gap between every text element.

Regeneration preserves source fields, IDs, document counts, and mechanical data.
The paragraph regression and full Node validation suite pass (the optional native
D&D5e sheet check was skipped). One source markup defect becomes visible at a
paragraph boundary: Basin Sea Reaper's `**Enrage.***` leaves an extra asterisk;
its source wording is retained and the cleanup is tracked in TODO.md. Live
Foundry visual checks and deployment remain pending.
