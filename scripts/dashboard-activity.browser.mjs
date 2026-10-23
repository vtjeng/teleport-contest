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
const browser = await chromium.launch({ headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE} : {}) });
try {
  // The desktop viewport fits the whole plot, so Playwright scrolling to an
  // offscreen target cannot be mistaken for selection-induced layout motion.
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 }, timezoneId: 'America/Los_Angeles' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const response = await page.goto(url);
  assert.equal(response.status(), 200);
  const openTime = async prefix => {
    const picker=page.locator('#'+prefix+'RangePicker');
    if(!(await picker.evaluate(element=>element.open)))await page.locator('#'+prefix+'RangeSummary').click();
  };
  const selectTime = async (id,value) => {
    await openTime(id.startsWith('activity')?'activity':'progress');
    await page.locator('#'+id).selectOption(value);
  };
  const defaultActivityRange = await page.locator('#activityWindowLabel').innerText();
  assert.equal(await page.locator('#activityWindow').inputValue(), '6');
  assert.equal(await page.locator('#activityHistorical').isChecked(), false);
  const legacyLabels = /^(?:A|A2|B|C|P[1-6])$/;
  assert.ok((await page.locator('#timeline .activity-label').allTextContents()).every(label => !legacyLabels.test(label)));
  assert.equal(await page.evaluate(() => sessionStorage.getItem('activityWindow')), null);
  await page.locator('#activityHistorical').check();
  const historicalLabels = await page.locator('#timeline .activity-label').allTextContents();
  const hasLegacy = await page.evaluate(() => DATA.activity.segments.some(row => /^(?:A|A2|B|C|P[1-6]|Prep-[1-6])$/.test(row.lane)));
  if (hasLegacy) assert.ok(historicalLabels.some(label => legacyLabels.test(label)), 'toggle reveals historical lanes');
  await page.locator('#activityHistorical').uncheck();
  assert.ok((await page.locator('#timeline .activity-label').allTextContents()).every(label => !legacyLabels.test(label)));
  await page.locator('#activityHistorical').check();
  // Large dashboard snapshots can be evicted from Chromium's inspector cache.
  // The request API retains its body for the empty/open-only rendering checks.
  const originalHTML = await (await page.request.get(url)).text();
  // Each chart keeps Duration independent from its ending time. Exercise the
  // real native controls in a non-UTC browser, including keyboard submission.
  for (const [prefix,other,initial,next] of [['activity','progress','6','24'],['progress','activity','7','1']]) {
    const rangeLabel = '#' + prefix + (prefix === 'activity' ? 'WindowLabel' : 'Range');
    const otherLabel = '#' + other + (other === 'activity' ? 'WindowLabel' : 'Range');
    const untouched = await page.locator(otherLabel).innerText();
    const latest = await page.evaluate(prefix => prefix === 'activity'
      ? Math.max(...DATA.activity.segments.map(row => Date.parse(row.end)))
      : Math.max(...DATA.scoreHistory.flatMap(row => row.points.map(point => Date.parse(point.utc)))),prefix);
    const local = await page.evaluate(time => {
      const d=new Date(time),p=n=>String(n).padStart(2,'0');
      return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'T'+p(d.getHours())+':'+p(d.getMinutes())+':'+p(d.getSeconds());
    },latest-2*86400000);
    await selectTime(prefix+'Ending','fixed');
    await page.locator('#'+prefix+'EndingAt').fill(local);
    await page.locator('#'+prefix+'EndingAt').press('Enter');
    assert.equal(await page.locator('#'+prefix+'Window').inputValue(),initial);
    const fixed = await page.locator('#'+prefix+'EndingAt').inputValue();
    await selectTime(prefix+'Window',next);
    assert.equal(await page.locator('#'+prefix+'EndingAt').inputValue(),fixed,'duration change keeps fixed endpoint');
    assert.equal(await page.locator('#'+prefix+'Ending').inputValue(),'fixed');
    assert.equal(await page.locator(otherLabel).innerText(),untouched,'other chart state is independent');
    const before=await page.locator(rangeLabel).innerText();
    await selectTime(prefix+'Window','custom');
    await page.locator('#'+prefix+'DurationCustom').fill('0');
    await page.locator('#'+prefix+'DurationCustom').press('Enter');
    assert.match(await page.locator('#'+prefix+'RangeError').innerText(),/positive/);
    assert.equal(await page.locator(rangeLabel).innerText(),before,'invalid draft keeps applied bounds');
    await page.locator('#'+prefix+'DurationCustom').fill('90');
    await selectTime(prefix+'DurationUnit','60000');
    await page.locator('#'+prefix+'DurationCustom').press('Enter');
    assert.equal(await page.locator('#'+prefix+'RangeError').innerText(),'');
    assert.equal(await page.locator('#'+prefix+'Window').inputValue(),'custom');
    await selectTime(prefix+'Ending','now');
    assert.equal(await page.locator('#'+prefix+'Ending').inputValue(),'now');
    assert.match(await page.locator('#'+prefix+'RangeAsOf').innerText(),/Latest available/);
    assert.match(await page.locator('#'+prefix+'RangeTimezone').innerText(),/America\/Los_Angeles/);
    await selectTime(prefix+'Window',initial);
  }
  for (const prefix of ['activity','progress']) {
    await selectTime(prefix+'Window','custom');
    await page.locator('#'+prefix+'DurationCustom').fill('90');
    await selectTime(prefix+'DurationUnit','60000');
    await selectTime(prefix+'Ending','fixed');
    await page.locator('#'+prefix+'RangeForm button').click();
    assert.equal(await page.locator('#'+prefix+'Window').inputValue(),'custom');
    assert.equal(await page.locator('#'+prefix+'Ending').inputValue(),'fixed');
  }
  for (const width of [390,320]) {
    await page.setViewportSize({width,height:1200});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),
      'expanded Fixed+Custom selectors wrap at '+width);
    for (const prefix of ['activity','progress']) {
      await openTime(prefix);
      const input=page.locator('#'+prefix+'DurationCustom');
      await input.focus();await input.press('Enter');
      assert.equal(await page.locator('#'+prefix+'RangeSummary').evaluate(element=>document.activeElement===element),true,'Apply returns focus to visible selector');
    }
  }
  await openTime('progress');
  if(screenshot)await page.locator('#progressRangeForm').screenshot({path:screenshot.replace(/\.png$/u,'-selector-mobile.png')});
  await page.locator('#progressDurationCustom').focus();await page.locator('#progressDurationCustom').press('Escape');
  assert.equal(await page.locator('#progressRangePicker').evaluate(element=>element.open),false);
  assert.equal(await page.locator('#progressRangeSummary').evaluate(element=>document.activeElement===element),true);
  await page.setViewportSize({width:1440,height:1200});
  await page.reload();
  await page.locator('#activityHistorical').check();
  assert.equal(await page.locator('#sourceWorkDisclosure').count(), 0);
  assert.equal(await page.locator('#integrationDisclosure').evaluate(element => element.open), true);
  assert.equal(await page.locator('#goalHistoryDisclosure').evaluate(element => element.open), false);
  assert.equal(await page.locator('#parkedTaskHistory').evaluate(element => element.open), false);
  assert.equal(await page.locator('#activityZoomIn, #activityZoomOut, #activityLatest').count(), 0);
  // All section disclosures share one glyph and native keyboard behavior.
  const disclosureStyles = [];
  for (const id of ['integrationDisclosure', 'parkedTaskHistory', 'goalHistoryDisclosure']) {
    const disclosure = page.locator('#' + id), heading = disclosure.locator(':scope > summary');
    if (!(await disclosure.isVisible())) continue;
    if (await disclosure.evaluate(element => element.open)) {
      await heading.focus(); await heading.press('Enter');
    }
    disclosureStyles.push(await heading.evaluate(element => {
      const style = getComputedStyle(element, '::before');
      return [style.width, style.height, style.clipPath, style.transform, getComputedStyle(element).font];
    }));
    await heading.focus(); await heading.press('Enter');
    assert.equal(await disclosure.evaluate(element => element.open), true);
    assert.notEqual(await heading.evaluate(element => getComputedStyle(element, '::before').transform), 'none');
    await heading.click();
    assert.equal(await disclosure.evaluate(element => element.open), false);
  }
  for (const style of disclosureStyles.slice(1)) assert.deepEqual(disclosureStyles[0], style);
  await page.locator('#integrationDisclosure > summary').click();
  // Start with the full domain, resize each edge, then drag the resulting
  // window. Both overviews must advertise exactly the operation they perform.
  for (const [id, preset, label, leftPad, rightPad] of [
    ['progressMinimap', 'progressWindow', 'progressRange', 52, 16],
    ['activityMinimap', 'activityWindow', 'activityWindowLabel', 8, 8],
  ]) {
    const overview = page.locator('#' + id);
    await selectTime(preset,'all');
    await overview.scrollIntoViewIfNeeded();
    const box = await overview.boundingBox(), y = box.y + (box.height - 20) / 2;
    const left = box.x + leftPad, right = box.x + box.width - rightPad;
    const span = right - left;
    const cursor = () => overview.evaluate(element => getComputedStyle(element).cursor);
    const before = await page.locator('#' + label).innerText();
    await page.mouse.move(left, y);
    assert.equal(await cursor(), 'ew-resize');
    await page.mouse.down(); await page.mouse.move(left + span / 4, y, {steps: 10});
    assert.equal(await cursor(), 'ew-resize'); await page.mouse.up();
    assert.notEqual(await page.locator('#' + label).innerText(), before);
    await page.mouse.move(right, y); assert.equal(await cursor(), 'ew-resize');
    await page.mouse.down(); await page.mouse.move(right - span / 4, y, {steps: 10}); await page.mouse.up();
    await page.mouse.move(left + span / 2, y); assert.equal(await cursor(), 'grab');
    const resized = await page.locator('#' + label).innerText();
    await page.mouse.down(); assert.equal(await cursor(), 'grabbing');
    await page.mouse.move(left + span * 0.6, y, {steps: 10}); await page.mouse.up();
    assert.equal(await cursor(), 'grab');
    assert.notEqual(await page.locator('#' + label).innerText(), resized);
    await selectTime(preset,id === 'progressMinimap' ? '7' : '6');
    await overview.focus(); await overview.press('End');
  }
  await page.locator('#goalHistoryDisclosure > summary').focus();
  await page.locator('#goalHistoryDisclosure > summary').press('Enter');
  assert.equal(await page.locator('#goalTable thead').getByText('Worker', {exact: true}).count(), 0);
  const member = page.locator('#goalTable .goal-member').first();
  const summary = member.locator('summary');
  const initialRow = await member.boundingBox();
  assert.ok(initialRow.height <= 30, 'collapsed goal is a single line');
  await summary.focus(); await summary.press('Enter');
  assert.match(await member.innerText(), /Worker/u);
  assert.ok((await member.boundingBox()).height > initialRow.height);
  await summary.press('Enter');
  assert.equal((await member.boundingBox()).height, initialRow.height);
  assert.ok((await summary.boundingBox()).x > (await page.locator('#goalTable .integration-group').first().boundingBox()).x + 10,
    'goals are indented beneath their integration');
  assert.equal(await page.locator('#activitySnapshotTime, #workerEvidence, #updated').count(), 0);
  assert.equal(await page.locator('.history-view-controls #historyBatchPicker').count(), 1);
  assert.match(await page.locator('.integration-legend').innerText(), /Over 30 min/u);
  assert.equal(await page.locator('#integrationDurationSummary strong').count(), 1);
  const sharedGroups = await page.evaluate(() => (DATA.goalHistory || []).filter(group => group.goals.length > 1 && group.synthetic));
  for (const group of sharedGroups.slice(-3)) {
    const section = page.locator('#goalTable tbody').filter({hasText: group.commit.slice(0, 8)});
    assert.equal(await section.locator('.integration-group').count(), 1);
    assert.equal(await section.locator('tr:not(.integration-group)').count(), group.goals.length);
    assert.ok((await section.locator('.integration-group').innerText()).includes('shared result'));
    for (const value of await section.locator('tr.goal-member td:last-child').allTextContents()) assert.equal(value, '');
  }
  await page.locator('#goalHistoryDisclosure > summary').press('Enter');
  assert.equal(await page.getByRole('heading', { name: /^Parked goals/u }).count(), 0,
    'older goal deferrals are hidden from the dashboard');
  const durationChart = page.locator('#integrationDurationChart');
  const pending = page.locator('#pendingMainWork');
  const submittedBatches = await page.evaluate(() => DATA.pendingMainWork?.deliveries
    .filter(row => row.kind === 'challenge-preparation').map(row => row.batch) ?? []);
  if (submittedBatches.length) {
    const summary = await pending.innerText();
    assert.match(summary, /Ready to integrate|Checks running|Ready to accept|Waiting for dependencies|Needs worker correction/u);
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
  assert.ok((await page.locator('#timeline').boundingBox()).y < (await page.locator('#integrationDisclosure').boundingBox()).y);
  const durationCharts = [durationChart];
  for (const group of ['implementation', 'preparation']) {
    const chart = durationChart;
    const durationDetails = page.locator('#integrationDurationReadout');
    const visibleCount = await page.evaluate(group => {
      const end = Math.min(Date.parse(DATA.activity.capturedAt),
        Math.max(...DATA.activity.segments.map(segment => Date.parse(segment.end))));
      return integrationDurations(DATA.activity)[group]
        .filter(point => Date.parse(point.end) >= end - 6 * 3600000 && Date.parse(point.end) <= end).length;
    }, group);
    if (!visibleCount) continue;
    await chart.scrollIntoViewIfNeeded();
    await chart.focus();
    const durationFrame = await chart.boundingBox(), durationScroll = await page.evaluate(() => scrollY);
    await chart.press('End');
    const selectedDuration = await durationDetails.innerText();
    assert.match(selectedDuration, /attempt \d+[\s\S]*Rolling median/u);
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
      const points = Object.values(integrationDurations(DATA.activity)).flat()
        .filter(point => Date.parse(point.end) >= start && Date.parse(point.end) <= end);
      const point = points.filter(point => (DATA.activity.segments[point.sourceIndex].kind === 'challenge-preparation')
        === (group === 'preparation')).at(-1);
      const { width, height } = document.getElementById('integrationDurationChart').getBoundingClientRect();
      // Match the plot padding; height comes from the actual CSS-sized frame.
      return { x: 44 + (Date.parse(point.end) - start) / (end - start) * (width - 56),
        y: height - 28 - Math.min(point.durationMs / 60000, 30) / 30 * (height - 40) };
    }, group);
    await chart.click({ position: clickPosition });
    assert.match(await durationDetails.innerText(), /attempt \d+[\s\S]*Rolling median/u);
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
  await selectTime('activityWindow','24');
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
    // Recovered intervals can overlap a later stage; keyboard selection reaches
    // the historical interval without relying on which bar covers its pixels.
    await bar.nth(index).focus();
    await bar.nth(index).press('Enter');
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
      await selectTime('activityWindow',hours);
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
  await selectTime('activityWindow','6');
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
  // The same range drives utilization, timing and the timeline. Arbitrary
  // zoom, dragged boundaries and All must preserve a deliberately pinned task.
  await selectTime('activityWindow','6');
  await page.locator('#timeline').focus(); await page.locator('#timeline').press('End');
  const rangeBeforeZoom = await page.locator('#activityWindowLabel').innerText();
  const pinnedBeforeZoom = await page.locator('#timelineReadout').innerText();
  await page.locator('#timeline').press('+');
  assert.notEqual(await page.locator('#activityWindowLabel').innerText(), rangeBeforeZoom);
  assert.equal(await page.locator('#activityWindow').inputValue(), 'custom');
  assert.equal(await page.locator('#timelineReadout').innerText(), pinnedBeforeZoom);
  await selectTime('activityWindow','all');
  const allRange = await page.locator('#activityWindowLabel').innerText();
  const navigator = page.locator('#activityMinimap');
  await navigator.scrollIntoViewIfNeeded();
  const mini = await navigator.boundingBox();
  await page.mouse.move(mini.x + 8, mini.y + 30);
  await page.mouse.down(); await page.mouse.move(mini.x + mini.width / 3, mini.y + 30, {steps: 10}); await page.mouse.up();
  assert.notEqual(await page.locator('#activityWindowLabel').innerText(), allRange);
  assert.equal(await page.locator('#activityWindow').inputValue(), 'custom');
  const draggedRange = await page.locator('#activityWindowLabel').innerText();
  await page.reload();
  await page.locator('#activityHistorical').check();
  assert.equal(await page.locator('#activityWindowLabel').innerText(), defaultActivityRange, 'reload opens the latest default range');
  assert.equal(await page.locator('#activityWindow').inputValue(), '6');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('activityWindow')), null, 'pan and range changes do not persist a worker window');
  await navigator.focus(); await navigator.press('+');
  assert.notEqual(await page.locator('#activityWindowLabel').innerText(), draggedRange);
  await selectTime('activityWindow','168');
  await page.locator('#timeline').focus(); await page.locator('#timeline').press('End');
  const overflow = await page.locator('#integrationOverflow').innerText();
  await page.locator('#integrationFullRange').focus();
  const scaleFrame = await durationChart.boundingBox();
  const scaleControls = page.locator('.integration-scale .history-controls');
  const scaleButtonFrames = await scaleControls.locator('button').evaluateAll(elements => elements.map(element => {
    const {x, y, width, height} = element.getBoundingClientRect(); return {x, y, width, height};
  }));
  if (/above 30 min/u.test(overflow)) {
    await page.locator('#integrationFullRange').focus(); await page.locator('#integrationFullRange').press('Enter');
    assert.equal(await page.locator('#integrationFullRange').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#integrationTypicalRange').getAttribute('aria-pressed'), 'false');
    assert.deepEqual(await durationChart.boundingBox(), scaleFrame, 'changing the scale keeps a stable plot');
    assert.deepEqual(await scaleControls.locator('button').evaluateAll(elements => elements.map(element => {
      const {x, y, width, height} = element.getBoundingClientRect(); return {x, y, width, height};
    })), scaleButtonFrames, 'scale buttons do not move when selection changes');
    await page.locator('#integrationTypicalRange').click();
    assert.equal(await page.locator('#integrationOverflow').innerText(), overflow);
  }
  console.log('Readability: grouped credit, collapsed history, arbitrary zoom, draggable range, reload reset and full duration scale passed.');
  const originalData = await page.evaluate('DATA');
  // Populate the queue with independent actions without altering the saved
  // snapshot: one ready task, one dependency wait and one accepted batch.
  const knownGoal = originalData.goalHistory.flatMap(group => group.goals)[0];
  const knownTitle = knownGoal.summary.replace(/^Implement (\w+) from \S+$/u, 'Implement $1');
  const queueRow = {worker: 'B', since: originalData.activity.capturedAt, delivery: 'b'.repeat(40), blockedBy: []};
  const queuedData = {...originalData, pendingMainWork: {
    deliveries: [{...queueRow, task: 'queue-ready', goal: knownGoal.id, kind: 'implementation', status: 'ready'},
      {...queueRow, task: 'queue-wait', kind: 'challenge-preparation', batch: 'v999', status: 'ready', blockedBy: ['queue-ready']}],
    preparedBatches: [{...queueRow, task: 'queue-admit', kind: 'challenge-preparation', batch: 'v998', status: 'awaiting-admission'}],
    parkedTasks: originalData.pendingMainWork.parkedTasks,
  }};
  const queueBegin = originalHTML.indexOf('const DATA = '), queueEnd = originalHTML.indexOf('\n', queueBegin);
  const queuedHTML = originalHTML.slice(0, queueBegin) + 'const DATA = ' + escapeJsonForScript(JSON.stringify(queuedData))
    + ';\n' + originalHTML.slice(queueEnd + 1);
  await page.route(url, route => route.fulfill({contentType: 'text/html', body: queuedHTML}));
  await page.reload();
  await page.locator('#activityHistorical').check();
  assert.match(await pending.innerText(), /Ready to integrate · 1/u);
  assert.match(await pending.innerText(), /Batches to admit · 1/u);
  assert.match(await pending.innerText(), /Waiting for dependencies · 1/u);
  assert.match(await pending.innerText(), /Awaiting integration: 1 implementation task · 1 challenge batch/u);
  assert.ok((await pending.innerText()).includes(knownTitle));
  const waiting = pending.locator('.main-work-item').filter({hasText: 'Challenge batch v999'});
  await waiting.locator('summary').focus(); await waiting.locator('summary').press('Enter');
  assert.ok((await waiting.innerText()).includes('Waiting on ' + knownTitle));
  await waiting.locator('summary').press('Enter');
  for (const width of [1440, 900, 600, 390, 320]) {
    await page.setViewportSize({width, height: 1200});
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'action queue fits ' + width);
  }
  if (screenshot) await pending.locator('..').screenshot({path: screenshot.replace(/\.png$/u, '-queue-mobile.png')});
  await page.unroute(url);
  await page.setViewportSize({width: 1440, height: 1200});
  console.log('Work lead backlog: readable titles, separate actions, keyboard dependency details and narrow layouts passed.');
  async function loadData(data) {
    const begin = originalHTML.indexOf('const DATA = '), end = originalHTML.indexOf('\n', begin);
    const html = originalHTML.slice(0, begin) + 'const DATA = ' + escapeJsonForScript(JSON.stringify(data))
      + ';\n' + originalHTML.slice(end + 1);
    await page.unroute(url);
    await page.route(url, route => route.fulfill({contentType: 'text/html', body: html}));
    await page.reload();
  await page.locator('#activityHistorical').check();
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
  assert.match(await groupBar.getAttribute('aria-label'), preparation ? /Challenge group · 4 tasks/u : /Implementation group · 4 tasks/u);
  await groupBar.scrollIntoViewIfNeeded();
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
  assert.match(await page.locator('#activityMetrics').innerText(), /A\/B\/C[\s\S]*Challenge lead[\s\S]*Prep lanes[\s\S]*Work lead/u);
  assert.equal(await page.locator('#prepProbeSummary').count(), 0);
  const laneLabels = await page.locator('.activity-label').allTextContents();
  assert.equal(laneLabels.length, 11, 'A/B/C, lead, six explorers and Main remain separate agents');
  for (let n = 1; n <= 6; n++) assert.ok(laneLabels.includes('P' + n));
  const probeBar = page.locator('.activity-bar[aria-label*="v83-probe-1"]').first();
  await probeBar.scrollIntoViewIfNeeded();
  await plot.scrollIntoViewIfNeeded(); // Keep every later hover target inside the viewport.
  const prepFrame = await plot.boundingBox(), prepScroll = await page.evaluate(() => scrollY);
  await probeBar.click();
  const probeDetails = await readout.innerText();
  assert.match(probeDetails, /Batch task[\s\S]*Prep-pilot[\s\S]*C target[\s\S]*fixture.c:target1[\s\S]*Probe result[\s\S]*failure/u);
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
    await selectTime('activityWindow','24');
    assert.deepEqual(await plot.boundingBox(), before, 'changing range preserves all Prep row positions');
    await selectTime('activityWindow','6');
  }
  console.log('Prep lanes: distinct workers, batch/target/outcome details, pooled utilization, pinned selection and responsive layout passed.');
  await page.setViewportSize({width: 1440, height: 1200});
  await page.unroute(url);
  await page.reload();
  await page.locator('#activityHistorical').check();
  // Replacing the entire dataset changes the number of worker rows above
  // this disclosure. Compare the chart's frame within its own section.
  const sectionFrame = chart => chart.evaluate(element => {
    const {x, y, width, height} = element.getBoundingClientRect();
    return {x, y: y - element.closest('details').getBoundingClientRect().y, width, height};
  });
  const emptyFrames = await Promise.all(durationCharts.map(sectionFrame));
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
    assert.deepEqual(await sectionFrame(durationChart), emptyFrames[0],
      'empty/open-only data must retain the plot frame within its section');
  }
  assert.deepEqual(errors, []);
  console.log('Activity selection, hover, keyboard, time range, batch labels and responsive percentages passed.');
} finally {
  await browser.close();
}
