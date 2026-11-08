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

test('TDCC symbol search shows 0050 by default, then switches to stocks and ETFs', async ({page})=>{
 const holders=[10,20,...Array(13).fill(1)],total=holders.reduce((a,b)=>a+b,0);
 const rows=holders.map((count,i)=>({grade:i+1,range:String(i+1),holders:count,shares:count*1000,proportion:0,cumulativeHolders:holders.slice(0,i+1).reduce((a,b)=>a+b,0)}));
 rows.push({grade:16,range:'差異數調整',holders:null,shares:0,proportion:0,cumulativeHolders:null});
 rows.push({grade:17,range:'合計',holders:total,shares:holders.reduce((a,b)=>a+b,0)*1000,proportion:100,cumulativeHolders:total});
 const snapshot=symbol=>({symbol,date:'2026-11-06',rows});
 await page.route('**/assets/data/tdcc/index.json',route=>route.fulfill({
  status:200,contentType:'application/json',body:JSON.stringify({date:'2026-11-06',count:3,symbols:['0050','00878','2330']})
 }));
 await page.route('**/assets/data/tdcc/00.json',route=>route.fulfill({
  status:200,contentType:'application/json',body:JSON.stringify({'0050':snapshot('0050'),'00878':snapshot('00878')})
 }));
 await page.route('**/assets/data/tdcc/23.json',route=>route.fulfill({
  status:200,contentType:'application/json',body:JSON.stringify({'2330':snapshot('2330')})
 }));
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#market-tab-tw-stock').click();
 await expect(page.locator('#tdcc-0050-status')).toContainText('0050');
 await page.locator('#tdcc-symbol-input').fill('2330');
 await page.locator('#tdcc-symbol-search').click();
 await expect(page.locator('#tdcc-0050-status')).toContainText('2330');
 await expect(page.locator('#tdcc-0050-tbody tr')).toHaveCount(17);
 await expect(page.locator('#tdcc-0050-tbody tr').nth(1).locator('td').nth(3)).toHaveText('30');
 await page.locator('#tdcc-symbol-input').fill('00878');
 await page.locator('#tdcc-symbol-search').click();
 await expect(page.locator('#tdcc-0050-status')).toContainText('00878');
 await page.locator('#tdcc-symbol-input').fill('9999');
 await page.locator('#tdcc-symbol-search').click();
 await expect(page.locator('#tdcc-0050-status')).toContainText('尚無可用');
 await expect(page.locator('#tdcc-0050-tbody tr')).toHaveCount(1);
});

test('TWSE market snapshot renders institutional and margin panels and 0050 close without public proxies',async({page})=>{
 const data={institutional:[{date:'20261106',f:20,t:-3,d:1}],margin:[{date:'20261106',finNow:1200,finPrev:1190,shortNow:150000,shortPrev:140000,finUnitNow:200000}],leaders:[{code:'2330',name:'台積電',foreign:10000,trust:3000,net:14000},{code:'2454',name:'聯發科',foreign:-3000,trust:1000,net:-2000}],leaderDate:'20261106',prices:{'2330':1450.5,'2454':1000},priceDate:'20261106'};
 await page.route('**/assets/data/tw-market-snapshot.json',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)}));
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#market-tab-tw-stock').click();
 await expect(page.locator('#twc-inst-tiles')).toContainText('20.0');
 await expect(page.locator('#twc-margin-tiles')).toContainText('1200 億');
 await expect(page.locator('#twc-rank-buy')).toContainText('台積電');
 await expect(page.locator('[data-twq="2330"]')).toContainText('1,450.50');
 await expect(page.locator('[data-twi="2330"]')).toContainText('14');
});

test('TDCC is scoped to Taiwan only and has a working sidebar entry',async ({page})=>{
 await page.locator('#market-tab-tw-stock').click();
 const tdcc=page.locator('#panel-tdcc-0050');
 await expect(tdcc).toBeVisible();
 await expect(page.locator('#section-nav .sn-item').filter({hasText:'集保戶股權分散表'})).toHaveCount(1);
 await page.locator('#market-tab-us-stock').click();
 await expect(tdcc).toBeHidden();
 await expect(page.locator('#section-nav')).not.toContainText('集保戶股權分散表');
 await page.locator('#market-tab-crypto').click();
 await expect(tdcc).toBeHidden();
 await expect(page.locator('#section-nav')).not.toContainText('集保戶股權分散表');
 await page.locator('#market-tab-tw-stock').click();
 if((page.viewportSize()?.width||0)>=1024){
  await page.locator('#section-nav .sn-item').filter({hasText:'集保戶股權分散表'}).click();
  await expect(tdcc).toBeInViewport({ratio:0.1});
 }else{
  // The sidebar is intentionally hidden on mobile; the TDCC panel remains accessible by scrolling.
  await tdcc.scrollIntoViewIfNeeded();
  await expect(tdcc).toBeInViewport({ratio:0.1});
 }
});

test('BTC options strategy uses Deribit ask/bid snapshots and renders expiry + IV PnL scenarios',async({page})=>{
 await page.evaluate(()=>{
   const expire=new Date(Date.now()+30*86400000),months=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
   window.WR_OPTION_EXPIRIES=[expire.getUTCDate()+months[expire.getUTCMonth()]+String(expire.getUTCFullYear()).slice(2)];
   window.WR_SNAPSHOT={spot:80000,ivRows:[{atmIV:45}],basisAnnual:0};
   window.WR_GET_OPTION_QUOTES=async names=>Object.fromEntries(names.map(name=>[name,{
     ticker:{state:'open',timestamp:Date.now(),best_bid_price:0.04,best_ask_price:0.042,best_bid_amount:5,best_ask_amount:5,index_price:80000,instrument_name:name},
     instrument:{kind:'option',base_currency:'BTC',settlement_currency:'BTC',contract_size:1,instrument_name:name,strike:Number(name.match(/-(\\d+)-[CP]$/)[1]),option_type:name.endsWith('-C')?'call':'put',expiration_timestamp:Date.now()+30*86400000,min_trade_amount:0.1,is_active:true}
   }]));
 });
 await page.locator('#wr-tab-calc').click();
 await expect(page.locator('#sc-expiry')).toHaveValue(/^[0-9]{1,2}[A-Z]{3}[0-9]{2}$/);
 await expect(page.locator('#sc-quote-status')).toContainText('✓');
 await expect(page.locator('#sc-scenarios table tbody tr')).toHaveCount(5);
 const spot=Number(await page.locator('#sc-spot').inputValue());
 const expectedPremium=Math.round(spot*0.042).toLocaleString('en-US');
 await expect(page.locator('#sc-metrics')).toContainText(expectedPremium);
 await expect(page.locator('#sc-legs-body')).toContainText('Ask');
 await page.locator('#sc-legs-body input[data-f="qty"]').first().fill('10');
 await expect(page.locator('#sc-quote-status')).toContainText('重新核對');
 await page.locator('#sc-apply-quotes').click();
 await expect(page.locator('#sc-quote-status')).toContainText('掛單量不足');
 await expect(page.locator('#sc-scenarios')).not.toContainText('IV -10pt');
});
