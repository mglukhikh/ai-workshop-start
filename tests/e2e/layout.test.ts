import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { chromium, expect } from '@playwright/test';
import { serve } from '../../src/web.ts';
import { openTarget } from '../../src/open.ts';

test('the skill list and document scroll independently on desktop and stack on mobile', async (t) => {
  const repo = mkdtempSync(join(tmpdir(), 'atlas-layout-'));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  for (let index = 1; index <= 60; index++) {
    const name = 'skill-' + String(index).padStart(2, '0');
    const directory = join(repo, '.agents', 'skills', name);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'SKILL.md'),
      `---\nname: ${name}\ndescription: Example skill\n---\n${'Document line\n'.repeat(60)}## Middle\n${'Document line\n'.repeat(120)}`);
  }
  execFileSync('git', ['init', '-q', repo]);
  execFileSync('git', ['-C', repo, 'add', '.']);
  execFileSync('git', ['-C', repo, '-c', 'user.name=Test', '-c', 'user.email=test@example.org', 'commit', '-qm', 'Fixture']);

  const server = await serve({ open: openTarget, port: 0 });
  t.after(() => server.close());
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1600, height: 800 } });
  await page.goto(`${server.url}/?repo=${encodeURIComponent(repo)}`);

  const atlas = page.locator('.atlas');
  assert.deepEqual(await atlas.boundingBox(), { x: 8, y: 8, width: 1584, height: 784 });
  const list = page.locator('#skills');
  const document = page.locator('#skill');
  const lastSkill = list.getByText('skill-60', { exact: true });
  const heading = document.getByRole('heading', { name: 'skill-60' });
  await lastSkill.click();
  await expect(heading).toBeInViewport();
  const filter = page.locator('#filter');
  await expect(filter).toBeVisible();
  assert.equal((await filter.boundingBox())!.height, (await page.locator('#repo').boundingBox())!.height);
  assert.equal(await page.evaluate(() => (globalThis as unknown as { scrollY: number }).scrollY), 0);
  const desktopList = (await list.boundingBox())!;
  const desktopDocument = (await document.boundingBox())!;
  assert.equal(desktopList.y, desktopDocument.y);
  assert.ok(desktopList.x + desktopList.width <= desktopDocument.x);
  const listScroll = await list.evaluate((pane: { scrollTop: number; scrollHeight: number }) => pane.scrollTop);
  assert.ok(listScroll > 0);
  assert.ok(await document.evaluate((pane: { scrollTop: number; scrollHeight: number }) => {
    pane.scrollTop = pane.scrollHeight;
    return pane.scrollTop > 0;
  }));
  assert.equal(await list.evaluate((pane: { scrollTop: number; scrollHeight: number }) => pane.scrollTop), listScroll);
  assert.equal(await page.evaluate(() => (globalThis as unknown as { scrollY: number }).scrollY), 0);

  const contentsTab = document.getByRole('tab', { name: /Contents/ });
  await expect(contentsTab).toBeInViewport({ ratio: 1 });
  await contentsTab.click();
  await document.getByRole('link', { name: 'Middle', exact: true }).click();
  const target = document.locator('#text .target');
  await expect(target).toBeFocused();
  const tabs = await document.getByRole('tablist').boundingBox();
  const line = await target.boundingBox();
  assert.ok(tabs && line && line.y >= tabs.y + tabs.height,
    'The heading must land below the tabs');

  await page.setViewportSize({ width: 3840, height: 800 });
  assert.equal((await atlas.boundingBox())!.width, 3824);
  const textPanel = document.locator('#text');
  const expectedWidth = await textPanel.evaluate((panel) => {
    const node = panel as unknown as {
      ownerDocument: { createElement(tag: string): {
        style: { cssText: string };
        getBoundingClientRect(): { width: number };
        remove(): void;
      } };
      append(child: unknown): void;
    };
    const probe = node.ownerDocument.createElement('span');
    probe.style.cssText = 'position: absolute; width: 110ch;';
    node.append(probe);
    const width = probe.getBoundingClientRect().width;
    probe.remove();
    return width;
  });
  const textFrame = (await textPanel.boundingBox())!;
  assert.equal(textFrame.width, expectedWidth);
  for (const selector of ['#skill-head', '[role="tablist"]', '#contents']) {
    if (selector === '#contents') await contentsTab.click();
    const frame = (await document.locator(selector).boundingBox())!;
    assert.equal(frame.x, textFrame.x);
    assert.equal(frame.width, textFrame.width);
  }

  await page.setViewportSize({ width: 1280, height: 400 });
  assert.ok((await list.boundingBox())!.height >= 200);
  assert.ok((await document.boundingBox())!.height >= 200);
  const middleSkill = list.getByText('skill-30', { exact: true });
  await middleSkill.click();
  const middleHeading = document.getByRole('heading', { name: 'skill-30' });
  await middleHeading.scrollIntoViewIfNeeded();
  assert.ok(await page.evaluate(() => (globalThis as unknown as { scrollY: number }).scrollY) > 0);
  await expect(middleHeading).toBeInViewport();

  await page.setViewportSize({ width: 400, height: 800 });
  const mobileAtlas = (await atlas.boundingBox())!;
  assert.equal(mobileAtlas.width, 384);
  assert.ok(mobileAtlas.height >= 784);
  const mobileList = (await list.boundingBox())!;
  const mobileDocument = (await document.boundingBox())!;
  assert.equal(mobileList.x, mobileDocument.x);
  assert.ok(mobileList.y + mobileList.height <= mobileDocument.y);
  assert.ok(await list.evaluate((pane: { scrollTop: number; scrollHeight: number }) => {
    pane.scrollTop = pane.scrollHeight;
    return pane.scrollTop > 0;
  }));
});

