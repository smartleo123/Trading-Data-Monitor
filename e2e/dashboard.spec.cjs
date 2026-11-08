const { test, expect } = require('@playwright/test');

// Mock provider boundaries, not the application's own JS/CSS. Charts are verified
// for DOM initialization; an opt-in live smoke check is separate from CI.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('groq_api_key', 'playwright-fixture-not-a-secret');
  });
  await page.route('**/fapi.binance.com/**', route => {
    const url = new URL(route.request().url());
    const symbol = url.searchParams.get('symbol') || 'BTCUSDT';
    const quote = url.pathname.endsWith('/premiumIndex')
      ? { symbol, lastFundingRate: '0.0001' }
      : { symbol, lastPrice: '100000', priceChangePercent: '1.25', highPrice: '101000', lowPrice: '99000' };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(quote) });
  });
  await page.route('**/api.coingecko.com/**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify(route.request().url().includes('/coins/markets')
      ? [{ id: 'bitcoin', name: 'Bitcoin', symbol: 'btc', current_price: 100000, price_change_percentage_24h: 1, total_volume: 300000, market_cap: 100000000, image: 'https://example.invalid/btc.png', sparkline_in_7d: { price: [1, 2, 3] } }]
      : { companies: [] })
  }));
  await page.route('**/api.groq.com/**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ choices: [{ message: { content: 'Playwright 測試回覆' } }] })
  }));
  await page.route('**/s3.tradingview.com/external-embedding/*.js', route => route.fulfill({
    status: 200, contentType: 'text/javascript',
    body: `(() => {
      const target = document.currentScript.parentElement;
      const frame = document.createElement('iframe');
      frame.title = 'TradingView chart fixture';
      frame.srcdoc = '<html><body>Chart loaded</body></html>';
      frame.style.width = '100%';
      frame.style.height = '100%';
      target.appendChild(frame);
    })();`
  }));
  // Images are documented, embeddable external assets. Mock them to verify
  // browser image decoding and in-panel presentation without provider uptime.
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGMUCaj4z8DAwMDEAAUAG4QB37TLi2wAAAAASUVORK5CYII=', 'base64');
  await page.route('**/www.tftc.io/bitcoin-etf-flows/email-card', route =>
    route.fulfill({ status: 200, contentType: 'image/png', body: pixel }));
  await page.route('**/alternative.me/crypto/fear-and-greed-index.png', route =>
    route.fulfill({ status: 200, contentType: 'image/png', body: pixel }));
  // Other external chart and API providers can be flaky in CI; do not let them
  // dictate the success of our own interaction and layout checks.
  await page.goto('/', { waitUntil: 'domcontentloaded' });
});

test('loads market quote and mounts the chart widget', async ({ page }) => {
  await expect(page.locator('#market-view-crypto')).toBeVisible();
  await expect(page.locator('#btc-price')).toContainText('100,000');
  const chart = page.locator('#coinglass-iframe-container');
  await expect(chart.locator('iframe[title="TradingView chart fixture"]')).toHaveCount(1);
  await expect(chart).toBeVisible();
  await expect(page.locator('#local-chart-container iframe[src*="coinglass"]')).toHaveCount(0);
});

