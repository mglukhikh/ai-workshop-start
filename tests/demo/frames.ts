// The key moments of the demo videos, compared with their baselines.
//   node tests/demo/frames.ts            compare, after `npx playwright test`; exit code 1 on a difference
//   node tests/demo/frames.ts --update   make the frames the new baselines (in CI: .github/workflows/baselines.yml)
// Each demo test writes moments.json next to its video.webm (tests/demo/fixtures.ts, `shot`). This
// takes those frames from the video with Chromium, compares them with tests/demo/frames/, and
// writes test-results/frames/: the frames, a highlighted image per difference, report.html and
// report.md, which also goes to the GitHub job summary.
//
// A video is compressed, so two recordings of the same page differ a little everywhere. Only
// *important* differences count: regions where many neighbouring pixels changed, such as a
// changed text, a moved panel or a missing button. They are boxed in red and listed.
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from '@playwright/test';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import type { Moments } from './fixtures.ts';

// The page scripts below run in Chromium; the project's types are Node's, without the DOM.
declare const document: any;

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const RESULTS = join(ROOT, 'test-results');
const BASELINES = join(ROOT, 'tests/demo/frames');
const OUT = join(RESULTS, 'frames');

/** A pixel differs when its colour distance passes this (pixelmatch's YIQ threshold, 0–1). */
const PIXEL_THRESHOLD = 0.2;
/** The grid that groups differing pixels into regions, in CSS pixels. */
const CELL = 8;
/** A cell counts when at least this many of its pixels differ: compression noise is sparse. */
const CELL_PIXELS = 6;
/** A region of touching cells is important when at least this many of its pixels differ. */
const REGION_PIXELS = 40;

export type Region = { x: number; y: number; width: number; height: number; pixels: number };
type Result = {
  file: string; title: string; name: string; seconds?: number;
  status: 'same' | 'different' | 'new' | 'missing-frame' | 'missing-baseline' | 'updated';
  regions: Region[]; changedPixels: number; note?: string;
};

/** Groups the differing pixels of a `width`×`height` mask into important regions, largest first. */
export function importantRegions(mask: Uint8Array, width: number, height: number): Region[] {
  const columns = Math.ceil(width / CELL);
  const rows = Math.ceil(height / CELL);
  const counts = new Uint32Array(columns * rows);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) if (mask[y * width + x]) counts[Math.floor(y / CELL) * columns + Math.floor(x / CELL)]++;
  }
  const seen = new Uint8Array(columns * rows);
  const regions: Region[] = [];
  for (let start = 0; start < counts.length; start++) {
    if (seen[start] || counts[start] < CELL_PIXELS) continue;
    let [left, top, right, bottom, pixels] = [columns, rows, 0, 0, 0];
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const cell = stack.pop()!;
      const [column, row] = [cell % columns, Math.floor(cell / columns)];
      [left, top, right, bottom] = [Math.min(left, column), Math.min(top, row), Math.max(right, column), Math.max(bottom, row)];
      pixels += counts[cell];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const [c, r] = [column + dx, row + dy];
          const next = r * columns + c;
          if (c < 0 || r < 0 || c >= columns || r >= rows || seen[next] || counts[next] < CELL_PIXELS) continue;
          seen[next] = 1;
          stack.push(next);
        }
      }
    }
    if (pixels < REGION_PIXELS) continue;
    const x = left * CELL;
    const y = top * CELL;
    regions.push({ x, y, width: Math.min(width, (right + 1) * CELL) - x, height: Math.min(height, (bottom + 1) * CELL) - y, pixels });
  }
  return regions.sort((a, b) => b.pixels - a.pixels);
}

/** The pixels that differ between two PNG images of the same size, as a 0/1 mask. */
export function differingPixels(baseline: PNG, actual: PNG): Uint8Array {
  const { width, height } = baseline;
  const output = new Uint8Array(width * height * 4);
  pixelmatch(baseline.data, actual.data, output, width, height, { threshold: PIXEL_THRESHOLD, includeAA: false, diffMask: true });
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i++) mask[i] = output[i * 4 + 3] > 0 ? 1 : 0;
  return mask;
}

