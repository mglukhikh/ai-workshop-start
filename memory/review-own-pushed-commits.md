# Re-review triggered by the review run's own commits

When a Code Review run commits fixes (push-to-source), the platform's push fires another `pull_request.synchronize`, so the next review sees only those commits. List them with `git log --format='%h %s%n%b' <before>..HEAD`. If they all carry the previous Code Review run's signature and touch only `memory/`, check that the notes are correct and that the paths they name exist. Then post a short review. Don't commit again unless something is wrong, or each review triggers another one.

**Why:** the PR #36 re-review at 2c4be6e only contained 3f746a3 and 2c4be6e from the previous review run.
**How to apply:** check this first on every `synchronize` event, before running the full review. For pushes that rewrite history, see `review-after-force-push.md`.

Learned: 2026-11-27, re-review of PR #36 at 2c4be6e