test('warnings can be hidden and restored, and reset on a new scan', async (t) => {
  const server = await serve({ open: openTarget, port: 0 });
  t.after(() => server.close());
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({
    viewport: { width: 800, height: 700 },
    recordVideo: process.env.ATLAS_DEMO_DIR ? { dir: process.env.ATLAS_DEMO_DIR } : undefined,
  });
  let warnings = ['Malformed front matter', 'Duplicate skill'];
  await page.route('**/api/scan?*', (route) => route.fulfill({
    contentType: 'application/x-ndjson',
    body: JSON.stringify({ result: { repository: { id: 'example' }, skills: [], warnings } }) + '\n',
  }));
  await page.goto(server.url);
  const toggle = page.locator('#toggle-warnings');
  const panel = page.locator('#warnings');
  await expect(toggle).toBeHidden();
  await page.locator('#repo').fill('./fixture');
  await page.locator('#scan').click();
  await expect(panel.locator('li')).toHaveCount(2);
  await expect(panel).toBeVisible();
  await expect(toggle).toHaveAccessibleName('Hide warnings');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');

  const pauseForDemo = async () => {
    if (process.env.ATLAS_DEMO_DIR) await page.waitForTimeout(1300);
  };
  await pauseForDemo();
  await toggle.click();
  await expect(panel).toBeHidden();
  assert.equal(await panel.boundingBox(), null);
  await expect(toggle).toHaveAccessibleName('Show warnings');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await pauseForDemo();
  await toggle.press('Enter');
  await expect(panel).toBeVisible();
  await expect(panel.locator('li')).toHaveText(warnings.map((warning) => 'warning: ' + warning));
  await pauseForDemo();

  await toggle.click();
  await page.locator('#scan').click();
  await expect(panel).toBeVisible();
  warnings = [];
  await page.locator('#scan').click();
  await expect(page.locator('#status')).toHaveText('example · 0 skills');
  await expect(toggle).toBeHidden();
  await expect(panel).toBeHidden();
  await page.close();
});

