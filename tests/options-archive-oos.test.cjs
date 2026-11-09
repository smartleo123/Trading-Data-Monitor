const {test}=require('node:test'),assert=require('node:assert/strict');
const H=require('../scripts/deribit-history.cjs');
const A=require('../assets/js/options-archive.js');
const O=require('../assets/js/options-oos.js');
const one=(t)=>({at:t,spot:85000,contracts:{}});
test('monthly archive groups across years without truncation',()=>{
 const stamps=['2025-12-31','2026-01-01','2026-01-10','2026-02-02'].map(s=>Date.parse(s+'T12:00:00Z'));
 const plan=stamps.reduce((h,t)=>H.planAppend({snapshots:h.snapshots},one(t)),{snapshots:[]});
 assert.deepEqual(plan.months,['2025-12','2026-01','2026-02']);
 assert.equal(plan.groups.get('2026-01').length,2);
 assert.equal(plan.snapshots.length,4);
 assert.throws(()=>H.planAppend({snapshots:plan.snapshots},one(stamps.at(-1))),/duplicate|out-of-order/);
 assert.throws(()=>H.validate([one(stamps[1]),one(stamps[0])]),/Invalid/);
});
test('monthly browser loader validates sharded history and never silently drops missing months',async()=>{
 const t0=Date.parse('2026-10-01T12:00:00Z'),t1=Date.parse('2026-11-01T12:00:00Z');
 const files={
  'assets/data/deribit/index.json':{schemaVersion:2,months:['2026-10','2026-11']},
  'assets/data/deribit/monthly/2026-10.json':{schemaVersion:2,month:'2026-10',snapshots:[one(t0)]},
  'assets/data/deribit/monthly/2026-11.json':{schemaVersion:2,month:'2026-11',snapshots:[one(t1)]}
 };
 const fetcher=async name=>({ok:!!files[name],status:files[name]?200:404,json:async()=>files[name]});
 const got=await A.load(fetcher,1);
 assert.equal(got.snapshots.length,1);
 assert.equal(got.truncated,true);
 assert.equal(got.snapshots[0].at,t1);
 assert.equal((await A.load(fetcher,6)).snapshots.length,2);
 delete files['assets/data/deribit/monthly/2026-10.json'];
 await assert.rejects(()=>A.load(fetcher,6),/HTTP 404/);
});
test('browser archive fallback supports legacy only when monthly index is 404',async()=>{
 const stamp=Date.parse('2026-11-09T05:00:00Z');
 const mock=async path=>path.endsWith('index.json')?
  {ok:false,status:404}:{ok:true,json:async()=>({schemaVersion:1,snapshots:[one(stamp)]})};
 const got=await A.load(mock);assert.equal(got.schemaVersion,1);
 assert.equal(got.snapshots.length,1);
 const bad=async()=>({ok:false,status:500});
 await assert.rejects(()=>A.load(bad),/HTTP 500/);
});
test('sample-out performance never selects a strategy using future holdout observations',()=>{
 const snapshots=Array.from({length:200},(_,i)=>one(Date.parse('2026-01-01T00:00:00Z')+i*3600000));
 const calls=[];
 const fake={replay({snapshots:s},{strategy}){
  calls.push([s.length,strategy]);
  const train=s.length===140;
  const amount=train?(strategy==='straddle'?0.02:0.005):-0.01;
  return {trades:Array.from({length:25},()=>({pnlBtc:amount}))};
 }};
 const r=O.evaluate(fake,{snapshots},{holdDays:1});
 assert.equal(r.selected,'straddle');
 assert.equal(r.train.count,25);assert.equal(r.test.count,25);
 assert.equal(r.test.net<0,true);
 assert.equal(r.eligible,true); // Enough observations, but a failed holdout cannot prove edge.
 assert.match(r.reason,/未能延續/);
 assert.equal(calls.length,6);
 assert.equal(calls.filter(([n])=>n===60).length,1);
});
test('insufficient forward data cannot imply a verified strategy',()=>{
 const snapshots=Array.from({length:10},(_,i)=>one(100000+i*3600000));
 const fake={replay:()=>({trades:[]})};
 const r=O.evaluate(fake,{snapshots});
 assert.equal(r.selected,null);assert.equal(r.eligible,false);
 assert.match(r.reason,/不足/);
});
