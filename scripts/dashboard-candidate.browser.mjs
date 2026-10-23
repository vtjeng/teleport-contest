#!/usr/bin/env node
// Optional local generated-page regression. Uses an installed Playwright/browser.
// Usage: node scripts/dashboard-candidate.browser.mjs <dashboard-url>
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const [url] = process.argv.slice(2);
if (!url) throw new Error('Expected generated dashboard URL');
const {chromium} = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({headless:true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE} : {})});
try {
    const page = await browser.newPage({timezoneId:'America/Los_Angeles',viewport:{width:1440,height:1100}});
    const errors = [], calls = [];
    page.on('pageerror', error => errors.push(error.message));
    const now = Date.parse('2026-10-24T08:00:00Z');
    await page.clock.install({time:now});
    let online = false, snapshot;
    const sha = 'b'.repeat(40), source = 'e'.repeat(40);
    const encode = value => ({encoding:'base64',content:Buffer.from(JSON.stringify(value)).toString('base64')});
    await page.route('https://api.github.com/**', async route => {
        const request = route.request().url(); calls.push(request);
        if (!online) return route.abort();
        const body = request.endsWith('/commits/main') ? {sha:source}
            : request.includes('/manifest.json?') ? encode(snapshot.manifest)
                : request.includes('/repairs.json?') ? encode(snapshot.register)
                    : {workflow_runs:[{id:9100,name:'Checkpoint',head_sha:sha,run_attempt:1,event:'push',
                        head_branch:'integration-checkpoint/fixture',status:'queued',conclusion:null,
                        created_at:'2026-10-24T06:01:00Z'}]};
        return route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
    });
    await page.goto(url);
    await page.waitForFunction(() => document.getElementById('trialRefreshStatus').textContent.includes('last-known'));
    const initial = await page.evaluate(() => ({sha:syntheticMonitorView.currentCandidate.sha,
        evidenceAt:syntheticMonitorView.currentCandidate.evidenceAt, values:[...document.querySelectorAll('.stat-value')].map(n=>n.textContent)}));
    assert.notEqual(initial.sha, await page.evaluate(() => TRIAL_DATA.manifest.operations.currentCandidate.sha), 'real stale pointer is ignored');
    assert.match(await page.locator('#trialFreshness').innerText(), /completed.*stale/);
    snapshot = await page.evaluate(() => structuredClone(TRIAL_DATA));
    // An ordinary new candidate record advances selection; the manifest stays untouched.
    const repair = structuredClone(snapshot.register.repairs.find(repair => repair.kind === 'parity-repair'));
    repair.id = 'pending-freshness-fixture'; repair.title = 'Pending candidate regression'; repair.window = 'single-worker';
    repair.candidates = [{sha,committedAt:'2026-10-24T06:00:00Z',runs:[]}];
    snapshot.register.repairs.unshift(repair);
    snapshot.register.asOf = '2026-10-24T08:00:00Z';
    online = true;
    await page.locator('#trialRefresh').click();
    await page.waitForFunction(() => !document.getElementById('trialRefresh').disabled);
    assert.match(await page.locator('#trialCandidate').innerText(), /Pending candidate regression.*bbbbbbbbbbbb/);
    assert.match(await page.locator('#trialFreshness').innerText(), /pending.*stale.*CI checked/);
    assert.match(await page.locator('#trialGates').innerText(), /Checkpoint: queued/);
    assert.ok(calls.filter(request=>request.includes('/contents/')).every(request=>request.endsWith('?ref='+source)));
    assert.deepEqual(await page.locator('.stat-value').allTextContents(), initial.values);
    online = false;
    await page.locator('#trialRefresh').click();
    await page.waitForFunction(() => !document.getElementById('trialRefresh').disabled);
    assert.match(await page.locator('#trialFreshness').innerText(), /pending.*stale.*last-known snapshot/);
    assert.match(await page.locator('#trialCandidate').innerText(), /bbbbbbbbbbbb/);
    for (const theme of ['light','dark']) {
        await page.emulateMedia({colorScheme:theme});
        for (const width of [1440,390,320]) {
            await page.setViewportSize({width,height:1100});
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), theme+'/'+width);
        }
    }
    assert.equal(await page.getByText('Freshness and evidence',{exact:true}).count(), 0);
    assert.deepEqual(errors, []);
    console.log('PASS: real stale pointer, register-only pending recording, pinned refresh, independent candidate age, API failure, stable score values, light/dark/mobile; no page errors.');
} finally {
    await browser.close();
}
