#!/usr/bin/env node
// Optional browser regression check. Requires Playwright on Node's module path;
// use NODE_PATH=$(npm root -g) when it is installed globally. Never runs in CI's
// ordinary Node suite or installs a browser/dependency as a side effect.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { escapeJsonForScript } from './build-dashboard.mjs';
import { activityTimeline } from './dashboard-activity.mjs';

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
  assert.equal(await page.getByRole('heading', { name: /^Parked goals/u }).count(), 0,
    'older goal deferrals are hidden from the dashboard');
  const durationChart = page.locator('#integrationDurationChart');
  const pending = page.locator('#pendingMainWork');
  const submittedBatches = await page.evaluate(() => DATA.pendingMainWork?.deliveries
    .filter(row => row.kind === 'challenge-preparation').map(row => row.batch) ?? []);
  if (submittedBatches.length) {
    const summary = await pending.innerText();
    assert.match(summary, /Submitted batches awaiting Main:/u);
    for (const batch of submittedBatches) assert.ok(summary.includes(batch), 'submitted batch is visible without opening Details: ' + batch);
  }
  const reservedRows = page.locator('#challengeTable tbody tr').filter({hasText: 'Not available for assignment.'});
  if (await reservedRows.count()) {
    const row = reservedRows.first(), summary = row.locator('summary').first();
    await row.scrollIntoViewIfNeeded();
    const widths = () => page.locator('#challengeTable thead th').evaluateAll(cells =>
      cells.map(cell => cell.getBoundingClientRect().width));
    const before = await widths();
    await summary.click();
    assert.match(await row.innerText(), /Not available for assignment[\s\S]*Task .*Worker/u);
    assert.deepEqual(await widths(), before, 'ownership details must not shift table columns');
    await summary.focus(); await summary.press('Space');
    assert.ok(await summary.evaluate(element => document.activeElement === element));
    // Scrub from desktop through the existing table/cards transition to phone.
    for (const width of [900, 720, 620, 400]) {
      await page.setViewportSize({width, height: 1000});
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false,
        'ownership labels must not cause horizontal overflow at ' + width);
    }
    const card = page.locator('#challengeCards details').filter({hasText: 'Not available for assignment.'}).first();
    await card.scrollIntoViewIfNeeded(); await card.locator('summary').click();
    assert.match(await card.innerText(), /Task .*Worker/u);
    await card.locator('summary').click();
    await page.setViewportSize({width: 1440, height: 1200});
    console.log('Session ownership: desktop/mobile labels, stable columns and pointer/keyboard details passed.');
  }
  if (screenshot) await pending.locator('..').screenshot({ path: screenshot.replace(/\.png$/u, '-backlog.png') });
  assert.equal(await page.getByRole('heading', { name: 'Worker timeline', exact: true }).count(), 1);
  const durationCharts = [durationChart];
  for (const group of ['implementation', 'preparation']) {
    const chart = durationChart;
    const durationDetails = page.locator('#integrationDurationReadout');
    const visibleCount = await page.evaluate(group => {
      const end = Math.min(Date.parse(DATA.activity.capturedAt),
        Math.max(...DATA.activity.segments.map(segment => Date.parse(segment.end))));
      return mainIntegrationDurations(DATA.activity)[group]
        .filter(point => Date.parse(point.end) >= end - 6 * 3600000 && Date.parse(point.end) <= end).length;
    }, group);
    if (!visibleCount) continue;
    await chart.scrollIntoViewIfNeeded();
    await chart.focus();
    const durationFrame = await chart.boundingBox(), durationScroll = await page.evaluate(() => scrollY);
    await chart.press('End');
    const selectedDuration = await durationDetails.innerText();
    assert.match(selectedDuration, /attempt \d+[\s\S]*Rolling mean/u);
    await chart.hover({ position: { x: 80, y: 60 } });
    assert.equal(await durationDetails.innerText(), selectedDuration, 'hover must preserve a selected duration');
    await chart.press('ArrowLeft');
    if (visibleCount > 1) assert.notEqual(await durationDetails.innerText(), selectedDuration, 'keyboard selection moves to the previous attempt');
    assert.deepEqual(await chart.boundingBox(), durationFrame, 'duration selection must not move or resize the plot');
    assert.equal(await page.evaluate(() => scrollY), durationScroll, 'duration selection must not move the page');
    assert.ok(await chart.evaluate(element => document.activeElement === element));
    await chart.press('Escape');
    const clickPosition = await page.evaluate(group => {
      const end = Math.min(Date.parse(DATA.activity.capturedAt),
        Math.max(...DATA.activity.segments.map(segment => Date.parse(segment.end)))), start = end - 6 * 3600000;
      const points = Object.values(mainIntegrationDurations(DATA.activity)).flat()
        .filter(point => Date.parse(point.end) >= start && Date.parse(point.end) <= end);
      const point = points.filter(point => (DATA.activity.segments[point.sourceIndex].kind === 'challenge-preparation')
        === (group === 'preparation')).at(-1);
      const { width, height } = document.getElementById('integrationDurationChart').getBoundingClientRect();
      const max = Math.max(1, ...points.flatMap(row => [row.durationMs, row.rollingMeanMs]).map(ms => ms / 60000));
      const previous = Object.values(mainIntegrationDurations(DATA.activity)).flatMap(rows => {
        const before = rows.filter(row => Date.parse(row.end) < start).at(-1);
        return before ? [before.rollingMeanMs / 60000] : [];
      });
      const ceilingMax = Math.max(max, ...previous);
      const magnitude = 10 ** Math.floor(Math.log10(ceilingMax / 5));
      const step = [1, 2, 5, 10].map(n => n * magnitude).find(n => n >= ceilingMax / 5);
      // Match the plot padding; height comes from the actual CSS-sized frame.
      return { x: 44 + (Date.parse(point.end) - start) / (end - start) * (width - 56),
        y: height - 28 - point.durationMs / 60000 / (Math.ceil(ceilingMax / step) * step) * (height - 40) };
    }, group);
    await chart.click({ position: clickPosition });
    assert.match(await durationDetails.innerText(), /attempt \d+[\s\S]*Rolling mean/u);
    assert.match(await durationDetails.innerText(), group === 'preparation' ? /Preparation/u : /Implementation/u,
      'clicking either series must select its own task');
    assert.deepEqual(await chart.boundingBox(), durationFrame);
    assert.equal(await page.evaluate(() => scrollY), durationScroll);
    if (screenshot) await chart.locator('..').screenshot({ path: screenshot.replace(/\.png$/u, '-' + group + '-integration.png') });
  }
  console.log('Integration duration: pointer and keyboard selection, pinned hover, stable frame and scroll passed.');
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
    const excludedRows = page.locator('#challengeTable tbody tr')
      .filter({has: page.getByRole('cell', {name: 'Excluded', exact: true})});
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
  // A clipped sliver at the window edge can be narrower than its neighbour's
  // minimum hit target. Exercise a full-size bar, not an arbitrary first node.
  async function widestBar(selector) {
    const bars = page.locator(selector);
    const index = await bars.evaluateAll(elements => elements.map((element, index) =>
      ({index, width: element.getBoundingClientRect().width})).sort((a, b) => b.width - a.width)[0]?.index ?? 0);
    return bars.nth(index);
  }
  const first = await widestBar('.activity-bar.phase-working');
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
  const prep = await widestBar('.activity-bar.phase-working[aria-label*="Prep"][aria-label*=" · v"]');
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
    const frames = await Promise.all(durationCharts.map(chart => chart.boundingBox()));
    for (const hours of ['6', '24', '168']) {
      await page.locator('#activityWindow').selectOption(hours);
      for (let index = 0; index < durationCharts.length; index++) {
        assert.deepEqual(await durationCharts[index].boundingBox(), frames[index],
          'changing the time window must preserve the duration plot frame');
      }
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      'the duration summary and readout must not overflow a narrow viewport');
    if (width === 390 && screenshot) {
      for (const [index, chart] of durationCharts.entries()) await chart.locator('..')
        .screenshot({ path: screenshot.replace(/\.png$/u, '-integration-' + index + '-mobile.png') });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.locator('#activityWindow').selectOption('6');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForFunction(() => {
    const style = getComputedStyle(document.documentElement);
    const fill = document.getElementById('integrationDurationChart').getContext('2d').fillStyle;
    return ['--integration-blue', '--integration-orange', '--ink-secondary']
      .some(key => fill === style.getPropertyValue(key).trim());
  });
  for (const theme of ['dark', 'light']) {
    await page.emulateMedia({ colorScheme: theme });
    const contrast = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      const luminance = color => {
        const values = color.match(/[a-f\d]{2}/giu).map(hex => parseInt(hex, 16) / 255)
          .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
        return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
      };
      const background = luminance(style.getPropertyValue('--surface-card').trim());
      return ['--integration-blue', '--integration-orange'].map(key => {
        const ink = luminance(style.getPropertyValue(key).trim());
        return (Math.max(ink, background) + 0.05) / (Math.min(ink, background) + 0.05);
      });
    });
    // Thin plot marks need at least 3:1 contrast against the actual card.
    assert.ok(contrast.every(value => value >= 3), JSON.stringify({ theme, contrast }));
  }
  await page.emulateMedia({ colorScheme: 'dark' });
  if (screenshot) await durationChart.locator('..').screenshot({ path: screenshot.replace(/\.png$/u, '-integration-dark.png') });
  await page.emulateMedia({ colorScheme: 'light' });
  assert.deepEqual(errors, []);
  if (screenshot) await page.getByRole('heading', { name: 'Worker activity', exact: true }).locator('..').screenshot({ path: screenshot });
  const originalData = await page.evaluate('DATA');
  async function loadData(data) {
    const begin = originalHTML.indexOf('const DATA = '), end = originalHTML.indexOf('\n', begin);
    const html = originalHTML.slice(0, begin) + 'const DATA = ' + escapeJsonForScript(JSON.stringify(data))
      + ';\n' + originalHTML.slice(end + 1);
    await page.unroute(url);
    await page.route(url, route => route.fulfill({contentType: 'text/html', body: html}));
    await page.reload();
  }
  // A shared attempt must remain one Main interval and one duration sample.
  // Four tasks exercise the uncapped group display without running games or CI.
  const groupEnd = originalData.activity.capturedAt;
  const groupStart = new Date(Date.parse(groupEnd) - 5 * 60000).toISOString();
  for (const preparation of [true, false]) {
  const prepGroup = ['Prep-v58', 'Prep-v59', 'Prep-v60', 'Prep-v61'];
  const validationGroup = preparation ? prepGroup : ['A1', 'B1', 'C1', 'A2'];
  const kind = preparation ? 'challenge-preparation' : 'implementation', worker = preparation ? 'Prep' : 'A';
  const groupSegments = validationGroup.map(task => ({task, worker, lane: 'Main',
    kind, phase: 'integrating', integration: 'a'.repeat(40),
    ...(preparation ? {prepGroup} : {validationGroup}), start: groupStart, end: groupEnd}));
  const groupData = {...originalData, activity: {capturedAt: groupEnd, segments: groupSegments,
    events: [], tasks: validationGroup.map((task, index) => ({id: task, label: task, worker, kind,
      ...(preparation ? {batch: `v${58 + index}`} : {}), assignedAt: groupStart, status: 'accepted'}))}};
  await loadData(groupData);
  assert.match(await page.locator(preparation ? '#prepIntegrationDurationSummary' : '#integrationDurationSummary').innerText(), /1 attempt/u);
  const groupBar = page.locator('.activity-bar.phase-integrating').first();
  assert.match(await groupBar.getAttribute('aria-label'), preparation ? /Prep group · 4 tasks/u : /Implementation group · 4 tasks/u);
  const groupFrame = await page.locator('#timeline').boundingBox();
  await groupBar.click();
  assert.match(await page.locator('#timelineReadout').innerText(), /Shared CI run/u);
  for (const task of validationGroup) assert.match(await page.locator('#timelineReadout').innerText(), new RegExp(task));
  assert.deepEqual(await page.locator('#timeline').boundingBox(), groupFrame, 'group selection does not shift the plot');
  await page.unroute(url);
  }
  // Exercise the new Prep rows even before production has emitted probe events.
  const at = minute => new Date(Date.parse(groupEnd) - (10 - minute) * 60000).toISOString();
  const probe = (n, minute, state = 'active', outcome) => ({type: 'prep-probe', task: 'Prep-pilot',
    probe: `v83-probe-${n}`, worker: `Prep-${n}`, source: `fixture.c:target${n}`,
    state, outcome, reason: state === 'blocked' ? 'Waiting for a recorder slot.' : 'Explore C behavior.', at: at(minute)});
  const prepEvents = [
    {type: 'assign', task: 'Prep-pilot', worker: 'Prep', kind: 'challenge-preparation', batch: 'v83', at: at(0)},
    ...['A', 'B', 'C'].flatMap(worker => [
      {type: 'assign', task: worker + '-fixture', worker, at: at(0)},
      {type: 'turn', worker, state: 'idle', reason: 'No independent admitted mismatch.', at: at(1)},
    ]),
    ...Array.from({length: 6}, (_, index) => probe(index + 1, 1)),
    probe(2, 2, 'blocked'), probe(1, 5, 'done', 'failure'), probe(3, 5, 'done', 'match'),
  ];
  await loadData({...originalData, activity: activityTimeline({events: prepEvents}, at(6))});
  assert.match(await page.locator('#activityMetrics').innerText(), /A\/B\/C[\s\S]*Prep lead[\s\S]*Prep lanes[\s\S]*Main/u);
  assert.match(await page.locator('#prepProbeSummary').innerText(), /1 blocked[\s\S]*1 failure[\s\S]*1 match kept outside manifests/u);
  const laneLabels = await page.locator('.activity-label').allTextContents();
  assert.equal(laneLabels.length, 11, 'A/B/C, lead, six explorers and Main remain separate agents');
  for (let n = 1; n <= 6; n++) assert.ok(laneLabels.includes('Prep-' + n));
  const probeBar = page.locator('.activity-bar[aria-label*="v83-probe-1"]').first();
  await probeBar.scrollIntoViewIfNeeded();
  const prepFrame = await plot.boundingBox(), prepScroll = await page.evaluate(() => scrollY);
  await probeBar.click();
  const probeDetails = await readout.innerText();
  assert.match(probeDetails, /Prep task[\s\S]*Prep-pilot[\s\S]*C target[\s\S]*fixture.c:target1[\s\S]*Probe result[\s\S]*failure/u);
  await page.locator('.activity-bar.phase-blocked').first().hover();
  assert.equal(await readout.innerText(), probeDetails);
  assert.deepEqual(await plot.boundingBox(), prepFrame);
  assert.equal(await page.evaluate(() => scrollY), prepScroll);
  await probeBar.focus(); await probeBar.press('Enter');
  assert.deepEqual(await plot.boundingBox(), prepFrame);
  if (screenshot) await page.getByRole('heading', {name: 'Worker activity', exact: true}).locator('..')
    .screenshot({path: screenshot.replace(/\.png$/u, '-prep-lanes.png')});
  for (const width of [1440, 900, 600, 390, 320]) {
    await page.setViewportSize({width, height: 1200});
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      'Prep labels and utilization must not overflow at ' + width);
    const before = await plot.boundingBox();
    await page.locator('#activityWindow').selectOption('24');
    assert.deepEqual(await plot.boundingBox(), before, 'changing range preserves all Prep row positions');
    await page.locator('#activityWindow').selectOption('6');
  }
  console.log('Prep lanes: distinct workers, batch/target/outcome details, pooled utilization, pinned selection and responsive layout passed.');
  await page.setViewportSize({width: 1440, height: 1200});
  await page.unroute(url);
  await page.reload();
  const emptyFrames = await Promise.all(durationCharts.map(chart => chart.boundingBox()));
  // The chart must retain its frame when no duration is measurable, including
  // a real open stage whose snapshot endpoint is not a completion event.
  const capturedAt = originalData.activity.capturedAt;
  const open = { task: 'open', worker: 'C', lane: 'Main', kind: 'implementation', phase: 'integrating',
    start: new Date(Date.parse(capturedAt) - 3600000).toISOString(), end: capturedAt, ongoing: true };
  for (const segments of [[], [open]]) {
    const data = { ...originalData, activity: { capturedAt, segments, tasks: segments.length
      ? [{ id: 'open', label: 'Open C task', worker: 'C', assignedAt: open.start, status: 'integrating' }] : [] } };
    await loadData(data);
    for (const prefix of ['integrationDuration', 'prepIntegrationDuration']) {
      assert.match(await page.locator('#' + prefix + 'Summary').innerText(), /No completed attempts/u);
    }
    assert.deepEqual(await durationChart.boundingBox(), emptyFrames[0],
      'empty/open-only data must retain the plot frame');
  }
  assert.deepEqual(errors, []);
  console.log('Activity selection, hover, keyboard, time range, batch labels and responsive percentages passed.');
} finally {
  await browser.close();
}
