#!/usr/bin/env node
// Compare a legacy inline build and the shell from identical saved inputs.
// Usage: DASHBOARD_PACKET_FIXTURE=<gz> PLAYWRIGHT_CHROMIUM_EXECUTABLE=<browser>
//   node scripts/dashboard-shell.browser.mjs <legacy-url> <shell-url>
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';

const [legacyUrl, shellUrl] = process.argv.slice(2);
const fixture = process.env.DASHBOARD_PACKET_FIXTURE;
if (!legacyUrl || !shellUrl || !fixture) throw new Error('Expected both page URLs and DASHBOARD_PACKET_FIXTURE');
const {chromium} = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({headless:true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE} : {})});
const bytes = readFileSync(fixture);
const ids = ['stats', 'repairCount', 'recentRepairs', 'trialHeadline', 'trialGates',
  'pendingMainWork', 'sessionSummary', 'progressRange', 'activityWindowLabel'];
async function open(url, {fail = false} = {}) {
  const page = await browser.newPage({viewport:{width:390,height:900}});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://api.github.com/**', route => route.abort());
  await page.route('https://raw.githubusercontent.com/vtjeng/teleport-contest/main/dashboard-data.json.gz**',
    route => fail ? route.abort() : route.fulfill({status:200, body:bytes,
      headers:{'access-control-allow-origin':'*'}}));
  await page.goto(url);
  if (fail) await page.waitForFunction(() => document.querySelector('#dashboardDataStatus')
    ?.textContent.includes('unavailable'));
  else {
    await page.waitForFunction(() => document.querySelector('#trialRefreshStatus')
      ?.textContent.includes('last-known'));
    await page.waitForFunction(() => document.querySelectorAll('.activity-bar').length > 0);
  }
  return {page, errors};
}
try {
  const legacy = await open(legacyUrl), shell = await open(shellUrl);
  for (const theme of ['light','dark']) {
    await legacy.page.emulateMedia({colorScheme:theme});
    await shell.page.emulateMedia({colorScheme:theme});
    for (const width of [320,390,900,1440]) {
      for (const item of [legacy,shell]) {
        await item.page.setViewportSize({width,height:900});
        assert.equal(await item.page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false, `${theme} ${width} overflows`);
      }
      const expected = await legacy.page.locator(ids.map(id => `#${id}`).join(',')).allInnerTexts();
      const actual = await shell.page.locator(ids.map(id => `#${id}`).join(',')).allInnerTexts();
      assert.deepEqual(actual, expected, `${theme} ${width} dashboard text differs`);
      assert.equal(await shell.page.locator('.activity-bar').count(),
        await legacy.page.locator('.activity-bar').count());
    }
  }
  assert.deepEqual(legacy.errors, []);
  assert.deepEqual(shell.errors, []);
  const broken = await open(shellUrl, {fail:true});
  assert.match(await broken.page.locator('#dashboardDataStatus').innerText(), /unavailable.*Reload to retry/u);
  assert.equal(await broken.page.locator('#stats .stat').count(), 0);
  await broken.page.close();
  await legacy.page.close(); await shell.page.close();
  console.log('PASS: shell and inline dashboard fields agree at 320–1440px in both themes; failure is explicit.');
} finally {await browser.close();}
