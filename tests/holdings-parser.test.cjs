const {test} = require('node:test');
const assert = require('node:assert/strict');
const {parseHoldings,parseTradeDate} = require('../scripts/holdings-parser.cjs');
const fixture = () => ({ tradeDate:'2026/11/06',Data:Array.from({length:50},(_,i)=>({stockId:String(1000+i),stockName:'股票'+i,weight:'2.0'})) });
test('official 0050 snapshot parser normalizes and ranks 50 holdings',()=>{
  const result = parseHoldings(fixture());
  assert.equal(result.length,50);
  assert.equal(result[0].r,1);
  assert.equal(result[0].w,2);
  assert.equal(parseTradeDate(fixture()),'2026-11-06');
});
test('snapshot parser rejects incomplete, duplicate and badly weighted data',()=>{
  const f=fixture();f.Data=f.Data.slice(0,30);assert.throws(()=>parseHoldings(f),/count/);
  const dup=fixture();dup.Data[1].stockId=dup.Data[0].stockId;assert.throws(()=>parseHoldings(dup),/Duplicate/);
  const bad=fixture();bad.Data.forEach(x=>x.weight='0.02');assert.throws(()=>parseHoldings(bad),/total/);
});
test('snapshot parser tolerates nested list and fields in traditional Chinese',()=>{
  const d={data:{list:fixture().Data.map(x=>({'商品代碼':x.stockId,'商品名稱':x.stockName,'商品權重':'2.0%'}))}};
  assert.equal(parseHoldings(d).length,50);
  assert.equal(parseTradeDate({tradeDate:'not a date'}),null);
});

test('MoneyDJ complete holdings HTML is normalized with its published trading date',()=>{
  const {parseMoneyDjHtml}=require('../scripts/holdings-parser.cjs');
  const rows=Array.from({length:50},(_,i)=>'<tr><td><a>測試股'+i+'('+String(1000+i)+'.TW)</a></td><td>2.00</td><td>100,000</td></tr>').join('');
  const html='<html><body><div>資料日期：2026/11/06</div><table>'+rows+'</table></body></html>';
  const {holdings,sourceTradeDate}=parseMoneyDjHtml(html);
  assert.equal(sourceTradeDate,'2026-11-06');
  assert.equal(holdings.length,50);
  assert.equal(holdings[0].code,'1000');
  assert.throws(()=>parseMoneyDjHtml('<html>blocked</html>'),/data date/);
});
