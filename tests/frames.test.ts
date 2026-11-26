// tests/demo/frames.ts: which differences between a video frame and its baseline are important.
import assert from 'node:assert/strict';
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
