/* Chronological out-of-sample validation, with parameter selection frozen before holdout.
 * This is a quote replay study, NOT confirmation of a trading edge. */
(function(root,factory){
 const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.OptionsOOS=api;
})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 const strategies=['long-call','straddle','bull-call','bear-put','iron-condor'];
 function summarize(trades){
  let gains=0,losses=0,net=0,peak=0,maxDD=0,wins=0;
  for(const t of trades){
   const p=t.pnlBtc;
   if(!Number.isFinite(p))throw Error('Invalid trade PnL');
   if(p>0){gains+=p;wins++;}else if(p<0)losses-=p;
   net+=p;peak=Math.max(peak,net);maxDD=Math.max(maxDD,peak-net);
  }
  return {count:trades.length,net,mean:trades.length?net/trades.length:null,
   winRate:trades.length?wins/trades.length:null,profitFactor:losses>0?gains/losses:null,maxDD};
 }
 function evaluate(replayEngine,data,config={}){
  if(!Array.isArray(data?.snapshots)||!replayEngine?.replay)throw Error('Missing replay engine or historical archive');
  const snapshots=data.snapshots.slice().sort((a,b)=>a.at-b.at);
  const cut=Math.floor(snapshots.length*0.7);
  const splitAt=snapshots[cut]?.at??null;
  const train=snapshots.slice(0,cut),test=snapshots.slice(cut);
  const results={splitAt,trainSnapshots:train.length,testSnapshots:test.length,
    splitRatio:'70% chronological training / 30% untouched holdout',selected:null,
    train:null,test:null,candidates:[],eligible:false};
  if(train.length<4||test.length<4)return {...results,reason:'歷史期間不足以進行時間序列樣本外切分'};
  for(const strategy of strategies){
   const replay=replayEngine.replay({snapshots:train},{...config,strategy});
   const metrics=summarize(replay.trades);
   results.candidates.push({strategy,...metrics});
  }
  // These exact thresholds are fixed in advance, not tuned to the holdout.
  const eligible=results.candidates.filter(r=>r.count>=20&&r.mean>0&&r.maxDD>=0);
  if(!eligible.length)return {...results,reason:'訓練期至少需要 20 筆完整交易且平均淨損益為正；目前不選策略'};
  eligible.sort((a,b)=>b.mean-a.mean||a.strategy.localeCompare(b.strategy));
  const chosen=eligible[0];
  const testReplay=replayEngine.replay({snapshots:test},{...config,strategy:chosen.strategy});
  const holdout=summarize(testReplay.trades);
  return {...results,selected:chosen.strategy,train:chosen,test:holdout,eligible:holdout.count>=20,
   reason:holdout.count<20?'樣本外完整交易少於 20 筆，禁止宣稱策略有預測優勢':
    holdout.mean<=0?'樣本外淨績效不佳；訓練期表現未能延續，無法證實優勢':
    '樣本外淨績效為正，但仍需考量樣本代表性、滑價、手續費與參數選擇偏誤'};
 }
 return {evaluate,summarize,strategies};
});
