// Shared helpers for the manual-testing scripts: start the real `skill-atlas serve`, open a
// browser on it, fill fields, press buttons and check what the page shows.
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from '@playwright/test';

export const QA = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(QA, '..');
export const FIXTURE = join(ROOT, 'fixture');
export const OUT = join(QA, 'out');

export type Server = { url: string; stop(): void };

/** Starts `./skill-atlas serve <port>` (any free port by default) and waits for its address. */
export async function startServer(port = 0): Promise<Server> {
  const child: ChildProcess = spawn(join(ROOT, 'skill-atlas'), ['serve', String(port)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const url = await new Promise<string>((resolve, reject) => {
    let output = '';
    child.stdout!.setEncoding('utf8');
    child.stdout!.on('data', (chunk: string) => {
      output += chunk;
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) resolve(match[0]);
    });
    child.once('exit', (code) => reject(new Error(`skill-atlas serve exited with ${code}: ${output}`)));
  });
  const stop = () => { if (child.exitCode === null) child.kill('SIGINT'); };
  process.once('exit', stop);
  return { url, stop };
}

export type BrowserOptions = {
  /** Show the browser window; `HEADED=1` by default. */
  headed?: boolean;
  /** Milliseconds between actions, so a person can follow; `SLOW_MO`. */
  slowMo?: number;
};

/**
 * Launches Chromium. `CHROME_PATH` points at a browser binary when Playwright's own
 * download (`npx playwright install chromium`) is not available.
 */
export async function launch(options: BrowserOptions = {}): Promise<Browser> {
  const headed = options.headed ?? process.env.HEADED === '1';
  return chromium.launch({
    headless: !headed,
    handleSIGINT: Boolean(process.stdin.isTTY),
    slowMo: options.slowMo ?? Number(process.env.SLOW_MO ?? 0),
    executablePath: process.env.CHROME_PATH || undefined,
  });
}

const configuredTimeout = Number(process.env.QA_TIMEOUT);
const TIMEOUT = Number.isFinite(configuredTimeout) && configuredTimeout > 0
  ? configuredTimeout
  : 15_000;

/** The actions and checks a manual tester needs, logged as they run. Selectors are Playwright's. */
export class Tester {
  failures = 0;
  readonly page: Page;
  readonly baseUrl: string;
  constructor(page: Page, baseUrl: string) { this.page = page; this.baseUrl = baseUrl; }

  log(text: string) { console.log(`  ${text}`); }

  /** Opens a page path, such as `/` or `/?repo=./fixture`. */
  async open(path = '/') {
    this.log(`open ${path}`);
    await this.page.goto(new URL(path, this.baseUrl).href);
  }

  async fill(selector: string, text: string) {
    this.log(`fill ${selector} = ${JSON.stringify(text)}`);
    await this.page.fill(selector, text, { timeout: TIMEOUT });
  }

  async click(selector: string) {
    this.log(`click ${selector}`);
    await this.page.click(selector, { timeout: TIMEOUT });
  }

  async press(selector: string, key: string) {
    this.log(`press ${key} in ${selector}`);
    await this.page.press(selector, key, { timeout: TIMEOUT });
  }

  /** Waits until the element's text contains `expected`. */
  async expectText(selector: string, expected: string) {
    await this.check(`${selector} contains ${JSON.stringify(expected)}`, async () => {
      const text = await this.page.locator(selector).first().textContent({ timeout: TIMEOUT });
      return text?.includes(expected) ? true : `found ${JSON.stringify(text)}`;
    });
  }

  /** Waits until the field's value is exactly `expected`. */
  async expectValue(selector: string, expected: string) {
    await this.check(`${selector} has value ${JSON.stringify(expected)}`, async () => {
      const value = await this.page.locator(selector).first().inputValue({ timeout: TIMEOUT });
      return value === expected ? true : `found ${JSON.stringify(value)}`;
    });
  }

  /** Waits until exactly `count` elements match. */
  async expectCount(selector: string, count: number) {
    await this.check(`${selector} × ${count}`, async () => {
      const actual = await this.page.locator(selector).count();
      return actual === count ? true : `found ${actual}`;
    });
  }

  async expectVisible(selector: string) {
    await this.check(`${selector} is visible`, async () => (await this.page.locator(selector).first().isVisible()) || 'hidden');
  }

  async expectHidden(selector: string) {
    await this.check(`${selector} is hidden`, async () => (await this.page.locator(selector).first().isHidden()) || 'visible');
  }

  async expectEnabled(selector: string) {
    await this.check(`${selector} is enabled`, async () => (await this.page.locator(selector).first().isEnabled()) || 'disabled');
  }

  /** Prints what the page shows now: status, warnings, skills and the selected skill. */
  async report() {
    const texts = (selector: string) => this.page.locator(selector).allInnerTexts();
    console.log(`  ── status: ${(await texts('#status')).join('')}`);
    for (const warning of await texts('#warnings li')) console.log(`  ── ${warning}`);
    for (const skill of await texts('#skills li')) console.log(`  ── skill: ${skill.replace(/\n+/g, ' | ')}`);
    const selected = await texts('#skill h2');
    if (selected.length) console.log(`  ── selected: ${selected[0]}`);
  }

  /** Saves a full-page screenshot under qa/out unless the path is absolute. */
  async screenshot(file: string) {
    const path = resolve(OUT, file);
    mkdirSync(dirname(path), { recursive: true });
    await this.page.screenshot({ path, fullPage: true });
    this.log(`screenshot ${path}`);
  }

  /** Polls `condition` until it returns true or the timeout passes; logs PASS or FAIL. */
  private async check(label: string, condition: () => Promise<true | string>) {
    const deadline = Date.now() + TIMEOUT;
    let last: true | string = 'not checked';
    while (Date.now() < deadline) {
      try { last = await condition(); } catch (error) { last = error instanceof Error ? error.message.split('\n')[0] : String(error); }
      if (last === true) return void console.log(`  PASS ${label}`);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    this.failures++;
    console.log(`  FAIL ${label}: ${last}`);
  }
}

/** Starts the server and a browser, runs `body`, and cleans up; the exit code is 1 on any failure. */
export async function session(body: (tester: Tester) => Promise<void>, options: BrowserOptions & { keepOpen?: boolean } = {}) {
  const server = await startServer();
  const browser = await launch(options);
  const page = await browser.newPage();
  const tester = new Tester(page, server.url);
  try {
    await body(tester);
    if (options.keepOpen) await waitForEnter(`Browser is open at ${server.url}. Press Enter to close.`);
  } finally {
    await browser.close();
    server.stop();
  }
  return tester.failures;
}

export async function waitForEnter(prompt: string) {
  console.log(prompt);
  if (!process.stdin.isTTY) return new Promise<void>((resolve) => process.once('SIGINT', () => resolve()));
  process.stdin.resume();
  await new Promise((resolve) => process.stdin.once('data', resolve));
  process.stdin.pause();
}
