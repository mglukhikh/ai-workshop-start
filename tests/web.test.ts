// The decisions in spec/web.md, checked over HTTP on the real server: ./fixture, and the small
// GitHub repository answered in tests/helpers.ts.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { request } from 'node:http';
import { join } from 'node:path';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { parseHTML, type HTMLInputElement, type HTMLElement } from 'linkedom';
import { run } from '../src/commands.ts';
import { openGitHub, parseGitHubUrl } from '../src/core/github.ts';
import { replay } from '../src/core/replay.ts';
import { openDirectory } from '../src/local.ts';
import { serve } from '../src/web.ts';
import { CLI, EXAMPLE, EXAMPLE_COMMIT, FIXTURE } from './helpers.ts';

const github = replay(EXAMPLE);
const server = await serve({
  open: (input) => (parseGitHubUrl(input) ? openGitHub(input, { fetch: github, token: 'test' }) : openDirectory(input)),
  port: 0,
});
test.after(() => server.close());

const scan = async (repo: string) => {
  const response = await fetch(`${server.url}/api/scan?repo=${encodeURIComponent(repo)}`);
  return { status: response.status, body: (await response.json()) as any };
};

test('the page: a field for the repository link, the skills, a SKILL.md', async () => {
  const response = await fetch(server.url);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /^text\/html/);
  const page = await response.text();
  assert.match(page, /<input id="repo"/);
  assert.match(page, /<ul id="skills"/);
  assert.match(page, /<section id="skill"/);
});

test('a GitHub link: its skills, each with its pinned link and its SKILL.md', async () => {
  const { status, body } = await scan('https://github.com/JetBrains/example');
  assert.equal(status, 200);
  assert.equal(body.repository.id, 'JetBrains/example');
  assert.deepEqual(body.warnings, []);
  assert.deepEqual(
    body.skills.map((skill: Record<string, unknown>) => [skill.name, skill.description, skill.link, skill.text]),
    [[
      'commits',
      'Write commit messages the way this repository does. Use for every commit.',
      `https://github.com/JetBrains/example/blob/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`,
      EXAMPLE[`https://raw.githubusercontent.com/JetBrains/example/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`].body,
    ]],
  );
});

test('a directory: the same skills as the CLI, sorted by name, with copies and warnings', async () => {
  const { status, body } = await scan(FIXTURE);
  assert.equal(status, 200);
  assert.deepEqual(
    body.skills.map((skill: Record<string, unknown>) => [skill.name, skill.path, skill.copies]),
    [
      ['code-style', '.github/skills/code-style/SKILL.md', []],
      ['commits', '.claude/skills/commits/SKILL.md', ['.github/skills/commits/SKILL.md']],
      ['commits', 'tools/linter/.agents/skills/commits/SKILL.md', []],
      ['lint', 'tools/linter/.claude/skills/lint/SKILL.md', []],
      ['release-checklist', '.agents/skills/release-checklist/SKILL.md', []],
    ],
  );
  // The SKILL.md as it is, front matter included, even when the front matter is malformed.
  for (const skill of body.skills) assert.equal(skill.text, readFileSync(join(FIXTURE, skill.path), 'utf8'));
  assert.equal(body.warnings.length, 2);
  assert.match(body.warnings[0], /^\.agents\/skills\/release-checklist\/SKILL\.md: malformed front matter: /);
});

test('an unreachable repository or an empty field → the clear message, status 400', async () => {
  const missing = await scan(join(FIXTURE, 'no-such-directory'));
  assert.equal(missing.status, 400);
  assert.match(missing.body.error, /^Not a GitHub URL or a readable directory: .*no-such-directory$/);
  const offline = await scan('https://github.com/JetBrains/not-answered');
  assert.equal(offline.status, 400);
  assert.match(offline.body.error, /^Cannot reach GitHub: /);
  assert.equal((await scan(' ')).status, 400);
});

