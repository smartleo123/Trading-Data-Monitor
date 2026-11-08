const {test}=require('node:test'),assert=require('node:assert/strict');
const R=require('../assets/js/options-replay.js');
const {chooseContracts}=require('../scripts/record-deribit.cjs');
const DAY=86400000,now=Date.parse('2026-11-01T08:00:00Z');
function fixture(days=32,missingExit=false){
 const expiry=now+60*DAY,contracts={};
 for(const strike of [88000,94000,100000,106000,112000])for(const type of ['C','P']){
  contracts['BTC-31DEC26-'+strike+'-'+type]={
   bid:0.04,ask:0.042,bidAmount:2,askAmount:2,
   strike,type,expiryAt:expiry,contractSize:1,bookAt:now
  };
 }
 const snapshots=Array.from({length:days},(_,i)=>{
  const at=now+i*DAY,book={};
  for(const [name,q] of Object.entries(contracts)){
   book[name]={...q,bookAt:at,bid:q.bid+i*0.0001,ask:q.ask+i*0.0001};
  }
  if(missingExit&&i===3)delete book['BTC-31DEC26-100000-C'];
  return {at,spot:100000,contracts:book};
 });
 return {schemaVersion:1,snapshots};
}
test('replay requires actual matching top-of-book snapshots, no future leakage',()=>{
 const h=fixture(32);
 const r=R.replay(h,{strategy:'straddle',holdDays:3,qty:0.1,feeBtc:0});
 assert.ok(r.tradeCount>=8);
 assert.equal(r.adequate,false);
 assert.equal(r.trades[0].entryAt,now);
 assert.equal(r.trades[0].exitAt,now+3*DAY);
 assert.ok(r.trades.every((t,i)=>i===0||t.entryAt>=r.trades[i-1].exitAt));
 assert.ok(r.trades.every(t=>t.pnlBtc>0));
});
test('replay refuses to create performance claims without 20 complete trades',()=>{
 const r=R.replay(fixture(6),{strategy:'long-call',holdDays:3});
 assert.equal(r.adequate,false);
 assert.match(r.verdict,/樣本不足/);
});
test('replay discards missing exit books, stale timestamps and illiquid quotes',()=>{
 const h=fixture(12,true);
 const r=R.replay(h,{strategy:'straddle',holdDays:3});
 assert.ok(r.skipped>0);
 const q=h.snapshots[0].contracts['BTC-31DEC26-100000-C'];
 assert.equal(R.valid({...q,askAmount:0.01},h.snapshots[0].at,0.1),false);
 assert.equal(R.valid({...q,bookAt:0},h.snapshots[0].at,0.1),false);
});
test('market-universe selection uses exact strikes and derivatives of real expiries',()=>{
 const expiry=now+30*DAY,base={kind:'option',settlement_currency:'BTC',base_currency:'BTC',is_active:true,expiration_timestamp:expiry};
 const instruments=[90000,100000,110000].flatMap(k=>['call','put'].map(t=>({...base,strike:k,option_type:t,instrument_name:'BTC-1DEC26-'+k+'-'+(t==='call'?'C':'P')})));
 const selected=chooseContracts(instruments,100000,now);
 assert.equal(selected.length,6);
 assert.ok(selected.every(q=>q.settlement_currency==='BTC'));
});
