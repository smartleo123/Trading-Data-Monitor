/* BTC perpetual decision panel. All numerical advice is conditional, not executable. */
(function(){
 'use strict';
 function start(){
  const host=document.getElementById('btc-perpetual-signal');
  if(!host||!window.PerpetualSignals)return;
  const status=document.getElementById('btc-perp-status'),detail=document.getElementById('btc-perp-detail');
  const money=n=>'$'+Number(n).toLocaleString('en-US',{maximumFractionDigits:2});
  function item(label,value){
   const d=document.createElement('div');d.className='rounded-xl border border-zinc-800 bg-zinc-950/50 p-3';
   const k=document.createElement('p');k.className='text-xs text-zinc-500';k.textContent=label;
   const v=document.createElement('p');v.className='font-mono font-bold text-white mt-1';v.textContent=value;
   d.append(k,v);return d;
  }
  let last=null;
  function render(res){
   last=res;detail.replaceChildren();
   const live=res.state==='WATCH_LONG'||res.state==='WATCH_SHORT';
   status.textContent=res.state==='WAIT'?'觀望｜未觸發完整條件':res.state==='WATCH_LONG'?'條件式偏多觀察':'條件式偏空觀察';
   status.className='text-sm font-bold '+(live?'text-amber-300':'text-zinc-300');
   const m=res.metrics;
   if(m){
    const row=document.createElement('div');row.className='grid grid-cols-2 md:grid-cols-4 gap-2';
    [['已收盤價',money(m.close)],['EMA20／EMA50',money(m.ema20)+' / '+money(m.ema50)],
     ['RSI(14)',m.rsi.toFixed(1)],['ATR(14)',money(m.atr)+' ('+m.atrPct.toFixed(2)+'%)'],
     ['上 20 根高／低',money(m.prior20High)+' / '+money(m.prior20Low)],
     ['8h 資金費率',m.funding8h.toFixed(4)+'%'],
     ['最新完整 K 線',new Date(m.closedAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})],
     ['行情抓取時間',new Date(res.asOf).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})]]
     .forEach(([k,v])=>row.appendChild(item(k,v)));
    detail.appendChild(row);
   }
   const reasons=document.createElement('p');reasons.className='text-xs text-zinc-400 leading-relaxed mt-3';
   reasons.textContent=res.reason.join('；')+'。';detail.appendChild(reasons);
   if(live){
    const box=document.createElement('div');box.className='rounded-xl border border-amber-600/40 bg-zinc-950 p-3 mt-3 text-sm';
    box.textContent='參考觸發價 '+money(res.entry)+'，失效／停損參考 '+money(res.stop)+'，2R 目標 '+money(res.target)+
     '；距離風險 '+res.riskPct.toFixed(2)+'%。須等待下一根 K 線與實際報價確認，無法保證在觸發價成交。';
    detail.appendChild(box);
   }
   const caveat=document.createElement('p');caveat.className='text-xs text-amber-400/90 mt-3';
   caveat.textContent=res.disclaimer+' 建議保守風險預算示例：單筆不超過資金 0.5%，不建議依訊號自動開高槓桿；資金費率、交易費、滑價、強平風險另計。此規則尚未通過策略績效回測。';
   detail.appendChild(caveat);
  }
  async function refresh(){
   if(document.hidden)return;
   status.textContent='正在確認 Deribit 已收盤 K 線與資金費率…';
   try{
    const c=new AbortController(),timer=setTimeout(()=>c.abort(),12000);
    let response;try{response=await fetch('assets/data/deribit/perpetual-signal.json',{cache:'no-store',signal:c.signal});}finally{clearTimeout(timer);}
    if(!response.ok)throw Error('尚無正式的 BTC 永續數據快照');
    const data=await response.json();
    if(data.schemaVersion!==1||data.source!=='Deribit BTC-PERPETUAL')throw Error('數據來源格式不符');
    render(window.PerpetualSignals.evaluate(data,Date.now()));
   }catch(e){render({state:'WAIT',reason:['無法驗證最新行情：'+(e.message||String(e))],metrics:null,
    disclaimer:'未取得有效數據時不產生交易訊號。'});}
  }
  document.getElementById('btc-perp-refresh')?.addEventListener('click',refresh);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  setInterval(refresh,300000);
  refresh();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
