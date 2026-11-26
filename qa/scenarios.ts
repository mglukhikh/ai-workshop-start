// Ready-made manual-testing scenarios for the web view (spec/web.md), on ./fixture: offline.
//   node qa/scenarios.ts            all scenarios
//   node qa/scenarios.ts filter     only the named ones
// HEADED=1 SLOW_MO=300 to watch them; each scenario saves a screenshot under qa/out.
import { FIXTURE, session, type Tester } from './lib.ts';

const SCENARIOS: Record<string, (t: Tester) => Promise<void>> = {
  async 'initial-page'(t) {
    await t.open('/');
    await t.expectText('#status', 'Paste a repository or organization link');
    await t.expectEnabled('#scan');
    await t.expectHidden('#filter');
    await t.expectCount('#skills [role="option"]', 0);
  },

  async 'scan-fixture'(t) {
    await t.open('/');
    await t.fill('#repo', FIXTURE);
    await t.click('#scan');
    await t.expectText('#status', 'fixture · 5 skills');
    await t.expectCount('#skills [role="option"]', 5);
    await t.expectText('#skills [role="option"]:nth-child(1) .name', 'code-style');
    await t.expectText('#skill h2', 'code-style');
    await t.expectText('#warnings', 'malformed front matter');
    await t.expectText('#warnings', 'not in a skills folder');
    await t.expectVisible('#filter');
    await t.expectEnabled('#scan');
    await t.report();
  },

  async 'select-skill'(t) {
    await t.open(`/?repo=${encodeURIComponent(FIXTURE)}`);
    await t.expectCount('#skills [role="option"]', 5);
    await t.click('#skills [role="option"]:nth-child(2)');
    await t.expectText('#skill h2', 'commits');
    await t.expectText('#skill', 'also in .github/skills/commits/SKILL.md');
    await t.expectText('#text', 'description:');
    await t.expectText('#skill-head a', 'file://');
  },

  async 'press-enter'(t) {
    await t.open('/');
    await t.fill('#repo', FIXTURE);
    await t.press('#repo', 'Enter');
    await t.expectText('#status', '5 skills');
  },

  async 'shared-link'(t) {
    await t.open('/');
    await t.fill('#repo', FIXTURE);
    await t.click('#scan');
    await t.expectText('#status', '5 skills');
    const url = t.page.url();
    t.log(`address after scan: ${url}`);
    await t.open(new URL(url).search);
    await t.expectText('#status', '5 skills');
  },

  async filter(t) {
    await t.open(`/?repo=${encodeURIComponent(FIXTURE)}`);
    await t.expectCount('#skills [role="option"]', 5);
    await t.fill('#filter', 'COMMITS linter');
    await t.expectCount('#skills [role="option"]', 1);
    await t.expectText('#skill h2', 'commits');
    await t.expectText('#skills [role="option"] .path', 'tools/linter');
    await t.fill('#filter', 'no-such-skill');
    await t.expectCount('#skills [role="option"]', 0);
    await t.expectText('#skill', 'No matching skills.');
    await t.fill('#filter', '');
    await t.expectCount('#skills [role="option"]', 5);
    await t.fill('#filter', 'lint');
    await t.expectCount('#skills [role="option"]', 2);
    await t.click('#scan');
    await t.expectText('#status', '5 skills');
    await t.expectValue('#filter', '');
    await t.expectCount('#skills [role="option"]', 5);
  },

  async 'missing-directory'(t) {
    await t.open('/');
    await t.fill('#repo', '/no/such/directory');
    await t.click('#scan');
    await t.expectText('#status.error', 'Not a GitHub URL or a readable directory');
    await t.expectHidden('#filter');
    await t.expectCount('#skills [role="option"]', 0);
    await t.expectEnabled('#scan');
    await t.report();
  },

  async 'empty-field'(t) {
    await t.open('/');
    await t.fill('#repo', '   ');
    await t.click('#scan');
    await t.expectText('#status', 'Paste a repository or organization link');
  },
};

const names = process.argv.slice(2);
for (const name of names) if (!(name in SCENARIOS)) throw new Error(`Unknown scenario "${name}". Scenarios: ${Object.keys(SCENARIOS).join(', ')}`);

let failed = 0;
await session(async (tester) => {
  for (const name of names.length ? names : Object.keys(SCENARIOS)) {
    console.log(`▶ ${name}`);
    const before = tester.failures;
    try {
      await SCENARIOS[name](tester);
    } catch (error) {
      tester.failures++;
      console.log(`  FAIL ${error instanceof Error ? error.message.split('\n')[0] : error}`);
    }
    await tester.screenshot(`${name}.png`);
    if (tester.failures > before) failed++;
  }
});
console.log(failed ? `${failed} scenario(s) failed` : 'All scenarios passed');
process.exitCode = failed ? 1 : 0;
