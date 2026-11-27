# Empty repositories in organization scans

`openGitHubTarget(...).sources()` never yields empty repositories (409 on `commits/<branch>`), but
`onOrganizationProgress` still counts them as completed. Any counter kept in `scan()` over the
yielded sources (e.g. `completed` for partial results on GitHub errors) therefore differs from the
progress bar's count.

**Why:** found while reviewing PR #24. An org listing `[empty, failing]` shows "1 of 2" completed,
but the scan still throws the request error.
**How to apply:** when a rule depends on "completed repositories", decide whether empty ones count,
then make `spec/` and code agree. Test organization partial-result rules in `tests/scan.test.ts`
too, not only in the Linux-only Playwright demos.

Learned: 2026-11-27, review of PR #24
