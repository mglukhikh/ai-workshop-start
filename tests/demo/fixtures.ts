// The demo tests' fixtures: the real web server, GitHub answering from tests/demo/github.ts,
// and ./fixture copied to a fixed path, so the page shows the same paths and links everywhere.
import { cpSync, rmSync, writeFileSync } from 'node:fs';
import { relative } from 'node:path';
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
  linuxOnly: void;
  /** The answers GitHub gives; set with `test.use({ recording })`. */
  recording: Recording;
  /** The `GITHUB_TOKEN` the server scans with; `''` for none. */
  token: string;
  github: SimulatedGitHub;
  /** The server's address; `page` opens it as its base URL. */
  atlas: string;
  fixture: string;
};

/** A key moment of a test's video: a checked state, held still on screen. */
export type Moment = { name: string; seconds: number };
/** What tests/demo/frames.ts reads next to each test's video.webm: moments.json. */
export type Moments = { file: string; title: string; moments: Moment[] };

const recordings = new WeakMap<Page, { start: number; moments: Moment[] }>();

export const test = base.extend<Fixtures>({
  linuxOnly: [async ({}, use, testInfo) => {
    testInfo.skip(process.platform !== 'linux', 'Demo screenshots require Linux fontconfig.');
    await use();
  }, { auto: true }],
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
  // The video starts with the page: the key moments are timed from here, and written next to it.
  page: async ({ page }, use, testInfo) => {
    const recording = { start: performance.now(), moments: [] as Moment[] };
    recordings.set(page, recording);
    await use(page);
    const moments: Moments = {
      file: relative(testInfo.project.testDir, testInfo.file),
      title: testInfo.titlePath.slice(1).join(' › '),
      moments: recording.moments,
    };
    writeFileSync(testInfo.outputPath('moments.json'), JSON.stringify(moments, null, 2) + '\n');
  },
  fixture: async ({}, use) => {
    rmSync(FIXTURE, { recursive: true, force: true });
    cpSync(SOURCE, FIXTURE, { recursive: true, verbatimSymlinks: true });
    await use(FIXTURE);
  },
});

export { expect };

const pause = Number(process.env.DEMO_PAUSE ?? 700);

/**
 * A key moment: checks the page against its screenshot baseline, then holds still for
 * `DEMO_PAUSE` ms (700 by default) so the state stays on screen in the video. The middle of the
 * hold is recorded in moments.json, and tests/demo/frames.ts compares that frame of the video with
 * its baseline. Only the video waits: the checks never depend on time.
 */
export async function shot(page: Page, name: string) {
  // Soft: a changed page fails the test but the video goes on, so every key moment is recorded.
  await expect.soft(page).toHaveScreenshot(name);
  const recording = recordings.get(page);
  recording?.moments.push({ name, seconds: (performance.now() - recording.start + pause / 2) / 1000 });
  if (pause > 0) await page.waitForTimeout(pause);
}
