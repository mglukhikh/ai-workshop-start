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
      `---\nname: ${name}\ndescription: Example skill\n---\n${'Document line\n'.repeat(120)}`);
  }
  execFileSync('git', ['init', '-q', repo]);
  execFileSync('git', ['-C', repo, 'add', '.']);
  execFileSync('git', ['-C', repo, '-c', 'user.name=Test', '-c', 'user.email=test@example.org', 'commit', '-qm', 'Fixture']);

  const server = await serve({ open: openTarget, port: 0 });
  t.after(() => server.close());
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`${server.url}/?repo=${encodeURIComponent(repo)}`);

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
