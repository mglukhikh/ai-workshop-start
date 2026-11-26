// The demo tests (tests/demo): the demos in docs/demo as deterministic Playwright tests.
// Same data (./fixture and recorded GitHub answers), same viewport, same fonts (tests/demo/fonts),
// and a video of every test in test-results/, which CI uploads on every run.
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const fonts = fileURLToPath(new URL('./tests/demo/fonts/fonts.conf', import.meta.url));
const viewport = { width: 1280, height: 800 };

export default defineConfig({
  testDir: 'tests/demo',
  testMatch: '*.spec.ts',
  outputDir: 'test-results',
  // The demos share the fixture's fixed path; one at a time also keeps the videos smooth.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 60_000,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  // One Linux baseline with pinned fonts and browser build.
  snapshotPathTemplate: '{testDir}/screenshots/{testFileName}/{arg}{ext}',
  expect: {
    toHaveScreenshot: { animations: 'disabled', caret: 'hide', scale: 'css', maxDiffPixels: 0 },
  },
  use: {
    browserName: 'chromium',
    viewport,
    deviceScaleFactor: 1,
    locale: 'en-US',
    timezoneId: 'UTC',
    colorScheme: 'light',
    video: { mode: 'on', size: viewport },
    trace: 'retain-on-failure',
    launchOptions: {
      // Only the vendored fonts, rendered without hinting or subpixel colour.
      env: { ...process.env, FONTCONFIG_FILE: fonts },
      // A pause between actions, so a person can follow the video.
      slowMo: Number(process.env.SLOW_MO ?? 150),
      args: ['--font-render-hinting=none', '--disable-lcd-text', '--force-color-profile=srgb', '--disable-gpu'],
    },
  },
});
