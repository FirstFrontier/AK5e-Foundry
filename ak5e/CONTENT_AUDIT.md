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
| 3 | 777 Items, 1 overview journal, 8 summon Actors |
| 4 | 126 Items, 6 reference journals |
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

Read-only inspection of all 1,442 generated records found the following
presentation issue. `sourceToHtml()` emits each pipe-table line as a separate
`<pre>` element. This preserves the literal text, but it does not create table
headers or cells and can make wide progression and statblock tables hard to
read on a sheet.

| Chapter | Records containing `<pre>` rows | Total `<pre>` rows |
| --- | ---: | ---: |
| 1 | 1 | 11 |
| 2 | 20 | 184 |
| 3 | 161 | 4,184 |
| 4 | 8 | 145 |
| 5 | 20 | 421 |
| 6 | 147 | 472 |

For example, Caster has 152 separate `<pre>` rows for source tables. Collapsed
Construct has three for its ability-score table. The current parser fixture
explicitly expects this form, so a passing parser test is not evidence that
the tables are usable in Foundry. Change the shared converter and regenerate
only after reviewing the affected source chapters and preserving their table
values. Check the result on real Item, Actor, and Journal sheets, including
partial renders and locked-pack imports. No live-World presentation claim is
made by this audit.
