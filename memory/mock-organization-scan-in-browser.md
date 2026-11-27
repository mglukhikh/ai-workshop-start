# Mocking an organization scan in a browser test

To test organization-only UI without GitHub, route `/api/scan` in Playwright:
`page.route('**/api/scan**', (r) => r.fulfill({ contentType: 'application/x-ndjson', body: JSON.stringify({ result }) + '\n' }))`,
then open `/?repo=https://github.com/<org>`. `result.repository.id` is the organization name,
and each skill's `repository` is `<org>/<repo>`. Each skill needs `name`, `description`, `path`, `repository`,
`commit`, `copies`, `text`, `headings` and `link`. Without `headings`, the page shows
"Cannot reach the Skill Atlas server: Cannot read properties of undefined (reading 'map')".

**Why:** The review of PR #36 needed organization-scan labels in the Skill map, and the layout fixture only covers a single repository.
**How to apply:** Use this for any organization-scan case in `spec/web.md` that the fixture can't cover. Also, the automation checkout is shallow and has no `main`, so `git diff main...HEAD` fails. Use `gh pr diff <n>` instead.

Learned: 2026-11-27, review of PR #36
