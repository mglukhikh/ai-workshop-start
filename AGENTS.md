# AGENTS.md
## Specs
Read [./spec](spec/) first. Update it with the code.
## Tests
Integration tests for every case in the spec.
## Definition of done
- All tests pass locally
- Verify the demo video in the PR description when applicable.

## Demo video for pull requests

For changes with visible or interactive behavior, record a short demo and attach it directly to the pull request description under `## Demo video`, or add a link that opens the video file itself. Before handing off, open the PR and verify that a reviewer can play or download the video from that section. If you can only link to an automation run, include the exact artifact filename and say where to find it in the run.

## Commands
- `npm ci`: first, in a fresh checkout
- `npx playwright install --with-deps chromium`: install the browser for layout tests after installing dependencies
- `npm test`: all tests, including Chromium layout tests
- `npm run test:demo`: the Linux-only demo tests (tests/demo), with a video of each in `test-results/`; their screenshot baselines are made in the cloud like the frames below
- `npm run test:frames`: after the demo tests, compare the videos' key moments with `tests/demo/frames`. Make new baselines in the cloud (label `update-baselines`, *Demo baselines* workflow), never locally
