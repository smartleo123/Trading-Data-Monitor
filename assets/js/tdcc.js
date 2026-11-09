/* TDCC lookup isolated from the crypto, US-stock and market-dashboard views. */
        // Weekly official TDCC data is generated as compact symbol-prefix shards.
        // No per-user proxy calls or third-party credentials are needed on GitHub Pages.
        let tdcc0050Loaded=false;
        let tdccRequestId=0;
        let tdccIndexPromise=null;
        const tdccShardPromises=new Map();
        const tdccSymbolPattern=/^\d{4}[0-9A-Z]{0,2}$/;
        function tdccFetchIndex(){
            if(!tdccIndexPromise){
                tdccIndexPromise=fetch('assets/data/tdcc/index.json',{cache:'no-store'})
                    .then(r=>{if(!r.ok)throw Error('TDCC index unavailable');return r.json();})
                    .then(v=>{
                        if(!v||!Array.isArray(v.symbols)||!/\d{4}-\d{2}-\d{2}/.test(v.date||''))throw Error('Invalid TDCC index');
                        return v;
                    }).catch(err=>{tdccIndexPromise=null;throw err;});
            }
            return tdccIndexPromise;
        }
        function tdccFetchShard(symbol){
            const prefix=symbol.slice(0,2);
            if(!tdccShardPromises.has(prefix)){
                const task=fetch('assets/data/tdcc/'+prefix+'.json',{cache:'no-store'})
                    .then(r=>{if(!r.ok)throw Error('TDCC shard unavailable');return r.json();})
                    .then(json=>{if(!json||typeof json!=='object'||Array.isArray(json))throw Error('Invalid TDCC shard');return json;})
                    .catch(err=>{tdccShardPromises.delete(prefix);throw err;});
                tdccShardPromises.set(prefix,task);
            }
            return tdccShardPromises.get(prefix);
        }
        function renderTdcc0050(snapshot){
            if(!snapshot || !tdccSymbolPattern.test(snapshot.symbol||'') ||
               !/^20\d{2}-\d{2}-\d{2}$/.test(snapshot.date||'') ||
               !Array.isArray(snapshot.rows)||snapshot.rows.length!==17)throw Error('Invalid TDCC snapshot');
            const rows=snapshot.rows,total=rows[16];
            if(!total||total.grade!==17||!Number.isSafeInteger(total.holders)||total.holders<=0)throw Error('Invalid TDCC total');
            let cumulative=0;
            rows.forEach((row,i)=>{
                if(!row||row.grade!==i+1||typeof row.range!=='string'||!Number.isSafeInteger(row.shares)||!Number.isFinite(row.proportion))throw Error('Invalid TDCC row');
                if(i<15){if(!Number.isSafeInteger(row.holders)||row.holders<0)throw Error('Invalid TDCC holders');cumulative+=row.holders;}
            });
            if(cumulative!==total.holders)throw Error('TDCC cumulative mismatch');
            const fmt=n=>Number(n).toLocaleString('en-US');
            const tb=document.getElementById('tdcc-0050-tbody');
            const cell=(value,cls='text-right')=>{
                const td=document.createElement('td');td.className='px-3 py-2.5 '+cls;td.textContent=value;return td;
            };
            if(!tb)return;
            tb.replaceChildren();
            rows.forEach((row,i)=>{
                const tr=document.createElement('tr');
                tr.className='hover:bg-zinc-800/40 '+(i===16?'bg-zinc-900 font-bold text-accentCyan':i===15?'text-zinc-500':'text-zinc-200');
                const count=i===15?'—':fmt(row.holders);
                const acc=i===15?'—':fmt(i===16?total.holders:row.cumulativeHolders);
                const percentage=i===15?'—':((i===16?100:row.cumulativeHolders/total.holders*100).toFixed(2)+'%');
                tr.append(cell(i+1,'text-center'),cell(row.range,'text-left'),cell(count),cell(acc),cell(percentage),cell(fmt(row.shares)),cell(row.proportion.toFixed(2)+'%'));
                tb.appendChild(tr);
            });
            const status=document.getElementById('tdcc-0050-status');
            if(status){
                status.textContent=snapshot.symbol+' · 集保資料基準日：'+snapshot.date+' · 來源：臺灣集中保管結算所（每週更新）';
                status.className='text-xs text-emerald-400 mb-3';
            }
        }
        function tdccShowError(message){
            const status=document.getElementById('tdcc-0050-status');
            if(status){status.textContent=message;status.className='text-xs text-amber-400 mb-3';}
            const tb=document.getElementById('tdcc-0050-tbody');
            if(tb)tb.innerHTML='<tr><td colspan="7" class="px-4 py-8 text-center text-zinc-400">暫無可用資料</td></tr>';
        }
        function searchTdccSymbol(value){
            const symbol=String(value||'').trim().toUpperCase();
            const input=document.getElementById('tdcc-symbol-input');
            if(input)input.value=symbol;
            if(!tdccSymbolPattern.test(symbol)){
                tdccRequestId++;
                tdccShowError('請輸入 4 至 6 碼的股票或 ETF 代號，例如 0050、2330、00878。');
                return Promise.resolve(false);
            }
            const requestId=++tdccRequestId;
            const current=()=>requestId===tdccRequestId;
            const status=document.getElementById('tdcc-0050-status');
            if(status){status.textContent='正在讀取 '+symbol+' 最新每週集保資料…';status.className='text-xs text-zinc-400 mb-3';}
            const load=tdccFetchIndex().then(index=>{
                if(!index.symbols.includes(symbol))throw Error('NOT_FOUND');
                return tdccFetchShard(symbol);
            }).then(shard=>{
                if(!shard[symbol])throw Error('NOT_FOUND');
                if(!current())return false;
                renderTdcc0050(shard[symbol]);
                return true;
            });
            return load.catch(error=>{
                if(!current())return false;
                // 0050 legacy snapshot remains a fallback for older deploys.
                if(symbol==='0050' && error.message!=='NOT_FOUND'){
                    return fetch('assets/data/0050-distribution.json',{cache:'no-store'})
                        .then(r=>{if(!r.ok)throw Error('legacy snapshot unavailable');return r.json();})
                        .then(snapshot=>{if(current()){renderTdcc0050(snapshot);return true;}return false;})
                        .catch(()=>{if(current())tdccShowError('0050 集保資料暫時無法取得，請使用官方查詢連結。');return false;});
                }
                tdccShowError(error.message==='NOT_FOUND'
                    ? symbol+' 尚無可用的集保分散資料，請確認代號或查看官方網站。'
                    : symbol+' 資料讀取失敗，請稍後重試或到集保官方網站查詢。');
                return false;
            });
        }
        function submitTdccSymbol(event){
            if(event)event.preventDefault();
            const input=document.getElementById('tdcc-symbol-input');
            searchTdccSymbol(input?input.value:'0050');
            return false;
        }
        function loadTdcc0050(){
            if(tdcc0050Loaded)return;
            tdcc0050Loaded=true;
            searchTdccSymbol('0050');
        }
