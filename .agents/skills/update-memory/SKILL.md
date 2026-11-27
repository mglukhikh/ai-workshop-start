---
name: update-memory
description: At the end of a task, add a note to memory/ with what the task learned
---

# Update memory

## When

At the end of every task, after the work is done and before handing off.

## Steps

1. Look in `memory/` for a note that already covers what you learned. If one does, update it
   (and fix or delete anything in it that turned out to be wrong) instead of adding a new one.
2. Otherwise add `memory/<short-kebab-case-topic>.md`.
3. If the task taught nothing that a future task would need, add nothing.

## What to write

Only what is not already recorded in the code, `spec/`, `AGENTS.md`, or git history, and that
a later task would otherwise have to rediscover, for example:

- a pitfall or a surprising behavior, and how to avoid it;
- a command, setup step, or workaround that turned out to be needed;
- a decision taken with the user, and why.

## Note format

```markdown
# <Topic>

<The fact, in a few sentences.>

**Why:** <how it was learned or why it matters>
**How to apply:** <what to do next time>

Learned: <YYYY-MM-DD>, <task or PR, if any>
```

Keep each note to one topic and short. Use absolute dates, never "today" or "last week".
Never write secrets or credentials.
