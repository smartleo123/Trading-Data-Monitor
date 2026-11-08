const {test}=require('node:test');
const assert=require('node:assert/strict');
const E=require('../assets/js/options-execution.js');
const now=Date.now();
const base={ticker:{state:'open',timestamp:now,best_bid_price:0.040,best_ask_price:0.042,best_bid_amount:5,best_ask_amount:5},instrument:{kind:'option',base_currency:'BTC',settlement_currency:'BTC',contract_size:1,expiration_timestamp:now+30*86400000,instrument_name:'BTC-27NOV26-80000-C',strike:80000,option_type:'call',min_trade_amount:0.1}};
test('Deribit inverse BTC premium uses ask for buy, bid for sell and converts BTC to USD',()=>{
 const buy=E.validateTicker(base,{qty:1,direction:1,spot:80000,instrument_name:'BTC-27NOV26-80000-C'},now);
 const sell=E.validateTicker(base,{qty:1,direction:-1,spot:80000,instrument_name:'BTC-27NOV26-80000-C'},now);
 assert.equal(buy.valid,true);assert.equal(buy.entryUsd,3360);assert.equal(buy.side,'Ask');
 assert.equal(sell.entryUsd,3200);assert.equal(sell.side,'Bid');
});
test('invalid market quotes are rejected, never labeled executable',()=>{
 const cases=[
  {ticker:{...base.ticker,best_ask_price:0}},
  {ticker:{...base.ticker,timestamp:now-180000}},
  {ticker:{...base.ticker,best_ask_amount:0.2}},
  {ticker:{...base.ticker,best_ask_price:0.1}},
  {instrument:{...base.instrument,contract_size:null}},
  {ticker:{...base.ticker,state:'closed'}}
 ];
 for(const c of cases){
  const r=E.validateTicker({...base,...c},{qty:1,direction:1,spot:80000},now);
  assert.equal(r.valid,false,JSON.stringify(c));
 }
});
test('long call actual premium gives correct max loss and break-even',()=>{
 const legs=[{t:'C',K:80000,prem:3360,qty:1,d:1,contractSize:1}];
 const m=E.extrema(legs,80000);
 assert.equal(m.maxLoss,-3360);assert.equal(m.maxProfit,Infinity);
 assert.deepEqual(m.breakevens,[83360]);assert.equal(E.terminalPnl(legs,90000),6640);
});
test('credit spread max profit/loss and break-even reflect bid/ask entry',()=>{
 const legs=[{t:'P',K:80000,prem:4000,qty:1,d:-1},{t:'P',K:75000,prem:1800,qty:1,d:1}];
 const m=E.extrema(legs,80000);
 assert.equal(m.maxProfit,2200);
 assert.equal(m.maxLoss,-2800);
 assert.deepEqual(m.breakevens,[77800]);
});
test('scenario reprices remaining time and IV shocks, not terminal intrinsic',()=>{
 const legs=[{t:'C',K:80000,prem:3360,qty:1,d:1,iv:50}];
 const atExpiry=E.scenarioPnl(legs,80000,0,0,50);
 const beforeExpiry=E.scenarioPnl(legs,80000,25,0,50);
 const highIv=E.scenarioPnl(legs,80000,25,10,50);
 assert.equal(atExpiry,-3360);assert.ok(beforeExpiry>atExpiry);
 assert.ok(highIv>beforeExpiry);
});
test('invalid instrument name rejects injection and non-matching expiry',()=>{
 assert.equal(E.instrument('27NOV26',80000,'C'),'BTC-27NOV26-80000-C');
 assert.throws(()=>E.instrument('abc/../../',80000,'C'));
});

test('inverse BTC option expires into BTC payout and USD-equivalent uses EXIT spot',()=>{
 const leg={t:'C',d:1,qty:1,K:80000,contractSize:1,entryBtc:0.042};
 assert.ok(Math.abs(E.inversePnlBtc([leg],90000)-(10000/90000-0.042))<1e-10);
 assert.ok(Math.abs(E.inversePnlUsd([leg],90000)-6220)<1e-8);
 const r=E.inverseMetrics([leg],80000);
 assert.ok(Math.abs(r.breakevens[0]-80000/(1-0.042))<1e-6);
 assert.equal(r.maxLoss,-3360);
 const up=E.inverseScenarioUsd([leg],80000,25,10,50);
 const down=E.inverseScenarioUsd([leg],80000,25,-10,50);
 assert.ok(up>down);
});
test('actual Deribit contract identity and expiry must match the requested quote',()=>{
 const wrong={...base,instrument:{...base.instrument,instrument_name:'BTC-27NOV26-85000-C'}};
 const r=E.validateTicker(wrong,{qty:1,direction:1,spot:80000,instrument_name:'BTC-27NOV26-80000-C'},now);
 assert.equal(r.valid,false);
 assert.match(r.reason,/代號不一致/);
});
