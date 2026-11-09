'use strict';
const fs=require('node:fs'),path=require('node:path');
const E=require('../assets/js/options-execution.js');
const History=require('./deribit-history.cjs');
const ROOT='https://www.deribit.com/api/v2/public/';
const AUDIT=path.join(__dirname,'../assets/data/deribit/source-audit.json');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function fetchRpc(method,params={}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{
  const u=new URL(ROOT+method);
  Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,String(v)));
  const res=await fetch(u,{signal:controller.signal,headers:{Accept:'application/json','User-Agent':'HakuTrade-public-market-data-audit/1.0'}});
  if(!res.ok)throw Error(method+' HTTP '+res.status);
  const j=await res.json();
  if(j.error||j.result===undefined)throw Error(method+' '+(j.error?.message||'invalid RPC'));
  return j.result;
 }finally{clearTimeout(timer);}
}
function chooseContracts(instruments,spot,now){
 const expiries=[...new Set(instruments.filter(x=>x.kind==='option'&&x.settlement_currency==='BTC'&&x.base_currency==='BTC'&&x.expiration_timestamp>now+12*86400000&&x.expiration_timestamp<now+65*86400000).map(x=>x.expiration_timestamp))].sort((a,b)=>a-b);
 if(!expiries.length)throw Error('No BTC inverse option expiries in 12–65 day range');
 const chosen=[21,42].map(target=>expiries.reduce((a,b)=>Math.abs(a-now-target*86400000)<=Math.abs(b-now-target*86400000)?a:b));
 const uniqueExp=[...new Set(chosen)];
 const selected=[];
 for(const expiry of uniqueExp){
  const rows=instruments.filter(x=>x.expiration_timestamp===expiry&&x.kind==='option'&&x.is_active!==false&&x.settlement_currency==='BTC');
  const strikes=[...new Set(rows.map(x=>x.strike))].filter(x=>typeof x==='number'&&Number.isFinite(x)).sort((a,b)=>a-b);
  const used=new Set();
  for(const pct of [0.88,0.94,1,1.06,1.12]){
   const k=strikes.reduce((a,b)=>Math.abs(a-spot*pct)<=Math.abs(b-spot*pct)?a:b);
   if(!k||used.has(k))continue;used.add(k);
   for(const type of ['call','put']){
    const row=rows.find(x=>x.strike===k&&x.option_type===type);
    if(row)selected.push(row);
   }
  }
 }
 return selected.slice(0,20);
}
function readHistory(){return History.load();}
function followContracts(instruments,history,now,fresh){
 const byName=new Map(instruments.filter(i=>i&&typeof i.instrument_name==='string'&&i.kind==='option'&&
  i.base_currency==='BTC'&&i.settlement_currency==='BTC'&&i.expiration_timestamp>now+86400000&&i.is_active!==false)
  .map(i=>[i.instrument_name,i]));
 const previous=history.snapshots.slice(-42);
 const firstSeen=new Map(),lastSeen=new Map();
 for(const snap of previous)for(const name of Object.keys(snap.contracts||{})){
  if(!byName.has(name))continue;
  if(!firstSeen.has(name))firstSeen.set(name,snap.at);
  lastSeen.set(name,snap.at);
 }
 const freshNames=new Set(fresh.map(i=>i.instrument_name));
 const lastNames=new Set(Object.keys(previous.at(-1)?.contracts||{}));
 // Keep contracts from previous observations across the full holding window.
 // Prefer continuity at the most recent snapshot, then older first-seen contracts.
 const tracked=[...lastSeen.keys()].filter(name=>!freshNames.has(name)).sort((a,b)=>
  Number(lastNames.has(b))-Number(lastNames.has(a))||
  firstSeen.get(a)-firstSeen.get(b)||a.localeCompare(b)).slice(0,36);
 return fresh.concat(tracked.map(name=>byName.get(name)));
}
async function run(){
 const now=Date.now(),old=readHistory();
 const [serverTime,index,instruments]=await Promise.all([
  fetchRpc('get_time'),fetchRpc('get_index_price',{index_name:'btc_usd'}),
  fetchRpc('get_instruments',{currency:'BTC',kind:'option',expired:'false'})
 ]);
 const spot=index.index_price;
 if(typeof serverTime!=='number'||Math.abs(now-serverTime)>90000)throw Error('Server clock skew too large');
 if(!Number.isFinite(spot)||spot<=0||!Array.isArray(instruments)||instruments.length<50)throw Error('Invalid official BTC market chain');
 const fresh=chooseContracts(instruments,spot,now);
 const selection=followContracts(instruments,old,now,fresh);
 const contracts={};const failures=[];
 for(let i=0;i<selection.length;i+=3){
  await Promise.all(selection.slice(i,i+3).map(async meta=>{
   try{
    const r=await fetchRpc('get_order_book',{instrument_name:meta.instrument_name,depth:1});
    const v=E.validateTicker({ticker:r,instrument:meta},{instrument_name:meta.instrument_name,qty:0.1,direction:1,spot},Date.now());
    // A buy-side valid quote is required. Also require a fully valid sell-side.
    const w=E.validateTicker({ticker:r,instrument:meta},{instrument_name:meta.instrument_name,qty:0.1,direction:-1,spot},Date.now());
    if(!v.valid||!w.valid)throw Error(v.reason||w.reason);
    contracts[meta.instrument_name]={
     bid:r.best_bid_price,ask:r.best_ask_price,bidAmount:r.best_bid_amount,askAmount:r.best_ask_amount,
     bookAt:r.timestamp,strike:meta.strike,type:meta.option_type==='call'?'C':'P',
     expiryAt:meta.expiration_timestamp,contractSize:meta.contract_size,
     spot:v.spot
    };
   }catch(e){failures.push({name:meta.instrument_name,reason:String(e.message||e).slice(0,110)});}
  }));
  await sleep(150);
 }
 const symbols=Object.keys(contracts);
 if(symbols.length<6||!symbols.some(x=>x.endsWith('-C'))||!symbols.some(x=>x.endsWith('-P')))throw Error('Too few live validated two-sided option books ('+symbols.length+'); '+failures.slice(0,3).map(x=>x.reason).join('; '));
 if(old.snapshots.length&&now-old.snapshots.at(-1).at<60*60*1000){
  // Migration cannot wait for the next hourly observation: publish the
  // existing verified legacy history even when no new quote should be added.
  if(!fs.existsSync(History.INDEX)){
   const prior=old.snapshots.slice(0,-1),last=old.snapshots.at(-1);
   History.save(History.planAppend({snapshots:prior},last));
   console.log('Migrated existing verified Deribit history into monthly shards');
  }else console.log('Existing snapshot newer than 1h; no duplicate');
  return;
 }
 const item={at:now,spot,contracts};
 const planned=History.planAppend(old,item);
 History.save(planned);
 const audit={source:'Deribit production public API',checkedAt:new Date(now).toISOString(),
  serverTime:new Date(serverTime).toISOString(),clockSkewMs:serverTime-now,spot,
  listedInstruments:instruments.length,selected:selection.length,fresh: fresh.length,followed:selection.length-fresh.length,verified:symbols.length,
  rejected:failures.length,failures:failures.slice(0,10),historyObservations:planned.snapshots.length,archiveMonths:planned.months.length,
  limitations:'Best bid/ask are not guaranteed fills; 4-hour snapshot frequency. Past order books cannot be reconstructed by requesting current ticker.'};
 fs.mkdirSync(path.dirname(AUDIT),{recursive:true});
 fs.writeFileSync(AUDIT,JSON.stringify(audit,null,2)+'\n');
 console.log(JSON.stringify(audit));
}
if(require.main===module)run().catch(e=>{console.error('DERIBIT AUDIT FAILED:',e.stack);process.exitCode=1;});
module.exports={chooseContracts,followContracts,readHistory,run};
