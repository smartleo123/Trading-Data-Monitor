'use strict';

const CODE = /^\d{4}$/;
const fields = {
  code: ['stockId','StockId','code','Code','commodityCode','CommodityCode','商品代碼'],
  name: ['stockName','StockName','name','Name','commodityName','CommodityName','商品名稱'],
  weight: ['weight','Weight','ratio','Ratio','investRatio','InvestRatio','商品權重']
};
function first(record, keys) {
  for (const key of keys) if (record[key] !== undefined && record[key] !== null && String(record[key]).trim() !== '') return record[key];
  return null;
}
function arrayFrom(data, depth = 0) {
  if (depth > 6 || data == null) return null;
  if (Array.isArray(data)) return data;
  if (typeof data !== 'object') return null;
  for (const key of ['Data', 'data', 'result', 'Result', 'list', 'List', 'items', 'Items', 'holdings', 'holdingStocks', 'stockList']) {
    const value = arrayFrom(data[key], depth + 1);
    if (value) return value;
  }
  return null;
}
function parseHoldings(payload) {
  const arr = arrayFrom(payload);
  if (!Array.isArray(arr)) throw new Error('Yuanta API response has no holdings array');
  const seen = new Set();
  const stocks = [];
  for (const record of arr) {
    if (!record || typeof record !== 'object') continue;
    const code = String(first(record, fields.code) || '').trim();
    const name = String(first(record, fields.name) || '').trim();
    const raw = String(first(record, fields.weight) ?? '').replace(/[,%％]/g, '').trim();
    const weight = Number(raw);
    if (!CODE.test(code) || !name || !raw || !Number.isFinite(weight) || weight <= 0 || weight > 80) continue;
    if (seen.has(code)) throw new Error('Duplicate holding symbol: ' + code);
    seen.add(code);
    stocks.push({ code, name, w: weight });
  }
  if (stocks.length < 40 || stocks.length > 60) throw new Error('Unexpected 0050 holding count: ' + stocks.length);
  const total = stocks.reduce((sum, stock) => sum + stock.w, 0);
  if (total < 85 || total > 105) throw new Error('Unexpected total holdings weight: ' + total.toFixed(2));
  stocks.sort((a,b) => b.w-a.w);
  const results = stocks.slice(0,50).map((stock,i) => ({ r:i+1, ...stock }));
  return results;
}
function parseTradeDate(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const candidates = [payload.tradeDate, payload.TradeDate, payload.trade_date, payload.dataDate, payload.date, payload.Date, payload.Data?.tradeDate, payload.data?.tradeDate];
  for (const item of candidates) {
    if (!item) continue;
    const s = String(item).trim().replace(/\//g,'-');
    if (/^20\d\d-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s) return s;
  }
  return null;
}
module.exports = { parseHoldings, parseTradeDate };
