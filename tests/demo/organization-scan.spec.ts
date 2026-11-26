// The demo docs/demo/organization-scan.mp4 as a test, on a recorded organization instead of the
// live one: the progress bar, the completed count and the current repository, step by step
// (spec/web.md), then the combined skills with their repository IDs (spec/analysis.md).
import { expect, shot, test } from './fixtures.ts';
import { COMMIT, ORGANIZATION_SCAN, ORGANIZATION_SCAN_REPOSITORIES as REPOSITORIES } from './github.ts';

test.use({ recording: ORGANIZATION_SCAN });

test('an organization scan shows its progress, then the skills of every repository', async ({ page, github }) => {
  const bar = page.locator('#scan-progress');
  const current = page.locator('#current-repository');
  const status = page.locator('#status');
  const scan = page.locator('#scan');
  const skills = page.locator('#skills li');

  github.hold('JetBrains', ...REPOSITORIES);
  await page.goto('/');
  await page.locator('#repo').pressSequentially('https://github.com/JetBrains', { delay: 20 });
  await scan.click();

  await test.step('listing the repositories: an indeterminate bar, Scan disabled', async () => {
    await expect(status).toHaveText('Scanned 0 repositories');
    await expect(bar).toBeVisible();
    await expect(bar).not.toHaveAttribute('value');
    await expect(current).toBeHidden();
    await expect(scan).toBeDisabled();
    await expect(scan).toHaveText('Scanning…');
  });

  github.release('JetBrains');
  for (const [index, repository] of REPOSITORIES.entries()) {
    await test.step(`scanning ${repository}`, async () => {
      await expect(current).toHaveText(`Scanning ${repository}…`);
      await expect(status).toHaveText(`Scanned ${index} ${index === 1 ? 'repository' : 'repositories'}`);
      await expect(bar).toHaveAttribute('max', String(REPOSITORIES.length));
      await expect(bar).toHaveAttribute('value', String(index));
      await shot(page, `progress-${index}.png`);
      github.release(repository);
    });
  }

  await test.step('the result: skills from every repository, warnings prefixed by repository', async () => {
    await expect(status).toHaveText('JetBrains · 7 skills');
    await expect(bar).toBeHidden();
    await expect(current).toBeHidden();
    await expect(scan).toBeEnabled();
    await expect(scan).toHaveText('Scan');
    await expect(skills.locator('.name')).toHaveText([
      'build-tools-bump-gradle-api', 'commits', 'commits', 'inspection', 'plugin', 'release-notes', 'write-compiler-test',
    ]);
    await expect(skills.locator('.path')).toHaveText([
      'JetBrains/kotlin · .claude/skills/build-tools-bump-gradle-api/SKILL.md',
      'JetBrains/intellij-community · .agents/skills/commits/SKILL.md',
      'JetBrains/ktor · .agents/skills/commits/SKILL.md',
      'JetBrains/intellij-community · platform/.agents/skills/inspection/SKILL.md',
      'JetBrains/ktor · .agents/skills/plugin/SKILL.md',
      'JetBrains/compose-multiplatform · .github/skills/release-notes/SKILL.md',
      'JetBrains/kotlin · .claude/skills/write-compiler-test/SKILL.md',
    ]);
    await expect(page.locator('#warnings li')).toHaveText([
      'warning: JetBrains/intellij-community: not in a skills folder, so not a skill: docs/skills/sample/SKILL.md',
      /^warning: JetBrains\/ktor: \.agents\/skills\/plugin\/SKILL\.md: malformed front matter/,
    ]);
    await expect(page.locator('#skill h2')).toHaveText('build-tools-bump-gradle-api');
    await expect(page.locator('#skill a')).toHaveText(
      `https://github.com/JetBrains/kotlin/blob/${COMMIT}/.claude/skills/build-tools-bump-gradle-api/SKILL.md`);
    await shot(page, 'result.png');
  });

  await test.step('filter by a repository ID', async () => {
    await page.locator('#filter').pressSequentially('ktor', { delay: 40 });
    await expect(skills.locator('.name')).toHaveText(['commits', 'plugin']);
    await expect(page.locator('#skill h2')).toHaveText('commits');
    await expect(page.locator('#skill pre')).toContainText('Writes commit messages in the Ktor style.');
    await shot(page, 'filter-repository.png');
  });
});
