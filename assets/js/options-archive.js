/* Browser-side archive repository: validates schema and timeline, loads only requested months. */
(function(root,factory){
 const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.DeribitArchive=api;
})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 const base='assets/data/deribit/';
 const monthOf=t=>new Date(t).toISOString().slice(0,7);
 function verify(snaps){
  if(!Array.isArray(snaps))throw Error('Deribit 歷史快照格式錯誤');
  let last=0;
  for(const s of snaps){
   if(!Number.isSafeInteger(s?.at)||s.at<=last||!Number.isFinite(s?.spot)||s.spot<=0||
    !s.contracts||typeof s.contracts!=='object'||Array.isArray(s.contracts))
    throw Error('Deribit 歷史快照損毀或時間排序異常');
   last=s.at;
  }
  return snaps;
 }
 async function read(url,fetcher=fetch){
  const r=await fetcher(url,{cache:'no-store'});
  if(!r.ok)throw Object.assign(Error('無法取得 '+url+' (HTTP '+r.status+')'),{status:r.status});
  return r.json();
 }
 async function load(fetcher,limit=6){
  const get=fetcher||fetch;
  let index;
  try{index=await read(base+'index.json',get);}
  catch(e){
   if(e.status!==404)throw e;
   const legacy=await read(base+'quote-history.json',get);
   if(legacy.schemaVersion!==1)throw Error('舊版 Deribit 歷史快照格式不符');
   return {schemaVersion:1,snapshots:verify(legacy.snapshots),months:[],truncated:false};
  }
  if(index.schemaVersion!==2||!Array.isArray(index.months)||index.months.some((m,i)=>
   !/^\d{4}-(0[1-9]|1[0-2])$/.test(m)||(i&&m<=index.months[i-1])))
   throw Error('Deribit 月度索引格式錯誤');
  const total=index.months.length,months=index.months.slice(-Math.max(1,Math.min(total,limit||6)));
  const all=[];
  for(const month of months){
   const shard=await read(base+'monthly/'+month+'.json',get);
   if(shard.schemaVersion!==2||shard.month!==month)throw Error('Deribit 月份資料不符：'+month);
   const checked=verify(shard.snapshots);
   if(checked.some(s=>monthOf(s.at)!==month)||all.length&&checked.length&&checked[0].at<=all.at(-1).at)
    throw Error('Deribit 月度檔有重複或跨期錯誤');
   all.push(...checked);
  }
  return {schemaVersion:2,snapshots:all,months,truncated:months.length<total,totalMonths:total};
 }
 return {load,verify,monthOf};
});
