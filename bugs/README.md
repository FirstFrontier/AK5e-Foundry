# AK5e bug tracker

One file per bug, so an agent reads only the bugs its task needs. This file replaces the old `BUGS.md`.
It lists **defects, gaps and unverified behaviour**. Open rules questions go in `ak5e/DECISIONS.md`;
planned work goes in `TODO.md`.

```
bugs/pending/   open bugs         B-<id>-<severity>-<slug>.md
bugs/fixed/     closed bugs       same names; archive, not read by default
```

`ls bugs/pending` is the index: the filename gives the ID, severity and topic.

## Reading rules (these are what save context)

1. **Never read `bugs/` wholesale** (`cat bugs/*/*`, globbing every file, "read the bug list"). Run
   `ls bugs/pending`, then open only the files whose ID or slug matches your task.
2. **Do not read `bugs/fixed/`** unless you were given a B-ID or need to know whether a symptom was seen
   before. Find it with `ls bugs/fixed | grep <word>` or `grep -ril <symptom> bugs/fixed`, then open one file.
3. **Assignments cite B-IDs** ("fix B-090"), never "read the bugs". The parent passes the file paths to a
   sub-agent, and the sub-agent opens only those.
4. A Foundry session or review that needs the current open defects for a *named area* lists
   `bugs/pending` and opens that area's files only.

## Writing rules

5. **New bug:** create `bugs/pending/B-<next>-<severity>-<slug>.md`. The next number is above the highest ID in
   both directories (`ls bugs/pending bugs/fixed | sort`). Do not renumber or reuse IDs.
   - First line: `# B-<id> · <Severity> · <title>`, then `Area: <area>`.
   - Say where it was found (agent/run/date), the evidence, and what **Fixed means**.
   - Keep it to about 25 lines or 2 KB. Link long logs or screenshots instead of pasting them.
6. **Close a bug** in the same change as the fix: `git mv bugs/pending/<file> bugs/fixed/<file>`, then add
   `**Resolution (fixed <date>, <version>):**` in at most about 10 lines, naming the test or the file changed.
   Longer write-ups go in the relevant implementation doc (for example `ak5e/MARKSMAN_FIXES.md`) and are linked.
   Do not mark a bug fixed on a worker's claim alone (`AGENTS.md` §6, §8). Never delete a bug.
7. **No separate fix notes.** The fix is recorded in the bug's own file. The existing `B-F01`–`B-F15` files are
   historical.
8. **Do not copy bugs elsewhere.** `TODO.md`, `VERIFY.md`, `DECISIONS.md` and reports cite a bug by ID only
   (`B-090`), not by pasting its text.
9. **Reclassify** by renaming the file when severity changes, and update the first line to match.

## Severity

- **High**: data loss, wrong rules result, or security.
- **Medium**: wrong in some situations.
- **Low**: cosmetic, latent, or tidy-up.

"Unverified" in a title means the bug was reasoned about or tested in Node only and has not been reproduced in
Foundry.
