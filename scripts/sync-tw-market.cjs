'use strict';
const fs=require('node:fs'),path=require('node:path');
const OUT=path.join(__dirname,'..','assets','data','tw-market-snapshot.json');
const ROOT='https://www.twse.com.tw/rwd/zh/';
const n=v=>{const x=Number(String(v??'').replace(/,/g,'').replace(/\s/g,''));return Number.isFinite(x)?x:null;};
function parseInstitution(j){
 if(!j||j.stat!=='OK'||!Array.isArray(j.data)||j.data.length<4)throw Error('BFI82U unavailable');
 let f=0,t=0,d=0,seen={};
 for(const row of j.data){
  if(!Array.isArray(row))continue;
  const label=String(row[0]),amount=n(row[3]);if(amount===null)continue;
  if(label.startsWith('外資及陸資')){f+=amount;seen.f=true;}
  else if(label.startsWith('投信')){t+=amount;seen.t=true;}
  else if(label.startsWith('自營商(')){d+=amount;seen.d=true;}
 }
 if(!seen.f||!seen.t||!seen.d)throw Error('BFI82U missing required investor classes');
 return {f:+(f/1e8).toFixed(3),t:+(t/1e8).toFixed(3),d:+(d/1e8).toFixed(3)};
}
function parseT86(j){
 if(!j||j.stat!=='OK'||!Array.isArray(j.fields)||!Array.isArray(j.data)||j.data.length<10)throw Error('T86 unavailable');
 const fields=j.fields.map(f=>String(f));
 const index=keyword=>fields.findIndex(f=>f.includes(keyword));
 const code=index('證券代號'),name=index('證券名稱'),foreign=index('外陸資買賣超股數'),trust=index('投信買賣超股數'),total=index('三大法人買賣超股數');
 if([code,name,foreign,trust,total].some(i=>i<0))throw Error('T86 required columns missing: '+fields.join('|'));
 const rows=[];
 for(const row of j.data){
  const symbol=String(row[code]||'').trim();
  const values=[n(row[foreign]),n(row[trust]),n(row[total])];
  if(!/^\d{4}[0-9A-Z]{0,2}$/.test(symbol)||values.some(v=>v===null))continue;
  rows.push({code:symbol,name:String(row[name]||'').trim(),foreign:values[0],trust:values[1],net:values[2]});
 }
 if(rows.length<50)throw Error('T86 too few valid rows: '+rows.length);
 return rows;
}
function parseMargin(j){
 if(!j||j.stat!=='OK')throw Error('MI_MARGN unavailable: '+(j?.stat||'invalid response'));
 const tables=Array.isArray(j.tables)?j.tables:[j];
 const table=tables.find(t=>/信用交易統計/.test(t.title||''));
 if(!table||!Array.isArray(table.fields)||!Array.isArray(table.data))throw Error('MI_MARGN summary table missing: '+tables.map(t=>t.title).join('|'));
 // Report column positions may vary by template: use headers and row labels.
 const fields=table.fields.map(x=>String(x).replace(/\s/g,''));
 const cur=fields.findIndex(x=>/今日餘額|本日餘額/.test(x));
 const prev=fields.findIndex(x=>/前日餘額|昨日餘額/.test(x));
 if(cur<0||prev<0)throw Error('MI_MARGN balance columns missing: '+fields.join('|'));
 const rec={};
 for(const row of table.data){
  const label=String(row[0]||'').replace(/\s/g,'');
  const now=n(row[cur]),earlier=n(row[prev]);
  if(now===null||earlier===null)continue;
  if(label.includes('融資金額')){rec.finNow=now/1e5;rec.finPrev=earlier/1e5;}
  else if(label.includes('融券')&&!label.includes('融券金額')){rec.shortNow=now;rec.shortPrev=earlier;}
  else if(label==='融資'||label.startsWith('融資(')){rec.finUnitNow=now;}
 }
 if(![rec.finNow,rec.finPrev,rec.shortNow,rec.shortPrev,rec.finUnitNow].every(Number.isFinite))
  throw Error('MI_MARGN balance rows missing: '+table.data.map(r=>r[0]).join('|'));
 return rec;
}
function parsePrices(j){
 if(!Array.isArray(j)||j.length<100)throw Error('STOCK_DAY_ALL incomplete');
 const prices={};
 for(const r of j){
  const code=String(r.Code||r.code||'').trim();
  const raw=String(r.ClosingPrice??r.Close??'').replace(/,/g,'').trim(),price=Number(raw);
  if(/^\d{4}[0-9A-Z]{0,2}$/.test(code)&&raw!==''&&Number.isFinite(price)&&price>0)prices[code]=price;
 }
 if(Object.keys(prices).length<100)throw Error('STOCK_DAY_ALL too few prices');
 return prices;
}
async function getJson(url,timeout=8000){
 const c=new AbortController(),timer=setTimeout(()=>c.abort(),timeout);
 try{const r=await fetch(url,{signal:c.signal,headers:{Accept:'application/json','User-Agent':'Mozilla/5.0 (compatible; HakuTrade-DataCollector/1.0)'}});
  if(!r.ok)throw Error('HTTP '+r.status);
  const raw=await r.text();if(raw.trim().startsWith('<'))throw Error('HTML response');
  return JSON.parse(raw);
 }finally{clearTimeout(timer);}
}
const taipeiToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()).replace(/\D/g,'');
function tradingDates(limit=27){
 const now=new Date(taipeiToday().slice(0,4)+'-'+taipeiToday().slice(4,6)+'-'+taipeiToday().slice(6)+'T00:00:00Z');
 const list=[];
 for(let i=0;list.length<limit&&i<45;i++){
  const d=new Date(now.getTime()-i*86400000);
  if(d.getUTCDay()!==0&&d.getUTCDay()!==6)list.push(d.toISOString().slice(0,10).replace(/-/g,''));
 }
 return list;
}
async function sync(){
 let previous={};
 try{previous=JSON.parse(fs.readFileSync(OUT,'utf8'));}catch{}
 const inst=new Map((previous.institutional||[]).map(r=>[r.date,r]));
 const margin=new Map((previous.margin||[]).map(r=>[r.date,r]));
 let leaders=previous.leaders||[],leaderDate=previous.leaderDate||null;
 let prices=previous.prices||{},priceDate=previous.priceDate||null;
 const dates=tradingDates(12);
 for(const date of dates){
  for(const [kind,map,api,parser] of [
   ['institutional',inst,'fund/BFI82U?date='+date+'&dayDate='+date+'&type=day&response=json',parseInstitution],
   ['margin',margin,'marginTrading/MI_MARGN?date='+date+'&selectType=MS&response=json',parseMargin]
  ]){
   if(map.has(date))continue;
   try{const raw=await getJson(ROOT+api);if(kind==='institutional'&&String(raw.date||'')!==date)throw Error('TWSE returned '+raw.date+' instead of '+date);const record=parser(raw);map.set(date,{date,...record});}
   catch(e){console.log(kind,date,'skipped:',e.message);}
  }
  if(!leaderDate||date>leaderDate){
   try{const latest=parseT86(await getJson(ROOT+'fund/T86?date='+date+'&selectType=ALLBUT0999&response=json'));leaders=latest;leaderDate=date;}
   catch(e){console.log('T86',date,'skipped:',e.message);}
  }
  if(inst.size>=20&&margin.size>=20&&leaders.length)break;
 }
 try {
  const latestPrices=parsePrices(await getJson('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL'));
  // STOCK_DAY_ALL omits a per-symbol trade date. Label the collection date,
  // rather than incorrectly presenting the newest institutional day as quote as-of.
  const checkedAt=taipeiToday();
  if(!priceDate||checkedAt>=priceDate){prices=latestPrices;priceDate=checkedAt;}
 }catch(e){console.log('STOCK_DAY_ALL skipped:',e.message);}
 const institutional=[...inst.values()].sort((a,b)=>a.date.localeCompare(b.date)).slice(-20);
 const margins=[...margin.values()].sort((a,b)=>a.date.localeCompare(b.date)).slice(-20);
 if(!institutional.length&&!margins.length&&!leaders.length&&!Object.keys(prices).length)throw Error('No TWSE data retrieved; retaining previous valid snapshot');
 const data={schemaVersion:2,source:'臺灣證券交易所 TWSE',source_url:'https://www.twse.com.tw/',institutional,margin:margins,leaderDate,leaders,priceDate,prices};
 if(previous&&Object.keys(data).every(k=>JSON.stringify(previous[k])===JSON.stringify(data[k]))){console.log('TWSE market snapshot unchanged');return;}
 data.fetchedAt=new Date().toISOString();
 fs.mkdirSync(path.dirname(OUT),{recursive:true});fs.writeFileSync(OUT,JSON.stringify(data,null,2)+'\n');
 console.log('Saved TWSE snapshot', {institutional:institutional.length,margin:margins.length,leaders:leaders.length,prices:Object.keys(prices).length,dates:[institutional.at(-1)?.date,margins.at(-1)?.date,leaderDate,priceDate]});
}
if(require.main===module)sync().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={parseInstitution,parseT86,parseMargin,parsePrices,sync};
