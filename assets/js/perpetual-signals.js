/* BTC perpetual entry assistance: indicators from confirmed Deribit hourly bars.
 * Descriptive decision rules only, not a backtested or executable signal. */
(function(root,factory){
 const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.PerpetualSignals=api;
})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 const num=x=>typeof x==='number'&&Number.isFinite(x);
 function ema(values,period){
  if(values.length<period)return NaN;
  let a=values.slice(0,period).reduce((s,v)=>s+v,0)/period;
  for(let i=period;i<values.length;i++)a=(values[i]*2+a*(period-1))/(period+1);
  return a;
 }
 function rsi(values,period=14){
  if(values.length<period+1)return NaN;
  let gain=0,loss=0;
  for(let i=1;i<=period;i++){const d=values[i]-values[i-1];gain+=Math.max(d,0);loss+=Math.max(-d,0);}
  gain/=period;loss/=period;
  for(let i=period+1;i<values.length;i++){const d=values[i]-values[i-1];gain=(gain*(period-1)+Math.max(d,0))/period;loss=(loss*(period-1)+Math.max(-d,0))/period;}
  return loss===0?(gain===0?50:100):100-100/(1+gain/loss);
 }
 function atr(bars,period=14){
  if(bars.length<period+1)return NaN;
  const ranges=bars.slice(1).map((b,i)=>Math.max(b.h-b.l,Math.abs(b.h-bars[i].c),Math.abs(b.l-bars[i].c)));
  let avg=ranges.slice(0,period).reduce((s,v)=>s+v,0)/period;
  for(let i=period;i<ranges.length;i++)avg=(avg*(period-1)+ranges[i])/period;
  return avg;
 }
 function evaluate(input,now=Date.now()){
  const out={state:'WAIT',side:null,reason:[],metrics:null,entry:null,stop:null,target:null,riskPct:null,asOf:input?.asOf||null,
   disclaimer:'條件式參考訊號，尚未歷史回測。不是訂單建議；入場需確認實際 Bid／Ask、滑價及保證金。'};
  const bars=input?.bars,funding=input?.funding8h;
  if(!Array.isArray(bars)||bars.length<60||!num(funding)||Math.abs(funding)>1)return {...out,reason:['缺少完整 60 根已收盤 1 小時 K 線或有效資金費率']};
  if(!num(input.asOf)||now-input.asOf>150*60000||input.asOf>now+10000)
   return {...out,reason:['資料已超過 150 分鐘或時間無效，停止進出場判斷']};
  for(let i=0;i<bars.length;i++){
   const b=bars[i];
   if(!num(b.t)||!num(b.o)||!num(b.h)||!num(b.l)||!num(b.c)||b.l<=0||b.h<b.l||
      Math.max(b.o,b.c)>b.h||Math.min(b.o,b.c)<b.l||
      (i>0&&b.t<=bars[i-1].t))return {...out,reason:['K 線資料不連續或 OHLC 格式異常']};
  }
  const last=bars.at(-1),closes=bars.map(b=>b.c);
  if(now-last.t<3600000||now-last.t>3*3600000)return {...out,reason:['最新 K 線尚未收盤，或資料過舊']};
  const fast=ema(closes,20),slow=ema(closes,50),momentum=rsi(closes),vol=atr(bars);
  const prev=bars.slice(-21,-1),upper=Math.max(...prev.map(b=>b.h)),lower=Math.min(...prev.map(b=>b.l));
  const volPct=vol/last.c*100;
  out.metrics={close:last.c,ema20:fast,ema50:slow,rsi:momentum,atr:vol,atrPct:volPct,
   prior20High:upper,prior20Low:lower,funding8h:funding,closedAt:last.t+3600000};
  if(![fast,slow,momentum,vol,volPct].every(num)||vol<=0)return {...out,reason:['技術指標計算無效']};
  if(volPct>6)return {...out,reason:['波動過大（ATR / 價格高於 6%），優先觀望']};
  if(volPct<0.12)return {...out,reason:['波動過小，可能缺乏可靠突破動能']};
  if(last.c>upper&&fast>slow&&momentum>=52&&momentum<=72&&funding<=0.03){
   out.state='WATCH_LONG';out.side='LONG';out.reason=['1 小時收盤突破先前 20 根高點','EMA20 高於 EMA50','RSI 介於 52–72、資金費率未過熱'];
  }else if(last.c<lower&&fast<slow&&momentum>=28&&momentum<=48&&funding>=-0.03){
   out.state='WATCH_SHORT';out.side='SHORT';out.reason=['1 小時收盤跌破先前 20 根低點','EMA20 低於 EMA50','RSI 介於 28–48、資金費率未過冷'];
  }else{
   out.reason=['尚無同時符合突破、趨勢、動能、資金費率的條件'];
   if(Math.abs(funding)>0.03)out.reason.push('資金費率偏極端，避免追逐擁擠部位');
   return out;
  }
  const distance=Math.max(vol*2,last.c*0.015);
  out.entry=last.c;
  out.stop=out.side==='LONG'?last.c-distance:last.c+distance;
  out.target=out.side==='LONG'?last.c+distance*2:last.c-distance*2;
  out.riskPct=distance/last.c*100;
  out.reason.push('僅供下一根 K 線確認後觀察；不應按歷史收盤價假設保證成交');
  return out;
 }
 return {evaluate,ema,rsi,atr};
});
