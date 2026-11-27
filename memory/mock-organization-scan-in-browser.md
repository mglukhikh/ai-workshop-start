# Mocking an organization scan in a browser test

To test organization-only UI without GitHub, route `/api/scan` in Playwright:
`page.route('**/api/scan?**', (r) => r.fulfill({ contentType: 'application/x-ndjson', body: JSON.stringify({ result }) + '\n' }))`,
then open `/?repo=https://github.com/<org>`. `result.repository.id` is the organization name. Set
`result.warnings` to `[]` for a scan with no warnings.
Each skill's `repository` is `<org>/<repo>`. Each skill needs `name`, `description`, `path`, `repository`,
`copies`, `text`, `headings` and `link`. `commit` is not needed. Without `result.warnings` or a skill’s `headings`, the page shows
"Cannot reach the Skill Atlas server: Cannot read properties of undefined (reading 'map')".

**Why:** The review of PR #36 needed organization-scan labels in the Skill map, and the layout fixture only covers a single repository.
**How to apply:** Use this for any organization-scan case in `spec/web.md` that the fixture can't cover. For diffing the PR in a shallow automation checkout, see `shallow-checkout-pr-diff.md`.

Learned: 2026-11-27, review of PR #36 (updated on re-review of 70994a5)
