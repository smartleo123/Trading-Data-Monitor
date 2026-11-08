'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { parseHoldings, parseTradeDate } = require('./holdings-parser.cjs');

const SOURCE_URL = 'https://www.yuantaetfs.com/api/v1/etfBasicInfo/getFundHoldingStock?fundId=0050';
const OUT_FILE = path.join(__dirname, '..', 'assets', 'data', '0050-holdings.json');
async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {signal: controller.signal, headers: {'Accept':'application/json', 'User-Agent':'HakuTrade-0050-Snapshot/1.0'}});
    if (!response.ok) throw new Error('Yuanta HTTP ' + response.status);
    const raw = await response.text();
    return JSON.parse(raw);
  } finally { clearTimeout(timer); }
}
async function sync() {
  let raw, error;
  for (let attempt = 0; attempt < 3; attempt++) {
    try { raw = await fetchJson(SOURCE_URL); break; }
    catch (err) { error = err; if (attempt < 2) await new Promise(r=>setTimeout(r,(attempt+1)*1500)); }
  }
  if (!raw) throw error || new Error('Unable to fetch official holdings');
  const holdings = parseHoldings(raw);
  const sourceTradeDate = parseTradeDate(raw);
  // Detect actual data changes; do not create daily commits when upstream content is unchanged.
  let previous = null;
  try { previous = JSON.parse(fs.readFileSync(OUT_FILE,'utf8')); } catch {}
  const same = previous && JSON.stringify(previous.holdings) === JSON.stringify(holdings) && previous.source_trade_date === sourceTradeDate;
  if (same) { console.log('0050 holdings unchanged, no commit needed'); return; }
  const snapshot = {
    fund: '0050',
    source: 'Yuanta ETF fund holding stock API',
    source_url: 'https://www.yuantaetfs.com/product/detail/0050/ratio',
    source_trade_date: sourceTradeDate,
    fetched_at: new Date().toISOString(),
    holdings
  };
  fs.mkdirSync(path.dirname(OUT_FILE), {recursive:true});
  fs.writeFileSync(OUT_FILE, JSON.stringify(snapshot,null,2) + '\n', 'utf8');
  console.log('Validated', holdings.length, 'holdings; source trade date', sourceTradeDate || '(not provided)', 'saved to', OUT_FILE);
}
if (require.main === module) sync().catch(e=>{ console.error('Refusing to update 0050 snapshot:',e.message); process.exitCode=1; });
module.exports = { sync };
