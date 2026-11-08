const {test}=require('node:test');
const assert=require('node:assert/strict');
const {evaluate}=require('../assets/js/options-decision.js');
test('no trade scenario when spot, DVOL or ATM IV unavailable',()=>{
 const d=evaluate({spot:80000,dvol:{pct:15},ivRows:[]});
 assert.equal(d.sufficient,false);
 assert.match(d.setup,/觀望/);
 assert.ok(d.missing.includes('近月 ATM IV'));
 assert.doesNotMatch(d.trigger,/直接買入|立即下單/);
});
test('low DVOL produces conditional finite-loss volatility setup',()=>{
 const r=evaluate({spot:80000,dvol:{pct:18},ivRows:[{atmIV:35,skew:3}],hv:{latest:29},perp:{funding8h:0.01},pcRatio:1.15,flowBias:{bull:20,bear:10}});
 assert.equal(r.sufficient,true);
 assert.equal(r.regime,'相對低波動');
 assert.match(r.setup,/有限虧損/);
 assert.match(r.trigger,/價格突破|事件催化/);
 assert.equal(r.spread,6);
 assert.match(r.bias,/低信心/);
});
test('high and mid IV regimes never encourage naked options selling',()=>{
 for(const pct of [40,85]){
  const r=evaluate({spot:70000,dvol:{pct},ivRows:[{atmIV:55,skew:-4}],hv:null,perp:{funding8h:-0.01}});
  assert.equal(r.sufficient,true);
  assert.match(r.setup,pct===85?/有限風險/:/觀望/);
  assert.ok(r.warnings.some(w=>w.includes('OI、Max Pain')));
 }
});
test('invalid percentiles are not treated as ordinary pricing regimes',()=>{
 for(const pct of [NaN,-10,101,Infinity]){
  const r=evaluate({spot:70000,dvol:{pct},ivRows:[{atmIV:45}]});
  assert.equal(r.sufficient,false);
  assert.match(r.setup,/觀望/);
 }
});
