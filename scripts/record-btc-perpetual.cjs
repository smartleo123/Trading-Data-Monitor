'use strict';
/* Verified Deribit BTC-PERPETUAL closed 1h candles and 8h funding. */
const fs=require('node:fs'),path=require('node:path');
const signal=require('../assets/js/perpetual-signals.js');
const OUT=path.join(__dirname,'../assets/data/deribit/perpetual-signal.json');
async function request(method,params){
 const url=new URL('https://www.deribit.com/api/v2/public/'+method);
 Object.entries(params).forEach(([k,v])=>url.searchParams.set(k,String(v)));
 const c=new AbortController(),timer=setTimeout(()=>c.abort(),15000);
 try{
  const r=await fetch(url,{signal:c.signal,headers:{Accept:'application/json'}});
  if(!r.ok)throw Error(method+' HTTP '+r.status);
  const j=await r.json();
  if(j.error||!j.result)throw Error('Deribit '+method+': '+JSON.stringify(j.error||'missing result'));
  return j.result;
 }finally{clearTimeout(timer);}
}
function normalize(chart,now){
 if(!chart||chart.status!=='ok'||!Array.isArray(chart.ticks)||chart.ticks.length<60)throw Error('Insufficient Deribit chart response');
 const n=chart.ticks.length;
 for(const col of ['open','high','low','close'])if(!Array.isArray(chart[col])||chart[col].length!==n)throw Error('Incomplete Deribit OHLC column '+col);
 const bars=[];
 for(let i=0;i<n;i++){
  const b={t:chart.ticks[i],o:chart.open[i],h:chart.high[i],l:chart.low[i],c:chart.close[i]};
  if(b.t+3600000>now)continue; // never use a partially formed hourly candle
  if(!Object.values(b).every(Number.isFinite)||b.h<b.l||b.l<=0||Math.max(b.o,b.c)>b.h||Math.min(b.o,b.c)<b.l)throw Error('Invalid Deribit OHLC');
  bars.push(b);
 }
 bars.sort((a,b)=>a.t-b.t);
 for(let i=1;i<bars.length;i++)if(bars[i].t-bars[i-1].t!==3600000)throw Error('Hourly candle gap / duplicate');
 if(bars.length<60||now-bars.at(-1).t>3*3600000)throw Error('Recent Deribit hourly candle unavailable');
 return bars.slice(-210);
}
async function run(){
 const now=Date.now();
 const [ticker,chart]=await Promise.all([
  request('ticker',{instrument_name:'BTC-PERPETUAL'}),
  request('get_tradingview_chart_data',{instrument_name:'BTC-PERPETUAL',
   start_timestamp:now-230*3600000,end_timestamp:now,resolution:'60'})
 ]);
 if(ticker.instrument_name!=='BTC-PERPETUAL'||ticker.state!=='open'||
   !Number.isFinite(ticker.timestamp)||Math.abs(now-ticker.timestamp)>90000||
   !Number.isFinite(ticker.funding_8h))throw Error('Stale/mismatched perpetual ticker');
 const bars=normalize(chart,now);
 const snapshot={schemaVersion:1,source:'Deribit BTC-PERPETUAL',
  asOf:now,tickerAt:ticker.timestamp,funding8h:ticker.funding_8h*100,
  markPrice:ticker.mark_price,bars};
 const decision=signal.evaluate(snapshot,now);
 if(!decision.metrics)throw Error('Signal calculation failed: '+decision.reason.join('; '));
 snapshot.analysis={state:decision.state,asOf:now,computedFromClosedCandles:true};
 fs.mkdirSync(path.dirname(OUT),{recursive:true});
 fs.writeFileSync(OUT,JSON.stringify(snapshot)+'\n');
 console.log('Saved Deribit BTC perpetual',JSON.stringify({state:decision.state,asOf:now,close:decision.metrics.close,closedAt:decision.metrics.closedAt,bars:bars.length,fundingPct:snapshot.funding8h}));
}
if(require.main===module)run().catch(e=>{console.error(e.stack);process.exitCode=1;});
module.exports={normalize,run};
