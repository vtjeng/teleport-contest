// Optional rendered QA. No game execution, public API access or installation.
// PLAYWRIGHT_MODULE may name an installed playwright-core entry point;
// CHROMIUM_EXECUTABLE may select the already installed browser binary.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const [url, prefix = '/tmp/dashboard-workflow'] = process.argv.slice(2);
if (!url) throw new Error('Usage: node scripts/dashboard-workflow.browser.mjs <preview-url> [screenshot-prefix]');
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch({ headless: true,
  ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
try {
  for (const [name, width, height] of [['desktop',1440,1100],['android',393,851]]) {
    const page = await browser.newPage({ viewport:{width,height}, isMobile:name==='android', hasTouch:name==='android' });
    const errors=[]; page.on('pageerror',error=>errors.push(error.message));
    await page.route('https://**/*',route=>route.abort());
    await page.goto(url);
    const panel = page.locator('#workflowEvidence');
    await panel.getByRole('heading',{name:'Sessions & handoffs'}).waitFor();
    assert.equal(await panel.locator('.workflow-number').count(),4);
    await panel.getByRole('combobox',{name:'Discovery inventory'}).selectOption('1');
    assert.match(await panel.innerText(),/Scanner keys in scope/);
    assert.match(await panel.innerText(),/No current review/);
    await panel.getByText('Technique versions, filters & coverage',{exact:true}).click();
    assert.match(await panel.innerText(),/missing_message/);
    await panel.getByText('Source freshness & known gaps',{exact:true}).click();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'horizontal page overflow');
    await panel.getByText('Source freshness & known gaps',{exact:true}).click();
    await panel.getByText('Technique versions, filters & coverage',{exact:true}).click();
    await panel.getByRole('combobox',{name:'Discovery inventory'}).selectOption('0');
    await page.evaluate(()=>scrollTo(0,document.querySelector('#workflowEvidence').offsetTop));
    await page.screenshot({path:`${prefix}-${name}.png`});
    await page.evaluate(()=>document.querySelector('#workflowEvidence .workflow-controls').scrollIntoView());
    await page.screenshot({path:`${prefix}-${name}-outcomes.png`});
    assert.deepEqual(errors,[]);
    console.log(`${name}: no page errors or horizontal overflow; inventory selection and disclosures passed`);
    await page.close();
  }
} finally { await browser.close(); }
