# Checking that a test catches a regression

Run the targeted test with the fix temporarily reverted and confirm it fails for the expected reason. Restore the fix and confirm the same test passes.

**Why:** The layout assertion in PR #33 caught panel overflow when the warnings flex-shrink rule was removed.
**How to apply:** Use a clean working tree and run `node --test --test-name-pattern="<name>" <file>` before and after restoring the fix.

Learned: 2026-11-27, PR #33
