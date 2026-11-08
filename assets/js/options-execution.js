/* Deribit BTC inverse options: buy at ask, sell at bid. Native premium BTC,
 * multiplied by contract size in BTC and by current USD/BTC for indicative USD cash.
 * No fills are implied by top-of-book quotes. */
(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.DeribitExecution=api;
})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 const good=n=>typeof n==='number'&&Number.isFinite(n);
 function instrument(expiry,strike,type){
  if(!/^\d{1,2}[A-Z]{3}\d{2}$/.test(expiry)||!good(strike)||strike<=0||!['C','P'].includes(type))throw Error('無效的 Deribit 選擇權合約');
  return 'BTC-'+expiry+'-'+strike+'-'+type;
 }
 function validateTicker(result,spec,now=Date.now()){
  const r=result&&result.ticker||result,meta=result&&result.instrument||{};
  if(!r||!meta||r.state!=='open')return {valid:false,reason:'合約非開盤可交易狀態'};
  const ts=r.timestamp;
  if(!good(ts)||Math.abs(now-ts)>120000)return {valid:false,reason:'市場報價超過 2 分鐘或時間戳無效'};
  const size=meta.contract_size;
  if(!good(size)||size<=0)return {valid:false,reason:'無法核實合約乘數'};
  if(meta.kind!=='option'||meta.base_currency!=='BTC'||(meta.settlement_currency&&meta.settlement_currency!=='BTC'))return {valid:false,reason:'非 BTC 交割的選擇權合約'};
  const bid=r.best_bid_price,ask=r.best_ask_price;
  if(!good(bid)||!good(ask)||bid<=0||ask<=bid)return {valid:false,reason:'缺少有效且有序的 Bid / Ask'};
  const bidQty=r.best_bid_amount,askQty=r.best_ask_amount;
  if(!good(bidQty)||!good(askQty)||bidQty<=0||askQty<=0)return {valid:false,reason:'最優價位無有效掛單量'};
  const spread=(ask-bid)/((ask+bid)/2)*100;
  if(spread>25)return {valid:false,reason:'買賣價差過大（'+spread.toFixed(1)+'%）'};
  if(!good(spec.qty)||spec.qty<=0)return {valid:false,reason:'無效部位數量'};
  // Quantity is Deribit option amount in BTC units, not a generic count of contracts.
  const amount=spec.qty*size;
  const available=spec.direction>0?askQty:bidQty;
  if(available+1e-8<amount)return {valid:false,reason:'最優價位掛單量不足（需 '+amount+' BTC，僅 '+available+' BTC）'};
  if(!good(spec.spot)||spec.spot<=0)return {valid:false,reason:'缺少有效 BTC/USD 參考價'};
  const quoteBtc=spec.direction>0?ask:bid;
  return {valid:true,quoteBtc:quoteBtc,entryUsd:quoteBtc*spec.spot*size,contractSize:size,availableAmount:available,spreadPct:spread,ageSeconds:Math.max(0,(now-ts)/1000),timestamp:ts,side:spec.direction>0?'Ask':'Bid'};
 }
 function normCdf(x){
  const t=1/(1+0.2316419*Math.abs(x));
  const p=0.3989422804*Math.exp(-x*x/2)*t*(0.3193815+t*(-0.3565638+t*(1.78147794+t*(-1.821255978+t*1.330274429))));
  return x>=0?1-p:p;
 }
 function black76(type,F,K,T,sigma){
  if(!good(F)||F<=0||!good(K)||K<=0)return NaN;
  if(T<=0||sigma<=0)return type==='C'?Math.max(F-K,0):Math.max(K-F,0);
  const v=sigma*Math.sqrt(T),d1=(Math.log(F/K)+v*v/2)/v,d2=d1-v;
  return type==='C'?F*normCdf(d1)-K*normCdf(d2):K*normCdf(-d2)-F*normCdf(-d1);
 }
 function terminalLeg(leg,spot){
  const qty=(leg.qty||1),scale=leg.contractSize||1,d=leg.d;
  if(leg.t==='U')return d*qty*(spot-leg.entry);
  if(leg.t==='F')return d*qty*(spot-leg.K);
  const intrinsic=leg.t==='C'?Math.max(spot-leg.K,0):Math.max(leg.K-spot,0);
  return d*qty*(intrinsic*scale-leg.prem);
 }
 function terminalPnl(legs,spot){return legs.reduce((v,l)=>v+terminalLeg(l,spot),0);}
 function extrema(legs,spot){
  const strikes=legs.filter(l=>l.t==='C'||l.t==='P').map(l=>l.K);
  const points=[0,...strikes].filter((v,i,a)=>a.indexOf(v)===i).sort((a,b)=>a-b);
  const values=points.map(x=>terminalPnl(legs,x));
  const slope=legs.reduce((n,l)=>n+l.d*(l.qty||1)*((l.t==='C'?(l.contractSize||1):l.t==='U'||l.t==='F'?1:0)),0);
  const maxProfit=slope>0?Infinity:Math.max(...values),maxLoss=slope<0?-Infinity:Math.min(...values);
  const breakevens=[];
  const push=x=>{if(good(x)&&x>=0&&!breakevens.some(v=>Math.abs(v-x)<1e-6))breakevens.push(x);};
  points.forEach((x,i)=>{
   const y=values[i];if(Math.abs(y)<1e-8)push(x);
   if(i+1<points.length){
    const z=points[i+1],zy=values[i+1];
    if(y*zy<0)push(x-y*(z-x)/(zy-y));
   }else if(Math.abs(slope)>1e-10){const z=x-y/slope;if(z>x)push(z);}
  });
  breakevens.sort((a,b)=>a-b);
  return {maxProfit,maxLoss,breakevens,netDebit:legs.reduce((v,l)=>v+(l.t==='C'||l.t==='P'?l.d*(l.qty||1)*l.prem:0),0)};
 }
 function scenarioPnl(legs,spot,daysLeft,ivShift,baseIv,basisPct=0){
  if(!good(spot)||spot<=0||!good(daysLeft)||daysLeft<0)return NaN;
  const T=daysLeft/365,F=spot*(1+basisPct*T/100);
  return legs.reduce((sum,l)=>{
   if(l.t==='U'||l.t==='F')return sum+terminalLeg(l,spot);
   const iv=Math.max(0.01,(good(l.iv)?l.iv:baseIv)+ivShift)/100;
   const value=black76(l.t,F,l.K,T,iv)*(l.contractSize||1);
   return sum+l.d*(l.qty||1)*(value-l.prem);
  },0);
 }
 return {instrument,validateTicker,black76,terminalPnl,extrema,scenarioPnl};
});
