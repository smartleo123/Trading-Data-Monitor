/* BTC options decision-support rules. Signals are scenarios, not price forecasts.
 * Standalone CommonJS/browser module to permit deterministic tests. */
(function(root,factory){
  var api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.BTCOptionsDecision=api;
})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  function finite(x){return typeof x==='number'&&Number.isFinite(x);}
  function evaluate(d){
    var missing=[];
    var spot=d&&d.spot;
    if(!finite(spot)||spot<=0)missing.push('有效 BTC 指數價');
    var percentile=d&&d.dvol&&d.dvol.pct;
    if(!finite(percentile)||percentile<0||percentile>100)missing.push('DVOL 歷史分位');
    var ivs=d&&Array.isArray(d.ivRows)?d.ivRows:[];
    var atm=ivs.find(function(x){return finite(x.atmIV)&&x.atmIV>0;});
    if(!atm)missing.push('近月 ATM IV');
    var rv=d&&d.hv&&d.hv.latest;
    var hasRv=finite(rv)&&rv>0;
    var spread=atm&&hasRv?atm.atmIV-rv:null;
    var skew=ivs.find(function(x){return finite(x.skew);});
    var fund=d&&d.perp&&d.perp.funding8h;
    var pcr=d&&d.pcRatio;
    var clues=[];
    if(skew&&Math.abs(skew.skew)>=2)clues.push('25Δ '+(skew.skew>0?'Put':'Call')+' 溢價約 '+Math.abs(skew.skew).toFixed(1)+' vol 點（需求/避險指標，非價格方向預言）');
    if(finite(pcr))clues.push('近 60 日 Put/Call 未平倉比 '+pcr.toFixed(2)+'（不能單獨推斷多空）');
    if(finite(fund))clues.push('永續資金費率 '+(fund>=0?'+':'')+fund.toFixed(3)+'%/8h');
    var regime=finite(percentile)?percentile<=25?'相對低波動':percentile>=75?'相對高波動':'波動中性':'未知';
    var bias='中性／等待價格確認';
    var flow=d&&d.flowBias;
    if(flow&&finite(flow.bull)&&finite(flow.bear)&&flow.bull+flow.bear>0){
      if(flow.bull>flow.bear*1.25)bias='短線成交偏多（低信心）';
      if(flow.bear>flow.bull*1.25)bias='短線成交偏空（低信心）';
    }
    var insufficient=missing.length>0;
    var setup,trigger;
    if(insufficient){setup='觀望：關鍵數據不足，不產生具體進場訊號';trigger='等待 Deribit 資料完整且時間有效後重新評估';}
    else if(percentile<=25){
      setup='情境：波動相對低；若預期未來實際波動擴大，可評估有限虧損的買方價差／跨式';
      trigger='先確認價格突破或事件催化；計入權利金、Theta、手續費與交易滑價';
    }else if(percentile>=75){
      setup='情境：隱含波動相對高；僅在波動溢價及報價可驗證時評估有限風險的信用價差／鐵兀鷹';
      trigger='等待價格區間確認，避免重大事件前裸賣；先核對最壞損失與保證金';
    }else{
      setup='情境：波動定價中性，沒有明顯統計優勢；優先觀望或小額價差策略';
      trigger='需價格結構、成交量與可執行報價共同確認，切勿只依 OI 牆下單';
    }
    var warnings=[
      '僅 Deribit 部分公開資料，沒有全市場部位方向；OI、Max Pain 與估計 GEX 不是確定支撐、壓力或到期價格。',
      'IV 與已實現波動率的比較可能跨不同觀察期間；未有同期限回測與買賣報價，不能當成已確認的期望收益。',
      '採用有限風險部位，單筆最大預定虧損以交易資金 0.5%–1% 作為保守示例；無法接受損失則不進場。'
    ];
    if(spread!==null)clues.push('ATM IV − 近期 RV = '+(spread>=0?'+':'')+spread.toFixed(1)+' vol 點（期間可能不一致）');
    return {sufficient:!insufficient,missing:missing,regime:regime,bias:bias,setup:setup,trigger:trigger,clues:clues,warnings:warnings,spread:spread};
  }
  return {evaluate:evaluate};
});
