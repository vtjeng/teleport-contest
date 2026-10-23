#!/usr/bin/env node
// Optional real-browser check; uses an existing Playwright/Chromium installation.
// Usage: NODE_PATH=<playwright modules> node scripts/dashboard-overview.browser.mjs <url> [screenshot-directory]
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
const [url, directory] = process.argv.slice(2);
if (!url) throw new Error('Expected a generated dashboard URL');
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE} : {})});
if (directory) mkdirSync(directory, {recursive: true});
try {
  const page = await browser.newPage({viewport: {width: 1440, height: 1100}});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
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
  const expected = await page.evaluate(() => singleWorkerSnapshot.tasks.filter(task => task.publishedAt)
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).slice(0, 5).map(task => task.label));
  assert.deepEqual(await page.locator('#recentRepairs a').allTextContents(), expected);
  assert.ok(expected.length > 0);
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
