# Reviewing a PR push that rewrote history

A `pull_request.synchronize` event can come from a force-push, for example after squashing `fixup!` commits. Then the event's `before` commit is not an ancestor of `after`. The GitHub compare API `before...after` reports `"status": "diverged"` and shows the files diffed from the old merge base, so a push that changes nothing looks like new work.

**Why:** found while reviewing PR #33. `d728d5f...2993fcb` looked like two new commits that add both memory notes, but the two heads had the same tree.
**How to apply:** compare trees first: `gh api repos/<owner>/<repo>/git/commits/<full-sha> --jq .tree.sha` for `before` and `after` (or `git rev-parse <sha>^{tree}` when both commits are local). If the trees match, nothing changed, and earlier test results still apply. Then check each rewritten commit with `gh api repos/<owner>/<repo>/commits/<sha> --jq '.files[].filename'`.

Learned: 2026-11-27, review of PR #33
