// Opens the web view in a visible browser for exploratory testing.
//   node qa/browse.ts [repository link]
// Starts `skill-atlas serve` on a free port; with a link, opens `/?repo=<link>` so it scans at once.
// Press Enter (or Ctrl+C) to close the browser and stop the server.
import { session } from './lib.ts';

const repo = process.argv[2];
const failures = await session(async (tester) => {
  await tester.open(repo ? `/?repo=${encodeURIComponent(repo)}` : '/');
  if (repo) {
    await tester.expectEnabled('#scan');
    await tester.report();
  }
}, { headed: process.env.HEADED !== '0', keepOpen: true });
process.exitCode = failures ? 1 : 0;
