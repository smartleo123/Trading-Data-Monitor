// ===== 時鐘 =====
        function updateClock() {
            const el = document.getElementById('system-time');
            if (el) { const n = new Date(); const p = x => String(x).padStart(2,'0');
                el.innerText = `${n.getFullYear()}-${p(n.getMonth()+1)}-${p(n.getDate())} ${p(n.getHours())}:${p(n.getMinutes())}:${p(n.getSeconds())}`; }
        }
        setInterval(updateClock, 1000); updateClock();
        // ===== 常用連結下拉選單 =====
        // ===== SOP 頁籤切換 =====
        function toggleSop(){
            const body=document.getElementById('sop-body'),chev=document.getElementById('sop-chevron');
            if(!body)return;
            const hidden=body.classList.toggle('hidden');
            if(chev)chev.style.transform=hidden?'rotate(-90deg)':'rotate(0deg)';
        }
        function switchSop(name,btn){
            document.querySelectorAll('.sop-panel').forEach(p=>p.classList.add('hidden'));
            const panel=document.getElementById('sop-'+name);if(panel)panel.classList.remove('hidden');
            document.querySelectorAll('.sop-tab').forEach(b=>b.className='sop-tab text-xs px-3.5 py-2 rounded-lg font-bold text-zinc-400 hover:text-zinc-200 transition-all');
            if(btn)btn.className='sop-tab text-xs px-3.5 py-2 rounded-lg font-bold transition-all bg-emerald-500/15 text-emerald-400 border border-emerald-500/30';
            if(window.lucide)lucide.createIcons();
        }
        // ===== 選擇權小抄折疊 =====
        function toggleLinksMenu(e){
            if(e)e.stopPropagation();
            const panel=document.getElementById('links-menu-panel');
            const chev=document.getElementById('links-menu-chevron');
            if(!panel)return;
            const open=panel.classList.toggle('hidden')===false;
            if(chev)chev.style.transform=open?'rotate(180deg)':'rotate(0deg)';
        }
        // 點擊選單以外區域自動關閉
        document.addEventListener('click',(e)=>{
            const panel=document.getElementById('links-menu-panel');
            const btn=document.getElementById('links-menu-btn');
            if(!panel||panel.classList.contains('hidden'))return;
            if(btn&&btn.contains(e.target))return;
            if(panel.contains(e.target))return;
            panel.classList.add('hidden');
            const chev=document.getElementById('links-menu-chevron');
            if(chev)chev.style.transform='rotate(0deg)';
        });
        // ===== 市場切換 =====
        const marketTabActiveClass = "flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all bg-gradient-to-r from-accentCyan/20 to-accentPurple/20 text-white border border-accentCyan/40";
        const marketTabInactiveClass = "flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900 border border-transparent";
        const twStockState = { extrasLoaded: false, weightLoaded: false };
        const usStockState = { cardsLoaded: false, chartLoaded: false, extrasLoaded: false, watchlistLoaded: false };
        const marketHeaders = {
            crypto: { title: '加密貨幣數據圖表', subtitle: 'CRYPTO RELATED PRODUCTS & BINANCE MARKET INTEGRATION' },
            'tw-stock': { title: '台股數據圖表', subtitle: 'TAIWAN STOCK MARKET & YAHOO / TRADINGVIEW INTEGRATION' },
            'us-stock': { title: '美股數據圖表', subtitle: 'US STOCK MARKET & TRADINGVIEW INTEGRATION' }
        };
        function switchMarketView(view) {
            const views = { crypto: 'market-view-crypto', 'tw-stock': 'market-view-tw-stock', 'us-stock': 'market-view-us-stock' };
            Object.entries(views).forEach(([k, id]) => {
                const el = document.getElementById(id); if (el) el.classList.toggle('hidden', k !== view);
                const b = document.getElementById(`market-tab-${k}`); if (b) b.className = k === view ? marketTabActiveClass : marketTabInactiveClass;
            });
            const h = marketHeaders[view];
            if (h) { document.getElementById('market-title').innerText = h.title; document.getElementById('market-subtitle').innerText = h.subtitle; }
            if (view === 'tw-stock') initTwStockView();
            if (view === 'us-stock') initUsStockView();
            // 預載的 TradingView widget 在隱藏時量不到尺寸，顯示後補發 resize 觸發重新量測
            setTimeout(()=>{window.dispatchEvent(new Event('resize'));},60);
        }
        // ===== 放大 =====
        function toggleMaximize(id) {
            const el = document.getElementById(id); const icon = document.getElementById(`${id}-zoom-icon`); if (!el) return;
            if (el.classList.contains('is-maximized')) { el.classList.remove('is-maximized'); if (icon){icon.setAttribute('data-lucide','maximize'); if(window.lucide)lucide.createIcons();} }
            else { el.classList.add('is-maximized'); if (icon){icon.setAttribute('data-lucide','minimize'); if(window.lucide)lucide.createIcons();} }
        }
        // TradingView 官方 widget 取代已被來源網站限制的 CoinGlass iframe
        function initMarketOverviewChart() {
            renderTvWidget('coinglass-iframe-container',
                'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js',
                {autosize:true,symbol:'BINANCE:BTCUSDT',interval:'60',timezone:'Etc/UTC',theme:'dark',style:'1',locale:'zh_TW',allow_symbol_change:true,hide_top_toolbar:false,hide_legend:false,save_image:false,calendar:false,support_host:'https://www.tradingview.com'});
        }
        // ===== CoinGlass / TradingView 切換 =====
        function toggleChartSource(type) {
            const bC=document.getElementById('btn-src-coinglass'),bL=document.getElementById('btn-src-local'),bA=document.getElementById('btn-src-altcoin');
            const cC=document.getElementById('coinglass-iframe-container'),cL=document.getElementById('local-chart-container'),cA=document.getElementById('altcoin-iframe-container');
            const sL=document.getElementById('coinglass-source-link');
            const A="text-xs px-3 py-1.5 rounded-lg font-bold transition-all bg-accentCyan/10 text-accentCyan border border-accentCyan/20";
            const I="text-xs px-3 py-1.5 rounded-lg font-bold text-zinc-400 hover:text-zinc-200 transition-all";
            bC.className=type==='coinglass'?A:I; bL.className=type==='local'?A:I; bA.className=type==='altcoin'?A:I;
            cC.style.display=type==='coinglass'?'block':'none'; cL.style.display=type==='local'?'block':'none'; cA.style.display=type==='altcoin'?'block':'none';
            if(sL){const m={coinglass:{u:'https://www.tradingview.com/chart/?symbol=BINANCE%3ABTCUSDT',t:'前往 TradingView BTC 即時 K 線'},local:{u:'https://farside.co.uk/btc/',t:'前往 Farside Bitcoin ETF 資金流原始表格'},altcoin:{u:'https://alternative.me/crypto/fear-and-greed-index/',t:'前往 Alternative.me 恐懼與貪婪指數'}};const g=m[type]||m.coinglass;sL.setAttribute('href',g.u);sL.setAttribute('title',g.t);}
        }
        // ===== 工具 =====
        function formatNumber(num) {
            if (num == null) return 'N/A'; const a = Math.abs(num);
            if (a >= 1e12) return (num/1e12).toFixed(2)+' T'; if (a >= 1e9) return (num/1e9).toFixed(2)+' B';
            if (a >= 1e6) return (num/1e6).toFixed(2)+' M'; if (a >= 1000) return num.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
            return num.toFixed(2);
        }
        function isUSMarketOpen() {
            try { const t=new Date(new Date().toLocaleString("en-US",{timeZone:"America/New_York"})); const d=t.getDay(); if(d===0||d===6)return false;
                const m=t.getHours()*60+t.getMinutes(); return m>=570&&m<=960; } catch(e){return false;}
        }
        // 以真實 Yahoo 報價更新美股卡 (MSTR/STRC)。price=最新/收盤價，change=相對昨收漲跌%
        function updateStockCard(pid,cid,sid,symbol){
            const pe=document.getElementById(pid),ce=document.getElementById(cid),se=document.getElementById(sid);
            if(!pe||!ce)return;
            fetchYahooQuote(symbol).then(q=>{
                const price=q.price,prev=q.prevClose;
                if(price==null||isNaN(price))return;
                const prevShown=parseFloat((pe.innerText||'').replace(/[^0-9.]/g,''))||0;
                const changePct=prev?((price-prev)/prev)*100:0;const up=price>=prevShown;
                pe.innerText='$'+price.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
                ce.innerText=(changePct>=0?'+':'')+changePct.toFixed(2)+'%';
                ce.className=`text-sm font-bold font-mono ${changePct>=0?'text-emerald-400':'text-rose-500'}`;
                if(se){const st=quoteState(q,isUSMarketOpen());se.innerText=st==='live'?'LIVE':(st==='delayed'?'延遲':'CLOSED');se.title=st==='delayed'?('Yahoo 報價延遲約 '+Math.round((Date.now()/1000-q.marketTime)/60)+' 分鐘'):'';se.className=st==='live'?'text-[9px] font-bold bg-emerald-950/80 border border-emerald-800 text-emerald-400 px-1.5 py-0.5 rounded animate-pulse':(st==='delayed'?'text-[9px] font-bold bg-amber-950/80 border border-amber-800 text-amber-400 px-1.5 py-0.5 rounded':'text-[9px] font-bold bg-zinc-900 border border-zinc-700 text-zinc-500 px-1.5 py-0.5 rounded');}
                if(prevShown>0&&Math.abs(price-prevShown)>0.001){pe.style.backgroundColor=up?'rgba(16,185,129,0.15)':'rgba(244,63,94,0.15)';pe.style.borderRadius='6px';pe.style.padding='2px 8px';pe.style.marginLeft='-8px';setTimeout(()=>pe.style.backgroundColor='transparent',350);}
            }).catch(()=>{
                if(se){se.innerText='離線';se.className='text-[9px] font-bold bg-zinc-900 border border-zinc-700 text-zinc-600 px-1.5 py-0.5 rounded';}
            });
        }
        // MSTR/STRC：幣安股票永續合約報價（24h 即時）。徽章依美股時段顯示 LIVE/CLOSED，
        // 但收盤時價格仍持續更新（永續合約不休市），滑鼠停留徽章可見說明
        function updatePerpStockCard(pid,cid,sid,symbol){
            const pe=document.getElementById(pid),ce=document.getElementById(cid),se=document.getElementById(sid);
            if(!pe||!ce)return;
            fetchCryptoQuote(symbol).then(d=>{
                if(!d||!Number.isFinite(Number(d.lastPrice))||Number(d.lastPrice)<=0||!Number.isFinite(Number(d.priceChangePercent)))throw new Error('invalid perpetual quote');
                const prevShown=parseFloat((pe.innerText||'').replace(/[^0-9.]/g,''))||0;
                const cp=parseFloat(d.lastPrice),cpc=parseFloat(d.priceChangePercent);
                pe.innerText='$'+cp.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
                ce.innerText=(cpc>=0?'+':'')+cpc.toFixed(2)+'% (24h)';
                ce.className=`text-sm font-bold font-mono ${cpc>=0?'text-emerald-400':'text-rose-500'}`;
                if(se){se.innerText='LIVE';se.title='幣安永續合約 24 小時交易，這不是美股現貨報價';se.className='text-[9px] font-bold bg-emerald-950/80 border border-emerald-800 text-emerald-400 px-1.5 py-0.5 rounded animate-pulse';}
                if(prevShown>0&&Math.abs(cp-prevShown)>0.001){pe.style.backgroundColor=cp>=prevShown?'rgba(16,185,129,0.15)':'rgba(244,63,94,0.15)';pe.style.borderRadius='6px';pe.style.padding='2px 8px';pe.style.marginLeft='-8px';setTimeout(()=>pe.style.backgroundColor='transparent',350);}
            }).catch(()=>{
                if(se){se.innerText='離線';se.title='無法更新永續合約報價；目前顯示的是上次取得的價格';se.className='text-[9px] font-bold bg-zinc-900 border border-zinc-700 text-zinc-600 px-1.5 py-0.5 rounded';}
            });
        }
        function startUsStockCards(){
            (function loop(){
                if(!document.hidden){
                    updatePerpStockCard('mstr-price','mstr-change','mstr-status','MSTRUSDT');
                    updatePerpStockCard('strc-price','strc-change','strc-status','STRCUSDT');
                }
                setTimeout(loop,5000); // 背景頁籤暫停發送報價請求
            })();
        }
        // MSTR 比特幣儲備量：自 CoinGecko 企業持倉 API 即時更新（失敗時保留內嵌預設值）
        function updateMstrReserve(){
            fetch('https://api.coingecko.com/api/v3/companies/public_treasury/bitcoin',{cache:'no-store'})
                .then(r=>r.ok?r.json():Promise.reject())
                .then(d=>{
                    const co=(d.companies||[]).find(c=>/strategy/i.test(c.name||'')||/MSTR/.test(c.symbol||''));
                    if(co&&co.total_holdings>0){
                        const el=document.getElementById('mstr-btc-reserve');
                        if(el)el.innerText='約 '+(co.total_holdings/10000).toFixed(1)+' 萬枚';
                    }
                }).catch(()=>{});
        }
        const cryptoQuotePending = new Map();
        function fetchCryptoQuote(symbol) {
            if (cryptoQuotePending.has(symbol)) return cryptoQuotePending.get(symbol);
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 9000);
            const request = fetch(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${symbol}`, {signal:controller.signal})
                .then(r => { if (!r.ok) throw new Error('quote HTTP ' + r.status); return r.json(); })
                .finally(() => { clearTimeout(timer); cryptoQuotePending.delete(symbol); });
            cryptoQuotePending.set(symbol, request);
            return request;
        }
        function updateMainCryptoCards(){
            const map=[['BTCUSDT','btc','emerald'],['ETHUSDT','eth','blue'],['BNBUSDT','bnb','yellow'],['SOLUSDT','sol','purple'],['XRPUSDT','xrp','blue'],['HYPEUSDT','hype','pink']];
            map.forEach(([sym,id])=>{
                fetchCryptoQuote(sym).then(d=>{
                    const pe=document.getElementById(`${id}-price`),ce=document.getElementById(`${id}-change`),he=document.getElementById(`${id}-high`),le=document.getElementById(`${id}-low`);
                    if(pe&&d&&Number.isFinite(Number(d.lastPrice))&&Number(d.lastPrice)>0&&Number.isFinite(Number(d.priceChangePercent))){const pv=parseFloat(pe.innerText.replace(/[$,]/g,''))||0,cp=parseFloat(d.lastPrice),cpc=parseFloat(d.priceChangePercent);
                        pe.innerText='$'+cp.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
                        ce.innerText=(cpc>=0?'+':'')+cpc.toFixed(2)+'%'; ce.className=`text-sm font-bold font-mono ${cpc>=0?'text-emerald-400':'text-rose-500'}`;
                        if(he&&d.highPrice!=null&&Number.isFinite(Number(d.highPrice)))he.innerText='$'+parseFloat(d.highPrice).toLocaleString('en-US',{minimumFractionDigits:2});
                        if(le&&d.lowPrice!=null&&Number.isFinite(Number(d.lowPrice)))le.innerText='$'+parseFloat(d.lowPrice).toLocaleString('en-US',{minimumFractionDigits:2});
                        if(pv>0&&cp!==pv){pe.style.backgroundColor=cp>=pv?'rgba(16,185,129,0.15)':'rgba(244,63,94,0.15)';pe.style.borderRadius='6px';pe.style.padding='2px 8px';pe.style.marginLeft='-8px';setTimeout(()=>pe.style.backgroundColor='transparent',300);}
                    }
                }).catch(()=>{});
            });
        }
        const fundingPending = new Map();
        function fetchFundingRate(symbol) {
            if (fundingPending.has(symbol)) return fundingPending.get(symbol);
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 9000);
            const request = fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`, {signal:controller.signal})
                .then(r => { if (!r.ok) throw new Error('funding HTTP ' + r.status); return r.json(); })
                .then(d => {
                    const rate = Number(d && d.lastFundingRate);
                    if (!d || d.lastFundingRate == null || !Number.isFinite(rate)) throw new Error('invalid funding rate');
                    return rate;
                })
                .finally(() => { clearTimeout(timer); fundingPending.delete(symbol); });
            fundingPending.set(symbol, request);
            return request;
        }
        function updateFundingRates(){
            if (document.hidden) return;
            const m={'BTCUSDT':'btc-funding','ETHUSDT':'eth-funding','BNBUSDT':'bnb-funding','SOLUSDT':'sol-funding','XRPUSDT':'xrp-funding','HYPEUSDT':'hype-funding'};
            Object.entries(m).forEach(([s,id])=>fetchFundingRate(s).then(rate=>{
                const el=document.getElementById(id);if(!el)return;
                const rp=rate*100;el.innerText=`${rp>=0?'+':''}${rp.toFixed(4)}%`;
                el.className=`font-mono text-[11px] ${rp>=0?'text-emerald-400':'text-rose-500'}`;
                el.title='資金費率（Binance，最新成功取得的數值）';
            }).catch(()=>{const el=document.getElementById(id);if(el)el.title='資金費率更新失敗；顯示的是上次取得的數值';}));
        }
        function drawSparkline(cid,prices,pos){const c=document.getElementById(cid);if(!c)return;const x=c.getContext('2d');if(!x)return;const dpr=window.devicePixelRatio||1;c.width=96*dpr;c.height=32*dpr;x.scale(dpr,dpr);x.clearRect(0,0,96,32);
            if(!prices||prices.length<2){x.beginPath();x.lineWidth=1;x.strokeStyle='#3f3f46';x.setLineDash([3,3]);x.moveTo(4,16);x.lineTo(92,16);x.stroke();x.setLineDash([]);return;}
            const mn=Math.min(...prices),mx=Math.max(...prices),r=mx-mn===0?1:mx-mn;x.beginPath();x.lineWidth=1.5;x.strokeStyle=pos?'#10b981':'#ef4444';x.lineJoin='round';x.lineCap='round';prices.forEach((p,i)=>{const px=(i/(prices.length-1))*96,py=30-((p-mn)/r)*28;i===0?x.moveTo(px,py):x.lineTo(px,py);});x.stroke();x.lineTo(96,32);x.lineTo(0,32);x.closePath();const g=x.createLinearGradient(0,0,0,32);g.addColorStop(0,pos?'rgba(16,185,129,0.15)':'rgba(239,68,68,0.15)');g.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=g;x.fill();}
        let cryptoDataList=[],searchFilter='';
        // 嚴格排除：穩定幣、包裝幣、質押衍生幣、代幣化實體資產(如 Figure Heloc 房貸憑證)等
        // symbol 精準比對排除清單
        const EXCLUDED_SYMBOLS=new Set([
            'usdt','usdc','dai','fdusd','usds','tusd','usdd','pyusd','ustc','eurs','usde','susde','frax','busd','gusd','usdp','usdl','usd0','crvusd','lusd','gho','mkusd','usdx',
            'wbtc','weth','wsteth','steth','cbeth','reth','wbeth','frxeth','meth','ezeth','weeth','rseth','oeth','ankreth','sfrxeth','wbnb',
            'ldo','ena','figure','figr','figr_heloc','ylds','buidl','usdy','ondo','usyc','ustb'
        ]);
        // name 關鍵字包含即排除
        const EXCLUDED_NAME_KEYWORDS=['stablecoin','tether','wrapped','pegged','staked','dollar','ethena','heloc','figure','tokenized','treasury','t-bill','money market','yield','usd '];
        function isExcludedCoin(symbol,name){
            const s=(symbol||'').toLowerCase().trim();
            const n=(name||'').toLowerCase();
            if(EXCLUDED_SYMBOLS.has(s))return true;
            // symbol 以 usd 開頭或結尾者多為穩定幣 (usdt, usdc, ...usd)
            if(/^usd/.test(s)||/usd$/.test(s))return true;
            if(EXCLUDED_NAME_KEYWORDS.some(k=>n.includes(k)))return true;
            return false;
        }
        // 主來源：CoinGecko markets API (含真實 7 日 sparkline)；後備：CoinLore
        // Bounded requests prevent a stalled provider from blocking the alternate feed.
        function fetchMarketJson(url,timeoutMs=8500){
            const controller=new AbortController();
            const timer=setTimeout(()=>controller.abort(),timeoutMs);
            return fetch(url,{cache:'no-store',signal:controller.signal})
                .then(r=>{if(!r.ok)throw new Error('market data HTTP '+r.status);return r.json();})
                .finally(()=>clearTimeout(timer));
        }
        let cryptoMarketPending=null;
        function fetchCryptoData(silent=false){
            if(cryptoMarketPending)return cryptoMarketPending;
            const request=(function(){
            const tb=document.getElementById('crypto-table-body');
            if(!silent&&tb)tb.innerHTML='<tr class="animate-pulse"><td colspan="8" class="py-8 text-center text-zinc-500">正在獲取頂級主權波動資產...</td></tr>';
            const cgUrl='https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=true&price_change_percentage=24h';
            return fetchMarketJson(cgUrl).then(data=>{
                if(!Array.isArray(data)||!data.length)throw 0;
                const fd=data.filter(c=>!isExcludedCoin(c.symbol,c.name));
                if(!fd.length)throw Error('CoinGecko has no valid coins');
                cryptoDataList=fd.slice(0,10).map(c=>({id:c.id,name:c.name,symbol:c.symbol,current_price:c.current_price,price_change_percentage_24h:c.price_change_percentage_24h||0,total_volume:c.total_volume||0,market_cap:c.market_cap||0,image:c.image||`https://assets.coincap.io/assets/icons/${(c.symbol||'').toLowerCase()}@2x.png`,sparkline_in_7d:{price:(c.sparkline_in_7d&&Array.isArray(c.sparkline_in_7d.price))?c.sparkline_in_7d.price:[]}}));
                renderCryptoTable();upd();
            }).catch(()=>fetchCryptoDataFallback(silent));
            })();
            cryptoMarketPending=request.finally(()=>{cryptoMarketPending=null;});
            return cryptoMarketPending;
        }
        // 後備來源：CoinLore (無歷史 sparkline，趨勢圖依當日漲跌方向示意)
        function fetchCryptoDataFallback(silent){
            return fetchMarketJson('https://api.coinlore.net/api/tickers/?start=0&limit=50').then(res=>{const data=res.data||[];if(!Array.isArray(data)||!data.length)throw Error('CoinLore empty data');
                const fd=data.filter(c=>!isExcludedCoin(c.symbol,c.name));
                if(!fd.length)throw Error('CoinLore has no valid coins');
                cryptoDataList=fd.slice(0,10).map(c=>({id:c.nameid,name:c.name,symbol:c.symbol,current_price:parseFloat(c.price_usd),price_change_percentage_24h:parseFloat(c.percent_change_24h||0),total_volume:parseFloat(c.volume24||0),market_cap:parseFloat(c.market_cap_usd||0),image:`https://assets.coincap.io/assets/icons/${c.symbol.toLowerCase()}@2x.png`,sparkline_in_7d:{price:[]}}));
                renderCryptoTable();upd();}).catch(()=>{const tb=document.getElementById('crypto-table-body');if(tb)tb.innerHTML='<tr><td colspan="8" class="py-8 text-center text-zinc-500">行情暫時無法取得，請稍後重試</td></tr>';});
        }
        function escapeCryptoText(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
        function renderCryptoTable(){const tb=document.getElementById('crypto-table-body');if(!tb)return;const tot=cryptoDataList.reduce((a,c)=>a+(c.market_cap||0),0);const fc=cryptoDataList.filter(c=>c.name.toLowerCase().includes(searchFilter)||c.symbol.toLowerCase().includes(searchFilter));
            if(!fc.length){tb.innerHTML='<tr><td colspan="8" class="py-8 text-center text-zinc-500">查無相關資產...</td></tr>';return;}tb.innerHTML='';
            fc.forEach((c,i)=>{const ch=c.price_change_percentage_24h||0,pos=ch>=0,cc=pos?'text-emerald-400':'text-rose-500',sh=tot>0?((c.market_cap/tot)*100):0;const row=document.createElement('tr');row.className="hover:bg-zinc-800/30 transition-colors border-b border-zinc-850/50 group";
                row.innerHTML=`<td class="py-4 px-4 text-center font-mono font-bold text-zinc-500">${i+1}</td><td class="py-4 px-4"><div class="flex items-center gap-3"><img class="w-7 h-7 rounded-full bg-zinc-900 object-cover" alt=""><div><div class="font-bold text-white group-hover:text-accentCyan transition-colors">${escapeCryptoText(c.name)}</div><div class="text-xs text-zinc-500 uppercase font-semibold">${escapeCryptoText(c.symbol)}</div></div></div></td><td class="py-4 px-4 text-right font-mono font-bold text-zinc-100">${formatNumber(c.current_price)}</td><td class="py-4 px-4 text-right font-mono font-bold ${cc}">${pos?'+':''}${ch.toFixed(2)}%</td><td class="py-4 px-4 text-right"><div class="inline-flex flex-col items-end gap-1 w-full max-w-[120px]"><span class="font-mono font-bold text-zinc-100">${sh.toFixed(2)}%</span><div class="w-full h-1 bg-zinc-800 rounded-full overflow-hidden"><div class="h-full bg-accentCyan rounded-full" style="width:${sh}%"></div></div></div></td><td class="py-4 px-4 text-right font-mono text-zinc-400 hidden md:table-cell">${formatNumber(c.total_volume)}</td><td class="py-4 px-4 text-right font-mono text-zinc-400 hidden lg:table-cell">${formatNumber(c.market_cap)}</td><td class="py-4 px-4 text-center"><canvas id="sparkline-${i}" class="w-24 h-8 mx-auto"></canvas></td>`;
                const img=row.querySelector("img");const fallback="https://placehold.co/28x28/1c1917/ffffff?text="+encodeURIComponent(String(c.symbol||"?").slice(0,10));img.onerror=()=>{img.onerror=null;img.src=fallback;};try{const url=new URL(String(c.image||""));img.src=url.protocol==="https:"?url.href:fallback;}catch(e){img.src=fallback;}tb.appendChild(row);setTimeout(()=>drawSparkline(`sparkline-${i}`,c.sparkline_in_7d?.price||[],pos),10);});if(window.lucide)lucide.createIcons();}
        function handleSearch(v){searchFilter=v.trim().toLowerCase();renderCryptoTable();}
        function upd(){const el=document.getElementById('last-updated');if(el){const n=new Date();el.innerText=`最後更新: 今天 ${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}:${String(n.getSeconds()).padStart(2,'0')} (自動即時同步)`;}}
        // ===== TradingView Widget 通用 =====
        function renderMiniSymbolCards(root){if(!root)return;root.querySelectorAll('[data-tv-mini-symbol]').forEach(card=>{const sym=card.getAttribute('data-tv-mini-symbol');card.innerHTML='';const c=document.createElement('div');c.className='tradingview-widget-container';c.style.height='100%';c.style.width='100%';const w=document.createElement('div');w.className='tradingview-widget-container__widget';c.appendChild(w);const s=document.createElement('script');s.type='text/javascript';s.src='https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js';s.async=true;s.text=JSON.stringify({symbol:sym,width:'100%',height:'100%',locale:'zh_TW',dateRange:'1D',colorTheme:'dark',isTransparent:true,autosize:true});c.appendChild(s);card.appendChild(c);});}
        let currentTvSymbol={tw:'TWSE:0050',us:'AMEX:SPY'};
        function reloadTvChart(market){const sym=currentTvSymbol[market]||(market==='tw'?'TWSE:0050':'AMEX:SPY');switchTvChart(market,sym,null);}
        function switchTvChart(market,symbol,btn){const cid=market==='tw'?'tw-chart-container':'us-chart-container';const ct=document.getElementById(cid);if(!ct)return;currentTvSymbol[market]=symbol;ct.innerHTML='';const c=document.createElement('div');c.className='tradingview-widget-container';c.style.height='100%';c.style.width='100%';const w=document.createElement('div');w.className='tradingview-widget-container__widget';w.style.height='100%';w.style.width='100%';c.appendChild(w);const s=document.createElement('script');s.type='text/javascript';s.src='https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';s.async=true;s.text=JSON.stringify({width:'100%',height:'100%',autosize:true,symbol:symbol,interval:'60',timezone:'Asia/Taipei',theme:'dark',style:'1',locale:'zh_TW',toolbar_bg:'#141416',enable_publishing:false,allow_symbol_change:true,hide_side_toolbar:false,support_host:'https://www.tradingview.com'});c.appendChild(s);ct.appendChild(c);
            // 重載按鈕：TradingView 伺服器偶發 502/載入失敗時，可一鍵重試而不需整頁刷新
            const rb=document.createElement('button');rb.type='button';rb.title='重新載入圖表 (TradingView 伺服器偶有暫時性錯誤)';rb.className='absolute bottom-3 right-3 z-20 px-2.5 py-1.5 rounded-lg bg-zinc-900/90 border border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors text-[11px] font-bold flex items-center gap-1 backdrop-blur';rb.innerHTML='<i data-lucide="refresh-cw" class="w-3 h-3"></i> 重載圖表';rb.onclick=(e)=>{e.stopPropagation();reloadTvChart(market);};ct.appendChild(rb);if(window.lucide)lucide.createIcons();
            if(btn){const tc=market==='tw'?'.tv-chart-tab-tw':'.tv-chart-tab-us';document.querySelectorAll(tc).forEach(b=>b.className=`${market==='tw'?'tv-chart-tab-tw':'tv-chart-tab-us'} text-xs px-3 py-1.5 rounded-lg font-bold text-zinc-400 hover:text-zinc-200 transition-all`);btn.className=`${market==='tw'?'tv-chart-tab-tw':'tv-chart-tab-us'} text-xs px-3 py-1.5 rounded-lg font-bold transition-all bg-accentCyan/10 text-accentCyan border border-accentCyan/20`;}
            const lid=market==='tw'?'tw-chart-source-link':'us-chart-source-link';const l=document.getElementById(lid);if(l)l.setAttribute('href',`https://tw.tradingview.com/symbols/${symbol.replace(':','-')}/`);}
        function renderTvWidget(cid,src,cfg){const ct=document.getElementById(cid);if(!ct)return;ct.innerHTML='';const c=document.createElement('div');c.className='tradingview-widget-container';c.style.height='100%';c.style.width='100%';const w=document.createElement('div');w.className='tradingview-widget-container__widget';c.appendChild(w);const s=document.createElement('script');s.type='text/javascript';s.src=src;s.async=true;s.text=JSON.stringify(cfg);c.appendChild(s);ct.appendChild(c);}
        function renderTechnicalGauge(cid,sym,interval){renderTvWidget(cid,'https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js',{interval:interval||'1D',width:'100%',height:'100%',symbol:sym,showIntervalTabs:false,displayMode:'multiple',locale:'zh_TW',colorTheme:'dark',isTransparent:true});}
        function renderNewsWidget(cid,sym){renderTvWidget(cid,'https://s3.tradingview.com/external-embedding/embed-widget-timeline.js',{feedMode:'symbol',symbol:sym,isTransparent:true,displayMode:'regular',width:'100%',height:'100%',colorTheme:'dark',locale:'zh_TW'});}
        function renderFinancialsWidget(cid,sym){renderTvWidget(cid,'https://s3.tradingview.com/external-embedding/embed-widget-financials.js',{symbol:sym,colorTheme:'dark',isTransparent:true,largeChartUrl:'',displayMode:'adaptive',width:'100%',height:'100%',locale:'zh_TW'});}
        // 判斷是否為 ETF / 指數 (無公司財務數據，需隱藏財務頁籤)
        const ETF_INDEX_SET=new Set(['TWSE:0050','TWSE:006208','TWSE:0056','TWSE:00878','TWSE:00919','TWSE:00929','AMEX:VT','AMEX:SPY','AMEX:VOO','AMEX:DIA','NASDAQ:QQQ','NASDAQ:SOXX','AMEX:VTI','AMEX:IVV']);
        // 常見美股 ETF 裸代號（使用者輸入不一定帶交易所前綴）
        const ETF_BARE_SET=new Set(['VT','SPY','VOO','DIA','QQQ','QQQM','SOXX','VTI','IVV','IWM','SMH','GLD','SLV','TLT','EEM','EFA','ARKK','SCHD','JEPI','JEPQ','VNQ','VGT','VUG','VTV','SPLG','SCHX','XLK','XLF','XLE','XLV','XLY','XLP','XLI','XLU','XLB','XLC','XLRE']);
        function isEtfOrIndex(sym){const s=(sym||'').toUpperCase();if(ETF_INDEX_SET.has(s))return true;const code=s.includes(':')?s.split(':')[1]:s;if(ETF_BARE_SET.has(code))return true;return /^00\d{2,4}[A-Z]?$/.test(code);}
        // 通用頁籤切換：market='us'|'tw'，view='tech'|'news'|'financials'
        function switchTechView(market,view,btn){
            const prefix=market==='tw'?'tw':'us';
            const sym=market==='tw'?twTechCurrentSymbol:techCurrentSymbol;
            const cid=prefix+'-technical-container';
            const interval=market==='tw'?twTechCurrentInterval:techCurrentInterval;
            // 時間區間列僅技術分析頁顯示
            const intervalRow=document.getElementById(prefix+'-tech-interval-row');
            if(intervalRow)intervalRow.style.display=view==='tech'?'flex':'none';
            if(view==='tech')renderTechnicalGauge(cid,sym,interval);
            else if(view==='news')renderNewsWidget(cid,sym);
            else if(view==='financials')renderFinancialsWidget(cid,sym);
            // 頁籤高亮
            document.querySelectorAll('.'+prefix+'-tech-view-btn').forEach(b=>b.className=prefix+'-tech-view-btn text-sm px-4 py-2 rounded-lg font-bold text-zinc-400 hover:text-zinc-200 transition-all');
            if(btn)btn.className=prefix+'-tech-view-btn text-sm px-4 py-2 rounded-lg font-bold transition-all bg-accentCyan/15 text-accentCyan border border-accentCyan/30';
            if(market==='tw')twTechCurrentView=view;else techCurrentView=view;
        }
        // 依當前 symbol 是否為 ETF/指數，顯示或隱藏財務頁籤；若正在看財務卻切到ETF則退回技術分析
        function refreshFinancialsTabVisibility(market){
            const prefix=market==='tw'?'tw':'us';
            const sym=market==='tw'?twTechCurrentSymbol:techCurrentSymbol;
            const finBtn=document.getElementById(prefix+'-tech-view-financials');
            if(!finBtn)return;
            const hide=isEtfOrIndex(sym);
            finBtn.style.display=hide?'none':'';
            const curView=market==='tw'?twTechCurrentView:techCurrentView;
            if(hide&&curView==='financials'){const techBtn=document.getElementById(prefix+'-tech-view-tech');switchTechView(market,'tech',techBtn);}
        }
        // 自訂技術分析時間區間切換 (一天/一週/一月)，取代 TradingView 內建含分鐘級的 tab 列
        let techCurrentSymbol='AMEX:VT',techCurrentInterval='1D',techCurrentView='tech';
        function switchTechInterval(interval,btn){
            techCurrentInterval=interval;
            renderTechnicalGauge('us-technical-container',techCurrentSymbol,interval);
            document.querySelectorAll('.tech-interval-btn').forEach(b=>b.className='tech-interval-btn text-sm px-4 py-2 rounded-lg font-bold text-zinc-400 hover:text-zinc-200 transition-all');
            if(btn)btn.className='tech-interval-btn text-sm px-4 py-2 rounded-lg font-bold transition-all bg-accentPurple/15 text-accentPurple border border-accentPurple/30';
        }
        // 更新技術分析標的、標題、小標題與資料來源連結
        function updateTechSymbol(symbol,displayName){
            techCurrentSymbol=symbol;
            const t=document.getElementById('tech-title'),st=document.getElementById('tech-subtitle'),lk=document.getElementById('tech-source-link'),nlk=document.getElementById('tech-news-link');
            const isVT=symbol==='AMEX:VT';
            if(t)t.innerText=isVT?'技術分析評級':`${displayName} 的技術分析`;
            if(st)st.innerText='股市多空儀表';
            const slug=symbol.includes(':')?symbol.replace(':','-'):symbol;
            if(lk){const path=techCurrentView==='financials'?'financials-overview':'technicals';lk.setAttribute('href',`https://tw.tradingview.com/symbols/${slug}/${path}/`);}
            if(nlk)nlk.setAttribute('href',`https://tw.tradingview.com/symbols/${slug}/news/`);
            refreshFinancialsTabVisibility('us');
            // 以當前檢視重新渲染 (若在財務頁但新標的是ETF，refreshFinancialsTabVisibility 已退回技術分析)
            const v=techCurrentView;
            if(v==='news')renderNewsWidget('us-technical-container',symbol);
            else if(v==='financials'&&!isEtfOrIndex(symbol))renderFinancialsWidget('us-technical-container',symbol);
            else renderTechnicalGauge('us-technical-container',symbol,techCurrentInterval);
        }
        function applyTechSymbol(){
            const inp=document.getElementById('tech-symbol-input');if(!inp)return;
            let raw=(inp.value||'').trim().toUpperCase();if(!raw)return;
            let symbol,display=raw;
            if(raw.includes(':')){symbol=raw;display=raw.split(':')[1];}
            else if(/^\d{4,6}$/.test(raw)){symbol='TWSE:'+raw;}          // 台股數字代號自動掛 TWSE
            else{symbol=raw;}                                             // 美股代號直接傳，由 TradingView 自動匹配交易所
            updateTechSymbol(symbol,display);
        }
        function resetTechSymbol(){
            const inp=document.getElementById('tech-symbol-input');if(inp)inp.value='';
            updateTechSymbol('AMEX:VT','VT');
        }
        // ===== 台股技術分析評級 (獨立，預設 0050) =====
        let twTechCurrentSymbol='TWSE:0050',twTechCurrentInterval='1D',twTechCurrentView='tech';
        function switchTwTechInterval(interval,btn){
            twTechCurrentInterval=interval;
            renderTechnicalGauge('tw-technical-container',twTechCurrentSymbol,interval);
            document.querySelectorAll('.tw-tech-interval-btn').forEach(b=>b.className='tw-tech-interval-btn text-sm px-4 py-2 rounded-lg font-bold text-zinc-400 hover:text-zinc-200 transition-all');
            if(btn)btn.className='tw-tech-interval-btn text-sm px-4 py-2 rounded-lg font-bold transition-all bg-accentPurple/15 text-accentPurple border border-accentPurple/30';
        }
        function updateTwTechSymbol(symbol,displayName){
            twTechCurrentSymbol=symbol;
            const t=document.getElementById('tw-tech-title'),st=document.getElementById('tw-tech-subtitle'),lk=document.getElementById('tw-tech-source-link'),nlk=document.getElementById('tw-tech-news-link');
            const isDefault=symbol==='TWSE:0050';
            if(t)t.innerText=isDefault?'技術分析評級':`${displayName} 的技術分析`;
            if(st)st.innerText='股市多空儀表';
            const slug=symbol.includes(':')?symbol.replace(':','-'):symbol;
            if(lk){const path=twTechCurrentView==='financials'?'financials-overview':'technicals';lk.setAttribute('href',`https://tw.tradingview.com/symbols/${slug}/${path}/`);}
            if(nlk)nlk.setAttribute('href',`https://tw.tradingview.com/symbols/${slug}/news/`);
            refreshFinancialsTabVisibility('tw');
            const v=twTechCurrentView;
            if(v==='news')renderNewsWidget('tw-technical-container',symbol);
            else if(v==='financials'&&!isEtfOrIndex(symbol))renderFinancialsWidget('tw-technical-container',symbol);
            else renderTechnicalGauge('tw-technical-container',symbol,twTechCurrentInterval);
        }
        function applyTwTechSymbol(){
            const inp=document.getElementById('tw-tech-symbol-input');if(!inp)return;
            let raw=(inp.value||'').trim().toUpperCase();if(!raw)return;
            let symbol,display=raw;
            if(raw.includes(':')){symbol=raw;display=raw.split(':')[1];}
            else if(/^\d{4,6}[A-Z]?$/.test(raw)){symbol='TWSE:'+raw;}      // 台股代號自動掛 TWSE
            else{symbol='TWSE:'+raw;}                                       // 其餘也預設台股
            updateTwTechSymbol(symbol,display);
        }
        function resetTwTechSymbol(){
            const inp=document.getElementById('tw-tech-symbol-input');if(inp)inp.value='';
            updateTwTechSymbol('TWSE:0050','0050');
        }
        function renderEconomicCalendar(cid,cf){renderTvWidget(cid,'https://s3.tradingview.com/external-embedding/embed-widget-events.js',{width:'100%',height:'100%',colorTheme:'dark',isTransparent:true,locale:'zh_TW',importanceFilter:'0,1',countryFilter:cf});}
        function renderStockHeatmap(cid,ds){renderTvWidget(cid,'https://s3.tradingview.com/external-embedding/embed-widget-stock-heatmap.js',{dataSource:ds,blockSize:'market_cap_basic',blockColor:'change',grouping:'sector',locale:'zh_TW',symbolUrl:'',colorTheme:'dark',hasTopBar:true,isDataSetEnabled:false,isZoomEnabled:true,hasSymbolTooltip:true,isMonoSize:false,width:'100%',height:'100%'});}
        // ============================================================
        // 台股盤中報價卡（Yahoo Finance 經公用代理；可能延遲，不保證交易所即時行情）
        // ============================================================
        let twQuotesTimer=null;
        function isTwMarketOpen(){try{const t=new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Taipei'}));const d=t.getDay();if(d===0||d===6)return false;const m=t.getHours()*60+t.getMinutes();return m>=540&&m<=810;}catch(e){return false;}}
        function flashTwPrice(el,up){if(!el)return;el.style.backgroundColor=up?'rgba(16,185,129,0.18)':'rgba(244,63,94,0.18)';el.style.borderRadius='6px';el.style.padding='2px 8px';el.style.marginLeft='-8px';setTimeout(()=>{el.style.backgroundColor='transparent';},350);}
        function twColorClass(ch){return ch>0?'text-emerald-400':(ch<0?'text-rose-500':'text-zinc-400');}
        function updateTwCard(card,q,open){
            const pe=card.querySelector('[data-tw-price]'),ce=card.querySelector('[data-tw-change]'),se=card.querySelector('[data-tw-status]');
            const qst=quoteState(q,open); // live/delayed/closed：延遲不誤判收盤、假日不誤亮 LIVE
            const last=q.price,prev=q.prevClose;if(last==null||isNaN(last))return;
            const prevShown=parseFloat((pe.innerText||'').replace(/[^0-9.]/g,''))||0;const change=last-prev,pct=prev?(change/prev)*100:0;const sign=change>=0?'+':'';
            pe.innerText=last.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
            pe.className=`text-4xl font-black font-mono tracking-tight transition-colors ${change>0?'text-emerald-400':(change<0?'text-rose-500':'text-white')}`;
            ce.innerText=`${sign}${change.toFixed(2)} (${sign}${pct.toFixed(2)}%)`;ce.className=`text-sm font-bold font-mono ${twColorClass(change)}`;
            if(se){if(qst==='live'){se.innerText='LIVE';se.title='';se.className='text-[9px] font-bold bg-emerald-950/80 border border-emerald-800 text-emerald-400 px-1.5 py-0.5 rounded animate-pulse';if(prevShown>0&&Math.abs(last-prevShown)>0.001)flashTwPrice(pe,last>=prevShown);}else if(qst==='delayed'){se.innerText='延遲';se.title=q.marketTime==null?'Yahoo 報價缺少交易時間戳，無法確認即時性':'Yahoo 報價延遲約 '+Math.max(0,Math.round((Date.now()/1000-q.marketTime)/60))+' 分鐘，價格可能持續更新';se.className='text-[9px] font-bold bg-amber-950/80 border border-amber-800 text-amber-400 px-1.5 py-0.5 rounded';if(prevShown>0&&Math.abs(last-prevShown)>0.001)flashTwPrice(pe,last>=prevShown);}else{se.innerText='收盤';se.title='';se.className='text-[9px] font-bold bg-zinc-900 border border-zinc-700 text-zinc-500 px-1.5 py-0.5 rounded';}}
        }
        // Yahoo does not offer browser CORS; bound proxy retries and never manufacture LIVE prices.
        function pxFetch(u){
            const c=new AbortController(),timeout=setTimeout(()=>c.abort(),6500);
            return fetch(u,{cache:'no-store',credentials:'omit',signal:c.signal})
                .then(r=>{if(!r.ok)throw Error('quote HTTP '+r.status);return r.text();})
                .finally(()=>clearTimeout(timeout));
        }
        function quoteState(q,clockOpen){
            if(q&&q.marketTime!=null){
                const age=Date.now()/1000-q.marketTime;
                if(age>=0&&age<300)return clockOpen?'live':'closed';
                if(clockOpen&&age<21600)return 'delayed';
            }
            return clockOpen?'delayed':'closed';
        }
        function fetchYahooQuote(symbol){
            const url='https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(symbol)+'?interval=1m&range=1d';
            // Avoid five serial proxies (45s/card) and restrict simultaneous Yahoo traffic.
            const proxies=[
                'https://proxy.cors.dev/'+url,
                'https://api.codetabs.com/v1/proxy/?quest='+encodeURIComponent(url)
            ];
            const parse=txt=>{
                const d=JSON.parse(txt),res=d.chart&&d.chart.result&&d.chart.result[0];
                if(!res||!res.meta)throw Error('missing Yahoo meta');
                const m=res.meta,price=Number(m.regularMarketPrice);
                const prevClose=Number(m.chartPreviousClose??m.previousClose);
                if(!Number.isFinite(price)||price<=0||!Number.isFinite(prevClose)||prevClose<=0)throw Error('invalid Yahoo quote');
                return {price,prevClose,marketTime:Number.isFinite(m.regularMarketTime)?m.regularMarketTime:null};
            };
            return pxFetch(proxies[0]).then(parse).catch(()=>pxFetch(proxies[1]).then(parse));
        }
        const twCardPending=new WeakSet();
        let twQuoteScanPending=null;
        let twClosingSnapshotPromise=null;
        function loadTwClosingSnapshot(){
            if(!twClosingSnapshotPromise){
                twClosingSnapshotPromise=fetch('assets/data/tw-market-snapshot.json',{cache:'no-store'})
                    .then(r=>{if(!r.ok)throw Error('snapshot unavailable');return r.json();})
                    .then(data=>data&&typeof data.prices==='object'?data:Promise.reject(Error('snapshot prices unavailable')))
                    .catch(e=>{twClosingSnapshotPromise=null;throw e;});
            }
            return twClosingSnapshotPromise;
        }
        function showTwClosingFallback(card,data){
            const symbol=card.getAttribute('data-tw-code');
            if(symbol==='TAIEX')return false; // Daily stock-price snapshot does not contain the index.
            const price=Number(data.prices[symbol]);
            if(!Number.isFinite(price)||price<=0)return false;
            const pe=card.querySelector('[data-tw-price]'),ce=card.querySelector('[data-tw-change]'),se=card.querySelector('[data-tw-status]');
            if(!pe||!se)return false;
            // A snapshot contains the official closing price but NOT a verified previous close.
            pe.textContent=price.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
            pe.className='text-4xl font-black text-white font-mono tracking-tight transition-colors';
            if(ce){ce.textContent='證交所收盤價';ce.className='text-sm font-bold font-mono text-zinc-400';}
            se.textContent='盤後參考';
            se.title='證交所價格快照抓取日：'+(data.priceDate||'未知')+'；非即時報價，個別股票成交日未提供';
            se.className='text-[9px] font-bold bg-zinc-900 border border-zinc-700 text-zinc-400 px-1.5 py-0.5 rounded';
            return true;
        }
        function markTwQuoteOffline(card){
            const se=card.querySelector('[data-tw-status]'),pe=card.querySelector('[data-tw-price]');
            if(se&&se.textContent!=='盤後參考'){
                se.innerText='離線';se.title='即時報價來源暫不可用；不表示目前價格';
                se.className='text-[9px] font-bold bg-zinc-900 border border-zinc-700 text-zinc-500 px-1.5 py-0.5 rounded';
            }
            // Do not retain a permanent spinner or the misleading "auto retry" message.
            if(pe&&(!pe.textContent.trim()||pe.querySelector('.q-spin')||pe.textContent.includes('暫時無法取得')))pe.textContent='--';
        }
        function fetchTwQuotes(){
            if(document.hidden)return Promise.resolve();
            if(twQuoteScanPending)return twQuoteScanPending;
            const scan=async()=>{
            const cards=Array.from(document.querySelectorAll('[data-tw-quote]'));
            // Display a same-origin, explicitly non-live fallback before network proxy requests.
            loadTwClosingSnapshot().then(data=>cards.forEach(card=>{
                if(!card.dataset.twHasLiveQuote && !card.dataset.twFallbackShown){
                    if(showTwClosingFallback(card,data))card.dataset.twFallbackShown='1';
                }
            })).catch(()=>{});
            // Concurrency of three prevents seven cards from hammering each public proxy.
            const queue=cards.filter(card=>!twCardPending.has(card));
            const workers=Array.from({length:Math.min(3,queue.length)},async()=>{
                while(queue.length){
                    const card=queue.shift();twCardPending.add(card);
                    try{
                        const quote=await fetchYahooQuote(card.getAttribute('data-tw-quote'));
                        card.dataset.twHasLiveQuote='1';
                        updateTwCard(card,quote,isTwMarketOpen());
                    }catch(e){
                        if(!card.dataset.twFallbackShown&&!card.dataset.twHasLiveQuote){
                            try{if(showTwClosingFallback(card,await loadTwClosingSnapshot()))card.dataset.twFallbackShown='1';}
                            catch(_){}
                        }
                        if(card.dataset.twHasLiveQuote || !card.dataset.twFallbackShown)markTwQuoteOffline(card);
                    }finally{twCardPending.delete(card);}
                }
            });
            await Promise.all(workers);
            };
            twQuoteScanPending=scan().finally(()=>{twQuoteScanPending=null;});
            return twQuoteScanPending;
        }
        function startTwRealtimeQuotes(){
            if(twQuotesTimer)clearInterval(twQuotesTimer);
            fetchTwQuotes();
            // A complete scan can take over 10s. Never start a second overlapping scan.
            twQuotesTimer=setInterval(()=>{
                if(!document.hidden && !twQuoteScanPending)fetchTwQuotes();
            },isTwMarketOpen()?20000:120000);
        }
        function renderTwSingleQuotes(){startTwRealtimeQuotes();}
        // ============================================================
        // 台股前 50 大個股 (清單內嵌打包於本檔；可一鍵抓取 0050 官網最新持股更新)
        // ============================================================
        let TW_TOP50=[
            {r:1,code:'2330',name:'台積電',w:41.6491,cat:'半導體'},{r:2,code:'2454',name:'聯發科',w:4.5373,cat:'半導體'},{r:3,code:'2308',name:'台達電',w:3.3755,cat:'電子'},{r:4,code:'2317',name:'鴻海',w:2.3424,cat:'電子'},{r:5,code:'3711',name:'日月光投控',w:2.0215,cat:'半導體'},
            {r:6,code:'2327',name:'國巨',w:1.5737,cat:'電子'},{r:7,code:'2303',name:'聯電',w:1.3788,cat:'半導體'},{r:8,code:'2383',name:'台光電',w:1.2871,cat:'電子'},{r:9,code:'2881',name:'富邦金',w:1.2089,cat:'金融'},{r:10,code:'3037',name:'欣興',w:1.1235,cat:'電子'},
            {r:11,code:'2882',name:'國泰金',w:0.961,cat:'金融'},{r:12,code:'2382',name:'廣達',w:0.9473,cat:'電子'},{r:13,code:'2408',name:'南亞科',w:0.9344,cat:'半導體'},{r:14,code:'2345',name:'智邦',w:0.933,cat:'電子'},{r:15,code:'2891',name:'中信金',w:0.9311,cat:'金融'},
            {r:16,code:'1303',name:'南亞',w:0.88,cat:'傳產'},{r:17,code:'7769',name:'鴻勁',w:0.7758,cat:'半導體'},{r:18,code:'2412',name:'中華電',w:0.7315,cat:'電信'},{r:19,code:'3017',name:'奇鋐',w:0.6599,cat:'電子'},{r:20,code:'2344',name:'華邦電',w:0.6223,cat:'半導體'},
            {r:21,code:'2360',name:'致茂',w:0.6121,cat:'電子'},{r:22,code:'2885',name:'元大金',w:0.5837,cat:'金融'},{r:23,code:'6669',name:'緯穎',w:0.574,cat:'電子'},{r:24,code:'2887',name:'台新新光金',w:0.551,cat:'金融'},{r:25,code:'8046',name:'南電',w:0.5103,cat:'電子'},
            {r:26,code:'2059',name:'川湖',w:0.4674,cat:'電子'},{r:27,code:'2886',name:'兆豐金',w:0.4557,cat:'金融'},{r:28,code:'4958',name:'臻鼎-KY',w:0.4495,cat:'電子'},{r:29,code:'3443',name:'創意',w:0.4327,cat:'半導體'},{r:30,code:'2368',name:'金像電',w:0.4135,cat:'電子'},
            {r:31,code:'2890',name:'永豐金',w:0.3854,cat:'金融'},{r:32,code:'3008',name:'大立光',w:0.3739,cat:'電子'},{r:33,code:'2884',name:'玉山金',w:0.3713,cat:'金融'},{r:34,code:'3481',name:'群創',w:0.3658,cat:'電子'},{r:35,code:'2880',name:'華南金',w:0.3524,cat:'金融'},
            {r:36,code:'6505',name:'台塑化',w:0.3498,cat:'傳產'},{r:37,code:'2357',name:'華碩',w:0.3465,cat:'電子'},{r:38,code:'2301',name:'光寶科',w:0.3427,cat:'電子'},{r:39,code:'6446',name:'藥華藥',w:0.3408,cat:'生技'},{r:40,code:'3231',name:'緯創',w:0.3359,cat:'電子'},
            {r:41,code:'3653',name:'健策',w:0.3354,cat:'電子'},{r:42,code:'2883',name:'凱基金',w:0.3247,cat:'金融'},{r:43,code:'2892',name:'第一金',w:0.3138,cat:'金融'},{r:44,code:'3189',name:'景碩',w:0.3129,cat:'電子'},{r:45,code:'3045',name:'台灣大',w:0.2891,cat:'電信'},
            {r:46,code:'2395',name:'研華',w:0.2847,cat:'電子'},{r:47,code:'1216',name:'統一',w:0.2821,cat:'傳產'},{r:48,code:'2379',name:'瑞昱',w:0.2769,cat:'半導體'},{r:49,code:'2449',name:'京元電子',w:0.275,cat:'半導體'},{r:50,code:'2603',name:'長榮',w:0.2662,cat:'航運'}
        ];
        // 常見代碼→產業別對照 (供從 0050 官網抓取後補上分類)
        const TW_SECTOR_MAP={'2330':'半導體','2454':'半導體','2303':'半導體','2379':'半導體','3711':'半導體','2344':'半導體','2408':'半導體','7769':'半導體','3443':'半導體','2449':'半導體','2308':'電子','2317':'電子','2382':'電子','2357':'電子','3231':'電子','2345':'電子','2383':'電子','2327':'電子','3037':'電子','3017':'電子','2360':'電子','6669':'電子','8046':'電子','2059':'電子','4958':'電子','2368':'電子','3008':'電子','3481':'電子','2301':'電子','3653':'電子','3189':'電子','2395':'電子','2881':'金融','2882':'金融','2891':'金融','2886':'金融','2884':'金融','2885':'金融','2887':'金融','2880':'金融','2890':'金融','2883':'金融','2892':'金融','2412':'電信','3045':'電信','1303':'傳產','1301':'傳產','2002':'傳產','1216':'傳產','6505':'傳產','2603':'航運','2609':'航運','2615':'航運','6446':'生技','1590':'生技'};
        let twWeightFilter='全部';
        function renderTwWeightFilters(){const el=document.getElementById('tw-weight-filters');if(!el)return;const cats=['全部',...Array.from(new Set(TW_TOP50.map(s=>s.cat)))];el.innerHTML=cats.map(c=>{const a=c===twWeightFilter;return `<button onclick="setTwWeightFilter('${c}')" class="text-xs px-3 py-1.5 rounded-lg font-bold transition-all ${a?'bg-accentCyan/10 text-accentCyan border border-accentCyan/30':'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-850'}">${c}</button>`;}).join('');}
        function setTwWeightFilter(c){twWeightFilter=c;renderTwWeightFilters();renderTwWeightTable();}
        function renderTwWeightTable(keyword){
            const tb=document.getElementById('tw-weight-tbody');if(!tb)return;
            const kw=(keyword!=null?keyword:(document.getElementById('tw-weight-search')?.value||'')).trim().toLowerCase();
            const rows=TW_TOP50.filter(it=>(twWeightFilter==='全部'||it.cat===twWeightFilter)&&(it.code.toLowerCase().includes(kw)||it.name.toLowerCase().includes(kw)));
            if(!rows.length){tb.innerHTML='<tr><td colspan="9" class="py-8 text-center text-zinc-500">查無相符的成分股</td></tr>';return;}
            tb.innerHTML=rows.map(it=>{const tvUrl=`https://tw.tradingview.com/chart/?symbol=TWSE%3A${it.code}`;const yUrl=`https://tw.stock.yahoo.com/quote/${it.code}.TW`;const newsUrl=`https://tw.tradingview.com/symbols/TWSE-${it.code}/news/`;
                return `<tr class="hover:bg-zinc-800/30 transition-colors group"><td class="py-3 px-4 text-center font-mono font-bold text-zinc-500">${it.r}</td><td class="py-3 px-4 font-mono font-bold text-zinc-200">${it.code}</td><td class="py-3 px-4"><div class="font-bold text-white group-hover:text-accentCyan transition-colors">${escapeCryptoText(it.name)}</div><div class="text-[10px] text-zinc-500">${escapeCryptoText(it.cat)}</div></td><td class="py-3 px-4 text-right"><span class="font-mono text-zinc-300" data-twq="${it.code}">${fmtTwPrevClose(it.code)}</span></td><td class="py-3 px-4 text-right"><span class="font-mono" data-twi="${it.code}">${fmtTwInst(it.code)}</span></td><td class="py-3 px-4 text-right"><span class="font-mono font-bold text-zinc-100">${it.w.toFixed(4)}%</span></td><td class="py-3 px-4 text-center"><a href="${tvUrl}" target="_blank" class="inline-flex items-center justify-center p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-850 text-accentCyan hover:text-white transition-colors" title="TradingView 圖表"><i data-lucide="line-chart" class="w-3.5 h-3.5"></i></a></td><td class="py-3 px-4 text-center"><a href="${yUrl}" target="_blank" class="inline-flex items-center justify-center p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-850 text-amber-400 hover:text-amber-300 transition-colors" title="Yahoo 股市"><i data-lucide="external-link" class="w-3.5 h-3.5"></i></a></td><td class="py-3 px-4 text-center"><a href="${newsUrl}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center justify-center p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-850 text-accentCyan hover:text-white transition-colors" title="TradingView 新聞"><i data-lucide="newspaper" class="w-3.5 h-3.5"></i></a></td></tr>`;
            }).join('');
            if(window.lucide)lucide.createIcons();
            loadTwPrevCloses(); // 背景補抓尚未快取的昨收價
            if(window.fillTwInstColumn)fillTwInstColumn();
        }
        // ============================================================
        // 昨收價：Yahoo 前一交易日收盤，4 併發背景載入，結果快取（失敗標記不重試）
        // ============================================================
        const TW_QUOTE_CACHE={};   // code -> number(昨收) | false(失敗)
        let twQuoteQueue=[],twQuoteActive=0;
        function fmtTwPrevClose(code){
            const v=TW_QUOTE_CACHE[code];
            if(typeof v==='number')return v.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
            if(v===false)return '—'; // 抓取失敗（點「更新前50大清單」或重新整理可重試）
            return '<span class="q-loading-sm"><span class="q-spin"></span>獲取中</span>'; // 佇列中／載入中
        }
        // 法人買賣超欄（資料由台股籌碼板塊的 T86 載入後填入 window.TW_INST_MAP）
        function fmtTwInst(code){
            const m=window.TW_INST_MAP;
            const v=m?m[code]:undefined;
            if(v===undefined)return '<span class="text-zinc-600">—</span>';
            const z=Math.round(v/1000);
            return '<span class="'+(z>=0?'text-emerald-400':'text-rose-500')+'">'+(z>=0?'+':'')+z.toLocaleString()+'</span>';
        }
        window.fillTwInstColumn=function(){
            document.querySelectorAll('[data-twi]').forEach(el=>{el.innerHTML=fmtTwInst(el.getAttribute('data-twi'));});
        };
        let twOfficialClosePromise=null;
        let twOfficialCloseData=null;
        function loadTwPrevCloses(){
            // One same-origin bulk TWSE snapshot replaces 50 separate Yahoo proxy calls.
            // Apply it again whenever the 0050 holdings list is refreshed.
            const apply=(data)=>{
                const prices=data&&data.prices||{};
                TW_TOP50.forEach(stock=>{
                    const value=prices[stock.code],price=value==null?NaN:Number(value);
                    TW_QUOTE_CACHE[stock.code]=Number.isFinite(price)&&price>0?price:false;
                });
                document.querySelectorAll('[data-twq]').forEach(el=>{
                    el.textContent=fmtTwPrevClose(el.getAttribute('data-twq'));
                    el.title=data&&data.priceDate?'證交所盤後收盤價（快照抓取日期：'+data.priceDate+'，個別交易日未提供）':'證交所盤後收盤價暫不可用';
                });
            };
            if(twOfficialCloseData){apply(twOfficialCloseData);return Promise.resolve();}
            if(!twOfficialClosePromise){
                twOfficialClosePromise=fetch('assets/data/tw-market-snapshot.json',{cache:'no-store'})
                    .then(r=>{if(!r.ok)throw Error('TWSE close snapshot missing');return r.json();})
                    .then(data=>{if(!data||typeof data.prices!=='object')throw Error('TWSE close list invalid');twOfficialCloseData=data;return data;})
                    .catch(()=>{twOfficialCloseData={prices:{}};return twOfficialCloseData;});
            }
            return twOfficialClosePromise.then(apply);
        }
        function pumpTwQuotes(){
            while(twQuoteActive<4&&twQuoteQueue.length){
                const code=twQuoteQueue.shift();
                twQuoteActive++;
                fetchYahooQuote(code+'.TW').then(q=>{
                    // 盤中→前一交易日昨收；休市(含週末/假日)→最近一個交易日收盤。
                    // 不能一律用 chartPreviousClose：休市日它指的是「最後交易日的前一日」，會往前錯一天。
                    let v=null;
                    if(q){
                        const st=quoteState(q,isTwMarketOpen());
                        if(st==='closed')v=(typeof q.price==='number')?q.price:((typeof q.prevClose==='number')?q.prevClose:null); // 休市/假日→最近一個交易日收盤
                        else v=(typeof q.prevClose==='number')?q.prevClose:null; // 盤中(即時或延遲皆同)→前一交易日收盤
                    }
                    TW_QUOTE_CACHE[code]=(v!=null)?v:false;
                }).catch(()=>{TW_QUOTE_CACHE[code]=false;}).then(()=>{
                    document.querySelectorAll('[data-twq="'+code+'"]').forEach(el=>{el.innerHTML=fmtTwPrevClose(code);});
                    twQuoteActive--;pumpTwQuotes();
                });
            }
        }
        // CI 每交易日盤後同步官方 0050 持股快照，瀏覽器優先載入本地 JSON。
        function applyTw0050Snapshot(snapshot){
            if(!snapshot || snapshot.fund!=='0050' || !Array.isArray(snapshot.holdings))throw new Error('invalid snapshot');
            const rows=snapshot.holdings;
            const seen=new Set();
            const valid=rows.length>=40 && rows.length<=50 && rows.every(s=>{
                if(!s || !/^\d{4}$/.test(String(s.code)) || typeof s.name!=='string' || !s.name.trim() ||
                    !Number.isFinite(s.w) || s.w<=0 || s.w>80 || seen.has(s.code))return false;
                seen.add(s.code);return true;
            });
            const total=rows.reduce((acc,v)=>acc+Number(v.w||0),0);
            if(!valid||total<85||total>105)throw new Error('invalid holdings content');
            TW_TOP50=rows.map((s,i)=>({r:i+1,code:String(s.code),name:s.name,w:s.w,cat:TW_SECTOR_MAP[s.code]||'其他'}));
            twWeightFilter='全部';
            renderTwWeightFilters();renderTwWeightTable();
            const note=document.getElementById('tw-weight-note');
            if(note){
                const date=snapshot.source_trade_date ? '官方資料交易日 '+snapshot.source_trade_date :
                    '官方來源未提供交易日（抓取時間 '+String(snapshot.fetched_at||'未註明').slice(0,16)+' UTC）';
                const fromMoneyDj=String(snapshot.source||'').includes('MoneyDJ');
                note.textContent='✓ 已載入 GitHub 排程同步的 0050 持股權重（資料來源：'+(fromMoneyDj?'MoneyDJ ETF 全部持股':'元大投信')+'）。'+date+'；本資訊為基金持股權重，非臺股大盤市值權重。 '; 
                const href=fromMoneyDj?'https://www.moneydj.com/ETF/X/Basic/Basic0007B.xdjhtm?etfid=0050.TW':'https://www.yuantaetfs.com/product/detail/0050/ratio';
                const link=document.createElement('a');link.href=href;link.target='_blank';link.rel='noopener noreferrer';link.className='text-accentCyan underline';link.textContent='檢視來源';note.appendChild(link);
            }
        }
        function loadScheduledTwTop50(){
            return fetch('assets/data/0050-holdings.json',{cache:'no-store'}).then(r=>{
                if(!r.ok)throw new Error('snapshot unavailable');
                return r.json();
            }).then(applyTw0050Snapshot).catch(()=>{
                const note=document.getElementById('tw-weight-note');
                if(note)note.textContent='⚠ 排程快照尚未建立或暫時無法取得。目前顯示內嵌舊清單（2026/06/30），非最新持股。可手動更新，或前往元大 0050 官方網站確認。';
            });
        }
        // 手動備援：由瀏覽器透過公用代理抓取元大 0050 持股（不保證代理可靠性）
        function refreshTwTop50FromYuanta(auto){
            const btn=document.getElementById('tw-weight-refresh-btn');
            const note=document.getElementById('tw-weight-note');
            const origHtml=btn?btn.innerHTML:'';
            if(btn&&!auto){btn.disabled=true;btn.innerHTML='<i data-lucide="loader" class="w-3.5 h-3.5 animate-spin"></i> 抓取中...';if(window.lucide)lucide.createIcons();}
            if(auto&&note){note.innerHTML='<span class="text-accentCyan">⟳</span> 正在從元大 0050 官網同步最新持股權重…（同步完成前暫以內嵌清單顯示）';}
            // 元大 ETF 後台持股 API (回傳含股票明細)；多個代理輪替容錯
            const apiUrl='https://www.yuantaetfs.com/api/v1/etfBasicInfo/getFundHoldingStock?fundId=0050';
            const proxies=[
                u=>`https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(u)}`,
                u=>`https://corsproxy.io/?url=${encodeURIComponent(u)}`,
                u=>`https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
                u=>`https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
                u=>`https://thingproxy.freeboard.io/fetch/${u}`
            ];
            const tryProxy=(i)=>{
                if(i>=proxies.length)return Promise.reject('all proxies failed');
                const purl=proxies[i](apiUrl);
                return pxFetch(purl).then(txt=>{
                    let raw=txt; try{const w=JSON.parse(txt); if(w&&typeof w.contents==='string')raw=w.contents;}catch(e){}
                    const data=JSON.parse(raw);
                    // 嘗試從常見結構取出股票陣列
                    let arr=data.Data||data.data||data.result||data.Result||data;
                    if(arr&&!Array.isArray(arr)&&Array.isArray(arr.list))arr=arr.list;
                    if(!Array.isArray(arr))throw 'unexpected structure';
                    const parsed=arr.map(x=>{
                        const code=String(x.stockId||x.StockId||x.code||x.Code||x.commodityCode||x.CommodityCode||x.商品代碼||'').trim();
                        const name=String(x.stockName||x.StockName||x.name||x.Name||x.commodityName||x.商品名稱||'').trim();
                        const w=parseFloat(x.weight||x.Weight||x.ratio||x.Ratio||x.investRatio||x.商品權重||NaN);
                        return {code,name,w};
                    }).filter(o=>o.code&&/^\d{4}$/.test(o.code)&&!isNaN(o.w));
                    if(parsed.length<10)throw 'too few rows';
                    parsed.sort((a,b)=>b.w-a.w);
                    TW_TOP50=parsed.slice(0,50).map((o,idx)=>({r:idx+1,code:o.code,name:o.name,w:o.w,cat:TW_SECTOR_MAP[o.code]||'其他'}));
                    return true;
                }).catch(()=>tryProxy(i+1));
            };
            tryProxy(0).then(()=>{
                twWeightFilter='全部';
                renderTwWeightFilters();renderTwWeightTable();
                if(note){const d=new Date();note.innerHTML=`<span class="text-emerald-500">✓</span> 已於 ${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')} ${auto?'自動':''}從<a href="https://www.yuantaetfs.com/product/detail/0050/ratio" target="_blank" class="text-accentCyan hover:underline">元大 0050 官網</a>同步最新持股權重，已下載最新可取得的資料（來源交易日期未核實，請至官網確認）。`;}
                if(btn&&!auto){btn.disabled=false;btn.innerHTML='<i data-lucide="check" class="w-3.5 h-3.5"></i> 已更新';if(window.lucide)lucide.createIcons();setTimeout(()=>{btn.innerHTML=origHtml;if(window.lucide)lucide.createIcons();},2500);}
            }).catch(()=>{
                if(note){note.innerHTML='<span class="text-rose-500">✗</span> '+(auto?'自動同步失敗':'抓取失敗')+'：0050 官網或公用代理暫時無法連線（政府/金融網站限制較嚴）。目前顯示為內嵌清單（資料日期 2026/06/30），可點上方「更新前50大清單」重試，或直接前往<a href="https://www.yuantaetfs.com/product/detail/0050/ratio" target="_blank" class="text-accentCyan hover:underline">元大 0050 官網</a>查看。';}
                if(btn&&!auto){btn.disabled=false;btn.innerHTML=origHtml;if(window.lucide)lucide.createIcons();}
            });
        }
        function initTwStockView(){
            loadTdcc0050();
            if(!twStockState.extrasLoaded){renderTwSingleQuotes();renderTechnicalGauge('tw-technical-container','TWSE:0050','1D');refreshFinancialsTabVisibility('tw');twStockState.extrasLoaded=true;}
            if(!twStockState.weightLoaded){twStockState.weightLoaded=true;renderTwWeightFilters();renderTwWeightTable();loadScheduledTwTop50();}
        }
        function initUsStockView(){
            if(!usStockState.cardsLoaded){renderMiniSymbolCards(document.getElementById('market-view-us-stock'));usStockState.cardsLoaded=true;}
            if(!usStockState.chartLoaded){switchTvChart('us','AMEX:SPY',document.querySelector('.tv-chart-tab-us'));usStockState.chartLoaded=true;}
            if(!usStockState.extrasLoaded){renderStockHeatmap('us-heatmap-container','SPX500');renderTechnicalGauge('us-technical-container','AMEX:VT');refreshFinancialsTabVisibility('us');renderEconomicCalendar('us-calendar-container','us,eu,cn,jp,gb');usStockState.extrasLoaded=true;}
        }
        // ===== 初始化 =====
        window.onload=function(){
            if(window.lucide)lucide.createIcons();
            fetchCryptoData();setInterval(()=>{if(!document.hidden)fetchCryptoData(true);},60000);
            updateMstrReserve();setInterval(updateMstrReserve,3600000);
            updateMainCryptoCards();setInterval(()=>{if(!document.hidden)updateMainCryptoCards();},5000);
            updateFundingRates();setInterval(updateFundingRates,30000);
        };
        // 預先載入：台股報價卡、前50大清單與收盤價、美股報價卡——腳本執行時 DOM 已就緒，
        // 立即開抓，不等 window.onload（外部 iframe 會拖慢 load 事件），也不等頁籤開啟
        (function preloadQuotes(){
            initMarketOverviewChart(); // 以官方 TradingView widget 顯示 BTC K 線
            startUsStockCards(); // MSTR/STRC 幣安永續報價
            renderTwSingleQuotes();
            twStockState.weightLoaded=true;renderTwWeightFilters();renderTwWeightTable();loadScheduledTwTop50();
            loadTdcc0050();
            renderMiniSymbolCards(document.getElementById('market-view-us-stock'));usStockState.cardsLoaded=true;
        })();
