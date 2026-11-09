'use strict';
/* Monthly Deribit archives. A bad shard must never reset verified history. */
const fs=require('node:fs'),path=require('node:path');
const ROOT=path.join(__dirname,'../assets/data/deribit');
const INDEX=path.join(ROOT,'index.json');
const LEGACY=path.join(ROOT,'quote-history.json');
const monthOf=t=>new Date(t).toISOString().slice(0,7);
function readJSON(file){return JSON.parse(fs.readFileSync(file,'utf8'));}
function validate(snaps){
 if(!Array.isArray(snaps))throw Error('Deribit archive requires snapshots array');
 for(let i=0;i<snaps.length;i++){
  const s=snaps[i];
  if(!s||!Number.isSafeInteger(s.at)||s.at<=0||!Number.isFinite(s.spot)||s.spot<=0||
   !s.contracts||typeof s.contracts!=='object'||Array.isArray(s.contracts)||
   (i>0&&s.at<=snaps[i-1].at))throw Error('Invalid or out-of-order Deribit snapshot '+i);
 }
 return snaps;
}
function load(){
 let index;
 try{index=readJSON(INDEX);}catch(e){
  if(e.code!=='ENOENT')throw Error('Refusing to reset unreadable Deribit index: '+e.message);
  let legacy;
  try{legacy=readJSON(LEGACY);}catch(err){
   if(err.code==='ENOENT')return {snapshots:[],months:[]};
   throw Error('Refusing to reset unreadable legacy Deribit archive: '+err.message);
  }
  if(legacy.schemaVersion!==1)throw Error('Unexpected legacy archive schema');
  return {snapshots:validate(legacy.snapshots),months:[]};
 }
 if(index.schemaVersion!==2||!Array.isArray(index.months))throw Error('Unsupported Deribit index schema');
 const all=[];let prior='';
 for(const m of index.months){
  if(typeof m!=='string'||!/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(m)||m<=prior)throw Error('Invalid month index order');
  const shard=readJSON(path.join(ROOT,'monthly',m+'.json'));
  if(shard.schemaVersion!==2||shard.month!==m)throw Error('Corrupt Deribit month '+m);
  validate(shard.snapshots);
  if(shard.snapshots.some(s=>monthOf(s.at)!==m)||all.length&&shard.snapshots.length&&
    shard.snapshots[0].at<=all.at(-1).at)throw Error('Cross-month timeline mismatch '+m);
  all.push(...shard.snapshots);prior=m;
 }
 return {snapshots:all,months:index.months};
}
function planAppend(history,item){
 const snaps=validate(history.snapshots.slice());
 validate([item]);
 if(snaps.length&&item.at<=snaps.at(-1).at)throw Error('Refusing duplicate/out-of-order Deribit market capture');
 snaps.push(item);
 const groups=new Map();
 for(const s of snaps){const k=monthOf(s.at);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(s);}
 return {months:[...groups.keys()].sort(),groups,snapshots:snaps};
}
function save(plan){
 fs.mkdirSync(path.join(ROOT,'monthly'),{recursive:true});
 for(const month of plan.months){
  const file=path.join(ROOT,'monthly',month+'.json'),body=JSON.stringify({schemaVersion:2,month,snapshots:plan.groups.get(month)})+'\n';
  const temp=file+'.tmp';fs.writeFileSync(temp,body);fs.renameSync(temp,file);
 }
 const index={schemaVersion:2,source:'Deribit verified public order books',updatedAt:new Date(plan.snapshots.at(-1).at).toISOString(),
  totalSnapshots:plan.snapshots.length,months:plan.months};
 const temp=INDEX+'.tmp';fs.writeFileSync(temp,JSON.stringify(index,null,2)+'\n');fs.renameSync(temp,INDEX);
}
module.exports={ROOT,INDEX,LEGACY,monthOf,validate,load,planAppend,save};
