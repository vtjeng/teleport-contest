#!/usr/bin/env node
// Optional browser regression check. Requires Playwright on Node's module path;
// use NODE_PATH=$(npm root -g) when it is installed globally. Never runs in CI's
// ordinary Node suite or installs a browser/dependency as a side effect.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const [url, screenshot] = process.argv.slice(2);
if (!url || process.argv.length > 4) throw new Error('Usage: node scripts/dashboard-activity.browser.mjs <dashboard-url> [screenshot.png]');
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ headless: true });
try {
  // The desktop viewport fits the whole plot, so Playwright scrolling to an
  // offscreen target cannot be mistaken for selection-induced layout motion.
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 }, timezoneId: 'America/Los_Angeles' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  assert.equal((await page.goto(url)).status(), 200);
  const plot = page.locator('#timeline');
  const readout = page.locator('#timelineReadout');
  await plot.evaluate(element => window.scrollTo(0, scrollY + element.getBoundingClientRect().top - 450));
  console.log(await page.locator('#activityMetrics').innerText());
  const first = page.locator('.activity-bar.phase-working').first();
  const frame = await plot.boundingBox(), scroll = await page.evaluate(() => scrollY);
  await first.click();
  const pinned = await readout.innerText();
  await page.locator('.activity-bar').last().hover();
  assert.equal(await readout.innerText(), pinned, 'hover must not replace pinned details');
  assert.equal(await page.evaluate(() => scrollY), scroll, 'selection/hover must preserve scroll');
  assert.deepEqual(await plot.boundingBox(), frame, 'selection must preserve the plot frame');
  await first.focus();
  await first.press('Enter');
  assert.deepEqual(await plot.boundingBox(), frame);
  const range = await page.locator('#activityWindowLabel').innerText();
  await page.locator('#activityWindow').selectOption('24');
  assert.notEqual(await page.locator('#activityWindowLabel').innerText(), range);
  assert.equal(await readout.innerText(), pinned, 'range changes must preserve a deliberate selection');
  const prep = page.locator('.activity-bar.phase-working[aria-label*="Prep"][aria-label*=" · v"]').first();
  if (await prep.count()) {
    await prep.click();
    assert.match(await readout.innerText(), /Synthetic local holdout v\d+/u);
  }
  // Include a narrow phone width: fixed percentage columns must not overflow.
  for (const width of [1440, 900, 600, 390, 320]) {
    await page.setViewportSize({ width, height: 1200 });
    const size = await page.locator('.activity-utilization').evaluate(element => ({
      scroll: element.scrollWidth, client: element.clientWidth,
    }));
    assert.ok(size.scroll <= size.client, JSON.stringify({ width, ...size }));
  }
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.locator('#activityWindow').selectOption('6');
  assert.deepEqual(errors, []);
  if (screenshot) await page.getByRole('heading', { name: 'Worker activity', exact: true }).locator('..').screenshot({ path: screenshot });
  console.log('Activity selection, hover, keyboard, time range, batch labels and responsive percentages passed.');
} finally {
  await browser.close();
}
