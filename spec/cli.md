# Command line
`./skill-atlas scan <GitHub URL | directory>`
- `github.com/<owner>/<repo>`: the default branch's latest commit
- `github.com/<owner>/<repo>/tree/<commit | branch>`: that commit, or the branch's latest
Prints the result **at once**; *nothing is stored*.
`GITHUB_TOKEN`, optional: a higher GitHub rate limit.
## Output
```
JetBrains/kotlin · 6 skills
build-tools-bump-gradle-api — Bumps the Gradle API…
  https://github.com/JetBrains/kotlin/blob/<commit>/…
```
- Sorted by **name**; the description's *first sentence*
- `also in <paths>` for copies; warnings go to *stderr*
