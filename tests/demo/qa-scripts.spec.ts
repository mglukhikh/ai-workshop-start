// The demo docs/demo/qa-scripts.mp4 as a test: the web view on ./fixture (spec/web.md), offline.
// Scan, select a skill, filter, and an error, as qa/scenarios.ts does by hand.
import { expect, shot, test } from './fixtures.ts';

test.skip(process.platform !== 'linux', 'Demo screenshots require Linux fontconfig.');

test('the page renders with the pinned fonts only', async ({ page }) => {
  await page.goto('/');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument');
  const fontsOf = async (selector: string) => {
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
    return fonts.map((font) => font.familyName);
  };
  expect(await fontsOf('h1')).toEqual(['TeX Gyre Pagella']);
  expect(await fontsOf('#status')).toEqual(['TeX Gyre Pagella']);
});

test('the initial page: the field, Scan, and no skills', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#status')).toHaveText('Paste a repository or organization link and press Scan.');
  await expect(page.locator('#scan')).toBeEnabled();
  await expect(page.locator('#filter')).toBeHidden();
  await expect(page.locator('#skills li')).toHaveCount(0);
  await shot(page, 'initial-page.png');
});

test('scan the fixture, select a skill, filter the list', async ({ page, fixture }) => {
  await page.goto('/');
  const skills = page.locator('#skills li');
  const skill = page.locator('#skill');

  await test.step('fill the field and press Scan', async () => {
    await page.locator('#repo').pressSequentially(fixture, { delay: 20 });
    await page.locator('#scan').click();
    await expect(page.locator('#status')).toHaveText('fixture · 5 skills');
    await expect(skills).toHaveCount(5);
    await expect(skills.locator('.name')).toHaveText(['code-style', 'commits', 'commits', 'lint', 'release-checklist']);
    await expect(page.locator('#warnings li')).toHaveText([
      /^warning: \.agents\/skills\/release-checklist\/SKILL\.md: malformed front matter/,
      'warning: not in a skills folder, so not a skill: .claude/skills/SKILL.md, .claude/skills/commits/examples/SKILL.md, testData/skills/sample/SKILL.md',
    ]);
    await expect(skill.locator('h2')).toHaveText('code-style');
    await expect(page).toHaveURL(`/?repo=${encodeURIComponent(fixture)}`);
    await shot(page, 'scan-fixture.png');
  });

  await test.step('click a skill: its SKILL.md, pinned link and copies', async () => {
    await skills.nth(1).click();
    await expect(skills.nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(skill.locator('h2')).toHaveText('commits');
    await expect(skill.locator('a')).toHaveText(`file://${fixture}/.claude/skills/commits/SKILL.md`);
    await expect(skill.locator('.path')).toHaveText('also in .github/skills/commits/SKILL.md');
    await expect(skill.locator('pre')).toContainText('description: Write commit messages');
    await shot(page, 'select-skill.png');
  });

  await test.step('type words: only the matching skills', async () => {
    const filter = page.locator('#filter');
    await filter.pressSequentially('COMMITS linter', { delay: 40 });
    await expect(skills).toHaveCount(1);
    await expect(skills.locator('.path')).toHaveText('tools/linter/.agents/skills/commits/SKILL.md');
    await expect(skill.locator('h2')).toHaveText('commits');
    await shot(page, 'filter-match.png');

    await filter.fill('');
    await filter.pressSequentially('no-such-skill', { delay: 40 });
    await expect(skills).toHaveCount(0);
    await expect(skill).toHaveText('No matching skills.');
    await shot(page, 'filter-no-match.png');

    await filter.fill('');
    await expect(skills).toHaveCount(5);
  });

  await test.step('a new scan clears the filter', async () => {
    await page.locator('#filter').fill('lint');
    await expect(skills).toHaveCount(2);
    await page.locator('#scan').click();
    await expect(page.locator('#status')).toHaveText('fixture · 5 skills');
    await expect(page.locator('#filter')).toHaveValue('');
    await expect(skills).toHaveCount(5);
  });
});

test('Enter in the field scans, and ?repo= in the address scans at once', async ({ page, fixture }) => {
  await page.goto('/');
  await page.locator('#repo').fill(fixture);
  await page.locator('#repo').press('Enter');
  await expect(page.locator('#status')).toHaveText('fixture · 5 skills');
  const shared = page.url();
  await page.goto('about:blank');
  await page.goto(shared);
  await expect(page.locator('#repo')).toHaveValue(fixture);
  await expect(page.locator('#status')).toHaveText('fixture · 5 skills');
});

test('a missing directory: the error, no skills, no filter', async ({ page }) => {
  await page.goto('/');
  await page.locator('#repo').pressSequentially('/no/such/directory', { delay: 20 });
  await page.locator('#scan').click();
  await expect(page.locator('#status.error')).toHaveText('Not a GitHub URL or a readable directory: /no/such/directory');
  await expect(page.locator('#filter')).toBeHidden();
  await expect(page.locator('#skills li')).toHaveCount(0);
  await expect(page.locator('#scan')).toBeEnabled();
  await shot(page, 'missing-directory.png');
});

test('a blank field: nothing is scanned', async ({ page }) => {
  await page.goto('/');
  await page.locator('#repo').fill('   ');
  await page.locator('#scan').click();
  await expect(page.locator('#status')).toHaveText('Paste a repository or organization link and press Scan.');
  await expect(page).toHaveURL('/');
});
