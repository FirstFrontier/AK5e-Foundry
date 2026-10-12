# B-070 · High · Almost all work is uncommitted

Area: Repository hygiene

**B-070 · High · Almost all work is uncommitted.** Every kernel, test and the Standard Bearer
files are untracked or modified in the working tree; `git worktree` isolation was unusable for
parallel agents because HEAD lacks them. Commit (or otherwise back up) when the owner decides,
then future parallel work can use worktrees.
