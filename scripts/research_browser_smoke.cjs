/* Lightweight browser checks for source exploration; no neural inference. */
const assert = require('node:assert/strict');
const path = require('node:path');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
(async () => {
  const browser = await chromium.launch({channel: 'msedge', headless: true});
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto('http://127.0.0.1:8000/research/');
    await page.waitForFunction(() => document.querySelector('#snapshot-status').textContent.includes('225'));
    assert.equal(await page.locator('#live-search').isChecked(), false);
    await page.locator('#topic-input').fill('asthma');
    await page.locator('#search-button').click();
    await page.waitForSelector('.paper-card');
    assert.ok(await page.locator('.paper-card').count() > 0);
    assert.match(await page.locator('#detail-panel').innerText(), /Source record/);
    const source = await page.locator('#detail-panel a').first().getAttribute('href');
    assert.match(source, /^https:\/\/(europepmc\.org|pmc\.ncbi\.nlm\.nih\.gov)/);
    await page.locator('.paper-card [data-action="save"]').first().click();
    await page.locator('a.nav[data-view="collections"]').click();
    assert.match(await page.locator('#collection-detail').innerText(), /1 saved studies/);
    await page.locator('a.nav[data-view="map"]').click();
    await page.waitForSelector('#graph-svg .graph-edge');
    await page.locator('#graph-list button').first().click();
    assert.match(await page.locator('#edge-detail').innerText(), /Open source record/);
    await page.locator('a.nav[data-view="discover"]').click();
    await page.locator('.paper-card [data-action="compare"]').first().click();
    await page.locator('a.nav[data-view="compare"]').click();
    assert.equal(await page.locator('.compare-study').count(), 1);
    await page.locator('a.nav[data-view="discover"]').click();
    await page.locator('#live-search').check();
    await page.route('**/api/research/search*', route => route.fulfill({status: 502, contentType: 'application/json', body: JSON.stringify({error: 'Source unavailable', fallback_used: false})}));
    await page.locator('#search-button').click();
    await page.waitForFunction(() => document.querySelector('#search-status').textContent.includes('No data fallback'));
    assert.equal(await page.locator('.paper-card').count(), 0);
    await page.locator('#live-search').uncheck();
    await page.locator('#search-button').click();
    await page.waitForSelector('.paper-card');
    await page.screenshot({path: path.join(__dirname, '../work/screenshots/research-discovery.png'), fullPage: true});
    await page.reload();
    await page.locator('a.nav[data-view="collections"]').click();
    assert.match(await page.locator('#collection-detail').innerText(), /1 saved studies/);
    assert.deepEqual(errors, []);
    console.log('Research browser passed: real source snapshot search, evidence links, graph, saved collections/reload, comparison, and explicit source failure. Model inference deferred.');
  } finally { await browser.close(); }
})().catch(error => {console.error(error); process.exitCode = 1;});
