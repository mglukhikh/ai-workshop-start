import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { serve } from '../src/web.ts';
import { openTarget } from '../src/open.ts';

test('Claude grouping invokes the local CLI, validates coverage, and reports failures', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'atlas-map-test-'));
  const originalPath = process.env.PATH;
  process.env.PATH = directory;
  t.after(async () => {
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
    await rm(directory, { recursive: true, force: true });
  });
  const server = await serve({ open: openTarget, port: 0 });
  t.after(() => server.close());
  const cluster = (names: unknown) => fetch(server.url + '/api/skill-map', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(names),
  });
  assert.equal((await cluster([123])).status, 400);
  assert.match((await (await cluster(['lint'])).json()).error, /unavailable/);
  const stub = (output: string) => writeFile(join(directory, 'claude'),
    `#!/bin/sh\n[ "$1 $2" = "--model haiku" ] || exit 1\nprintf '%s' '${output}'\n`, { mode: 0o755 });
  const groups = [{ label: 'Code quality', members: [0, 1] }];
  await stub(JSON.stringify(groups));
  const response = await cluster(['lint', 'code-style']);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), groups);
  await stub('[{"label":"Invalid","members":[0,0]}]');
  assert.equal((await cluster(['lint', 'code-style'])).status, 503);
});
