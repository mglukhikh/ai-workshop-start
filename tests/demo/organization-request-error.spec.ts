import { expect, test } from './fixtures.ts';
import { COMMIT, RATE_LIMITED } from './github.ts';

const url = `https://api.github.com/repos/JetBrains/second/git/trees/${COMMIT}?recursive=1`;
test.use({ recording: { ...RATE_LIMITED, [url]: { status: 404, body: { message: 'Not Found' } } } });

test('a missing GitHub tree leaves completed repositories visible', async ({ page }) => {
  await page.goto('/');
  await page.locator('#repo').pressSequentially('https://github.com/JetBrains', { delay: 20 });
  await page.locator('#scan').click();

  await expect(page.locator('#status')).toHaveText('JetBrains · 1 skill');
  await expect(page.locator('#warnings li')).toHaveText(
    `warning: Not found on GitHub: ${url}. Showing results from completed repositories.`,
  );
  await expect(page.locator('#skills [role="option"] .path')).toHaveText(
    ['JetBrains/first · tools/.agents/skills/shared/SKILL.md'],
  );
  await expect(page.locator('#scan')).toBeEnabled();
  await page.waitForTimeout(1500);
});
