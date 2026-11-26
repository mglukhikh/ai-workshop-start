# qa: manual testing of the web view

Scripts that start the real `./skill-atlas serve` on a free port, open the page in Chromium
(Playwright), fill fields, press buttons and check how the page reacts. They are for manual and
exploratory testing. The automated tests are `npm test` in the repository root.

They use the root project's Playwright, so run them from the repository root:

```console
$ npm ci
$ npx playwright install --with-deps chromium     # once; or set CHROME_PATH, below
$ npm run qa:scenarios
```

## Scripts

| Command | What it does |
| --- | --- |
| `node qa/browse.ts [link]`, `npm run qa:browse` | Opens the page in a **visible** browser for exploring by hand, scanning `link` at once if given. Press Enter to close it. |
| `node qa/steps.ts <step>…` | Runs the steps you list (fill, click, check) and prints `PASS` / `FAIL` for each check. |
| `node qa/scenarios.ts [name…]`, `npm run qa:scenarios` | Ready-made scenarios from [spec/web.md](../spec/web.md), run on `./fixture`, so no network is needed. Saves one screenshot per scenario in `qa/out/`. |

Each command exits with 1 if a check fails.

### Steps

```console
$ node qa/steps.ts fill '#repo' ./fixture click '#scan' expect '#status' '5 skills' \
    fill '#filter' lint count '#skills li' 2 report shot filter.png
  open /
  fill #repo = "./fixture"
  click #scan
  PASS #status contains "5 skills"
  fill #filter = "lint"
  PASS #skills li × 2
  ── status: fixture · 5 skills
  ...
```

| Step | |
| --- | --- |
| `open [path]` | Opens a page path. The default is `/`, and it runs first if you omit it. Example: `open '/?repo=./fixture'` |
| `fill <selector> <text>` | Replaces the field's value with `text` |
| `click <selector>` | Clicks a button or any other element |
| `press <selector> <key>` | Presses a key in an element, e.g. `press '#repo' Enter` |
| `expect <selector> <text>` | Waits until the element's text contains `text` |
| `value <selector> <text>` | Waits until the field's value is exactly `text` |
| `count <selector> <n>` | Waits until exactly `n` elements match |
| `visible` / `hidden` / `enabled <selector>` | Waits until the element is in that state |
| `report` | Prints the status, the warnings, the skills and the selected skill |
| `shot <file.png>` | Saves a screenshot in `qa/out/` |
| `wait <ms>`, `pause` | Sleeps for `ms`, or waits for Enter so you can look at a headed browser |

Selectors are [Playwright selectors](https://playwright.dev/docs/locators), such as `#repo` or
`role=button[name="Scan"]`. The page's elements are `#repo`, `#scan`, `#status` (`.error` on
errors), `#warnings li`, `#filter`, `#skills li`, `#skill` (`h2`, `a`, `pre`), `#scan-progress`
and `#current-repository`. Relative directories are resolved from the repository root, where the
server runs. A GitHub URL works too, but it uses the network. Set `GITHUB_TOKEN` to get a higher rate limit.

### Scenarios

`initial-page`, `scan-fixture`, `select-skill`, `press-enter`, `shared-link`, `filter`,
`missing-directory`, `empty-field`. To add one, add a function to `SCENARIOS` in `qa/scenarios.ts`.

## Environment

| Variable | |
| --- | --- |
| `HEADED=1` | Shows the browser. `browse.ts` shows it by default; `HEADED=0` hides it. |
| `SLOW_MO=<ms>` | Adds a pause between actions so you can follow them |
| `QA_TIMEOUT=<ms>` | Sets how long a check or action waits. The default is 15000. |
| `CHROME_PATH=<binary>` | Uses this Chromium or Chrome instead of Playwright's download. This is for machines where `cdn.playwright.dev` is blocked. You can get a Chrome for Testing build from `storage.googleapis.com/chrome-for-testing-public/`. |

A headed browser needs a display. On a machine without one, run `xvfb-run node qa/browse.ts` or use
the headless default.
