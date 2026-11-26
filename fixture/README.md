# fixture

A small repository for the tests.

| Path | Case |
| --- | --- |
| `.claude/skills/commits` | a skill |
| `.github/skills/commits` | its copy for another agent, with different contents |
| `.github/skills/code-style` | a skill in another agent's folder |
| `.agents/skills/code-style` | a symbolic link to it: not followed |
| `.agents/skills/release-checklist` | malformed front matter |
| `tools/linter/.claude/skills/lint` | a skill of a nested project |
| `tools/linter/.agents/skills/commits` | a skill with the same name in another project |
| `.claude/skills/SKILL.md` | the skills folder's own `SKILL.md`: not a skill |
| `.claude/skills/commits/examples/SKILL.md` | in a skill's subdirectory: not a skill |
| `testData/skills/sample` | outside a skills folder: not a skill |
| `.claude/skills/notes/skill.md` | not named exactly `SKILL.md`: not a skill |