test('filter highlights use a gold background and inherit the description color', async (t) => {
  const server = await serve({ open: openTarget, port: 0 });
  t.after(() => server.close());
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.goto(`${server.url}/?repo=./fixture`);
  const filter = page.locator('#filter');
  await filter.fill('lint');
  const marks = page.locator('#skills .description mark');
  await expect(marks).toHaveCount(5);
  for (const mark of await marks.all()) {
    await expect(mark).toHaveCSS('background-color', 'rgb(233, 199, 122)');
    const description = mark.locator('..');
    const color = await description.evaluate((element) => {
      const browserWindow = globalThis as unknown as {
        getComputedStyle(node: typeof element): { color: string };
      };
      return browserWindow.getComputedStyle(element).color;
    });
    await expect(mark).toHaveCSS('color', color);
  }
});

test('skill map groups scanned skills and opens the selected copy', async (t) => {
  const server = await serve({ open: openTarget, port: 0 });
  t.after(() => server.close());
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    ...(process.env.SKILL_MAP_VIDEO_DIR && { recordVideo: { dir: process.env.SKILL_MAP_VIDEO_DIR } }),
  });
  const page = await context.newPage();
  try {
    await page.goto(`${server.url}/?repo=${encodeURIComponent('./fixture')}`);
    const map = page.locator('#skill-map');
    await map.locator('summary').click();
    await expect(map.getByRole('heading', { name: 'commits' })).toBeVisible();
    await expect(map.getByRole('button', { name: 'commits', exact: true })).toHaveCount(2);
    await expect(map.getByRole('heading', { name: 'Other skills' })).toBeVisible();
    assert.ok((await page.locator('main').boundingBox())!.height >= 200);
    if (process.env.SKILL_MAP_VIDEO_DIR) {
      await map.getByRole('heading', { name: 'commits' }).scrollIntoViewIfNeeded();
      await page.waitForTimeout(1500);
    }
    await page.locator('#filter').fill('lint');
    await map.getByRole('button', { name: 'commits', exact: true }).last().click();
    await expect(page.locator('#filter')).toHaveValue('');
    await expect(page.locator('#skills [aria-selected="true"]')).toContainText('tools/linter');
    if (process.env.SKILL_MAP_VIDEO_DIR) await page.waitForTimeout(1500);
    await page.route('**/api/skill-map', async (route) => {
      const names = route.request().postDataJSON() as string[];
      await route.fulfill({ json: [{ label: 'Development', members: names.map((_, index) => index) }] });
    });
    await map.getByLabel('Grouping').selectOption('claude');
    await expect(map.getByRole('heading', { name: 'Development' })).toBeVisible();
    if (process.env.SKILL_MAP_VIDEO_DIR) await page.waitForTimeout(1200);
    await page.unroute('**/api/skill-map');
    await page.route('**/api/skill-map', (route) => route.fulfill({
      status: 503, json: { error: 'Claude CLI is unavailable.' },
    }));
    await map.getByLabel('Grouping').selectOption('heuristic');
    await map.getByLabel('Grouping').selectOption('claude');
    await expect(map.getByRole('status')).toHaveText('Claude CLI is unavailable.');
    await map.getByLabel('Grouping').selectOption('heuristic');
    await expect(map.getByRole('heading', { name: 'commits' })).toBeVisible();

    await page.unroute('**/api/skill-map');
    await page.route('**/api/skill-map', () => {});
    for (const cancel of [
      () => map.getByLabel('Grouping').selectOption('heuristic'),
      () => map.locator('summary').click(),
      () => page.getByRole('button', { name: 'Scan', exact: true }).click(),
    ]) {
      if (!(await map.getByLabel('Grouping').isVisible())) await map.locator('summary').click();
      await map.getByLabel('Grouping').selectOption('heuristic');
      const started = page.waitForRequest('**/api/skill-map');
      await map.getByLabel('Grouping').selectOption('claude');
      const request = await started;
      const failed = page.waitForEvent('requestfailed', (failedRequest) => failedRequest === request);
      await cancel();
      await failed;
    }
  } finally {
    await context.close();
    if (process.env.SKILL_MAP_VIDEO_DIR) {
      await page.video()?.saveAs(join(process.env.SKILL_MAP_VIDEO_DIR, 'skill-map.webm'));
      await page.video()?.delete();
    }
  }
});
