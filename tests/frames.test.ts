// tests/demo/frames.ts: which differences between a video frame and its baseline are important.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { PNG } from 'pngjs';
import { differingPixels, importantRegions, mergeRegions } from './demo/frames.ts';

const WIDTH = 200;
const HEIGHT = 120;

/** A frame of parchment colour, with `paint` drawing on it. */
function frame(paint: (set: (x: number, y: number, rgb: [number, number, number]) => void) => void = () => {}) {
  const png = new PNG({ width: WIDTH, height: HEIGHT });
  for (let i = 0; i < WIDTH * HEIGHT; i++) png.data.set([255, 246, 223, 255], i * 4);
  paint((x, y, rgb) => png.data.set([...rgb, 255], (y * WIDTH + x) * 4));
  return png;
}

test('the same frame: no important difference', () => {
  const mask = differingPixels(frame(), frame());
  assert.equal(mask.reduce((sum, pixel) => sum + pixel, 0), 0);
  assert.deepEqual(importantRegions(mask, WIDTH, HEIGHT), []);
});

test('compression noise, sparse single pixels all over the frame, is not important', () => {
  const noisy = frame((set) => {
    for (let y = 3; y < HEIGHT; y += 11) for (let x = 5; x < WIDTH; x += 13) set(x, y, [40, 30, 20]);
  });
  const mask = differingPixels(frame(), noisy);
  assert.ok(mask.reduce((sum, pixel) => sum + pixel, 0) > 100);
  assert.deepEqual(importantRegions(mask, WIDTH, HEIGHT), []);
});

test('a changed block, such as a new text or button, is one region around it', () => {
  const changed = frame((set) => {
    for (let y = 40; y < 60; y++) for (let x = 100; x < 150; x++) set(x, y, [120, 46, 53]);
  });
  const regions = importantRegions(differingPixels(frame(), changed), WIDTH, HEIGHT);
  assert.equal(regions.length, 1);
  const [region] = regions;
  assert.equal(region.pixels, 20 * 50);
  assert.ok(region.x <= 100 && region.y <= 40 && region.x + region.width >= 150 && region.y + region.height >= 60);
});

test('two separate changes are two regions, the larger first', () => {
  const changed = frame((set) => {
    for (let y = 10; y < 20; y++) for (let x = 10; x < 30; x++) set(x, y, [0, 0, 0]);
    for (let y = 80; y < 110; y++) for (let x = 120; x < 180; x++) set(x, y, [0, 0, 0]);
  });
  const regions = importantRegions(differingPixels(frame(), changed), WIDTH, HEIGHT);
  assert.deepEqual(regions.map((region) => region.pixels), [30 * 60, 10 * 20]);
});

test('changes close together, such as the lines of a shifted panel, are one region', () => {
  const changed = frame((set) => {
    for (const top of [10, 30, 50]) for (let y = top; y < top + 8; y++) for (let x = 20; x < 120; x++) set(x, y, [0, 0, 0]);
  });
  const regions = importantRegions(differingPixels(frame(), changed), WIDTH, HEIGHT);
  assert.equal(regions.length, 1);
  assert.equal(regions[0].pixels, 3 * 8 * 100);
  assert.ok(regions[0].y <= 10 && regions[0].y + regions[0].height >= 58);
});

test('merging joins overlapping and near regions, transitively, and keeps far ones apart', () => {
  const merged = mergeRegions([
    { x: 0, y: 0, width: 10, height: 10, pixels: 50 },
    { x: 20, y: 0, width: 10, height: 10, pixels: 50 },
    { x: 40, y: 0, width: 10, height: 10, pixels: 50 },
    { x: 150, y: 100, width: 10, height: 10, pixels: 50 },
  ]);
  assert.deepEqual(merged, [
    { x: 0, y: 0, width: 50, height: 10, pixels: 150 },
    { x: 150, y: 100, width: 10, height: 10, pixels: 50 },
  ]);
});

test('frame comparison CLI reports failures and updates only changed or missing baselines', { skip: process.platform !== 'linux' }, (t) => {
  const root = mkdtempSync(join(tmpdir(), 'demo-frames-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const demo = join(root, 'tests/demo');
  const baseline = join(demo, 'frames/demo');
  const results = join(root, 'test-results');
  const recording = join(results, 'run');
  mkdirSync(baseline, { recursive: true });
  mkdirSync(recording, { recursive: true });
  symlinkSync(new URL('../node_modules', import.meta.url), join(root, 'node_modules'), 'dir');
  const script = join(demo, 'frames.mts');
  copyFileSync(new URL('./demo/frames.ts', import.meta.url), script);
  const manifests = ['same', 'changed', 'new'].map((name) => ({ name: name + '.png', seconds: 0.5 }));
  writeFileSync(join(recording, 'moments.json'), JSON.stringify({ file: 'demo', title: 'Demo', moments: manifests }));

  function run(expected: number, ...args: string[]) {
    const result = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 30_000 });
    assert.equal(result.status, expected, result.error?.message ?? result.stderr);
    return result.stdout;
  }
  assert.match(run(0, '--input-type=module', '-e',
    `Object.defineProperty(process, 'platform', { value: 'darwin' }); process.argv[1] = ${JSON.stringify(script)}; await import(${JSON.stringify(pathToFileURL(script).href)});`), /Linux-only/);
  assert.match(run(1, script), /NO FRAME.*no video/);
  const video = join(recording, 'video.webm');
  copyFileSync(new URL('../docs/demo/organization-rate-limit.webm', import.meta.url), video);
  const wrongSize = PNG.sync.write(new PNG({ width: 1, height: 1 }));
  writeFileSync(join(baseline, 'changed.png'), wrongSize);
  writeFileSync(join(baseline, 'stale.png'), wrongSize);
  const failed = run(1, script);
  assert.match(failed, /NO BASELINE.*new\.png/);
  assert.match(failed, /DIFF.*changed\.png.*size/);
  assert.match(failed, /STALE.*stale\.png/);

  const actual = readFileSync(join(results, 'frames/demo/same.png'));
  const changed = PNG.sync.read(actual);
  for (let offset = 0; offset < changed.data.length; offset += 4) {
    for (let channel = 0; channel < 3; channel++) changed.data[offset + channel] ^= 255;
  }
  writeFileSync(join(baseline, 'changed.png'), PNG.sync.write(changed));
  writeFileSync(join(baseline, 'same.png'), actual);
  utimesSync(join(baseline, 'same.png'), 100, 100);
  const updated = run(0, script, '--update');
  assert.match(updated, /PASS.*same\.png/);
  assert.match(updated, /UPDATED.*changed\.png/);
  assert.match(updated, /NEW.*new\.png/);
  assert.equal(statSync(join(baseline, 'same.png')).mtimeMs, 100_000);
  assert.deepEqual(readFileSync(join(baseline, 'stale.png')), wrongSize);
  assert.deepEqual(readFileSync(join(baseline, 'changed.png')), actual);
  assert.deepEqual(readFileSync(join(baseline, 'new.png')), actual);
  assert.match(run(1, script), /STALE.*stale\.png/);
});
