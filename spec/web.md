# Web view
`./skill-atlas serve [port]`: a local page, `http://127.0.0.1:<port>`; port **4173** by default, `0` any free one
- A field for the **repository link**: a GitHub URL, `…/tree/<commit | branch>`, or a directory, as in `scan`
- Its **skills**: name, description, path, sorted by **name**, as in `scan`
- After a successful scan that finds skills, filter the list by typing words. Every whitespace-separated word must match a case-insensitive substring of the name, description, path, or displayed repository ID. Clearing the filter restores the list. The first match is selected, and when there are no matches the detail pane shows a message. A new scan clears the filter. The filter stays hidden after an error or a scan with no skills.
- The selected skill's **SKILL.md**, as it is, front matter included; its *pinned link*; `also in` its copies
- Warnings appear under the field in a list that scrolls when it reaches 30% of the viewport height. The page displays the scan error message. The API returns scan errors with HTTP 400 for plain JSON or an `error` event with HTTP 200 for `progress=1`.
- The same scan as the CLI: `GET /api/scan?repo=<link>` → `{ repository, skills, warnings }`, each skill with `link` and `text`
- `?repo=<link>` in the page's address scans at once: a link to share
- **This machine only**: bound to `127.0.0.1`; another `Host` → 403
- *Nothing is stored*; the server runs until stopped, Ctrl+C

An organization URL works in the same field and API parameter. The response's
`repository.id` is the organization name, and each skill retains its own
repository ID and pinned link. Each skill row shows its repository ID before the path.

The page disables Scan while it waits. Organization scans show a progress bar, a
completed repository count (including empty repositories), and the current
repository below the bar. The bar is indeterminate until a total is available. For paginated listings, GitHub’s last-page link
provides an upper bound. The final short page supplies the exact total.
The page requests newline-delimited JSON with `progress=1` to receive progress
and then the result or error. At the 3-minute deadline it displays skills from
completed repositories and a warning. If the client disconnects, the server
cancels in-flight GitHub requests and stops issuing new ones.

- The browser view uses a grimoire-inspired parchment palette, serif typography, and double rules. The skill list sits alongside the document on wide screens, where both panes scroll independently. On narrow screens the scrollable skill list sits above the document.
