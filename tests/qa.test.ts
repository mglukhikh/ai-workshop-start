import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

test('non-interactive QA resumes a pause and shuts down on SIGINT outside it', { timeout: 20_000 }, async () => {
  const child = spawn(process.execPath, ['--input-type=module', '-e', `
    import { session, waitForEnter } from './qa/lib.ts';
    await session(async (tester) => {
      await waitForEnter(tester.baseUrl);
      console.log('resumed');
      await new Promise((resolve) => setTimeout(resolve, 30_000));
    });
  `], { stdio: ['ignore', 'pipe', 'inherit'] });
  const closed = once(child, 'close');
  const lines = createInterface({ input: child.stdout });
  try {
    let url: string | undefined;
    for await (const line of lines) {
      if (line.startsWith('http://')) {
        url = line;
        assert.equal((await fetch(url)).status, 200);
        child.kill('SIGINT');
      } else if (line === 'resumed') {
        child.kill('SIGINT');
        break;
      }
    }
    assert.deepEqual(await closed, [130, null]);
    assert.ok(url);
    for (let attempt = 0; attempt < 50; attempt++) {
      try {
        await fetch(url);
      } catch {
        return;
      }
      await delay(20);
    }
    assert.fail('QA server was still accepting requests after SIGINT');
  } finally {
    lines.close();
    child.kill('SIGTERM');
    await closed;
  }
});
