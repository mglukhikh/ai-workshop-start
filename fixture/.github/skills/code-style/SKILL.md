---
name: code-style
description: Follow the project's code style. Use before committing Kotlin or Java changes.
---

# Code style

- Four spaces, no tabs; lines up to 120 characters.
- Prefer `val` over `var`.

## Kotlin

### Imports

No wildcard imports.

```sh
# Not a title: a comment in a code block
./gradlew ktlintCheck
```

#### Too deep for the contents

## Java ##

Same rules as Kotlin.
