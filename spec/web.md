# Web view
`./skill-atlas serve [port]`: a local page, `http://127.0.0.1:<port>`; port **4173** by default, `0` any free one
- A field for the **repository link**: a GitHub URL, `…/tree/<commit | branch>`, or a directory, as in `scan`
- Its **skills**: name, description, path, sorted by **name**, as in `scan`
- The selected skill's **SKILL.md**, as it is, front matter included, with line numbers; its *pinned link*; `also in` its copies
- A **Contents** tab: the SKILL.md's `#`, `##` and `###` titles, indented by level; a title → its line in SKILL.md
  - Not a title: in the front matter, in a fenced code block, `####` and deeper, `#text` without a space
- A filter for the skills: by name, description or path
- Warnings under the field; an error → its *clear message*, status 400
- The same scan as the CLI: `GET /api/scan?repo=<link>` → `{ repository, skills, warnings }`, each skill with `link`, `text` and `headings`: `{ level, title, line }`
- `?repo=<link>` in the page's address scans at once: a link to share
- **This machine only**: bound to `127.0.0.1`; another `Host` → 403
- *Nothing is stored*; the server runs until stopped, Ctrl+C
