# Diffing a PR in a shallow automation checkout

Automation runs start in a shallow clone of the PR branch with no local `main`, so `git diff main...HEAD` fails ("unknown revision"), and even after `git fetch origin main` it fails with "no merge base". Run `git fetch --unshallow origin && git fetch origin main`, then `git diff origin/main...HEAD`. For only the latest push, diff the event's `before` SHA against HEAD.

**Why:** the PR #34 re-review hit both errors before the full diff was available.
**How to apply:** do this first when reviewing or changing a PR branch in Air Automations.

Learned: 2026-11-27, review of PR #34