/** Every `moments.json` under the test results, with the directory of its video. */
function findMoments(directory: string): { directory: string; moments: Moments }[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { recursive: true, encoding: 'utf8' })
    .filter((path) => path.endsWith('moments.json') && !path.startsWith('frames'))
    .sort()
    .map((path) => ({ directory: dirname(join(directory, path)), moments: JSON.parse(readFileSync(join(directory, path), 'utf8')) as Moments }));
}

/** Plays `video` in Chromium and returns the PNG frame at each time, in seconds. */
async function extractFrames(page: Page, video: string, times: number[]): Promise<{ duration: number; frames: Buffer[] }> {
  const { duration, frames } = await page.evaluate(async ({ base64, times }) => {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const element = document.createElement('video');
    element.muted = true;
    element.src = URL.createObjectURL(new Blob([bytes], { type: 'video/webm' }));
    await new Promise((resolve, reject) => {
      element.onloadeddata = resolve;
      element.onerror = () => reject(new Error(`cannot play the video: ${element.error?.message}`));
    });
    const frames: string[] = [];
    for (const time of times) {
      element.currentTime = Math.min(time, element.duration);
      await new Promise((resolve) => element.addEventListener('seeked', resolve, { once: true }));
      const canvas = Object.assign(document.createElement('canvas'), { width: element.videoWidth, height: element.videoHeight });
      canvas.getContext('2d')!.drawImage(element, 0, 0);
      frames.push(canvas.toDataURL('image/png').split(',')[1]);
    }
    return { duration: element.duration, frames };
  }, { base64: readFileSync(video).toString('base64'), times });
  return { duration, frames: frames.map((frame) => Buffer.from(frame, 'base64')) };
}

/** The baseline, the frame, and the frame with the important differences boxed and numbered. */
async function highlight(page: Page, baseline: Buffer, actual: Buffer, regions: Region[], mask: Uint8Array | undefined, title: string) {
  const { width, height } = PNG.sync.read(actual);
  const url = (png: Buffer) => `data:image/png;base64,${png.toString('base64')}`;
  // The changed pixels, red on transparent, drawn over the faded frame.
  let overlay = '';
  if (mask) {
    const png = new PNG({ width, height });
    for (let i = 0; i < mask.length; i++) if (mask[i]) png.data.set([220, 0, 0, 255], i * 4);
    overlay = `<img src="${url(PNG.sync.write(png))}">`;
  }
  const boxes = regions.map((region, index) => `<div class="box" style="left:${region.x}px;top:${region.y}px;width:${region.width}px;height:${region.height}px"><span>${index + 1}</span></div>`).join('');
  await page.setViewportSize({ width: width * 3 + 64, height: height + 80 });
  await page.setContent(`<style>
    body { margin: 0; padding: 16px; background: #222; color: #eee; font: 14px sans-serif; display: inline-block; }
    h1 { font-size: 15px; margin: 0 0 10px; } .row { display: flex; gap: 16px; } figure { margin: 0; }
    figcaption { margin-bottom: 4px; } .frame { position: relative; width: ${width}px; height: ${height}px; }
    .frame img { position: absolute; inset: 0; } .faded img:first-child { opacity: .35; }
    .box { position: absolute; outline: 3px solid #ff2a2a; outline-offset: 2px; }
    .box span { position: absolute; top: -26px; left: -5px; background: #ff2a2a; color: white; font-weight: bold; padding: 1px 6px; }
  </style><h1>${title.replace(/</g, '&lt;')}</h1><div class="row">
    <figure><figcaption>Baseline (tests/demo/frames)</figcaption><div class="frame"><img src="${url(baseline)}"></div></figure>
    <figure><figcaption>This run</figcaption><div class="frame"><img src="${url(actual)}"></div></figure>
    <figure><figcaption>Important differences: ${regions.length}</figcaption><div class="frame faded"><img src="${url(actual)}">${overlay}${boxes}</div></figure>
  </div>`);
  return page.locator('body').screenshot();
}

