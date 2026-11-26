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

- [spec/](spec/): what it does. [AGENTS.md](AGENTS.md): the definition of done.
- [fixture/](fixture/README.md): a small repository for the tests.
