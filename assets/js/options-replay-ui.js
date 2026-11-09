/* Read-only walk-forward replay UI: true archived order-book snapshots only. */
(function(){
 'use strict';
 window.WR_initReplayUI=function(calcBox){
  const mount=calcBox.querySelector('#sc-backtest');
  if(!mount||mount.dataset.ready)return;
  mount.dataset.ready='true';
  mount.innerHTML='<div class="sc-hd">Deribit 真實報價歷史重播（可核對成交假設）</div>'+
   '<p class="sc-help">來源：GitHub 每四小時保存 Deribit 生產環境最優買賣檔。' +
   '僅重播已記錄到的有效 Bid／Ask：買進在 Ask、賣出在 Bid，出場方向相反；每筆完整持倉期間不會開另一筆。' +
   '此資料是開始記錄後的 forward replay，並非從過去不存在的歷史報價重建。只有同合約且具有有效進出場雙向報價的交易會列入，跨式必須同到期、同履約價。未考慮價位瞬間消失及實際市場衝擊。</p>'+
   '<div class="sc-inputs">'+
   '<div class="sc-field"><label for="sc-replay-strategy">策略</label><select id="sc-replay-strategy">'+
   '<option value="straddle">買入 ATM 跨式</option><option value="long-call">買入 ATM Call</option>'+
   '<option value="bull-call">多頭 Call 價差</option><option value="bear-put">空頭 Put 價差</option>'+
   '<option value="iron-condor">鐵兀鷹</option></select></div>'+
   '<div class="sc-field"><label for="sc-replay-hold">持有天數</label><select id="sc-replay-hold"><option value="1">1 天</option><option value="3" selected>3 天</option><option value="7">7 天</option></select></div>'+
   '<div class="sc-field"><label for="sc-replay-fee">單邊每 BTC 單位手續費（BTC）</label><input id="sc-replay-fee" type="number" min="0" step="0.0001" value="0.0003"></div>'+
   '</div><button type="button" id="sc-replay-run" class="sc-btn">重播已記錄交易報價</button>'+
   '<p id="sc-replay-status" class="sc-help" role="status">尚未載入已驗證的 Deribit 歷史快照。</p>'+
   '<div id="sc-replay-results"></div>';
  const status=mount.querySelector('#sc-replay-status'),out=mount.querySelector('#sc-replay-results');
  let requestSeq=0;
  const dt=t=>new Date(t).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false});
  function show(message){status.textContent=message;}
  async function run(){
   const request=++requestSeq;
   out.replaceChildren();show('檢查快照來源、日期與可成交條件…');
   try{
    const res=await fetch('assets/data/deribit/quote-history.json',{cache:'no-store'});
    if(!res.ok)throw Error('尚無官方可核實的歷史快照（首次 GitHub Actions 執行前正常）');
    const history=await res.json();
    if(request!==requestSeq)return;
    if(history?.schemaVersion!==1||!Array.isArray(history.snapshots))throw Error('快照版本或格式不正確');
    const strategy=mount.querySelector('#sc-replay-strategy').value;
    const holdDays=Number(mount.querySelector('#sc-replay-hold').value);
    const feeBtc=Number(mount.querySelector('#sc-replay-fee').value);
    const data=window.DeribitReplay.replay(history,{strategy,holdDays,feeBtc,qty:0.1});
    const ageHours=data.to?Math.max(0,(Date.now()-data.to)/3600000):Infinity;
    const freshness=!Number.isFinite(ageHours)?'尚未取得有效時間戳':
      ageHours>12?'⚠ 最後行情快照已超過 12 小時（約 '+ageHours.toFixed(1)+' 小時），請檢查 GitHub 排程':
      '最近快照距今約 '+ageHours.toFixed(1)+' 小時';
    show('資料期間 '+(data.from?dt(data.from):'尚未建立')+' ～ '+(data.to?dt(data.to):'無')+
      '；實際可用市場快照 '+data.snapshots+' 筆，完成進出場 '+data.tradeCount+' 筆，跳過 '+data.skipped+' 筆。'+freshness+'。');
    const make=(tag,content)=>{const el=document.createElement(tag);el.textContent=content;return el;};
    const info=make('p',data.verdict);info.className='sc-help';out.appendChild(info);
    if(!data.adequate){
      const note=make('p','樣本不足，暫停勝率／Profit Factor／績效優勢排名。數據會由排程逐步累積。');
      note.className='sc-help';out.appendChild(note);return;
    }
    const summary=make('p','勝率 '+(data.winRate*100).toFixed(1)+'%｜總淨損益 '+data.totalBtc.toFixed(5)+
       ' BTC｜單筆平均 '+data.avgBtc.toFixed(5)+' BTC｜Profit Factor '+(data.profitFactor==null?'無法估算':data.profitFactor.toFixed(2))+
       '｜最高累積回撤 '+data.maxDrawdownBtc.toFixed(5)+' BTC');
    summary.className='sc-help';out.appendChild(summary);
    const grid=document.createElement('table');grid.className='sc-legs';grid.style.minWidth='570px';
    const thead=document.createElement('thead'),head=document.createElement('tr');
    ['進場（台灣）','出場（台灣）','BTC 進場價','BTC 出場價','淨損益 BTC','淨損益 USD（出場等值）'].forEach(n=>head.appendChild(make('th',n)));
    thead.appendChild(head);grid.appendChild(thead);
    const tbody=document.createElement('tbody');
    data.trades.slice(-20).reverse().forEach(t=>{
     const row=document.createElement('tr');
     [dt(t.entryAt),dt(t.exitAt),t.entrySpot.toFixed(0),t.exitSpot.toFixed(0),
      t.pnlBtc.toFixed(5),t.pnlUsd.toFixed(0)].forEach(v=>row.appendChild(make('td',v)));
     tbody.appendChild(row);
    });
    grid.appendChild(tbody);const scroll=document.createElement('div');scroll.style.overflowX='auto';scroll.appendChild(grid);out.appendChild(scroll);
    out.appendChild(make('p','每筆皆核對相同合約到期日與進出場時點的兩側掛單及量。樣本採非重疊交易。實際成交可能與最優價不同，美元損益以出場 BTC 現價換算。'));
   }catch(error){if(request===requestSeq)show('⚠ 無法執行可信的歷史重播：'+String(error.message||error));}
  }
  mount.querySelector('#sc-replay-run').addEventListener('click',run);
  run();
 };
})();