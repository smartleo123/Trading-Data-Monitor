const {test}=require('node:test'),assert=require('node:assert/strict');
const P=require('../assets/js/perpetual-signals.js');
const {normalize}=require('../scripts/record-btc-perpetual.cjs');
const HOUR=3600000,now=Date.parse('2026-11-09T07:20:00Z');
function bars(n=120){
 const start=now-(n+1)*HOUR;
 return Array.from({length:n},(_,i)=>{
  const c=100000+Math.sin(i*.5)*90+i*8;
  return {t:start+i*HOUR,o:c-10,h:c+110,l:c-110,c};
 });
}
test('BTC perpetual signal refuses stale, incomplete and fabricated candle observations',()=>{
 const b=bars(),input={asOf:now,funding8h:0.01,bars:b};
 const r=P.evaluate(input,now);
 assert.ok(r.metrics);assert.equal(r.state,'WAIT');
 assert.equal(P.evaluate({...input,asOf:now-160*60000},now).state,'WAIT');
 assert.match(P.evaluate({...input,asOf:now-160*60000},now).reason[0],/超過 150/);
 assert.equal(P.evaluate({...input,bars:b.slice(0,50)},now).metrics,null);
 const malformed=b.map(x=>({...x}));malformed[20].h=malformed[20].l-1;
 assert.match(P.evaluate({...input,bars:malformed},now).reason[0],/異常/);
});
test('source normalizer uses only COMPLETE hourly bars and rejects gaps',()=>{
 const b=bars(120);
 const partial={t:now-20*60000,o:100000,h:100050,l:99900,c:100020};
 const all=[...b,partial];
 const chart={status:'ok',ticks:all.map(x=>x.t),open:all.map(x=>x.o),high:all.map(x=>x.h),
  low:all.map(x=>x.l),close:all.map(x=>x.c)};
 const good=normalize(chart,now);
 assert.equal(good.length,120);assert.equal(good.at(-1).t,b.at(-1).t);
 const broken={...chart,ticks:chart.ticks.slice(),open:chart.open.slice(),high:chart.high.slice(),low:chart.low.slice(),close:chart.close.slice()};
 broken.ticks[50]+=120000;
 assert.throws(()=>normalize(broken,now),/gap/);
});
test('perpetual signal rejects funding extremes and declines to claim historical edge',()=>{
 const input={asOf:now,funding8h:0.5,bars:bars()};
 const r=P.evaluate(input,now);
 assert.equal(r.state,'WAIT');
 assert.ok(r.disclaimer.includes('尚未歷史回測'));
});
