/* Conservative, forward-only replay of archived real public Deribit top-of-book snapshots.
 * Public quotes are indicative; this is NOT a historical filled-order backtest. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.DeribitReplay=api;
})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 const DAY=86400000;
 const optionName=/^BTC-\d{1,2}[A-Z]{3}\d{2}-\d+-(C|P)$/;
 function valid(q,t,qty){
  return q&&Number.isFinite(q.bid)&&q.bid>0&&Number.isFinite(q.ask)&&q.ask>q.bid&&
   (q.ask-q.bid)/((q.ask+q.bid)/2)<=0.2 &&
   Number.isFinite(q.bidAmount)&&q.bidAmount>=qty&&Number.isFinite(q.askAmount)&&q.askAmount>=qty &&
   Number.isFinite(q.bookAt)&&Math.abs(t-q.bookAt)<120000&&
   Number.isFinite(q.contractSize)&&q.contractSize>0&&Number.isFinite(q.expiryAt)&&q.expiryAt>t;
 }
 function choose(snapshot,strategy,qty){
  const spot=snapshot.spot,at=snapshot.at;
  if(!Number.isFinite(spot)||spot<=0)return null;
  const groups={};
  for(const [name,q] of Object.entries(snapshot.contracts||{})){
   if(!optionName.test(name)||!valid(q,at,qty))continue;
   const d=(q.expiryAt-at)/DAY;
   if(d<15||d>65)continue;
   (groups[q.expiryAt]??=[]).push({name,...q});
  }
  const expiries=Object.keys(groups).map(Number).sort((a,b)=>Math.abs((a-at)/DAY-30)-Math.abs((b-at)/DAY-30));
  for(const expiry of expiries){
   const rows=groups[expiry];
   function strike(type,ratio,used=[]){
    return rows.filter(q=>q.type===type&&!used.includes(q.name))
     .sort((a,b)=>Math.abs(a.strike-spot*ratio)-Math.abs(b.strike-spot*ratio))[0];
   }
   let selected;
   if(strategy==='long-call')selected=[[strike('C',1),1]];
   else if(strategy==='straddle')selected=[[strike('C',1),1],[strike('P',1),1]];
   else if(strategy==='bull-call')selected=[[strike('C',1),1],[strike('C',1.06),-1]];
   else if(strategy==='bear-put')selected=[[strike('P',1),1],[strike('P',0.94),-1]];
   else if(strategy==='iron-condor')selected=[
    [strike('P',0.88),1],[strike('P',0.94),-1],[strike('C',1.06),-1],[strike('C',1.12),1]];
   else throw Error('Unsupported strategy');
   if(selected.every(v=>v[0]&&Number.isFinite(v[0].strike))){
    const keys=selected.map(([r])=>r.name);
    if(new Set(keys).size!==keys.length)continue;
    if(strategy==='bull-call'&&selected[0][0].strike>=selected[1][0].strike)continue;
    if(strategy==='bear-put'&&selected[0][0].strike<=selected[1][0].strike)continue;
    if(strategy==='iron-condor'&&!selected.every((v,i)=>i===0||selected[i-1][0].strike<v[0].strike))continue;
    return selected.map(([q,direction])=>({name:q.name,direction,expiryAt:expiry,strike:q.strike}));
   }
  }
  return null;
 }
 function replay(input,config={}){
  const h=(input&&input.snapshots||[]).filter(x=>x&&Number.isFinite(x.at)&&Number.isFinite(x.spot)&&x.spot>0)
   .sort((a,b)=>a.at-b.at);
  const strategy=config.strategy||'straddle',holdDays=config.holdDays??3,qty=config.qty??0.1,feePerSide=config.feeBtc??0.0003;
  if(!Number.isFinite(holdDays)||holdDays<1||holdDays>14||!Number.isFinite(qty)||qty<=0||
     !Number.isFinite(feePerSide)||feePerSide<0)throw Error('Invalid replay configuration');
  const trades=[];let skipped=0,nextEntry=0;
  for(let i=0;i<h.length;i++){
   const entry=h[i];if(entry.at<nextEntry)continue;
   const legs=choose(entry,strategy,qty);if(!legs){skipped++;continue;}
   const target=entry.at+holdDays*DAY;
   const end=h.find(x=>x.at>=target&&x.at<=target+18*3600000&&x.at<legs[0].expiryAt);
   if(!end){skipped++;continue;}
   const matched=legs.every(l=>valid(entry.contracts[l.name],entry.at,qty)&&valid(end.contracts?.[l.name],end.at,qty));
   if(!matched){skipped++;continue;}
   let totalBtc=0,feesBtc=0;const details=[];
   for(const leg of legs){
    const a=entry.contracts[leg.name],b=end.contracts[leg.name];
    const entryFill=leg.direction>0?a.ask:a.bid;
    const exitFill=leg.direction>0?b.bid:b.ask;
    const scale=a.contractSize;
    if(Math.abs(scale-b.contractSize)>1e-8){totalBtc=NaN;break;}
    const legFee=qty*scale*feePerSide*2;
    const result=qty*scale*leg.direction*(exitFill-entryFill)-legFee;
    totalBtc+=result;feesBtc+=legFee;
    details.push({name:leg.name,direction:leg.direction,entryBtc:entryFill,exitBtc:exitFill});
   }
   if(!Number.isFinite(totalBtc)){skipped++;continue;}
   trades.push({entryAt:entry.at,exitAt:end.at,entrySpot:entry.spot,exitSpot:end.spot,
    pnlBtc:+totalBtc.toFixed(8),pnlUsd:+(totalBtc*end.spot).toFixed(2),feesBtc:+feesBtc.toFixed(8),legs:details});
   nextEntry=end.at;
  }
  const n=trades.length,grossWin=trades.filter(t=>t.pnlBtc>0).reduce((s,t)=>s+t.pnlBtc,0);
  const grossLoss=-trades.filter(t=>t.pnlBtc<0).reduce((s,t)=>s+t.pnlBtc,0);
  let equity=0,peak=0,maxDD=0;
  trades.forEach(t=>{equity+=t.pnlBtc;peak=Math.max(peak,equity);maxDD=Math.max(maxDD,peak-equity);});
  return {strategy,holdDays,snapshots:h.length,from:h[0]?.at||null,to:h.at(-1)?.at||null,skipped,
   trades,tradeCount:n,adequate:n>=20,
   winRate:n?trades.filter(t=>t.pnlBtc>0).length/n:null,
   avgBtc:n?equity/n:null,totalBtc:equity,
   profitFactor:grossLoss?grossWin/grossLoss:null,
   maxDrawdownBtc:maxDD,
   verdict:n<20?'有效、互不重疊的進出場樣本不足（需至少 20 筆）。不顯示策略優勢結論。':
    '僅為已記錄最佳檔報價的歷史重播；不保證真實成交、費用與滑價可重現。'
  };
 }
 return {replay,choose,valid};
});
