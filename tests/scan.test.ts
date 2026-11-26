// The decisions in spec/analysis.md and spec/cli.md, checked on what the real command prints for
// ./fixture and for small GitHub repositories answered in tests/helpers.ts and below.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { openGitHub, openGitHubTarget, parseGitHubUrl } from '../src/core/github.ts';
import { AtlasError } from '../src/core/errors.ts';
import { parseSkill } from '../src/core/parse.ts';
import { scan } from '../src/core/scan.ts';
import { replay } from '../src/core/replay.ts';
import type { Recording } from '../src/core/replay.ts';
import { atlas, CLI, EXAMPLE_COMMIT, FIXTURE } from './helpers.ts';

const fixture = await atlas(['scan', FIXTURE]);
const example = await atlas(['scan', 'github.com/JetBrains/example']);

test('malformed front matter → the directory name, no description and a warning', () => {
  const parsed = parseSkill(readFileSync(join(FIXTURE, '.agents/skills/release-checklist/SKILL.md'), 'utf8'));
  assert.equal(parsed.name, undefined);
  assert.equal(parsed.description, '');
  assert.equal(
    parsed.warning,
    'malformed front matter: Nested mappings are not allowed in compact mappings at line 3, column 14; using the directory name',
  );
});

test('scan prints the repository, then each skill with its first sentence and pinned link', () => {
  assert.equal(example.code, 0, example.stderr);
  assert.equal(
    example.stdout,
    [
      'JetBrains/example · 1 skill',
      'commits — Write commit messages the way this repository does.',
      `  https://github.com/JetBrains/example/blob/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`,
    ].join('\n'),
  );
});

test('./fixture: every project skill once, sorted by name, linked to its file, with its copies', () => {
  const root = pathToFileURL(FIXTURE).href;
  assert.equal(fixture.code, 0);
  assert.equal(
    fixture.stdout,
    [
      'fixture · 5 skills',
      // .agents/skills/code-style is a symbolic link to it: not followed, so not a copy.
      "code-style — Follow the project's code style.",
      `  ${root}/.github/skills/code-style/SKILL.md`,
      // .claude/skills comes before .github/skills: the original, even though the copy differs.
      'commits — Write commit messages the way this repository does.',
      `  ${root}/.claude/skills/commits/SKILL.md`,
      '  also in .github/skills/commits/SKILL.md',
      // The same name in a nested project: a skill of its own.
      'commits — Prefix linter commits with `linter:`.',
      `  ${root}/tools/linter/.agents/skills/commits/SKILL.md`,
      'lint — Run the linter on the changed files.',
      `  ${root}/tools/linter/.claude/skills/lint/SKILL.md`,
      'release-checklist',
      `  ${root}/.agents/skills/release-checklist/SKILL.md`,
    ].join('\n'),
  );
  const [malformed, ignored, ...rest] = fixture.stderr.split('\n');
  assert.match(malformed, /^warning: \.agents\/skills\/release-checklist\/SKILL\.md: malformed front matter: /);
  // .claude/skills/notes/skill.md is not named exactly SKILL.md: not even mentioned.
  assert.equal(
    ignored,
    'warning: not in a skills folder, so not a skill: .claude/skills/SKILL.md, .claude/skills/commits/examples/SKILL.md, testData/skills/sample/SKILL.md',
  );
  assert.deepEqual(rest, []);
});

/** What GitHub answers for JetBrains/<name> at COMMIT; `files` are the raw SKILL.md files. */
const COMMIT = '0123456789abcdef0123456789abcdef01234567';
function repository(name: string, answers: Recording, files: Record<string, string | undefined>): Recording {
  const raw = Object.entries(files).map(([path, text]) => [
    `https://raw.githubusercontent.com/JetBrains/${name}/${COMMIT}/${path}`,
    text === undefined ? { status: 404, body: '404: Not Found' } : { status: 200, body: text },
  ]);
  return {
    [`https://api.github.com/repos/JetBrains/${name}`]: { status: 200, body: { full_name: `JetBrains/${name}`, default_branch: 'main' } },
    [`https://api.github.com/repos/JetBrains/${name}/commits/main`]: { status: 200, body: { sha: COMMIT } },
    ...answers,
    ...Object.fromEntries(raw),
  };
}

