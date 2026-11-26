# Web view
`./skill-atlas serve [port]`: a local page, `http://127.0.0.1:<port>`; port **4173** by default, `0` any free one
- A field for the **repository link**: a GitHub URL, `…/tree/<commit | branch>`, or a directory, as in `scan`
- Its **skills**: name, description, path, sorted by **name**, as in `scan`
- After a successful scan that finds skills, filter the list by typing words. Every whitespace-separated word must match a case-insensitive substring of the name, description, path, or displayed repository ID. Clearing the filter restores the list. The first match is selected, and when there are no matches the detail pane shows a message. A new scan clears the filter. The filter stays hidden after an error or a scan with no skills.
- The selected skill's **SKILL.md**, as it is, front matter included; its *pinned link*; `also in` its copies
- Warnings under the field; an error → its *clear message*, status 400
- The same scan as the CLI: `GET /api/scan?repo=<link>` → `{ repository, skills, warnings }`, each skill with `link` and `text`
- `?repo=<link>` in the page's address scans at once: a link to share
- **This machine only**: bound to `127.0.0.1`; another `Host` → 403
- *Nothing is stored*; the server runs until stopped, Ctrl+C

An organization URL works in the same field and API parameter. The response's
`repository.id` is the organization name, and each skill retains its own
repository ID and pinned link. Each skill row shows its repository ID before the path.

The page shows that a scan is pending and disables Scan while it waits. After
one minute without a complete response, the page shows a timeout and enables Scan.
