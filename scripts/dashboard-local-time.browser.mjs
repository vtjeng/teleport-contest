#!/usr/bin/env node
// Optional browser check; use an existing Playwright/Chromium installation.
// Usage: node scripts/dashboard-local-time.browser.mjs <dashboard-url> [screenshots-directory]
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
const [url, directory] = process.argv.slice(2);
if (!url) throw new Error('Expected a generated dashboard URL');
const {chromium} = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({headless:true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE} : {})});
if (directory) mkdirSync(directory, {recursive:true});
try {
    for (const [zone, date, clock] of [
        ['America/Los_Angeles', '22 Oct 2026', '18:30'],
        ['Asia/Kathmandu', '23 Oct 2026', '07:15'],
        ['Europe/Berlin', '23 Oct 2026', '03:30'],
    ]) {
        const page = await browser.newPage({timezoneId:zone,viewport:{width:1440,height:1100}});
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('https://api.github.com/**', route => route.abort());
        await page.goto(url);
        const result = await page.evaluate(() => ({
            zone:localTime.zone, boundary:localTime.stamp('2026-10-23T01:30:00Z'),
            measured:localTime.stamp(DATA.challenges.publication.measuredThrough),
            candidate:localTime.stamp(syntheticMonitorView.currentCandidate?.evidenceAt),
            baseline:localTime.stamp(TRIAL_DATA.manifest.baseline.start),
            repairs:[...document.querySelectorAll('#recentRepairs time')].map(node => ({
                utc:node.dateTime, text:node.textContent, expected:localTime.stamp(node.dateTime)})),
        }));
        assert.equal(await page.locator('#displayTimezone').innerText(), 'Times in ' + result.zone);
        assert.ok(result.boundary.includes(date) && result.boundary.includes(clock));
        assert.ok((await page.locator('#stats').innerText()).includes(result.measured));
        assert.ok((await page.locator('#trialFreshness').innerText()).includes(result.candidate));
        assert.ok((await page.locator('#trialBaselineWindow').textContent()).includes(result.baseline));
        for (const repair of result.repairs) {
            assert.match(repair.utc, /Z$/);
            assert.equal(repair.text, repair.expected);
        }
        assert.ok((await page.locator('.activity-tick').first().getAttribute('title')).includes('GMT'));
        await page.locator('#activityRangeSummary').click();
        await page.locator('#activityEnding').selectOption('fixed');
        assert.ok((await page.locator('#activityRangeTimezone').innerText()).includes(result.zone));
        const original = await page.locator('#activityWindowLabel').innerText();
        const field = page.locator('#activityEndingAt');
        const value = await field.inputValue();
        const parsed = await page.evaluate(value => localTime.parseInput(value), value);
        assert.ok(original.includes(await page.evaluate(parsed => localTime.stamp(parsed), parsed)));
        if (zone === 'America/Los_Angeles' || zone === 'Europe/Berlin') {
            // Playwright fill itself rejects DST gaps; exercise the native field's
            // input event so the dashboard's own validation is still tested.
            await field.evaluate((node, value) => {
                node.value = value; node.dispatchEvent(new Event('input', {bubbles:true}));
            }, zone === 'America/Los_Angeles' ? '2026-03-08T02:30:00' : '2026-03-29T02:30:00');
            await field.press('Enter');
            assert.match(await page.locator('#activityRangeError').innerText(), /skipped daylight-saving/);
            assert.equal(await page.locator('#activityWindowLabel').innerText(), original);
        }
        await field.press('Escape');
        await page.locator('#scoreHistoryDisclosure > summary').click();
        assert.ok((await page.locator('#developmentChart').getAttribute('aria-label')).includes('GMT'));
        assert.ok((await page.locator('#progressReadoutDate').innerText()).includes('GMT'));
        await page.locator('#scoreHistoryDisclosure > summary').click();
        for (const theme of ['light','dark']) {
            await page.emulateMedia({colorScheme:theme});
            for (const width of [1440,390,320]) {
                await page.setViewportSize({width,height:1100});
                assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), zone + '/' + theme + '/' + width);
                assert.equal(await page.locator('#activityWindowLabel').evaluate(node => node.scrollWidth <= node.clientWidth), true,
                    'both range boundaries remain readable instead of being clipped');
                if (directory && width !== 320) await page.screenshot({path:join(directory, `${zone.replaceAll('/','-')}-${theme}-${width}.png`),fullPage:true});
            }
        }
        assert.deepEqual(errors, []);
        await page.close();
        console.log('PASS ' + zone + ': local summaries, stored UTC, date controls, DST validation, chart labels and light/dark 320–1440px layouts');
    }
} finally {
    await browser.close();
}