function searched(name: string, paths: string[]): Recording {
  return {
    [`https://api.github.com/search/code?q=filename:SKILL.md+repo:JetBrains/${name}&per_page=100&page=1`]: {
      status: 200,
      body: { total_count: paths.length, items: paths.map((path) => ({ path })) },
    },
  };
}

const skill = (name: string, description: string) => `---\nname: ${name}\ndescription: ${description}\n---\n`;

test('GitHub: copies are one skill; code search results outside skills folders are not skills', async () => {
  const paths = [
    'community/.claude/skills/jewel/SKILL.md',
    'community/.agents/skills/jewel/SKILL.md',
    'platform/testData/skills/x/SKILL.md',
    ...['a', 'b', 'c', 'd', 'e', 'f'].map((dir) => `docs/${dir}/SKILL.md`),
  ];
  const recording = repository('copies', searched('copies', paths), {
    'community/.agents/skills/jewel/SKILL.md': skill('jewel', 'Jewel UI. Build and audit.'),
  });
  const result = await atlas(['scan', 'https://github.com/JetBrains/copies'], { recording });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(
    result.stdout,
    [
      'JetBrains/copies · 1 skill',
      'jewel — Jewel UI.',
      `  https://github.com/JetBrains/copies/blob/${COMMIT}/community/.agents/skills/jewel/SKILL.md`,
      '  also in community/.claude/skills/jewel/SKILL.md',
    ].join('\n'),
  );
  assert.equal(
    result.stderr,
    'warning: not in a skills folder, so not a skill: docs/a/SKILL.md, docs/b/SKILL.md, docs/c/SKILL.md, docs/d/SKILL.md, docs/e/SKILL.md and 2 more',
  );
});

test('GitHub: the original not at the scanned commit → the next copy, with a warning', async () => {
  const recording = repository('moved', searched('moved', ['.agents/skills/icons/SKILL.md', '.claude/skills/icons/SKILL.md', '.github/skills/icons/SKILL.md']), {
    '.agents/skills/icons/SKILL.md': undefined,
    '.claude/skills/icons/SKILL.md': skill('icons', 'Add SVG icons.'),
  });
  const result = await atlas(['scan', 'https://github.com/JetBrains/moved'], { recording });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(
    result.stdout,
    [
      'JetBrains/moved · 1 skill',
      'icons — Add SVG icons.',
      `  https://github.com/JetBrains/moved/blob/${COMMIT}/.claude/skills/icons/SKILL.md`,
      '  also in .github/skills/icons/SKILL.md',
    ].join('\n'),
  );
  assert.equal(result.stderr, 'warning: .agents/skills/icons/SKILL.md: listed, but not found at the scanned commit; skipped');
});

test('GitHub, no token, a tree too large → only the root skills folders; symbolic links not followed', async () => {
  const tree = (sha: string) => `https://api.github.com/repos/JetBrains/huge/git/trees/${sha}`;
  const answers: Recording = {
    [`${tree(COMMIT)}?recursive=1`]: { status: 200, body: { truncated: true, tree: [] } },
    [tree(COMMIT)]: {
      status: 200,
      body: {
        truncated: false,
        tree: [
          { path: '.agents', mode: '120000', type: 'blob', sha: 'link' },
          { path: '.claude', mode: '040000', type: 'tree', sha: 'claude' },
          { path: 'tools', mode: '040000', type: 'tree', sha: 'tools' },
        ],
      },
    },
    [tree('claude')]: { status: 200, body: { truncated: false, tree: [{ path: 'skills', mode: '040000', type: 'tree', sha: 'skills' }] } },
    [`${tree('skills')}?recursive=1`]: {
      status: 200,
      body: {
        truncated: false,
        tree: [
          { path: 'commits', mode: '040000', type: 'tree', sha: 'c' },
          { path: 'commits/SKILL.md', mode: '100644', type: 'blob', sha: 'c1' },
          { path: 'commits/examples/SKILL.md', mode: '100644', type: 'blob', sha: 'c2' },
          { path: 'linked/SKILL.md', mode: '120000', type: 'blob', sha: 'l1' },
        ],
      },
    },
  };
  const recording = repository('huge', answers, { '.claude/skills/commits/SKILL.md': skill('commits', 'Write commits.') });
  const result = await atlas(['scan', 'https://github.com/JetBrains/huge'], { recording, token: false });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(
    result.stdout,
    [
      'JetBrains/huge · 1 skill',
      'commits — Write commits.',
      `  https://github.com/JetBrains/huge/blob/${COMMIT}/.claude/skills/commits/SKILL.md`,
    ].join('\n'),
  );
  assert.equal(
    result.stderr,
    [
      'warning: the tree is too large to list at once; looked only in .agents/skills, .claude/skills, .github/skills, agent/skills (GITHUB_TOKEN searches everywhere)',
      'warning: not in a skills folder, so not a skill: .claude/skills/commits/examples/SKILL.md',
    ].join('\n'),
  );
});

