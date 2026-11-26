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
and then the result or error. At the 5-minute deadline or when GitHub rate-limits the scan, it displays skills from
completed repositories and a warning. If the client disconnects, the server
cancels in-flight GitHub requests and stops issuing new ones.

- The browser view uses a grimoire-inspired parchment palette, serif typography, and double rules. The skill list sits alongside the document on wide screens, where both panes scroll independently. On short wide screens, the layout keeps a minimum height of 700 px and the page can scroll to reach the panes. On narrow screens the scrollable skill list sits above the document.

## Demo screenshots

The demo tests check Linux Chromium against pixel-exact baselines using vendored
fonts configured through fontconfig. On other platforms the demo tests are skipped,
including when running the suite in screenshot update mode.

Each checked state is a *key moment* of the test's recorded video, held on screen for a moment.
After the demo tests, `npm run test:frames` takes the frame at each key moment from the video and
compares it with its baseline in `tests/demo/frames`:
- An *important difference* is a region where many neighbouring pixels changed, such as a changed text, a moved panel or a missing button. Sparse changes like compression noise are ignored.
- Important differences, a missing baseline or frame, a different frame size, and a baseline without a key moment fail the comparison.
- For each failing moment, an image shows the baseline, the frame, and the frame faded with the changed pixels in red and each important difference in a numbered red box. A report lists every moment with its regions. CI writes the report to the job summary.
- Baselines are made in the cloud on the CI Linux runner, by the *Demo baselines* workflow: the `update-baselines` label on a pull request, or a manual run. An update replaces only screenshots that changed and frames with an important difference or no baseline.
