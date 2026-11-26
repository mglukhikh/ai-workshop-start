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
import { replay } from '../src/core/replay.ts';
import { openTarget } from '../src/open.ts';
import { serve } from '../src/web.ts';
import { CLI, EXAMPLE, EXAMPLE_COMMIT, FIXTURE } from './helpers.ts';

const sharedPath = 'tools/.agents/skills/shared/SKILL.md';
const repos = ['JetBrains/first', 'JetBrains/second'];
const emptyRepo = 'JetBrains/empty';
const github = replay({
  ...EXAMPLE,
  'https://api.github.com/orgs/JetBrains/repos?per_page=100&page=1': {
    status: 200, body: [...repos, emptyRepo].map((full_name) => ({ full_name, default_branch: 'main' })),
  },
  [`https://api.github.com/repos/${emptyRepo}/commits/main`]: {
    status: 409, body: { message: 'Git Repository is empty.' },
  },
  ...Object.fromEntries(repos.flatMap((repo) => [
    [`https://api.github.com/repos/${repo}/commits/main`, { status: 200, body: { sha: EXAMPLE_COMMIT } }],
    [`https://api.github.com/repos/${repo}/git/trees/${EXAMPLE_COMMIT}?recursive=1`, {
      status: 200, body: { truncated: false, tree: [{ path: sharedPath, type: 'blob', mode: '100644' }] },
    }],
    [`https://raw.githubusercontent.com/${repo}/${EXAMPLE_COMMIT}/${sharedPath}`, {
      status: 200, body: '---\nname: shared\ndescription: Shared skill.\n---\n',
    }],
  ])),
});
const server = await serve({
  open: (input, options) => openTarget(input, { fetch: github, token: 'test', ...options }),
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

test('the served page displays the streamed scan error', async () => {
  const { document } = parseHTML(await (await fetch(server.url)).text());
  const missing = join(FIXTURE, 'no-such-directory');
  await runInNewContext(
    document.querySelector('script')!.textContent! + '\nscan(missing);',
    {
      document, missing, URLSearchParams, TextDecoderStream, location: { search: '' },
      fetch: async (path: string) => {
        const url = new URL(path, server.url);
        assert.equal(url.searchParams.get('progress'), '1');
        const response = await fetch(url);
        assert.equal(response.status, 200);
        return response;
      },
    },
  );
  const status = document.querySelector('#status')!;
  assert.equal(status.textContent, `Not a GitHub URL or a readable directory: ${missing}`);
  assert.equal(status.className, 'error');
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

test('an organization URL works through the same HTTP scan endpoint', async () => {
  const { status, body } = await scan('github.com/JetBrains');
  assert.equal(status, 200);
  assert.equal(body.repository.id, 'JetBrains');
  assert.deepEqual(body.skills.map((skill: Record<string, unknown>) => [skill.repository, skill.path, skill.link]),
    repos.map((repo) => [repo, sharedPath, `https://github.com/${repo}/blob/${EXAMPLE_COMMIT}/${sharedPath}`]));
});

test('the served page renders all warnings in a bounded scrollable list alongside skills', async () => {
  const { document } = parseHTML(await (await fetch(server.url)).text());
  const { body } = await scan('github.com/JetBrains');
  const warnings = Array.from({ length: 40 }, (_, index) => `acme/repo${index}: malformed front matter`);
  runInNewContext(document.querySelector('script')!.textContent! + '\nshow(result);', {
    document, location: { search: '' }, URLSearchParams, result: { ...body, warnings },
  });

  const rules = document.querySelector('style')!.textContent!;
  const warningRule = rules.match(/#warnings\s*\{([^}]+)\}/)?.[1] ?? '';
  assert.match(warningRule, /max-height:\s*30vh;/);
  assert.match(warningRule, /overflow:\s*auto;/);
  assert.match(warningRule, /flex:\s*none;/);
  assert.equal(document.querySelectorAll('#warnings li').length, warnings.length);
  assert.equal(document.querySelector('#warnings li:last-child')?.textContent, `warning: ${warnings.at(-1)}`);
  assert.equal(document.querySelectorAll('#skills li').length, body.skills.length);
  assert.equal(document.querySelector('#skill h2')?.textContent, 'shared');
});

test('organization skill rows distinguish the same path in different repositories', async () => {
  const page = await (await fetch(server.url)).text();
  const { document, Event } = parseHTML(page);
  const { body } = await scan('github.com/JetBrains');
  runInNewContext(document.querySelector('script')!.textContent! + '\nshow(result);', {
    document, location: { search: '' }, URLSearchParams, result: body,
  });
  const paths = () => Array.from(document.querySelectorAll('#skills .path') as Iterable<HTMLElement>, (row) => row.textContent);
  assert.deepEqual(paths(), repos.map((repo) => `${repo} · ${sharedPath}`));

  const filter = document.querySelector<HTMLInputElement>('#filter')!;
  filter.value = 'JETBRAINS/SECOND shared';
  filter.dispatchEvent(new Event('input'));
  assert.deepEqual(paths(), [`${repos[1]} · ${sharedPath}`]);
});

test('the served page filters skills by words and resets on a new scan', async () => {
  const page = await (await fetch(server.url)).text();
  const { document, Event } = parseHTML(page);
  const context = {
    document, URLSearchParams, TextDecoderStream, location: { search: '' },
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

test('the served page shows organization progress before the final result', async () => {
  const { document } = parseHTML(await (await fetch(server.url)).text());
  const reader = (await fetch(`${server.url}/api/scan?repo=github.com/JetBrains&progress=1`))
    .body!.pipeThrough(new TextDecoderStream()).getReader();
  const { readable, writable } = new TransformStream<string, Uint8Array>({
    transform(chunk, controller) { controller.enqueue(new TextEncoder().encode(chunk)); },
  });
  const writer = writable.getWriter();
  const status = document.querySelector('#status')!;
  const { promise: progressShown, resolve } = Promise.withResolvers<void>();
  new document.defaultView.MutationObserver(() => {
    if (status.textContent?.includes('Scanned 1 repository')) resolve();
  }).observe(status, { childList: true });
  const pending = runInNewContext(
    document.querySelector('script')!.textContent! + '\nscan("https://github.com/JetBrains");',
    { document, URLSearchParams, TextDecoderStream, location: { search: '' }, fetch: async () => new Response(readable) },
  );
  const button = document.querySelector('#scan')!;
  assert.equal(button.textContent, 'Scanning…');
  assert.equal(Reflect.get(button, 'disabled'), true);
  let events = '';
  while (events.split('\n').length < 4) events += (await reader.read()).value;
  const newline = events.split('\n', 3).join('\n').length;
  const [listing, started, completed] = events.slice(0, newline).split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(listing, { progress: { completed: 0 } });
  assert.deepEqual(started, { progress: { current: repos[0], completed: 0, total: 3 } });
  assert.deepEqual(completed, { progress: { completed: 1, total: 3 } });
  const startEnd = events.split('\n', 2).join('\n').length + 1;
  const bar = document.querySelector<HTMLElement>('#scan-progress')!;
  bar.setAttribute('value', '3');
  const listingEnd = events.indexOf('\n') + 1;
  await writer.write(events.slice(0, listingEnd));
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(bar.hidden, false);
  assert.equal(bar.hasAttribute('value'), false);
  await writer.write(events.slice(listingEnd, startEnd));
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(bar.hidden, false);
  assert.equal(bar.getAttribute('max'), '3');
  assert.equal(bar.getAttribute('value'), '0');
  assert.equal(document.querySelector('#current-repository')!.textContent, `Scanning ${repos[0]}…`);
  await writer.write(events.slice(startEnd, newline + 1));
  await progressShown;
  let remaining = events.slice(newline + 1);
  for (let next = await reader.read(); !next.done; next = await reader.read()) remaining += next.value;
  const [, , , emptyProgress] = remaining.trimEnd().split('\n').map((line) => JSON.parse(line));
  await writer.write(remaining);
  await writer.close();
  assert.deepEqual(emptyProgress, { progress: { completed: 3, total: 3 } });
  await pending;
  assert.match(status.textContent!, /JetBrains · 2 skills/);
  assert.equal(Reflect.get(button, 'disabled'), false);
});

test('disconnecting aborts the in-flight GitHub request and stops the scan', { timeout: 5000 }, async () => {
  const started = Promise.withResolvers<void>();
  const cancelled = Promise.withResolvers<void>();
  const finished = Promise.withResolvers<void>();
  let calls = 0;
  const server = await serve({
    port: 0,
    open: async (input, options) => {
      const target = await openTarget(input, {
        ...options,
        fetch: async (_url, init) => {
          calls++;
          if (calls === 1) return Response.json(repos.map((full_name) => ({ full_name, default_branch: 'main' })));
          started.resolve();
          return new Promise((_, reject) => init!.signal!.addEventListener('abort', () => {
            cancelled.resolve();
            reject(init!.signal!.reason);
          }, { once: true }));
        },
      });
      assert.ok('sources' in target);
      return {
        repository: target.repository,
        async *sources() {
          try { yield* target.sources(); }
          finally { finished.resolve(); }
        },
      };
    },
  });
  const controller = new AbortController();
  try {
    const response = await fetch(`${server.url}/api/scan?repo=github.com/JetBrains&progress=1`, { signal: controller.signal });
    await started.promise;
    controller.abort();
    await assert.rejects(response.text(), { name: 'AbortError' });
    await cancelled.promise;
    await finished.promise;
    assert.equal(calls, 2);
  } finally {
    controller.abort();
    await server.close();
  }
});

test('the organization deadline cancels the current request and streams partial results', { timeout: 5000 }, async (t) => {
  const deadline = new AbortController();
  const timeout = AbortSignal.timeout;
  t.mock.method(AbortSignal, 'timeout', (ms: number) => ms === 300_000 ? deadline.signal : timeout(ms));
  let cancelled = false;
  const server = await serve({
    port: 0,
    open: (input, options) => openTarget(input, {
      ...options,
      fetch: (url, init) => {
        if (!url.includes(`/repos/${repos[1]}/`)) return github(url, init);
        return new Promise((_, reject) => {
          const signal = init!.signal!;
          signal.addEventListener('abort', () => {
            cancelled = true;
            reject(signal.reason);
          }, { once: true });
          deadline.abort(new DOMException('Deadline exceeded', 'TimeoutError'));
        });
      },
    }),
  });
  try {
    const response = await fetch(`${server.url}/api/scan?repo=github.com/JetBrains&progress=1`);
    const events = (await response.text()).trim().split('\n').map((line) => JSON.parse(line));
    assert.equal(cancelled, true);
    assert.deepEqual(events.at(-2), { progress: { completed: 1, total: 3, current: repos[1] } });
    const { result } = events.at(-1);
    assert.deepEqual(result.skills.map((skill: { repository: string }) => skill.repository), [repos[0]]);
    assert.match(result.warnings.at(-1), /5-minute limit/);
  } finally {
    await server.close();
  }
});

test('an organization scan uses the remaining quota and streams partial results when rate-limited', async () => {
  const server = await serve({
    port: 0,
    open: (input, options) => openTarget(input, {
      ...options,
      fetch: async (url, init) => {
        if (url.includes(`/repos/${repos[1]}/`)) {
          return new Response(null, { status: 403, headers: { 'x-ratelimit-remaining': '0' } });
        }
        const response = await github(url, init);
        if (url.includes('/orgs/')) response.headers.set('x-ratelimit-remaining', '2');
        return response;
      },
    }),
  });
  try {
    const response = await fetch(`${server.url}/api/scan?repo=github.com/JetBrains&progress=1`);
    const events = (await response.text()).trim().split('\n').map((line) => JSON.parse(line));
    const { result } = events.at(-1);
    assert.deepEqual(result.skills.map((skill: { repository: string }) => skill.repository), [repos[0]]);
    assert.match(result.warnings.at(-1), /GitHub rate limit reached.*Showing results from completed repositories/);
  } finally {
    await server.close();
  }
});