test('a commit in the URL: its tree, even with a token, and links pinned to it', async () => {
  const answers: Recording = {
    // Not the default branch: the URL's commit. No code search is recorded, so it must not be asked.
    [`https://api.github.com/repos/JetBrains/pinned/commits/${COMMIT}`]: { status: 200, body: { sha: COMMIT } },
    [`https://api.github.com/repos/JetBrains/pinned/git/trees/${COMMIT}?recursive=1`]: {
      status: 200,
      body: { truncated: false, tree: [{ path: '.claude/skills/eel/SKILL.md', mode: '100644', type: 'blob', sha: 'e' }] },
    },
  };
  const recording = repository('pinned', answers, { '.claude/skills/eel/SKILL.md': skill('eel', 'Use EEL APIs.') });
  delete recording['https://api.github.com/repos/JetBrains/pinned/commits/main'];
  const result = await atlas(['scan', `github.com/JetBrains/pinned/tree/${COMMIT}`], { recording });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(
    result.stdout,
    ['JetBrains/pinned · 1 skill', 'eel — Use EEL APIs.', `  https://github.com/JetBrains/pinned/blob/${COMMIT}/.claude/skills/eel/SKILL.md`].join('\n'),
  );
  assert.equal(result.stderr, '');
});

test('GitHub URLs: with or without the scheme, .git, a trailing slash, a commit or a branch', () => {
  assert.deepEqual(parseGitHubUrl('github.com/JetBrains/MPS'), { owner: 'JetBrains', repo: 'MPS', ref: undefined });
  assert.deepEqual(parseGitHubUrl('https://www.github.com/JetBrains/MPS.git/'), { owner: 'JetBrains', repo: 'MPS', ref: undefined });
  assert.deepEqual(parseGitHubUrl(`https://github.com/JetBrains/MPS/tree/${COMMIT}/`), { owner: 'JetBrains', repo: 'MPS', ref: COMMIT });
  assert.deepEqual(parseGitHubUrl('github.com/JetBrains/MPS/tree/release/2025.3'), { owner: 'JetBrains', repo: 'MPS', ref: 'release/2025.3' });
  assert.equal(parseGitHubUrl('github.com/JetBrains/MPS/blob/master/README.md'), undefined);
});

test('unknown commit or branch → a clear message, exit code 1', async () => {
  const recording = repository('pinned', {
    // What GitHub answers for a commit that is not there, and for a branch that is not there.
    'https://api.github.com/repos/JetBrains/pinned/commits/0000000': { status: 422, body: { message: 'No commit found for SHA: 0000000' } },
    'https://api.github.com/repos/JetBrains/pinned/commits/no-such-branch': { status: 404, body: { message: 'Not Found' } },
  }, {});
  for (const ref of ['0000000', 'no-such-branch']) {
    const result = await atlas(['scan', `https://github.com/JetBrains/pinned/tree/${ref}`], { recording });
    assert.equal(result.code, 1);
    assert.equal(result.stderr, `No commit or branch ${ref} in https://github.com/JetBrains/pinned`);
  }
});

test('the CLI prints the result at once and stores nothing', (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'skill-atlas-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const scanned = spawnSync(process.execPath, [CLI, 'scan', FIXTURE], { cwd, encoding: 'utf8' });
  assert.equal(scanned.status, 0, scanned.stderr);
  assert.equal(scanned.stdout, `${fixture.stdout}\n`);
  assert.deepEqual(readdirSync(cwd), []);
});

