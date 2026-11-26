---
name: code-review
description: Review code changes which is a short summary plus inline comments, each saying where and how to reproduce
---

# Code review

## Output

1. **Short review**: a few sentences on the overall verdict and the most important problems.
2. **Inline comments**: one per finding, attached to the exact place in the code.

## Each inline comment includes

- **Where**: `path/to/file:line` (or a line range).
- **What**: the problem, in one or two sentences.
- **How to reproduce**: concrete steps, input, or a command that shows the problem,
  and the expected vs. actual result.