/** Compares a frame with its baseline; writes the highlighted image when they differ. */
async function compare(page: Page, result: Result, baseline: Buffer, actual: Buffer, diffPath: string) {
  const baselinePng = PNG.sync.read(baseline);
  const actualPng = PNG.sync.read(actual);
  const title = `${result.title} › ${result.name}`;
  if (baselinePng.width !== actualPng.width || baselinePng.height !== actualPng.height) {
    result.status = 'different';
    result.note = `size ${actualPng.width}×${actualPng.height}, baseline ${baselinePng.width}×${baselinePng.height}`;
    result.regions = [{ x: 0, y: 0, width: actualPng.width, height: actualPng.height, pixels: actualPng.width * actualPng.height }];
    return writeFileSync(diffPath, await highlight(page, baseline, actual, result.regions, undefined, title));
  }
  const mask = differingPixels(baselinePng, actualPng);
  result.changedPixels = mask.reduce((sum, pixel) => sum + pixel, 0);
  result.regions = importantRegions(mask, actualPng.width, actualPng.height);
  if (result.regions.length === 0) return;
  result.status = 'different';
  writeFileSync(diffPath, await highlight(page, baseline, actual, result.regions, mask, title));
}

const describe = (region: Region, index: number) => `${index + 1}: ${region.width}×${region.height} at (${region.x}, ${region.y}), ${region.pixels} px`;

