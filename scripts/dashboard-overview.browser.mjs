#!/usr/bin/env node
// Optional real-browser check; uses an existing Playwright/Chromium installation.
// Usage: NODE_PATH=<playwright modules> node scripts/dashboard-overview.browser.mjs <url> [screenshot-directory]
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const [url, directory] = process.argv.slice(2);
if (!url) throw new Error('Expected a generated dashboard URL');
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE} : {})});
if (directory) mkdirSync(directory, {recursive: true});
try {
  const page = await browser.newPage({viewport: {width: 1440, height: 1100}, timezoneId: process.env.DASHBOARD_TIMEZONE});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  if (process.env.DASHBOARD_PACKET_FIXTURE) {
    const bytes = readFileSync(process.env.DASHBOARD_PACKET_FIXTURE);
    await page.route('https://raw.githubusercontent.com/vtjeng/teleport-contest/main/dashboard-data.json.gz**',
      route => route.fulfill({status:200, contentType:'application/octet-stream', body:bytes,
        headers:{'access-control-allow-origin':'*'}}));
  }
  // Deterministic saved-data view, including the explicit refresh-failure state.
  await page.route('https://api.github.com/**', route => route.abort());
  await page.goto(url);
  await page.waitForFunction(() => document.querySelector('#trialRefreshStatus').textContent.includes('last-known'));
  assert.match(await page.locator('#trialCandidate').innerText(), /[a-f0-9]{12}/);
  assert.equal(await page.locator('#trialGates > span').count(), 3);
  assert.equal(await page.locator('#stats > .stat').count(), 2);
  assert.equal(await page.getByText('Freshness and evidence', {exact:true}).count(), 0);
  assert.equal(await page.locator('#activitySnapshotTime, #workerEvidence, #updated').count(), 0);
  assert.match(await page.locator('#stats').innerText(), /98 batches · 2,055 cases/);
  // Compute expectations from the unfiltered register, not the adapter under test.
  const registered = await page.evaluate(() => syntheticMonitorView.results
    .filter(result => ['single-worker','post-trial'].includes(result.repair.window) && result.accepted)
    .sort((a,b) => Date.parse(b.accepted.closureAt) - Date.parse(a.accepted.closureAt))
    .map(result => ({title:result.repair.title, at:result.accepted.closureAt, window:result.repair.window})));
  const expected = registered.slice(0,5).map(result => result.title);
  assert.deepEqual(await page.locator('#recentRepairs a').allTextContents(), expected);
  assert.ok(expected.length > 0);
  assert.match(await page.locator('#repairCount').innerText(), new RegExp('^' + registered.length + ' registered'));
  assert.deepEqual(await page.locator('#recentRepairs time').evaluateAll(nodes => nodes.map(node => node.dateTime)),
    registered.slice(0,5).map(result => result.at), 'latest five retain first-acceptance order');
  const newestPostTrial = registered.find(result => result.window === 'post-trial');
  if (newestPostTrial) {
    const barIndex = await page.locator('.activity-bar').evaluateAll((nodes, title) =>
      nodes.findIndex(node => node.getAttribute('aria-label').includes(title)), newestPostTrial.title);
    assert.ok(barIndex >= 0, 'newest post-trial repair has a real timeline bar');
    await page.locator('.activity-details > summary').click();
    await page.locator('.activity-bar').nth(barIndex).focus();
    await page.locator('.activity-bar').nth(barIndex).press('Enter');
    assert.ok((await page.locator('#timelineReadout').innerText()).includes(newestPostTrial.title));
    await page.locator('.activity-details > summary').click();
  }
  for (const id of ['legacyBacklog', 'sessionDisclosure', 'scoreHistoryDisclosure', 'integrationDisclosure', 'goalHistoryDisclosure'])
    assert.equal(await page.locator('#' + id).evaluate(node => node.open), false, id + ' starts collapsed');
  for (const theme of ['light', 'dark']) {
    await page.emulateMedia({colorScheme: theme});
    for (const width of [1440, 900, 600, 390, 320]) {
      await page.setViewportSize({width, height: 1100});
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), theme + ' fits ' + width);
      assert.ok(await page.locator('#recentRepairs').isVisible());
      if (directory && [1440, 390].includes(width)) await page.screenshot({path: join(directory, `overview-${theme}-${width}.png`), fullPage: true});
    }
    for (const summary of await page.locator('.score-metrics > summary').all()) await summary.click();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'expanded metrics fit 320px');
    for (const summary of await page.locator('.score-metrics > summary').all()) await summary.click();
    // Provenance remains readable and keyboard reachable in either theme.
    await page.locator('.score-provenance > summary').focus();
    await page.keyboard.press('Enter');
    const provenance = page.locator('.score-provenance a').first();
    await provenance.focus();
    assert.equal(await provenance.evaluate(node => getComputedStyle(node).outlineStyle), 'solid');
    assert.equal(await provenance.evaluate(node => getComputedStyle(node).outlineWidth), '2px');
    await page.locator('.score-provenance > summary').click();
  }
  await page.setViewportSize({width: 1440, height: 1100});
  // Reopening hidden canvas content must redraw at its actual dimensions.
  await page.locator('#scoreHistoryDisclosure > summary').click();
  await page.waitForFunction(() => document.getElementById('developmentChart').width > 100);
  assert.ok(await page.locator('#developmentChart').isVisible());
  await page.locator('#progressRangeSummary').click();
  await page.locator('#progressWindow').selectOption('1');
  await page.locator('#progressRangeSummary').click();
  await page.locator('#scoreHistoryDisclosure > summary').click();
  await page.locator('#sessionDisclosure > summary').click();
  assert.ok((await page.locator('#sessionSummary').innerText()).length > 0);
  await page.locator('#sessionShowAll').check();
  await page.locator('#sessionShowAll').uncheck();
  await page.locator('#sessionDisclosure > summary').click();
  await page.locator('#activityRangeSummary').click();
  await page.locator('#activityWindow').selectOption('24');
  await page.locator('#activityRangeSummary').click();
  assert.deepEqual(await page.locator('.activity-label').allTextContents(), ['Standard engineer']);
  await page.locator('.activity-help > summary').click();
  await page.locator('#activityHistorical').check();
  await page.locator('#activityHistorical').uncheck();
  await page.locator('.activity-help > summary').click();
  await page.locator('#trialRefresh').click();
  await page.waitForFunction(() => !document.getElementById('trialRefresh').disabled);
  assert.deepEqual(await page.locator('#recentRepairs a').allTextContents(), expected);
  assert.deepEqual(errors, []);
  console.log('PASS: populated overview, grouped repairs, disclosures, canvas redraw, refresh failure, keyboard focus, light/dark and 320–1440px layouts; no page errors.');
} finally {
  await browser.close();
}
