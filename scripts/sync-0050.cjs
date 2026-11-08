'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { parseHoldings, parseTradeDate, parseMoneyDjHtml } = require('./holdings-parser.cjs');

const SOURCE_URL = 'https://www.yuantaetfs.com/api/v1/etfBasicInfo/getFundHoldingStock?fundId=0050';
const MONEYDJ_URL = 'https://www.moneydj.com/ETF/X/Basic/Basic0007B.xdjhtm?etfid=0050.TW';
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
async function fetchMoneyDj() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 18000);
  try {
    const response=await fetch(MONEYDJ_URL,{signal:controller.signal,headers:{'Accept':'text/html','User-Agent':'Mozilla/5.0 (compatible; HakuTrade-ETF-Holdings/1.0)'}});
    if(!response.ok)throw new Error('MoneyDJ HTTP '+response.status);
    const bytes=await response.arrayBuffer();
    const header=response.headers.get('content-type')||'';
    let text = new TextDecoder(/big5|big-5/i.test(header)?'big5':'utf-8').decode(bytes);
    if(/<meta[^>]+charset\s*=\s*["']?big5/i.test(text.slice(0,4000)))text=new TextDecoder('big5').decode(bytes);
    const parsed=parseMoneyDjHtml(text);
    return { ...parsed, source:'MoneyDJ ETF all holdings (issuer-derived)', source_url:MONEYDJ_URL };
  } finally {clearTimeout(timer);}
}
async function sync() {
  let holdings,sourceTradeDate,source,sourceUrl;
  try {
    let raw, error;
    for (let attempt=0;attempt<2;attempt++) {
      try {raw=await fetchJson(SOURCE_URL);break;}
      catch(e) {error=e; if(attempt===0) await new Promise(r=>setTimeout(r,1200));}
    }
    if(!raw)throw error||new Error('Issuer source unavailable');
    holdings=parseHoldings(raw);
    sourceTradeDate=parseTradeDate(raw);
    source='Yuanta ETF fund holding stock API';
    sourceUrl='https://www.yuantaetfs.com/product/detail/0050/ratio';
  } catch(error) {
    console.warn('Issuer API unavailable or incomplete:',error.message,'— trying publicly listed MoneyDJ holdings');
    const fallback=await fetchMoneyDj();
    holdings=fallback.holdings;
    sourceTradeDate=fallback.sourceTradeDate;
    source=fallback.source;
    sourceUrl=fallback.source_url;
  }
  // Detect actual data changes; do not create daily commits when upstream content is unchanged.
  let previous = null;
  try { previous = JSON.parse(fs.readFileSync(OUT_FILE,'utf8')); } catch {}
  const same = previous && JSON.stringify(previous.holdings) === JSON.stringify(holdings) && previous.source_trade_date === sourceTradeDate && previous.source_url === sourceUrl;
  if (same) { console.log('0050 holdings unchanged, no commit needed'); return; }
  const snapshot = {
    fund: '0050',
    source,
    source_url: sourceUrl,
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
