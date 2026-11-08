const {test}=require('node:test'),assert=require('node:assert/strict');
const {parseInstitution,parseT86,parseMargin,parsePrices}=require('../scripts/sync-tw-market.cjs');
test('BFI82U adds dealer cash and hedging while excluding foreign dealer',()=>{
 const j={stat:'OK',data:[['自營商(自行買賣)','0','0','1,000,000,000'],['自營商(避險)','0','0','2,000,000,000'],['投信','0','0','-3,000,000,000'],['外資及陸資(不含外資自營商)','0','0','4,000,000,000'],['外資自營商','0','0','9,000,000,000']]};
 assert.deepEqual(parseInstitution(j),{f:40,t:-30,d:30});
});
test('T86 uses dynamic field names and preserves net share units',()=>{
 const fields=['證券代號','證券名稱','投信買賣超股數','三大法人買賣超股數','外陸資買賣超股數(不含外資自營商)'];
 const data=Array.from({length:70},(_,i)=>[String(1000+i),'測試股票','1,000','3,000','2,000']);
 const rows=parseT86({stat:'OK',fields,data});
 assert.equal(rows[0].net,3000);assert.equal(rows[0].trust,1000);assert.equal(rows[0].foreign,2000);
 assert.throws(()=>parseT86({stat:'OK',fields:['code'],data}),/columns missing/);
});
test('MI_MARGN summary selects balances by headers',()=>{
 const j={stat:'OK',tables:[{title:'信用交易統計',fields:['項目','前日餘額','買進','賣出','現金償還','今日餘額'],data:[
  ['融資(交易單位)','1,000','0','0','0','1,200'],['融券','100','0','0','0','80'],['融資金額','100,000,000','0','0','0','105,000,000']
 ]}]};
 const m=parseMargin(j);
 assert.equal(m.finNow,1050);assert.equal(m.finPrev,1000);assert.equal(m.shortNow,80);
 assert.equal(m.finUnitNow,1200);
});
test('bulk close parser rejects incomplete data and malformed closing prices',()=>{
 const records=Array.from({length:110},(_,i)=>({Code:String(1000+i),ClosingPrice:'1,250.5'}));
 assert.equal(Object.keys(parsePrices(records)).length,110);
 assert.equal(parsePrices(records)['1000'],1250.5);
 assert.throws(()=>parsePrices([]),/incomplete/);
});
