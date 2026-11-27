# Getting a PR diff in an automation checkout

The automation checkout of a PR branch can be shallow, so the head commit has no common history with `origin/main`. `git diff origin/main...HEAD` fails with "no merge base", and `git show HEAD` lists the whole repository as added.

**Why:** found while reviewing PR #33. Both git commands gave useless output.
**How to apply:** use `gh pr diff <number>` to see a PR's real changes.

Learned: 2026-11-27, review of PR #33
