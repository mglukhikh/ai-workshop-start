# Repository analysis
## Input
A **GitHub repository** URL, or a local directory
## Output
Every *project skill* (below): **name**, **description**, **link**
## Architecture
Core: fetch → find → parse. CLI and web view: *thin clients*.
Skill: id = `repo:path`, name, description, commit, the SKILL.md text
## Details
- **GitHub API**, no clone; *under 5 s* for intellij-community
- The name: front matter, else the directory
- The link pins the *scanned commit*
- A commit or branch in the URL → its tree, even with `GITHUB_TOKEN`: code search sees only the default branch
- Unknown commit or branch → a clear message, exit code 1
- Malformed front matter → a *warning*, the scan goes on
- Unreachable repository → a clear message, exit code 1
## Project skill
`<project>/<skills folder>/<skill>/SKILL.md`, the file named exactly `SKILL.md`
- Skills folders, in this order: `.agents/skills`, `.claude/skills`, `.github/skills`, `agent/skills`
- `<project>`: the repository root or any directory in it, for nested projects
- Elsewhere → **not** a skill: test data, a skills folder's own `SKILL.md`, a skill's subdirectories; *one warning* lists them, the first five
- **Copies**: one `<project>/<skill>` in several skills folders is *one* skill, even if the files differ
  - The original is in the first folder of the list; the others are copies
  - Original not at the scanned commit → the next copy, with a warning
- One name in two projects → *two* skills
- Symbolic links are not followed: the target is the skill
- Listed through the tree, and the tree too large for one answer → only the root's skills folders, with a warning
