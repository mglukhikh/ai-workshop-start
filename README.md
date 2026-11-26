# Skill Atlas

Every agent skill in a repository: `./skill-atlas scan` finds each `SKILL.md` and prints its name,
description and link.

```console
$ npm ci
$ ./skill-atlas scan https://github.com/JetBrains/kotlin
JetBrains/kotlin · 6 skills
…
build-tools-bump-gradle-api — Bumps the Gradle API version that Kotlin Gradle plugins are compiled against in the Kotlin compiler repository.
  https://github.com/JetBrains/kotlin/blob/5ab6270ab772d113e8ad52ebfcaa0109c522ae00/.claude/skills/build-tools-bump-gradle-api/SKILL.md
…
```

`./skill-atlas scan https://github.com/JetBrains/kotlin/tree/<commit>` scans that commit.
`./skill-atlas serve` opens a local web view at http://127.0.0.1:4173: a field for the repository
link, its skills and their SKILL.md.
Set `GITHUB_TOKEN` for a higher GitHub rate limit.

After `npm ci`, install Chromium with `npx playwright install --with-deps chromium`.
Then run `npm test`, which includes the browser layout test.
`npm run test:e2e` runs the browser layout test and the end-to-end tests on real GitHub repositories at fixed commits.

`npm run test:demo` runs the demos in [docs/demo](docs/demo/) as deterministic Playwright tests on Linux
([tests/demo](tests/demo/)). They are skipped on other platforms and use fixed data: `./fixture`, copied to
`/tmp/skill-atlas-demo/fixture`, and recorded GitHub answers. They also use the same viewport
(1280×800, or 1000×640 for the rate-limit demo) and the same fonts, which are vendored in
`tests/demo/fonts` with a fontconfig that hides the system fonts. They check the page against
screenshot baselines in `tests/demo/screenshots` and record a video of every test in
`test-results/`. CI uploads the videos as the `demo-videos` artifact on every run. After an
intended visual change, update the baselines on Linux with `npx playwright test -u`. `DEMO_PAUSE=<ms>`
(700 by default) holds each checked state on screen in the video. `SLOW_MO=<ms>` (150 by default)
sets the pause between actions.

Run only one demo suite per machine at a time, even across checkouts. Each run
recreates the fixture at the same absolute path so screenshots show stable paths.

- [spec/](spec/): what it does. [AGENTS.md](AGENTS.md): the definition of done.
- [fixture/](fixture/README.md): a small repository for the tests.
- [qa/](qa/README.md): scripts for manual testing of the web view in a real browser.
