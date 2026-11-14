'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { normalizedRows, parseDistribution } = require('./tdcc-distribution.cjs');

const DATA_DIR = path.join(__dirname, '..', 'assets', 'data');
const SHARD_DIR = path.join(DATA_DIR, 'tdcc');
const INDEX_FILE = path.join(SHARD_DIR, 'index.json');
const LEGACY_0050 = path.join(DATA_DIR, '0050-distribution.json');
const SOURCES = [
  'https://openapi.tdcc.com.tw/v1/opendata/1-5',
  'https://smart.tdcc.com.tw/opendata/getOD.ashx?id=1-5'
];
const SYMBOL_RE = /^\d{4}[0-9A-Z]{0,2}$/;
const getSymbol = row => String(row['證券代號'] ?? row['證券代碼'] ??
  row['Securities Code'] ?? row.stockNo ?? row.StockNo ?? row.code ?? '').trim();

async function download(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 40000);
  try {
    const requestUrl = new URL(url);
    requestUrl.searchParams.set('_ts', String(Date.now()));
    const response = await fetch(requestUrl, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { 'Accept': 'application/json,text/csv,text/plain,*/*', 'Cache-Control': 'no-cache' }
    });
    if (!response.ok) throw Error('HTTP ' + response.status);
    return normalizedRows(await response.text());
  } finally {
    clearTimeout(timer);
  }
}

function normalizeDate(value) {
  const raw = String(value ?? '').replace(/\D/g, '');
  if (/^20\d{6}/.test(raw)) return raw.slice(0, 8);
  if (/^1\d{6}$/.test(raw)) return String(Number(raw.slice(0, 3)) + 1911) + raw.slice(3);
  return null;
}
function groupLatest(rows) {
  let latest = '';
  for (const row of rows) {
    const date = normalizeDate(row['資料日期'] ?? row.Date ?? row.date ?? row.scaDate);
    if (date && date > latest) latest = date;
  }
  if (!latest) throw Error('TDCC returned no valid date; rows=' + rows.length + '; first row keys=' + JSON.stringify(Object.keys(rows[0] || {})) + '; sample=' + JSON.stringify(rows[0] || {}).slice(0,500));
  const grouped = new Map();
  for (const row of rows) {
    const symbol = getSymbol(row);
    if (!SYMBOL_RE.test(symbol)) continue;
    if (normalizeDate(row['資料日期'] ?? row.Date ?? row.date ?? row.scaDate) !== latest) continue;
    if (!grouped.has(symbol)) grouped.set(symbol, []);
    grouped.get(symbol).push(row);
  }
  return { latest, grouped };
}
function buildSnapshots(rows, minimum = 300) {
  const { latest, grouped } = groupLatest(rows);
  const snapshots = new Map();
  let invalid = 0;
  for (const [symbol, records] of grouped) {
    try {
      snapshots.set(symbol, parseDistribution(records, symbol));
    } catch (error) {
      invalid++;
      if (invalid <= 3) console.warn('Skipped invalid symbol', symbol, error.message);
    }
  }
  if (snapshots.size < minimum || !snapshots.has('0050')) {
    throw Error('TDCC data incomplete: ' + snapshots.size + ' valid securities; rejected ' + invalid);
  }
  return { latest, snapshots, invalid };
}
function writeIfChanged(file, obj) {
  const serialized = JSON.stringify(obj, null, 2) + '\n';
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === serialized) return false;
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, serialized);
  return true;
}
function publishSnapshots(data) {
  const { latest, snapshots } = data;
  const prior = fs.existsSync(INDEX_FILE) ? JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8')) : null;
  if (prior && prior.date.replace(/-/g, '') > latest) throw Error('TDCC latest date regressed');

  const prefixGroups = new Map();
  for (const [symbol, snapshot] of [...snapshots].sort(([a],[b]) => a.localeCompare(b))) {
    const prefix = symbol.slice(0,2);
    if (!prefixGroups.has(prefix)) prefixGroups.set(prefix, {});
    prefixGroups.get(prefix)[symbol] = snapshot;
  }
  let changed = 0;
  for (const [prefix, entries] of prefixGroups) {
    if (writeIfChanged(path.join(SHARD_DIR, prefix + '.json'), entries)) changed++;
  }
  const manifest = {
    date: latest.slice(0,4)+'-'+latest.slice(4,6)+'-'+latest.slice(6,8),
    source: '臺灣集中保管結算所 集保戶股權分散表 (OpenAPI 1-5)',
    source_url: 'https://www.tdcc.com.tw/portal/zh/smWeb/qryStock',
    count: snapshots.size,
    symbols: [...snapshots.keys()].sort()
  };
  if (writeIfChanged(INDEX_FILE, manifest)) changed++;
  // Keep the original endpoint working for existing clients.
  if (writeIfChanged(LEGACY_0050, snapshots.get('0050'))) changed++;
  console.log('TDCC date', manifest.date, 'securities', snapshots.size, 'changed files', changed);
}
async function sync() {
  let data, lastError;
  for (const source of SOURCES) {
    try {
      const rows = await download(source);
      const candidate = buildSnapshots(rows);
      // A successful HTTP response can still be a week-old upstream snapshot.
      // Require a fresh weekly date; keep existing published data if upstream lags.
      const today = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Taipei', year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
      const ageDays = Math.round((Date.parse(today + 'T00:00:00Z') - Date.parse(candidate.latest.slice(0,4)+'-'+candidate.latest.slice(4,6)+'-'+candidate.latest.slice(6,8)+'T00:00:00Z')) / 86400000);
      if (ageDays > 7) throw Error('TDCC API stale: latest ' + candidate.latest + ' is ' + ageDays + ' days old (Taipei); refusing silent success');
      data = candidate;
      break;
    } catch (error) {
      lastError = error;
      console.warn('TDCC endpoint failed:', source, error.message);
    }
  }
  if (!data) throw lastError || Error('No complete official TDCC dataset');
  publishSnapshots(data);
}
if (require.main === module) sync().catch(error => {
  console.error('TDCC sync failed:', error.message);
  process.exitCode = 1;
});
module.exports = { buildSnapshots, publishSnapshots, sync };