test('only this machine: another host name → 403; an unknown path → 404', async () => {
  const status = await new Promise<number>((resolve, reject) => {
    request(server.url, { headers: { host: 'attacker.example' } }, (response) => resolve(response.statusCode ?? 0)).on('error', reject).end();
  });
  assert.equal(status, 403);
  assert.equal((await fetch(`${server.url}/nope`)).status, 404);
});

test('./skill-atlas serve <port> prints its address and serves until stopped', async (t) => {
  const child = spawn(process.execPath, [CLI, 'serve', '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => child.kill());
  const [line] = (await once(child.stdout, 'data')).map(String);
  const url = /^Skill Atlas: (http:\/\/127\.0\.0\.1:\d+)\n$/.exec(line)?.[1];
  assert.ok(url, line);
  const response = await fetch(`${url}/api/scan?repo=${encodeURIComponent(FIXTURE)}`);
  assert.equal(((await response.json()) as any).skills.length, 5);
});

test('serve: a bad port, or no server to start → usage or a clear message, exit code 1', async () => {
  const errors: string[] = [];
  const context = { open: () => Promise.reject(new Error('unused')), print: () => {}, error: (text: string) => errors.push(text) };
  assert.equal(await run(['serve', 'abc'], { ...context, serve: async () => 'unused' }), 1);
  assert.equal(await run(['serve'], context), 1);
  assert.deepEqual(errors, ['Usage: skill-atlas serve [port]', 'serve: only in the Node CLI']);
});

test('serve with no port: 4173', async () => {
  const ports: number[] = [];
  const printed: string[] = [];
  const code = await run(['serve'], {
    open: () => Promise.reject(new Error('unused')),
    print: (text) => printed.push(text),
    error: () => {},
    serve: async (port) => (ports.push(port), `http://127.0.0.1:${port}`),
  });
  assert.equal(code, 0);
  assert.deepEqual(ports, [4173]);
  assert.deepEqual(printed, ['Skill Atlas: http://127.0.0.1:4173']);
});

test('?repo=<link> in the page address: scanned at once', async () => {
  const page = await (await fetch(`${server.url}/?repo=${encodeURIComponent(FIXTURE)}`)).text();
  assert.match(page, /new URLSearchParams\(location\.search\)\.get\('repo'\)/);
});

test('the served page filters skills by words and resets on a new scan', async () => {
  const page = await (await fetch(server.url)).text();
  const { document, Event } = parseHTML(page);
  const context = {
    document, URLSearchParams, location: { search: '' },
    fetch: (path: string) => fetch(server.url + path),
  };
  runInNewContext(document.querySelector('script')!.textContent!, context);
  const scanPage = (repo: string) => runInNewContext('scan(' + JSON.stringify(repo) + ')', context);
  await scanPage(FIXTURE);
  const filter = document.querySelector<HTMLInputElement>('#filter')!;
  const names = () => Array.from(document.querySelectorAll('#skills .name') as Iterable<HTMLElement>, (node) => node.textContent);
  const type = (value: string) => {
    filter.value = value;
    filter.dispatchEvent(new Event('input'));
  };
  assert.equal(filter.hidden, false);
  assert.equal(names().length, 5);
  type('  COMMITS   tools/linter ');
  assert.deepEqual(names(), ['commits']);
  assert.equal(document.querySelector('#skill h2')?.textContent, 'commits');
  type('KOTLIN');
  assert.deepEqual(names(), ['code-style']);
  type('impossible-word');
  assert.deepEqual(names(), []);
  assert.equal(document.querySelector('#skill')?.textContent, 'No matching skills.');
  type(' ');
  assert.equal(names().length, 5);
  type('lint');
  await scanPage(FIXTURE);
  assert.equal(filter.value, '');
  assert.equal(names().length, 5);

  await scanPage(join(FIXTURE, 'no-such-directory'));
  assert.equal(filter.hidden, true);

  await scanPage(FIXTURE);
  assert.equal(filter.hidden, false);
  await scanPage(join(FIXTURE, 'testData'));
  assert.equal(filter.hidden, true);
  assert.deepEqual(names(), []);
});