async function main() {
  if (process.platform !== 'linux') {
    console.log('Skipped: the demo tests and their frames are Linux-only (tests/demo/fixtures.ts).');
    return;
  }
  const update = process.argv.includes('--update');
  const runs = findMoments(RESULTS);
  if (runs.length === 0) {
    console.error('No moments.json under test-results/: run `npx playwright test` first.');
    process.exit(2);
  }
  rmSync(OUT, { recursive: true, force: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('about:blank');
  const results: Result[] = [];
  const expected = new Set<string>();
  try {
    for (const { directory, moments } of runs) {
      const video = join(directory, 'video.webm');
      const base = { file: moments.file, title: moments.title };
      if (!existsSync(video)) {
        results.push({ ...base, name: '(video)', status: 'missing-frame', regions: [], changedPixels: 0, note: `no video at ${relative(ROOT, video)}` });
        continue;
      }
      const { duration, frames } = await extractFrames(page, video, moments.moments.map((moment) => moment.seconds));
      for (const [index, moment] of moments.moments.entries()) {
        const key = join(moments.file, moment.name);
        expected.add(key);
        const result: Result = { ...base, name: moment.name, seconds: moment.seconds, status: 'same', regions: [], changedPixels: 0 };
        results.push(result);
        const actualPath = join(OUT, key);
        mkdirSync(dirname(actualPath), { recursive: true });
        writeFileSync(actualPath, frames[index]);
        if (moment.seconds > duration) result.note = `at ${moment.seconds.toFixed(2)} s, after the video's end at ${duration.toFixed(2)} s`;
        const baselinePath = join(BASELINES, key);
        const exists = existsSync(baselinePath);
        if (exists) await compare(page, result, readFileSync(baselinePath), frames[index], actualPath.replace(/\.png$/, '-diff.png'));
        else result.status = 'missing-baseline';
        // An update keeps the baselines that still match, so only real changes reach a commit.
        if (update && result.status !== 'same') {
          result.status = exists ? 'updated' : 'new';
          mkdirSync(dirname(baselinePath), { recursive: true });
          copyFileSync(actualPath, baselinePath);
        }
      }
    }
  } finally {
    await browser.close();
  }

  // Baselines no test reaches any more: a key moment that disappeared.
  const stale = existsSync(BASELINES)
    ? readdirSync(BASELINES, { recursive: true, encoding: 'utf8' }).filter((path) => path.endsWith('.png') && !expected.has(path)).sort()
    : [];
  if (update) for (const path of stale) rmSync(join(BASELINES, path));

  const failed = results.filter((result) => !['same', 'updated', 'new'].includes(result.status));
  const markdown = report(results, update ? [] : stale, update);
  writeFileSync(join(OUT, 'report.md'), markdown);
  writeFileSync(join(OUT, 'report.html'), html(results, update ? [] : stale));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
  for (const result of results) {
    const mark = { same: 'PASS', updated: 'UPDATED', new: 'NEW', different: 'DIFF', 'missing-baseline': 'NO BASELINE', 'missing-frame': 'NO FRAME' }[result.status];
    const changed = result.status === 'same' || result.status === 'different' ? `, ${result.changedPixels} px changed` : '';
    console.log(`${mark.padEnd(11)} ${result.file} › ${result.name}${result.note ? ` (${result.note})` : ''}${changed}`);
    result.regions.forEach((region, index) => console.log(`            ${describe(region, index)}`));
  }
  for (const path of stale) console.log(`${update ? 'REMOVED' : 'STALE'}     ${path}: no test has this moment`);
  console.log(`Report: ${relative(ROOT, join(OUT, 'report.html'))}`);
  process.exitCode = failed.length > 0 || (!update && stale.length > 0) ? 1 : 0;
}

function report(results: Result[], stale: string[], update: boolean): string {
  const different = results.filter((result) => result.status !== 'same' && result.status !== 'updated' && result.status !== 'new');
  const lines = [
    '## Demo video key moments',
    '',
    update
      ? `Updated ${results.length} baseline frames in \`tests/demo/frames\`.`
      : different.length === 0 && stale.length === 0
        ? `All ${results.length} key moments match their baselines.`
        : `**${different.length} of ${results.length} key moments differ from their baselines.** The highlighted images are \`test-results/frames/**/*-diff.png\` in the \`demo-videos\` artifact; open \`test-results/frames/report.html\` there.`,
    '',
    '| Test | Moment | Result |',
    '| --- | --- | --- |',
    ...results.map((result) => {
      const status = {
        same: '✅ same', updated: '🔄 updated', new: '🆕 new baseline', 'missing-baseline': '❌ no baseline',
        'missing-frame': '❌ no frame', different: `❌ ${result.regions.length} important ${result.regions.length === 1 ? 'difference' : 'differences'}`,
      }[result.status];
      const details = [result.note, ...result.regions.slice(0, 5).map(describe)].filter(Boolean).join('<br>');
      return `| ${result.title} | \`${result.name}\` | ${status}${details ? `<br>${details}` : ''} |`;
    }),
    ...stale.map((path) => `| — | \`${path}\` | ❌ baseline without a key moment |`),
    '',
  ];
  return lines.join('\n') + '\n';
}

function html(results: Result[], stale: string[]): string {
  const escape = (text: string) => text.replace(/[&<>"]/g, (char) => `&#${char.charCodeAt(0)};`);
  const rows = results.map((result) => {
    const key = join(result.file, result.name);
    const image = result.status === 'different'
      ? `<a href="${escape(key.replace(/\.png$/, '-diff.png'))}"><img src="${escape(key.replace(/\.png$/, '-diff.png'))}"></a>`
      : existsSync(join(OUT, key)) ? `<a href="${escape(key)}"><img class="small" src="${escape(key)}"></a>` : '';
    const regions = result.regions.map((region, index) => `<li>${escape(describe(region, index))}</li>`).join('');
    return `<section class="${result.status}"><h2>${escape(result.title)} › ${escape(result.name)}: ${escape(result.status)}</h2>
      ${result.note ? `<p>${escape(result.note)}</p>` : ''}${regions ? `<ol>${regions}</ol>` : ''}${image}</section>`;
  }).join('\n');
  return `<!doctype html><meta charset="utf-8"><title>Demo video key moments</title>
<style>body { font: 14px sans-serif; margin: 24px; } section { margin-bottom: 28px; } img { max-width: 100%; }
img.small { width: 320px; border: 1px solid #ccc; } .different h2, .missing-baseline h2, .missing-frame h2 { color: #c00; }
h2 { font-size: 16px; }</style>
<h1>Demo video key moments</h1>
${stale.map((path) => `<p class="different">Baseline without a key moment: ${escape(path)}</p>`).join('')}
${rows}`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
