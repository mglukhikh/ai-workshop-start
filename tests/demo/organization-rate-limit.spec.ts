// The demo docs/demo/organization-rate-limit.webm as a test, at its 1000×640 viewport: GitHub's
// quota ends after the first repository, and the page shows that repository's skill with the
// rate-limit warning (spec/analysis.md, "Organization scan").
import { expect, shot, test } from './fixtures.ts';
import { COMMIT, RATE_LIMITED } from './github.ts';

const viewport = { width: 1000, height: 640 };
// As in the demo, no GITHUB_TOKEN: the warning suggests one.
test.use({ recording: RATE_LIMITED, token: '', viewport, video: { mode: 'on', size: viewport } });

test('a rate-limited organization scan shows the completed repositories and a warning', async ({ page, github }) => {
  github.rateLimit('JetBrains/second');
  github.hold('JetBrains/second');
  await page.goto('/');
  await page.locator('#repo').pressSequentially('https://github.com/JetBrains', { delay: 20 });
  await page.locator('#scan').click();

  await test.step('the first repository is done, the second waits for GitHub', async () => {
    await expect(page.locator('#status')).toHaveText('Scanned 1 repository');
    await expect(page.locator('#current-repository')).toHaveText('Scanning JetBrains/second…');
    await expect(page.locator('#scan-progress')).toHaveAttribute('value', '1');
    await expect(page.locator('#scan-progress')).toHaveAttribute('max', '2');
    await expect(page.locator('#scan')).toBeDisabled();
    await shot(page, 'scanning.png');
  });

  github.release('JetBrains/second');
  await test.step('GitHub answers 403: the skills so far and the rate-limit warning', async () => {
    await expect(page.locator('#status')).toHaveText('JetBrains · 1 skill');
    await expect(page.locator('#warnings li')).toHaveText([
      'warning: GitHub rate limit reached; set GITHUB_TOKEN. Showing results from completed repositories.',
    ]);
    await expect(page.locator('#skills li .path')).toHaveText(['JetBrains/first · tools/.agents/skills/shared/SKILL.md']);
    await expect(page.locator('#skill h2')).toHaveText('shared');
    await expect(page.locator('#skill a')).toHaveText(
      `https://github.com/JetBrains/first/blob/${COMMIT}/tools/.agents/skills/shared/SKILL.md`);
    await expect(page.locator('#scan')).toBeEnabled();
    await shot(page, 'rate-limited.png');
  });
});
