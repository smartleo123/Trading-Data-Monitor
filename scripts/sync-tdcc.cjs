'use strict';
const fs=require('node:fs'),path=require('node:path');
const {parseDistribution}=require('./tdcc-distribution.cjs');
const OUTPUT=path.join(__dirname,'..','assets','data','0050-distribution.json');
const SOURCES=[
 'https://openapi.tdcc.com.tw/v1/opendata/1-5',
 'https://smart.tdcc.com.tw/opendata/getOD.ashx?id=1-5'
];
async function download(url){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
 try{
  const response=await fetch(url,{signal:controller.signal,headers:{'Accept':'application/json,text/csv,text/plain,*/*'}});
  if(!response.ok)throw Error('HTTP '+response.status);
  const text=await response.text();
  return parseDistribution(text);
 } finally {clearTimeout(timer);}
}
async function sync(){
 let result,lastError;
 for(const url of SOURCES){
  try{result=await download(url);break;}catch(error){lastError=error;console.warn('TDCC endpoint failed',url,error.message);}
 }
 if(!result)throw lastError||Error('TDCC data unavailable');
 const current=fs.existsSync(OUTPUT)?JSON.parse(fs.readFileSync(OUTPUT,'utf8')):null;
 if(current&&current.date>result.date)throw Error('TDCC source date regressed');
 if(current&&current.date===result.date&&JSON.stringify(current.rows)===JSON.stringify(result.rows)){
  console.log('TDCC 0050 holdings distribution unchanged');return;
 }
 result.fetched_at=new Date().toISOString();
 fs.mkdirSync(path.dirname(OUTPUT),{recursive:true});
 fs.writeFileSync(OUTPUT,JSON.stringify(result,null,2)+'\n');
 console.log('Saved TDCC 0050 distribution',result.date,result.rows.length,'rows, total holders',result.rows[16].holders);
}
if(require.main===module)sync().catch(e=>{console.error('TDCC sync failed:',e.message);process.exitCode=1;});
module.exports={sync};
