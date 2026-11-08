'use strict';
const RANGES=['1–999','1,000–5,000','5,001–10,000','10,001–15,000','15,001–20,000','20,001–30,000','30,001–40,000','40,001–50,000','50,001–100,000','100,001–200,000','200,001–400,000','400,001–600,000','600,001–800,000','800,001–1,000,000','1,000,001 以上','差異數調整','合計'];
function parseCsv(text){
  const rows=[];let row=[],field='',quoted=false;
  const input=String(text).replace(/^\uFEFF/,'');
  for(let i=0;i<input.length;i++){
    const ch=input[i];
    if(ch==='"'){if(quoted&&input[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
    else if(!quoted&&ch===','){row.push(field);field='';}
    else if(!quoted&&(ch==='\n'||ch==='\r')){if(ch==='\r'&&input[i+1]==='\n')i++;row.push(field);if(row.some(x=>x.trim()))rows.push(row);row=[];field='';}
    else field+=ch;
  }
  if(quoted)throw Error('Unterminated CSV quote');
  row.push(field);if(row.some(x=>x.trim()))rows.push(row);
  const headings=rows.shift();if(!headings)throw Error('Empty TDCC CSV');
  return rows.map(values=>Object.fromEntries(headings.map((h,i)=>[h.trim(),(values[i]||'').trim()])));
}
function normalizedRows(payload){
  if(Array.isArray(payload))return payload;
  if(typeof payload==='string'){
    const trimmed=payload.trim();
    if(trimmed.startsWith('<'))throw Error('TDCC returned HTML rather than data');
    if(trimmed.startsWith('[')||trimmed.startsWith('{'))return normalizedRows(JSON.parse(trimmed));
    return parseCsv(trimmed);
  }
  if(payload&&typeof payload==='object'){
    for(const key of ['data','Data','result','Result','list','items']){
      if(payload[key])return normalizedRows(payload[key]);
    }
  }
  throw Error('Unsupported TDCC data format');
}
const val=(r,keys)=>{for(const k of keys)if(r[k]!=null)return r[k];return undefined;};
const integer=(n)=>{const x=Number(String(n??'').replace(/,/g,'').trim());return Number.isSafeInteger(x)&&x>=0?x:null;};
const signedInteger=(n)=>{const x=Number(String(n??'').replace(/,/g,'').trim());return Number.isSafeInteger(x)?x:null;};
const pct=(n)=>{const x=Number(String(n??'').replace(/[,%％]/g,'').trim());return Number.isFinite(x)?x:null;};
function parseDistribution(payload,symbol='0050'){
 if(!/^\d{4}[0-9A-Z]{0,2}$/.test(symbol))throw Error('Invalid TDCC symbol');
 const all=normalizedRows(payload);
 const matching=all.filter(r=>String(val(r,['證券代號','證券代碼','Securities Code','stockNo','StockNo','code'])??'').trim()===symbol);
 if(!matching.length)throw Error('TDCC contains no '+symbol+' data');
 const normalizeDate=(value)=>{
  const raw=String(value??'').trim();
  const digits=raw.replace(/\D/g,'');
  if(/^20\d{6}/.test(digits))return digits.slice(0,8);
  if(/^1\d{6}$/.test(digits))return String(Number(digits.slice(0,3))+1911)+digits.slice(3);
  return null;
 };
 const dated=matching.map(r=>({r,date:normalizeDate(val(r,['資料日期','Date','date','scaDate','dateStr']))})).filter(x=>x.date);
 if(!dated.length)throw Error('TDCC '+symbol+' has no valid data date');
 const latest=dated.map(x=>x.date).sort().at(-1),rows=dated.filter(x=>x.date===latest).map(x=>x.r);
 const table=new Map();
 for(const r of rows){
  const grade=integer(val(r,['持股分級','Holding Range','grade','level']));
  if(grade==null||grade<1||grade>17)continue;
  if(table.has(grade))throw Error('Duplicate TDCC holding grade '+grade);
  const holders=grade===16?null:integer(val(r,['人數','Number of Holders','holders']));
  const shares=signedInteger(val(r,['股數','Number of Shares/Units','shares']));
  const proportion=pct(val(r,['占集保庫存數比例%','佔集保庫存數比例(%)','佔集保庫存數比例%','Percentage of Centrally Deposited Securities','proportion']));
  if((grade!==16&&holders==null)||shares==null||proportion==null)throw Error('Malformed TDCC row '+grade);
  table.set(grade,{grade,range:RANGES[grade-1],holders,shares,proportion});
 }
 if(table.size!==17||!Array.from({length:17},(_,i)=>i+1).every(n=>table.has(n)))throw Error('Incomplete TDCC distribution');
 const total=table.get(17);
 let cumulative=0;
 const result=[];
 for(let grade=1;grade<=17;grade++){
  const row=table.get(grade);
  if(grade<=15){cumulative+=row.holders;row.cumulativeHolders=cumulative;row.cumulativePct=total.holders?Number((cumulative/total.holders*100).toFixed(4)):0;}
  else if(grade===17){row.cumulativeHolders=cumulative;row.cumulativePct=total.holders?Number((cumulative/total.holders*100).toFixed(4)):0;}
  else {row.cumulativeHolders=null;row.cumulativePct=null;}
  result.push(row);
 }
 if(total.holders<=0||cumulative!==total.holders)throw Error('TDCC total holder count inconsistent');
 // Some TDCC exports print the grade-16 adjustment as an unsigned magnitude,
 // while the total reflects its negative effect. Reconstruct the direction from
 // the issuer-reported total, but never accept an unexplained discrepancy.
 const bandShares=result.slice(0,15).reduce((a,r)=>a+r.shares,0);
 const adjustmentRequired=total.shares-bandShares;
 if(Math.abs(adjustmentRequired-result[15].shares)>1){
  if(Math.abs(adjustmentRequired+result[15].shares)>1)throw Error('TDCC total share count inconsistent');
  result[15].shares=adjustmentRequired;
  result[15].proportion=-Math.abs(result[15].proportion);
 }
 if(Math.abs(bandShares+result[15].shares-total.shares)>1)throw Error('TDCC total share count inconsistent');
 if(Math.abs(total.proportion-100)>0.2)throw Error('TDCC total proportion not 100%');
 const iso=latest.slice(0,4)+'-'+latest.slice(4,6)+'-'+latest.slice(6,8);
 if(new Date(iso+'T00:00:00Z').toISOString().slice(0,10)!==iso)throw Error('Invalid TDCC calendar date');
 return {symbol,date:iso,rows:result,source:'臺灣集中保管結算所 集保戶股權分散表 (OpenAPI 1-5)',source_url:'https://www.tdcc.com.tw/portal/zh/smWeb/qryStock'};
}
module.exports={parseCsv,normalizedRows,parseDistribution,RANGES};
