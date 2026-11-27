# Web view
`./skill-atlas serve [port]`: a local page, `http://127.0.0.1:<port>`; port **4173** by default, `0` any free one
- A field for the **repository link**: a GitHub URL, `…/tree/<commit | branch>`, or a directory, as in `scan`
- Its **skills**: name, description, path, sorted by **name**, as in `scan`
- A skill with copies shows a “+N copies” badge (“+1 copy” for one) next to its name
- After a successful scan that finds skills, filter the list by typing words. Every whitespace-separated word must match a case-insensitive substring of the name, description, path, or displayed repository ID. Every occurrence of a filter word in skill descriptions in the list and the detail pane is highlighted with its original casing and text color on a gold background. Overlapping matches share one highlight. Clearing the filter restores the list and removes the highlights. The first match is selected, and when there are no matches the list shows “No skill matches.” and the detail pane shows “No matching skills.”. A new scan clears the filter. The filter stays hidden after an error or a scan with no skills. The filter stays the same single-line height as the repository field so the skill panes can use the remaining vertical space on wide screens.
- While scanning, the list shows “Scanning…”. After an error, a stopped scan without results, or a scan with no skills, it shows “No skills.” In these states, the detail pane shows “No skill selected.”
- The selected skill's **SKILL.md**, as it is, front matter included, with line numbers; its *pinned link*; `also in` its copies
- A **Contents** tab: the SKILL.md's `#`, `##` and `###` titles, indented by level; a title → its line in SKILL.md. Both tabs stay visible while the desktop document pane scrolls, including after jumping to a title.
  - Not a title: in the front matter, in a fenced code block, `####` and deeper, `#text` without a space
- Selecting a skill or switching tabs keeps focus on the activated control. Opening a title focuses its line.
- Warnings appear under the field in a list that scrolls when it reaches 30% of the viewport height. The page displays the scan error message. The API returns scan errors with HTTP 400 for plain JSON or an `error` event with HTTP 200 for `progress=1`.
- Each scan with warnings starts with the list expanded. **Hide warnings** collapses the list and frees its space. **Show warnings** restores it. The button is hidden while scanning or when there are no warnings.
- The same scan as the CLI: `GET /api/scan?repo=<link>` → `{ repository, skills, warnings }`, each skill with `link`, `text` and `headings`: `{ level, title, line }`
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
and then a result, error, or stopped event. It displays skills from completed repositories and a warning when the scan reaches
the 5-minute deadline, hits a GitHub rate limit, or encounters another GitHub
request error after completing at least one repository. If the client disconnects, the server
cancels in-flight GitHub requests and stops issuing new ones.

- The browser view uses a grimoire-inspired parchment palette, serif typography, and double rules. The atlas uses the available viewport width with an 8 px outer margin on each side and fills the viewport height inside those margins when space permits. On wide displays, the skill header, tab strip, and both tab panels share a frame capped at 110 SKILL.md monospace character widths. The cap includes the text panel’s borders, line-number gutter, and padding. The skill list sits alongside the document on wide screens, where both panes scroll independently. On short wide screens, the layout keeps a minimum height of 700 px and the page can scroll to reach the panes. On narrow screens the scrollable skill list sits above the document.

While a scan is active, **Stop Scanning** cancels in-flight GitHub requests.
For an organization, the page displays skills and warnings from completed
repositories. The progress indicators clear and Scan becomes available again.

The page supplies a unique `id` with each `GET /api/scan?repo=<link>&progress=1`
request. The ID is optional for streaming API clients. Reusing an active ID
returns HTTP 409. `POST /api/stop?id=<id>` cancels the matching active scan and
returns HTTP 204, including when the ID is unknown or omitted.

A stopped single-repository scan ends the stream with `{"stopped":true}`.
The page shows **Scan stopped.** and displays no results. A stopped organization
scan ends with a result event containing the partial results and warnings.

## Demo screenshots
The fixture demo opens Contents, checks its count, and follows Java to line 24.

The demo tests check Linux Chromium against pixel-exact baselines using vendored
fonts configured through fontconfig. On other platforms the demo tests are skipped,
including when running the suite in screenshot update mode. Demo specs inherit
this guard by importing `test` from the shared demo fixture.

Each checked state is a *key moment* of the test's recorded video, held on screen for a moment.
After the demo tests, `npm run test:frames` takes the frame at each key moment from the video and
compares it with its baseline in `tests/demo/frames`:
- An *important difference* is a region where many neighbouring pixels changed, such as a changed text, a moved panel or a missing button. Sparse changes like compression noise are ignored.
- Like the demo tests, the comparison is skipped on other platforms than Linux.
- Important differences, a missing baseline or frame, a different frame size, and a baseline without a key moment fail the comparison.
- For each failing moment, an image shows the baseline, the frame, and the frame faded with the changed pixels in red and each important difference in a numbered red box. A report lists every moment with its regions. CI writes the report to the job summary.
- Baselines are made in the cloud on the CI Linux runner, by the *Demo baselines* workflow: the `update-baselines` label on a pull request, a manual run, or a pushed commit whose message contains `[update-baselines]`. An update replaces only screenshots that changed and frames with an important difference or no baseline. It preserves baselines for moments absent from the run.

## Skill map

A scan with skills offers a collapsed **Skill map**. Open it to group the scanned skills by the most frequent shared word in their names, breaking ties alphabetically. Names without shared words appear under **Other skills**. Selecting a skill from a group clears the filter and opens that skill. Each group shows its name beside its members, which wrap across rows. When space is limited, only the groups scroll: the summary and Grouping selector stay in view, and at least one full row of members stays visible. On wide screens, opening the map leaves at least 200 px for the skill panes.

Choose **Claude Haiku** to group the same skills by purpose using the locally installed, authenticated `claude -p` CLI. This sends skill names to Claude and requires a valid response that assigns every skill exactly once. Missing CLI, timeout, and invalid output show an error in the map. Select **Shared words** to use the local heuristic again. Closing the map, switching modes, or starting a scan cancels an active Claude request.