test('unreachable repository → a clear message, exit code 1', async () => {
  const missing = spawnSync(process.execPath, [CLI, 'scan', join(FIXTURE, 'no-such-directory')], { encoding: 'utf8' });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /^Not a GitHub URL or a readable directory: .*no-such-directory\n$/);

  // What GitHub answers for a repository that does not exist.
  const notFound = replay({ 'https://api.github.com/repos/JetBrains/no-such-repository': { status: 404, body: { message: 'Not Found' } } });
  await assert.rejects(openGitHub('https://github.com/JetBrains/no-such-repository', { fetch: notFound }), {
    message: 'Repository not found: https://github.com/JetBrains/no-such-repository',
  });

  const offline = await atlas(['scan', 'https://github.com/JetBrains/not-answered']);
  assert.equal(offline.code, 1);
  assert.match(offline.stderr, /^Cannot reach GitHub: not recorded: https:\/\/api\.github\.com\/repos\/JetBrains\/not-answered$/);
});

test('rate limit → a message that asks for GITHUB_TOKEN', async () => {
  const limited = replay({
    'https://api.github.com/repos/JetBrains/MPS': {
      status: 403,
      body: { message: 'API rate limit exceeded for 192.0.2.1. (But here is the good news: ...)' },
    },
  });
  await assert.rejects(openGitHub('https://github.com/JetBrains/MPS', { fetch: limited }), {
    message: 'GitHub rate limit reached; set GITHUB_TOKEN',
  });
});

test('organization scan paginates, skips empty repositories, and pins skills to their own repositories', async () => {
  const org = 'https://api.github.com/orgs/JetBrains/repos?per_page=100';
  const path = 'tools/.agents/skills/shared/SKILL.md';
  const first = { full_name: 'JetBrains/first', default_branch: 'main' };
  const second = { full_name: 'JetBrains/second', default_branch: 'main', private: true };
  const recording: Recording = {
    [org + '&page=1']: { status: 200, body: [
      first,
      ...Array.from({ length: 99 }, (_, i) => ({ full_name: `JetBrains/empty-${i}`, default_branch: 'main' })),
    ] },
    [org + '&page=2']: { status: 200, body: [second] },
  };
  for (let i = 0; i < 99; i++) {
    recording[`https://api.github.com/repos/JetBrains/empty-${i}/commits/main`] = { status: 409, body: {} };
  }
  for (const repo of [first, second]) {
    const base = `https://api.github.com/repos/${repo.full_name}`;
    recording[`${base}/commits/main`] = { status: 200, body: { sha: COMMIT } };
    recording[`${base}/git/trees/${COMMIT}?recursive=1`] = {
      status: 200, body: { truncated: false, tree: [{ path, type: 'blob', mode: '100644' }] },
    };
    const file = 'private' in repo
      ? `${base}/contents/${path}?ref=${COMMIT}`
      : `https://raw.githubusercontent.com/${repo.full_name}/${COMMIT}/${path}`;
    recording[file] = { status: 200, body: skill('shared', 'Shared skill.') };
  }
  const result = await atlas(['scan', 'https://github.com/JetBrains/'], { recording });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout.split('\n')[0], 'JetBrains · 2 skills');
  for (const repo of [first, second]) {
    assert.ok(result.stdout.includes(`https://github.com/${repo.full_name}/blob/${COMMIT}/${path}`));
  }
  assert.equal(result.stderr, '');
});

test('an unknown organization reports an error', async () => {
  const result = await atlas(['scan', 'github.com/orgs/missing'], {
    recording: {
      'https://api.github.com/orgs/missing/repos?per_page=100&page=1': { status: 404, body: {} },
      'https://api.github.com/users/missing': { status: 404, body: {} },
    },
  });
  assert.equal(result.code, 1);
  assert.equal(result.stderr, 'Organization not found: https://github.com/missing');
});

test('a GitHub user URL explains that organization scans require an organization', async () => {
  const result = await atlas(['scan', 'github.com/person'], {
    recording: {
      'https://api.github.com/orgs/person/repos?per_page=100&page=1': { status: 404, body: {} },
      'https://api.github.com/users/person': { status: 200, body: { type: 'User' } },
    },
  });
  assert.equal(result.code, 1);
  assert.equal(result.stderr, 'GitHub user accounts are unsupported for organization scans: https://github.com/person');
});

const limitedOrganization: Recording = {
  'https://api.github.com/orgs/JetBrains/repos?per_page=100&page=1': {
    status: 200, body: [{ full_name: 'JetBrains/huge', default_branch: 'main' }],
  },
  'https://api.github.com/repos/JetBrains/huge/commits/main': { status: 200, body: { sha: COMMIT } },
};

