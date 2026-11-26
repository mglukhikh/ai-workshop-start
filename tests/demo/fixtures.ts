// The demo tests' fixtures: the real web server, GitHub answering from tests/demo/github.ts,
// and ./fixture copied to a fixed path, so the page shows the same paths and links everywhere.
import { cpSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test as base, expect, type Page } from '@playwright/test';
import type { Recording } from '../../src/core/replay.ts';
import { openTarget } from '../../src/open.ts';
import { serve } from '../../src/web.ts';
import { SimulatedGitHub } from './github.ts';

/** Where the demos scan ./fixture: a path that does not depend on the checkout's location. */
export const FIXTURE = '/tmp/skill-atlas-demo/fixture';
const SOURCE = fileURLToPath(new URL('../../fixture', import.meta.url));

type Fixtures = {
  /** The answers GitHub gives; set with `test.use({ recording })`. */
  recording: Recording;
  /** The `GITHUB_TOKEN` the server scans with; `''` for none. */
  token: string;
  github: SimulatedGitHub;
  /** The server's address; `page` opens it as its base URL. */
  atlas: string;
  fixture: string;
};

export const test = base.extend<Fixtures>({
  recording: [{}, { option: true }],
  token: ['test', { option: true }],
  github: async ({ recording }, use) => use(new SimulatedGitHub(recording)),
  atlas: async ({ github, token }, use) => {
    const server = await serve({
      open: (input, options) => openTarget(input, { ...options, fetch: github.fetch, token: token || undefined }),
      port: 0,
    });
    await use(server.url);
    await server.close();
  },
  baseURL: async ({ atlas }, use) => use(atlas),
  fixture: async ({}, use) => {
    rmSync(FIXTURE, { recursive: true, force: true });
    cpSync(SOURCE, FIXTURE, { recursive: true, verbatimSymlinks: true });
    await use(FIXTURE);
  },
});

export { expect };

const pause = Number(process.env.DEMO_PAUSE ?? 700);

/**
 * Checks the page against its screenshot baseline, then holds still for `DEMO_PAUSE` ms
 * (700 by default, 0 to skip) so the state stays on screen in the video. Only the video waits:
 * the checks never depend on time.
 */
export async function shot(page: Page, name: string) {
  await expect(page).toHaveScreenshot(name);
  if (pause > 0) await page.waitForTimeout(pause);
}
