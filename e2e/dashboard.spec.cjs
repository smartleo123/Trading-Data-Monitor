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
  await expect(page.locator('#coinglass-source-link')).toHaveAttribute('href', /coinglass\.com/);
  await page.locator('#btn-src-altcoin').click();
  await expect(page.locator('#altcoin-iframe-container')).toBeVisible();
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
  if (isMobile) await page.locator('#ha-fab').tap();
  else await page.locator('#ha-fab').click();
  await expect(page.locator('#ha-panel')).toBeVisible();
  await page.locator('#ha-input').fill('BTC 行情如何？');
  if (isMobile) await page.locator('#ha-send').tap();
  else await page.locator('#ha-send').click();
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
