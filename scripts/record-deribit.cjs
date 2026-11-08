'use strict';
const fs=require('node:fs'),path=require('node:path');
const E=require('../assets/js/options-execution.js');
const ROOT='https://www.deribit.com/api/v2/public/';
const DEST=path.join(__dirname,'../assets/data/deribit/quote-history.json');
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
async function run(){
 const now=Date.now();
 const [serverTime,index,instruments]=await Promise.all([
  fetchRpc('get_time'),fetchRpc('get_index_price',{index_name:'btc_usd'}),
  fetchRpc('get_instruments',{currency:'BTC',kind:'option',expired:'false'})
 ]);
 const spot=index.index_price;
 if(typeof serverTime!=='number'||Math.abs(now-serverTime)>90000)throw Error('Server clock skew too large');
 if(!Number.isFinite(spot)||spot<=0||!Array.isArray(instruments)||instruments.length<50)throw Error('Invalid official BTC market chain');
 const selection=chooseContracts(instruments,spot,now);
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
 let old={schemaVersion:1,snapshots:[]};
 try{old=JSON.parse(fs.readFileSync(DEST,'utf8'));}catch{}
 if(old.schemaVersion!==1||!Array.isArray(old.snapshots))throw Error('Historical snapshot schema mismatch');
 if(old.snapshots.length&&now-old.snapshots.at(-1).at<60*60*1000){console.log('Existing snapshot newer than 1h; no duplicate');return;}
 const item={at:now,spot,contracts};
 old.snapshots.push(item);
 old.snapshots=old.snapshots.sort((a,b)=>a.at-b.at).filter((x,i,arr)=>i===0||x.at>arr[i-1].at).slice(-540);
 const audit={source:'Deribit production public API',checkedAt:new Date(now).toISOString(),
  serverTime:new Date(serverTime).toISOString(),clockSkewMs:serverTime-now,spot,
  listedInstruments:instruments.length,selected:selection.length,verified:symbols.length,
  rejected:failures.length,failures:failures.slice(0,10),historyObservations:old.snapshots.length,
  limitations:'Best bid/ask are not guaranteed fills; 4-hour snapshot frequency. Past order books cannot be reconstructed by requesting current ticker.'};
 fs.mkdirSync(path.dirname(DEST),{recursive:true});
 fs.writeFileSync(DEST,JSON.stringify(old)+'\n');
 fs.writeFileSync(AUDIT,JSON.stringify(audit,null,2)+'\n');
 console.log(JSON.stringify(audit));
}
if(require.main===module)run().catch(e=>{console.error('DERIBIT AUDIT FAILED:',e.stack);process.exitCode=1;});
module.exports={chooseContracts,run};
