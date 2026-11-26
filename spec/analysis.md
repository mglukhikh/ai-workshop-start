# Repository analysis
## Input
A **GitHub repository or organization** URL, or a local directory
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

## Organization scan

- List every page of repositories visible to the scan credentials, including private repositories accessible with `GITHUB_TOKEN`.
- Scan each repository's default-branch commit by tree. If the recursive listing is truncated, scan only the root’s skills folders and warn. Skip empty repositories.
- Combine skills across repositories, retaining their repository IDs and pinned links. Prefix warnings with the repository ID.
- Report an error if the organization cannot be listed or a repository scan fails.
- A GitHub user account URL reports that user accounts are unsupported for organization scans.
- If GitHub reports fewer remaining requests than twice the number of unscanned repositories on a listing page, stop before scanning that page and explain how to retry.
- GitHub requests have a 15-second timeout that includes reading the response body. A timeout produces a GitHub connection error.
- Web organization scans have a 3-minute deadline. At that deadline, return skills and warnings from completed repositories with a partial-results warning.