test('chart choices and market tabs respond to real clicks', async ({ page }) => {
  await page.locator('#btn-src-local').click();
  await expect(page.locator('#local-chart-container')).toBeVisible();
  await expect(page.locator('#coinglass-source-link')).toHaveAttribute('href', /farside\.co\.uk/);
  await expect(page.locator('#btc-etf-flow-chart')).toBeVisible();
  await expect.poll(() => page.locator('#btc-etf-flow-chart').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  await page.locator('#btn-src-altcoin').click();
  await expect(page.locator('#altcoin-iframe-container')).toBeVisible();
  await expect(page.locator('#coinglass-source-link')).toHaveAttribute('href', /alternative\.me/);
  await expect(page.locator('#crypto-fear-greed-chart')).toBeVisible();
  await expect.poll(() => page.locator('#crypto-fear-greed-chart').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  await page.locator('#btn-src-coinglass').click();
  await expect(page.locator('#coinglass-iframe-container')).toBeVisible();
  await page.locator('#market-tab-tw-stock').click();
  await expect(page.locator('#market-view-tw-stock')).toBeVisible();
  await expect(page.locator('#market-view-crypto')).toBeHidden();
  await page.locator('#market-tab-us-stock').click();
  await expect(page.locator('#market-view-us-stock')).toBeVisible();
  await page.locator('#market-tab-crypto').click();
  await expect(page.locator('#market-view-crypto')).toBeVisible();
});

test('assistant accepts a question and restores controls', async ({ page, isMobile }) => {
  // Real keyboard activation on mobile avoids the Chromium emulator's unreliable
  // synthetic tapping of fixed overlays; desktop still uses actual mouse input.
  if (isMobile) {
    await page.locator('#ha-fab').focus();
    await page.keyboard.press('Enter');
  } else {
    await page.locator('#ha-fab').click();
  }
  await expect(page.locator('#ha-panel')).toBeVisible();
  await page.locator('#ha-input').fill('BTC 行情如何？');
  if (isMobile) {
    await page.locator('#ha-send').focus();
    await page.keyboard.press('Enter');
  } else {
    await page.locator('#ha-send').click();
  }
  await expect(page.locator('#ha-msgs')).toContainText('Playwright 測試回覆');
  await expect(page.locator('#ha-send')).toBeEnabled();
});

test('main panel stays within viewport on desktop and mobile', async ({ page }) => {
  const panel = page.locator('#sec-crypto-prices');
  await expect(panel).toBeVisible();
  const box = await panel.boundingBox();
  expect(box).not.toBeNull();
  const width = page.viewportSize().width;
  expect(box.x).toBeGreaterThanOrEqual(-2);
  expect(box.x + box.width).toBeLessThanOrEqual(width + 2);
  const chart = page.locator('#panel-chart');
  const chartBox = await chart.boundingBox();
  expect(chartBox).not.toBeNull();
  expect(chartBox.x + chartBox.width).toBeLessThanOrEqual(width + 2);
});

test('Taiwan holdings panel reads a scheduled snapshot and shows the source date',async ({page})=>{
  const holdings=Array.from({length:50},(_,i)=>({r:i+1,code:String(1000+i),name:'測試成分股'+i,w:2}));
  await page.route('**/assets/data/0050-holdings.json',route=>route.fulfill({
    status:200,contentType:'application/json',
    body:JSON.stringify({fund:'0050',source_trade_date:'2026-11-06',fetched_at:'2026-11-06T12:00:00Z',holdings})
  }));
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#market-tab-tw-stock').click();
  await expect(page.locator('#tw-weight-tbody tr').first().locator('td').nth(1)).toHaveText('1000');
  await expect(page.locator('#tw-weight-note')).toContainText('2026-11-06');
});

test('0050 TDCC holder distribution renders 17 grades and cumulative holders', async ({page})=>{
  const shares=[485315659,3366434775,2735946272,1883030066,1460668868,1912533935,1282659962,916084520,2281881174,1429649735,731160250,237196051,103415219,58066094,5118704618,-20247198];
  const holders=[1612623,1471595,372614,152082,82692,77667,36738,20295,33325,10654,2731,491,150,64,288];
  const total=holders.reduce((a,b)=>a+b,0);
  let cumulative=0;
  const rows=shares.map((n,i)=>{if(i<15)cumulative+=holders[i];return {grade:i+1,range:i===15?'差異數調整':String(i+1),holders:i===15?null:holders[i]||total,shares:n,proportion:i===16?100:0,cumulativeHolders:i===15?null:i===16?total:cumulative};});
  rows.push({grade:17,range:'合計',holders:total,shares:shares.reduce((a,b)=>a+b,0),proportion:100,cumulativeHolders:total});
  await page.route('**/assets/data/0050-distribution.json',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({symbol:'0050',date:'2026-11-06',rows})}));
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#market-tab-tw-stock').click();
  await expect(page.locator('#tdcc-0050-tbody tr')).toHaveCount(17);
  await expect(page.locator('#tdcc-0050-tbody tr').nth(1).locator('td').nth(3)).toHaveText('3,084,218');
  await expect(page.locator('#tdcc-0050-tbody tr').nth(15).locator('td').nth(3)).toHaveText('—');
  await expect(page.locator('#tdcc-0050-tbody tr').last().locator('td').nth(4)).toHaveText('100.00%');
  await expect(page.locator('#tdcc-0050-status')).toContainText('2026-11-06');
});
