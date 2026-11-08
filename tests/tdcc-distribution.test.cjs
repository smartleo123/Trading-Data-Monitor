const test=require('node:test'),assert=require('node:assert/strict');
const {parseDistribution,parseCsv}=require('../scripts/tdcc-distribution.cjs');
const shares=[485315659,3366434775,2735946272,1883030066,1460668868,1912533935,1282659962,916084520,2281881174,1429649735,731160250,237196051,103415219,58066094,5118704618,-20247198];
const holders=[1612623,1471595,372614,152082,82692,77667,36738,20295,33325,10654,2731,491,150,64,288];
function fixture(){
 const rows=[];for(let i=0;i<15;i++)rows.push({'資料日期':'20261106','證券代號':'0050  ','持股分級':String(i+1),'人數':String(holders[i]),'股數':String(shares[i]),'占集保庫存數比例%':'0'});
 rows.push({'資料日期':'20261106','證券代號':'0050','持股分級':'16','人數':'0','股數':String(shares[15]),'占集保庫存數比例%':'0'});
 rows.push({'資料日期':'20261106','證券代號':'0050','持股分級':'17','人數':String(holders.reduce((a,b)=>a+b,0)),'股數':String(shares.reduce((a,b)=>a+b,0)),'占集保庫存數比例%':'100.00'});
 return rows;
}
test('TDCC cumulative count ignores adjustment and total',()=>{
 const r=parseDistribution(fixture());
 assert.equal(r.date,'2026-11-06');assert.equal(r.rows.length,17);
 assert.equal(r.rows[0].cumulativeHolders,1612623);
 assert.equal(r.rows[1].cumulativeHolders,3084218);
 assert.equal(r.rows[14].cumulativePct,100);
 assert.equal(r.rows[15].cumulativeHolders,null);
 assert.equal(r.rows[16].cumulativeHolders,r.rows[16].holders);
});
test('TDCC parser rejects incomplete data and inconsistent totals',()=>{
 assert.throws(()=>parseDistribution(fixture().slice(0,15)),/Incomplete/);
 const bad=fixture();bad[16].人數='12';assert.throws(()=>parseDistribution(bad),/inconsistent/);
 assert.throws(()=>parseDistribution('<!DOCTYPE html>Access Denied'),/HTML/);
});
test('TDCC CSV supports quoted fields and commas',()=>{
 const csv='資料日期,證券代號,持股分級,人數,股數,占集保庫存數比例%\n20261106,0050,1,"1,612,623","485,315,659",2.02\n';
 const rows=parseCsv(csv);assert.equal(rows[0].人數,'1,612,623');
});

test('TDCC adjusts unsigned discrepancy based on source total',()=>{
 const f=fixture();
 f[15]['股數']=String(Math.abs(Number(f[15]['股數'])));
 const result=parseDistribution(f);
 assert.ok(result.rows[15].shares<0);
 assert.equal(result.rows[15].shares,-20247198);
});
test('TDCC ROC dates and ISO timestamps normalize to calendar date',()=>{
 const f=fixture();
 f.forEach(r=>{r['資料日期']='1151106';});
 assert.equal(parseDistribution(f).date,'2026-11-06');
 f.forEach(r=>{r['資料日期']='2026-11-06T00:00:00';});
 assert.equal(parseDistribution(f).date,'2026-11-06');
});