test('an organization scan limits truncated trees to root skills folders and prefixes warnings', async () => {
  const tree = (sha: string) => `https://api.github.com/repos/JetBrains/huge/git/trees/${sha}`;
  const path = '.agents/skills/shared/SKILL.md';
  const result = await atlas(['scan', 'github.com/JetBrains'], {
    recording: {
      ...limitedOrganization,
      [`${tree(COMMIT)}?recursive=1`]: { status: 200, body: { truncated: true, tree: [] } },
      [tree(COMMIT)]: { status: 200, body: { tree: [
        { path: '.agents', type: 'tree', sha: 'agents' },
        { path: 'tools', type: 'tree', sha: 'tools' },
      ] } },
      [tree('agents')]: { status: 200, body: { tree: [{ path: 'skills', type: 'tree', sha: 'skills' }] } },
      [`${tree('skills')}?recursive=1`]: {
        status: 200, body: { tree: [{ path: 'shared/SKILL.md', type: 'blob', mode: '100644' }] },
      },
      [`https://raw.githubusercontent.com/JetBrains/huge/${COMMIT}/${path}`]: {
        status: 200, body: skill('shared', 'Shared skill.'),
      },
    },
  });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^JetBrains · 1 skill\b/);
  assert.ok(result.stdout.includes(`https://github.com/JetBrains/huge/blob/${COMMIT}/${path}`));
  assert.match(result.stderr, /JetBrains\/huge: the tree is too large to list at once; looked only in /);
});

test('a failed repository scan reports an error for the organization', async () => {
  const result = await atlas(['scan', 'github.com/JetBrains'], {
    recording: {
      ...limitedOrganization,
      [`https://api.github.com/repos/JetBrains/huge/git/trees/${COMMIT}?recursive=1`]: { status: 500, body: {} },
    },
  });
  assert.equal(result.code, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /GitHub answered 500 .*\/repos\/JetBrains\/huge\/git\/trees\//);
});

test('an organization scan stops before visiting repositories when the request budget is insufficient', async () => {
  const target = await openGitHubTarget('https://github.com/JetBrains', {
    fetch: async (url, init) => {
      assert.equal(url, 'https://api.github.com/orgs/JetBrains/repos?per_page=100&page=1');
      assert.ok(init?.signal);
      return Response.json([{ full_name: 'JetBrains/first', default_branch: 'main' }], {
        headers: { 'x-ratelimit-remaining': '1' },
      });
    },
  });
  await assert.rejects(scan(target), { message: /set GITHUB_TOKEN/ });
});

test('a GitHub timeout while reading a response body produces an AtlasError', async (t) => {
  const abort = new AbortController();
  t.mock.method(AbortSignal, 'timeout', (milliseconds: number) => {
    assert.equal(milliseconds, 15_000);
    return abort.signal;
  });
  await assert.rejects(openGitHub('https://github.com/JetBrains/example', {
    fetch: async (_url, init) => new Response(new ReadableStream({
      pull(controller) {
        init?.signal?.addEventListener('abort', () => controller.error(init.signal?.reason), { once: true });
        abort.abort(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));
      },
    })),
  }), (error) => error instanceof AtlasError && /Cannot reach GitHub: .*timeout/.test(error.message));
});

test('organization progress uses the last-page bound before scanning the first repository', async (t) => {
  const timeout = AbortSignal.timeout;
  t.mock.method(AbortSignal, 'timeout', (ms: number) => {
    assert.equal(ms, 15_000);
    return timeout(ms);
  });
  const totals: (number | undefined)[] = [];
  const target = await openGitHubTarget('github.com/Big', {
    onOrganizationProgress: ({ current, total }) => { if (current) totals.push(total); },
    fetch: async (url) => {
      if (url.includes('/orgs/')) {
        const first = url.endsWith('&page=1');
        return Response.json(Array.from({ length: first ? 100 : 50 }, (_, index) => ({
          full_name: `Big/repo-${index + (first ? 0 : 100)}`, default_branch: 'main',
        })), { headers: first ? {
          link: '<https://api.github.com/orgs/Big/repos?per_page=100&page=2>; rel="last"',
        } : {} });
      }
      return Response.json(url.includes('/commits/') ? { sha: COMMIT } : { tree: [] });
    },
  });
  await scan(target);
  assert.deepEqual(totals, [...Array(100).fill(200), ...Array(50).fill(150)]);
});
