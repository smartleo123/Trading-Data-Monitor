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
  const fail=reason=>({valid:false,reason});
  if(!r||!meta||r.state!=='open')return fail('訂單簿不是 open 可交易狀態');
  const name=spec.instrument_name||result&&result.requestedName;
  if(name&&((r.instrument_name&&r.instrument_name!==name)||(meta.instrument_name&&meta.instrument_name!==name)))
   return fail('回傳合約代號不一致');
  const ts=r.timestamp;
  if(!good(ts)||now-ts< -10000||now-ts>90000)return fail('訂單簿時間戳已過期、超前或缺失（須在 90 秒內）');
  const size=meta.contract_size;
  if(!good(size)||size<=0)return fail('合約乘數未核實');
  if(meta.kind!=='option'||meta.base_currency!=='BTC'||meta.settlement_currency!=='BTC')return fail('並非 BTC 計價/交割反向選擇權');
  if(meta.is_active===false)return fail('合約已停止交易');
  if(!good(meta.expiration_timestamp)||meta.expiration_timestamp<=now)return fail('合約已到期或到期日無效');
  const parseName=/^BTC-(\\d{1,2}[A-Z]{3}\\d{2})-(\\d+)-(C|P)$/;
  const identity=parseName.exec(name||meta.instrument_name||'');
  if(!identity)return fail('無法確認 BTC 合約代號');
  if(good(meta.strike)&&Math.abs(meta.strike-Number(identity[2]))>0.01)return fail('履約價不一致');
  if(meta.option_type&&meta.option_type!==(identity[3]==='C'?'call':'put'))return fail('買權／賣權類型不一致');
  const bid=r.best_bid_price,ask=r.best_ask_price;
  if(!good(bid)||!good(ask)||bid<=0||ask<=bid)return fail('雙邊報價不存在或無效');
  const bidQty=r.best_bid_amount,askQty=r.best_ask_amount;
  if(!good(bidQty)||!good(askQty)||bidQty<=0||askQty<=0)return fail('最優檔掛單量不存在');
  const spread=(ask-bid)/((ask+bid)/2)*100;
  if(spread>20)return fail('買賣價差超過 20%：'+spread.toFixed(2)+'%');
  if(!good(spec.qty)||spec.qty<=0)return fail('部位數量無效');
  if(good(meta.min_trade_amount)&&spec.qty<meta.min_trade_amount-1e-8)return fail('小於最低交易量');
  const amount=spec.qty;
  const available=spec.direction>0?askQty:bidQty;
  if(available+1e-8<amount)return fail('最佳檔掛單量不足：需 '+amount+'，僅 '+available);
  const spot=good(r.index_price)&&r.index_price>0?r.index_price:spec.spot;
  if(!good(spot)||spot<=0)return fail('無有效 Deribit BTC 指數價');
  if(good(spec.spot)&&spec.spot>0&&Math.abs(spot/spec.spot-1)>0.03)return fail('交易所與頁面指數價差逾 3%');
  const quoteBtc=spec.direction>0?ask:bid;
  return {valid:true,quoteBtc,entryUsd:quoteBtc*spot*size,contractSize:size,
   amount,availableAmount:available,spreadPct:spread,ageSeconds:Math.max(0,(now-ts)/1000),
   timestamp:ts,side:spec.direction>0?'Ask':'Bid',spot,source:'Deribit order book'};
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
 // Deribit inverse BTC options: premium paid/received in BTC at entry,
 // intrinsic settled in BTC as intrinsic_USD / delivery_BTC_USD.
 // USD-equivalent is marked at *scenario/exit spot*, not entry spot.
 function inversePnlBtc(legs,exitSpot){
  if(!good(exitSpot)||exitSpot<=0)return NaN;
  return legs.reduce((sum,l)=>{
   if(l.t!=='C'&&l.t!=='P')return NaN;
   const multiplier=l.contractSize||1,qty=l.qty||1;
   const intrinsic=l.t==='C'?Math.max(exitSpot-l.K,0):Math.max(l.K-exitSpot,0);
   const premiumBtc=good(l.entryBtc)?l.entryBtc:l.quote&&l.quote.quoteBtc;
   if(!good(premiumBtc))return NaN;
   return sum+l.d*qty*multiplier*(intrinsic/exitSpot-premiumBtc)-(l.feeBtc||0)*qty;
  },0);
 }
 function inversePnlUsd(legs,exitSpot){return inversePnlBtc(legs,exitSpot)*exitSpot;}
 function inverseMetrics(legs,entrySpot){
  if(!legs.length||legs.some(l=>!['C','P'].includes(l.t)||!good(l.entryBtc??(l.quote&&l.quote.quoteBtc))))return null;
  const strikes=[...new Set([0,...legs.map(l=>l.K)])].sort((a,b)=>a-b);
  const values=strikes.map(s=>legs.reduce((sum,l)=>{
   const p=l.entryBtc??l.quote.quoteBtc,m=l.contractSize||1,q=l.qty||1;
   const intrinsic=l.t==='C'?Math.max(s-l.K,0):Math.max(l.K-s,0);
   return sum+l.d*q*m*(intrinsic-p*s)-(l.feeBtc||0)*q*s;
  },0));
  const highSlope=legs.reduce((sum,l)=>sum+l.d*(l.qty||1)*(l.contractSize||1)*((l.t==='C'?1:0)-(l.entryBtc??l.quote.quoteBtc))-(l.feeBtc||0)*(l.qty||1),0);
  const breakevens=[];
  const put=x=>{if(good(x)&&x>0&&!breakevens.some(y=>Math.abs(x-y)<1e-5))breakevens.push(x);};
  strikes.forEach((x,i)=>{
    const v=values[i];if(Math.abs(v)<1e-7&&x>0)put(x);
    if(i+1<strikes.length){
      const y=strikes[i+1],w=values[i+1];
      if(v*w<0)put(x-v*(y-x)/(w-v));
    }else if(Math.abs(highSlope)>1e-10){const z=x-v/highSlope;if(z>x)put(z);}
  });
  const maxProfit=highSlope>0?Infinity:Math.max(...values);
  const maxLoss=highSlope<0?-Infinity:Math.min(...values);
  return {maxProfit,maxLoss,breakevens:breakevens.sort((a,b)=>a-b),
    entryNetBtc:legs.reduce((v,l)=>v+l.d*(l.qty||1)*(l.contractSize||1)*(l.entryBtc??l.quote.quoteBtc),0),
    entryNetUsd:legs.reduce((v,l)=>v+l.d*(l.qty||1)*(l.contractSize||1)*(l.entryBtc??l.quote.quoteBtc)*entrySpot,0),
    atSpot:inversePnlUsd(legs,entrySpot)};
 }
 function inverseScenarioUsd(legs,spot,daysLeft,ivShift,baseIv,basisPct=0){
  if(!good(spot)||spot<=0||!good(daysLeft)||daysLeft<0)return NaN;
  const T=daysLeft/365,F=spot*(1+basisPct*T/100);
  return legs.reduce((sum,l)=>{
    if(!['C','P'].includes(l.t))return NaN;
    const vol=Math.max(0.01,((good(l.iv)?l.iv:baseIv)+ivShift)/100);
    const exitUsd=black76(l.t,F,l.K,T,vol);
    const premiumBtc=l.entryBtc??(l.quote&&l.quote.quoteBtc);
    return sum+l.d*(l.qty||1)*(l.contractSize||1)*(exitUsd-premiumBtc*spot)-(l.feeBtc||0)*(l.qty||1)*spot;
  },0);
 }
 return {instrument,validateTicker,black76,terminalPnl,extrema,scenarioPnl,
   inversePnlBtc,inversePnlUsd,inverseMetrics,inverseScenarioUsd};
});
