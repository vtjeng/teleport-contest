#!/usr/bin/env node
// Optional browser regression check. Requires Playwright on Node's module path;
// use NODE_PATH=$(npm root -g) when it is installed globally. Never runs in CI's
// ordinary Node suite or installs a browser/dependency as a side effect.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { escapeJsonForScript } from './build-dashboard.mjs';

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
  const response = await page.goto(url);
  assert.equal(response.status(), 200);
  // Large dashboard snapshots can be evicted from Chromium's inspector cache.
  // The request API retains its body for the empty/open-only rendering checks.
  const originalHTML = await (await page.request.get(url)).text();
  const sourceHistory = page.locator('#sourceWorkDisclosure');
  await sourceHistory.locator('summary').first().click();
  if (await page.locator('#sourceWorkTable').count()) {
    const headings = await page.locator('#sourceWorkTable thead').innerText();
    assert.match(headings, /Tasks/iu);
    assert.doesNotMatch(headings, /Verified|Listed|Functions \/ programs/iu);
  }
  await sourceHistory.locator('summary').first().focus();
  await sourceHistory.locator('summary').first().press('Enter');
  assert.equal(await sourceHistory.evaluate(element => element.open), false,
    'source history remains keyboard-accessible without the removed coverage help');
  const parked = page.locator('#remainingWorkDisclosure');
  await parked.locator('summary').first().click();
  const durationChart = page.locator('#integrationDurationChart');
  const durationDetails = page.locator('#integrationDurationReadout');
  await durationChart.scrollIntoViewIfNeeded();
  await durationChart.focus();
  const durationFrame = await durationChart.boundingBox(), durationScroll = await page.evaluate(() => scrollY);
  await durationChart.press('End');
  const selectedDuration = await durationDetails.innerText();
  assert.match(selectedDuration, /attempt \d+[\s\S]*Rolling mean/u);
  await durationChart.hover({ position: { x: 80, y: 60 } });
  assert.equal(await durationDetails.innerText(), selectedDuration, 'hover must preserve a selected duration');
  await durationChart.press('ArrowLeft');
  assert.notEqual(await durationDetails.innerText(), selectedDuration, 'keyboard selection moves to the previous attempt');
  assert.deepEqual(await durationChart.boundingBox(), durationFrame, 'duration selection must not move or resize the plot');
  assert.equal(await page.evaluate(() => scrollY), durationScroll, 'duration selection must not move the page');
  assert.ok(await durationChart.evaluate(element => document.activeElement === element));
  await durationChart.press('Escape');
  const clickPosition = await page.evaluate(() => {
    const end = Date.parse(DATA.activity.capturedAt), start = end - 6 * 3600000;
    const points = mainIntegrationDurations(DATA.activity).filter(point => Date.parse(point.end) >= start && Date.parse(point.end) <= end);
    const point = points.at(-1), width = document.getElementById('integrationDurationChart').getBoundingClientRect().width;
    const max = Math.max(1, ...points.flatMap(row => [row.durationMs, row.rollingMeanMs]).map(ms => ms / 60000));
    const magnitude = 10 ** Math.floor(Math.log10(max / 3));
    const step = [1, 2, 5, 10].map(n => n * magnitude).find(n => n >= max / 3);
    // Match the canvas's documented plot padding and 180 px fixed frame.
    return { x: 44 + (Date.parse(point.end) - start) / (end - start) * (width - 56),
      y: 152 - point.durationMs / 60000 / (Math.ceil(max / step) * step) * 140 };
  });
  await durationChart.click({ position: clickPosition });
  assert.match(await durationDetails.innerText(), /attempt \d+[\s\S]*Rolling mean/u);
  assert.deepEqual(await durationChart.boundingBox(), durationFrame);
  assert.equal(await page.evaluate(() => scrollY), durationScroll);
  if (screenshot) await durationChart.locator('..').screenshot({ path: screenshot.replace(/\.png$/u, '-integration.png') });
  console.log('Integration duration: pointer and keyboard selection, pinned hover, stable frame and scroll passed.');
  assert.doesNotMatch(await parked.innerText(), /Unverified functions|Remaining source work/u);
  await parked.locator('summary').first().click();
  const excludedCases = await page.evaluate(() => challengeCases
    .filter(item => challengeExclusion(item))
    .map(item => ({ name: item.title || item.id, reason: challengeExclusion(item).reason })));
  if (excludedCases.length) {
    const sessionNames = () => page.locator('#challengeTable tbody tr').evaluateAll(rows =>
      rows.map(row => row.cells[0]?.innerText.split('\n')[0]));
    const pending = await sessionNames();
    for (const item of excludedCases) assert.ok(!pending.includes(item.name), item.name);
    const showAll = page.locator('#sessionShowAll');
    await showAll.focus();
    await showAll.press('Space');
    const all = await sessionNames();
    for (const item of excludedCases) assert.ok(all.includes(item.name), item.name);
    const excludedRows = page.locator('#challengeTable tbody tr').filter({ hasText: 'Excluded' });
    assert.equal(await excludedRows.count(), excludedCases.length);
    await excludedRows.first().locator('summary').click();
    assert.ok((await excludedRows.first().innerText()).includes(excludedCases[0].reason));
    await showAll.focus();
    await showAll.press('Space');
    assert.ok(await showAll.evaluate(element => document.activeElement === element));
    assert.equal(await excludedRows.count(), 0);
    console.log('Excluded cases: hidden from pending work, available with raw scores and reasons, keyboard toggle passed.');
  }
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
  // Exercise a recovered historical endpoint when the preview contains one.
  // These rows are history, not bars claiming measured publication work.
  const recovered = await page.evaluate('DATA.activity.tasks.filter(task => task.publicationKnownBy).map(task => task.label).reverse()');
  for (const label of recovered) {
    const bar = page.locator('.activity-bar');
    const index = await bar.evaluateAll((bars, name) => bars.findIndex(element => element.getAttribute('aria-label')?.includes(name)), label);
    if (index < 0) continue;
    await bar.nth(index).click();
    const beforeHistory = await plot.boundingBox(), beforeScroll = await page.evaluate(() => scrollY);
    const publication = readout.getByRole('button', { name: /Publication · duration unknown/u });
    assert.equal(await publication.count(), 1);
    assert.match(await readout.innerText(), /Published by[\s\S]*exact time unknown/u);
    await publication.evaluate(element => element.focus({ preventScroll: true }));
    await publication.press('Enter');
    assert.match(await publication.innerText(), /duration unknown · selected/u);
    assert.deepEqual(await plot.boundingBox(), beforeHistory);
    assert.equal(await page.evaluate(() => scrollY), beforeScroll);
    console.log('Recovered publication: known-by timestamp, unknown duration and stable keyboard selection passed.');
    break;
  }
  // Include a narrow phone width: fixed percentage columns must not overflow.
  for (const width of [1440, 900, 600, 390, 320]) {
    await page.setViewportSize({ width, height: 1200 });
    const size = await page.locator('.activity-utilization').evaluate(element => ({
      scroll: element.scrollWidth, client: element.clientWidth,
    }));
    assert.ok(size.scroll <= size.client, JSON.stringify({ width, ...size }));
    const frame = await durationChart.boundingBox();
    for (const hours of ['6', '24', '168']) {
      await page.locator('#activityWindow').selectOption(hours);
      assert.deepEqual(await durationChart.boundingBox(), frame,
        'changing the time window must preserve the duration plot frame');
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      'the duration summary and readout must not overflow a narrow viewport');
    if (width === 390 && screenshot) await durationChart.locator('..').screenshot({ path: screenshot.replace(/\.png$/u, '-integration-mobile.png') });
  }
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.locator('#activityWindow').selectOption('6');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForFunction(() => document.getElementById('integrationDurationChart').getContext('2d').fillStyle
    === getComputedStyle(document.documentElement).getPropertyValue('--goal-divergence').trim());
  if (screenshot) await durationChart.locator('..').screenshot({ path: screenshot.replace(/\.png$/u, '-integration-dark.png') });
  await page.emulateMedia({ colorScheme: 'light' });
  assert.deepEqual(errors, []);
  if (screenshot) await page.getByRole('heading', { name: 'Worker activity', exact: true }).locator('..').screenshot({ path: screenshot });
  const originalData = await page.evaluate('DATA');
  const emptyFrame = await durationChart.boundingBox();
  // The chart must retain its frame when no duration is measurable, including
  // a real open stage whose snapshot endpoint is not a completion event.
  const capturedAt = originalData.activity.capturedAt;
  const open = { task: 'open', worker: 'C', lane: 'Main', kind: 'implementation', phase: 'integrating',
    start: new Date(Date.parse(capturedAt) - 3600000).toISOString(), end: capturedAt, ongoing: true };
  for (const segments of [[], [open]]) {
    const data = { ...originalData, activity: { capturedAt, segments, tasks: segments.length
      ? [{ id: 'open', label: 'Open C task', worker: 'C', assignedAt: open.start, status: 'integrating' }] : [] } };
    const begin = originalHTML.indexOf('const DATA = '), end = originalHTML.indexOf('\n', begin);
    const html = originalHTML.slice(0, begin) + 'const DATA = ' + escapeJsonForScript(JSON.stringify(data))
      + ';\n' + originalHTML.slice(end + 1);
    await page.route(url, route => route.fulfill({ contentType: 'text/html', body: html }));
    await page.reload();
    assert.match(await page.locator('#integrationDurationSummary').innerText(), /No completed attempts/u);
    assert.deepEqual(await durationChart.boundingBox(), emptyFrame, 'empty/open-only data must retain the plot frame');
  }
  assert.deepEqual(errors, []);
  console.log('Activity selection, hover, keyboard, time range, batch labels and responsive percentages passed.');
} finally {
  await browser.close();
}
