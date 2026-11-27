# Checking CSS layout fallbacks in Chromium

The layout tests run only in Chromium. To see how the page behaves in a browser that lacks a CSS feature, delete the rules that use it in Playwright, then measure: walk `document.styleSheets` (including `@media` rules) and `deleteRule` every rule whose `selectorText` contains the feature, e.g. `:has(`. Run one layout test with `node --test --test-name-pattern="<name>" tests/e2e/layout.test.ts`. To show that a test catches a bug, run it against the old file, e.g. `git show origin/main:src/web.html > src/web.html`, then restore the file. Put any temporary script inside `tests/` so that `@playwright/test` and `../src/*.ts` imports resolve.

**Why:** in the PR #34 review this showed that the skill map, without `:has()`, loses its scrolling groups and the 200 px for `main` (~78 px at 800 × 600).
**How to apply:** use it when reviewing or writing fallbacks for newer CSS features (`:has()`, `::details-content`, `lh` units).

Learned: 2026-11-27, review of PR #34
