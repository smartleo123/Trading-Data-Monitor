(function () {
          'use strict';
          var API = 'https://www.deribit.com/api/v2/public/';
          /* ===== 分析規則門檻（集中管理，調整解讀邏輯改這裡） ===== */
          var CFG = {
            volLowPct: 25,       /* DVOL 90日分位 < 此值 → 低波動壓縮 */
            volHighPct: 75,      /* DVOL 90日分位 > 此值 → 高波動 */
            skewPt: 2,           /* 25Δ Put-Call IV 差超過此值(vol點) → 偏防禦/偏追漲 */
            fundHot: 0.02,       /* 資金費率(%/8h) > 此值 → 多頭擁擠 */
            fundCrowdShort: -0.01, /* 資金費率 < 此值 → 空頭擁擠 */
            basisCalm: 5,        /* 期貨年化基差(%) < 此值 → 槓桿冷靜 */
            basisHot: 15         /* 期貨年化基差(%) > 此值 → 槓桿擁擠 */
          };
          var root = document.getElementById('btc-options-weekly');
          var body = document.getElementById('wr-body');
          var box = document.getElementById('wr-content');
          var chevron = document.getElementById('wr-chevron');
          var toggleBtn = document.getElementById('wr-toggle');
          var loaded = false, loading = false;

          toggleBtn.addEventListener('click', function () {
            var open = body.classList.toggle('hidden') === false;
            chevron.style.transform = open ? 'rotate(180deg)' : '';
            toggleBtn.setAttribute('aria-expanded', open);
            if (open && !loaded && !loading) load();
          });

          /* 主頁籤：即時分析 / 進出場 SOP / 策略試算 */
          var tabLive = document.getElementById('wr-tab-live');
          var tabSop = document.getElementById('wr-tab-sop');
          var tabCalc = document.getElementById('wr-tab-calc');
          var sopBox = document.getElementById('wr-sop');
          var calcBox = document.getElementById('wr-calc');
          function switchMainTab(which) {
            box.classList.toggle('hidden', which !== 'live');
            sopBox.classList.toggle('hidden', which !== 'sop');
            calcBox.classList.toggle('hidden', which !== 'calc');
            tabLive.classList.toggle('active', which === 'live');
            tabSop.classList.toggle('active', which === 'sop');
            tabCalc.classList.toggle('active', which === 'calc');
            if (which === 'calc' && typeof window.WR_initCalc === 'function') window.WR_initCalc();
            if (which !== 'live' && window.lucide) lucide.createIcons();
          }
          tabLive.addEventListener('click', function () { switchMainTab('live'); });
          tabSop.addEventListener('click', function () { switchMainTab('sop'); });
          tabCalc.addEventListener('click', function () { switchMainTab('calc'); });

          /* ---------- 工具 ---------- */
          function $(html) { box.innerHTML = html; }
          function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
          function fmt$(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
          function fmtK(n) { return n >= 1000 ? (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + 'K' : String(Math.round(n)); }
          function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
          function nearest(arr, t) { return arr.reduce(function (a, b) { return Math.abs(b - t) < Math.abs(a - t) ? b : a; }); }
          var MONTHS = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
          function parseExpiry(code) { var m = /^(\d{1,2})([A-Z]{3})(\d{2})$/.exec(code); return m ? new Date(Date.UTC(2000 + +m[3], MONTHS[m[2]], +m[1], 8)) : null; }
          function daysTo(d) { return (d - Date.now()) / 86400000; }
          function pctile(v, arr) { var s = arr.slice().sort(function (a, b) { return a - b; }); return s.filter(function (x) { return x <= v; }).length / s.length * 100; }

          /* --- 傳輸層 ---
             瀏覽器直接 fetch Deribit REST 會被 CORS 擋下（Failed to fetch），
             因此主通道改用 Deribit 官方 WebSocket JSON-RPC（不受 CORS 限制），
             失敗時依序退回：HTTP 直連 → 公用 CORS 代理。 */
          var ws = null, wsReady = null, rpcId = 0, pending = {};
          function wsConnect() {
            if (wsReady) return wsReady;
            wsReady = new Promise(function (resolve, reject) {
              var settled = false;
              var done = function (ok, val) { if (!settled) { settled = true; ok ? resolve(val) : (wsReady = null, reject(val)); } };
              var sock;
              try { sock = new WebSocket('wss://www.deribit.com/ws/api/v2'); }
              catch (e) { return done(false, e); }
              sock.onopen = function () { ws = sock; done(true, sock); };
              sock.onerror = function () { done(false, new Error('WebSocket error')); };
              sock.onclose = function () { ws = null; wsReady = null; };
              sock.onmessage = function (ev) {
                try {
                  var m = JSON.parse(ev.data);
                  if (m.id && pending[m.id]) {
                    var cb = pending[m.id]; delete pending[m.id];
                    if (m.error) cb.reject(new Error(m.error.message || ('API error ' + m.error.code))); else cb.resolve(m.result);
                  }
                } catch (e) {}
              };
              setTimeout(function () { done(false, new Error('WebSocket timeout')); }, 8000);
            });
            return wsReady;
          }
          function apiWs(path, params) {
            return wsConnect().then(function (sock) {
              return new Promise(function (resolve, reject) {
                var id = ++rpcId;
                pending[id] = { resolve: resolve, reject: reject };
                sock.send(JSON.stringify({ jsonrpc: '2.0', id: id, method: 'public/' + path, params: params || {} }));
                setTimeout(function () { if (pending[id]) { delete pending[id]; reject(new Error('timeout ' + path)); } }, 15000);
              });
            });
          }
          /* 分頁切走／隱藏時主動關閉 WebSocket。
             開著的 WS 會讓瀏覽器無法把頁面放進 back-forward cache（bfcache），
             於是切回分頁時只能整頁重載。閒置時關掉→頁面可被凍結復原；下次重新整理會自動重連。 */
          function wsClose() { try { if (ws) ws.close(); } catch (e) {} ws = null; wsReady = null; }
          window.addEventListener('pagehide', wsClose);
          document.addEventListener('visibilitychange', function () { if (document.hidden) wsClose(); });
          function apiHttp(path, params) {
            var qs = new URLSearchParams(params || {}).toString();
            var url = API + path + (qs ? '?' + qs : '');
            var parse = function (txt) {
              var j = JSON.parse(txt);
              if (j.error) throw new Error('API ' + path);
              return j.result !== undefined ? j.result : j;
            };
            var direct = function () {
              return fetch(url).then(function (res) {
                if (res.status === 429) return sleep(1200).then(direct);
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.text().then(parse);
              });
            };
            var viaProxy = function (make) {
              return fetch(make(url), { cache: 'no-store' }).then(function (res) {
                if (!res.ok) throw new Error('proxy HTTP ' + res.status);
                return res.text().then(parse);
              });
            };
            return direct()
              .catch(function () { return viaProxy(function (u) { return 'https://corsproxy.io/?url=' + encodeURIComponent(u); }); })
              .catch(function () { return viaProxy(function (u) { return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u); }); });
          }
          function api(path, params) {
            return apiWs(path, params).catch(function () { return apiHttp(path, params); });
          }

          /* ---------- 數據 ---------- */
          function fetchAll(onStep) {
            var now = Date.now(), D = {};
            onStep('抓取基礎數據（1/3）…');
            return Promise.all([
              api('get_index_price', { index_name: 'btc_usd' }),
              api('ticker', { instrument_name: 'BTC-PERPETUAL' }),
              api('get_book_summary_by_currency', { currency: 'BTC', kind: 'future' }),
              api('get_volatility_index_data', { currency: 'BTC', start_timestamp: now - 90 * 86400000, end_timestamp: now, resolution: '43200' }),
              api('get_tradingview_chart_data', { instrument_name: 'BTC-PERPETUAL', start_timestamp: now - 45 * 86400000, end_timestamp: now, resolution: '1D' }),
              api('get_historical_volatility', { currency: 'BTC' }).catch(function () { return null; }),
              api('get_last_trades_by_currency', { currency: 'BTC', kind: 'option', count: 40, sorting: 'desc' }).catch(function () { return null; })
            ]).then(function (r) {
              D.spot = r[0].index_price;
              D.perp = { mark: r[1].mark_price, funding8h: (r[1].funding_8h || 0) * 100, high24: r[1].stats.high, low24: r[1].stats.low };
              var futs = r[2].filter(function (f) { return f.instrument_name !== 'BTC-PERPETUAL'; })
                .map(function (f) { return { mark: f.mark_price, exp: parseExpiry(f.instrument_name.split('-')[1]) }; })
                .filter(function (f) { return f.exp; }).sort(function (a, b) { return a.exp - b.exp; });
              var far = futs[futs.length - 1];
              D.basisAnnual = far ? (far.mark / D.spot - 1) / (daysTo(far.exp) / 365) * 100 : 0;
              var closes = r[3].data.map(function (c) { return c[4]; });
              D.dvol = { latest: closes[closes.length - 1], min: Math.min.apply(null, r[3].data.map(function (c) { return c[3]; })), max: Math.max.apply(null, r[3].data.map(function (c) { return c[2]; })), pct: pctile(closes[closes.length - 1], closes) };
              var n = r[4].ticks.length;
              D.last30 = { high: Math.max.apply(null, r[4].high.slice(Math.max(0, n - 30))), low: Math.min.apply(null, r[4].low.slice(Math.max(0, n - 30))) };
              /* 已實現波動率（get_historical_volatility 回傳 [[ts, vol%], ...]） */
              var hv = r[5] && r[5].length ? r[5][r[5].length - 1][1] : null;
              D.hv = hv != null ? { latest: hv } : null;
              D.trades = (r[6] && r[6].trades) ? r[6].trades : [];
              onStep('分析未平倉結構（2/3）…');
              return api('get_book_summary_by_currency', { currency: 'BTC', kind: 'option' });
            }).then(function (sum) {
              var opts = [];
              sum.forEach(function (o) {
                var p = o.instrument_name.split('-'); if (p.length !== 4) return;
                var ed = parseExpiry(p[1]); if (!ed || ed <= new Date()) return;
                opts.push({ expiry: p[1], ed: ed, K: +p[2], type: p[3], oi: o.open_interest || 0, iv: (o.mark_iv != null ? o.mark_iv : null), vol: o.volume || 0 });
              });
              D.opts = opts;
              var near = opts.filter(function (o) { return daysTo(o.ed) <= 60; });
              var pOI = 0, cOI = 0;
              near.forEach(function (o) { if (o.type === 'P') pOI += o.oi; else cOI += o.oi; });
              D.pcRatio = cOI ? pOI / cOI : 0;
              function walls(f) { var m = {}; near.forEach(function (o) { if (f(o)) m[o.K] = (m[o.K] || 0) + o.oi; }); return Object.entries(m).map(function (e) { return [+e[0], e[1]]; }).sort(function (a, b) { return b[1] - a[1]; }); }
              D.putWalls = walls(function (o) { return o.type === 'P' && o.K < D.spot && o.K > D.spot * 0.75; }).slice(0, 6);
              D.callWalls = walls(function (o) { return o.type === 'C' && o.K > D.spot && o.K < D.spot * 1.3; }).slice(0, 6);
              var g = {}; opts.forEach(function (o) { if (daysTo(o.ed) <= 30 && Math.abs(o.K / D.spot - 1) < 0.08) g[o.K] = (g[o.K] || 0) + o.oi; });
              var ge = Object.entries(g).sort(function (a, b) { return b[1] - a[1]; })[0];
              D.gamma = ge ? +ge[0] : Math.round(D.spot / 1000) * 1000;
              var eo = {}; opts.forEach(function (o) { var d = daysTo(o.ed); if (d >= 14 && d <= 50) eo[o.expiry] = (eo[o.expiry] || 0) + o.oi; });
              var big = Object.entries(eo).sort(function (a, b) { return b[1] - a[1]; })[0];
              D.maxPain = null;
              if (big) {
                var es = opts.filter(function (o) { return o.expiry === big[0]; });
                var ks = Array.from(new Set(es.map(function (o) { return o.K; }))).sort(function (a, b) { return a - b; });
                var best = [Infinity, ks[0]];
                ks.forEach(function (S) {
                  var pay = 0;
                  es.forEach(function (o) { pay += o.oi * (o.type === 'C' ? Math.max(0, S - o.K) : Math.max(0, o.K - S)); });
                  if (pay < best[0]) best = [pay, S];
                });
                D.maxPain = { expiry: big[0], strike: best[1] };
              }
              /* ── 進階即時分析（皆用已抓的公開數據，無需登入）：波動率微笑 / GEX / Put-Call量 / 大單流 ── */
              function normPdf(x) { return 0.3989422804 * Math.exp(-x * x / 2); }
              function bsGamma(S, K, Tyr, sig) { if (Tyr <= 0 || sig <= 0 || S <= 0) return 0; var d1 = (Math.log(S / K) + 0.5 * sig * sig * Tyr) / (sig * Math.sqrt(Tyr)); return normPdf(d1) / (S * sig * Math.sqrt(Tyr)); }
              (function () { /* 波動率微笑：近/中/遠三到期日，各 (K, IV) 曲線（IV 取自 book_summary mark_iv） */
                var withIv = opts.filter(function (o) { return o.iv != null && o.iv > 0; });
                D.smile = []; D.smilePts = {};
                var byExp = {}; withIv.forEach(function (o) { (byExp[o.expiry] = byExp[o.expiry] || []).push(o); });
                var em = Object.keys(byExp).map(function (e) { return { code: e, dte: daysTo(parseExpiry(e)) }; }).filter(function (e) { return e.dte > 0; }).sort(function (a, b) { return a.dte - b.dte; });
                var picks3 = [];
                [[3, 20], [21, 55], [56, 220]].forEach(function (w) { var c = em.find(function (e) { return e.dte >= w[0] && e.dte <= w[1] && picks3.indexOf(e) < 0; }); if (c) picks3.push(c); });
                if (!picks3.length && em.length) picks3.push(em[0]);
                picks3.forEach(function (e) {
                  var m = {}; byExp[e.code].forEach(function (o) { (m[o.K] = m[o.K] || {})[o.type] = o.iv; });
                  var pts = Object.keys(m).map(function (k) { k = +k; var v = m[k]; var iv = k >= D.spot ? (v.C != null ? v.C : v.P) : (v.P != null ? v.P : v.C); return { K: k, iv: iv }; })
                    .filter(function (x) { return x.iv != null && x.iv > 0 && x.K > D.spot * 0.5 && x.K < D.spot * 1.8; }).sort(function (a, b) { return a.K - b.K; });
                  if (pts.length >= 3) { D.smile.push({ expiry: e.code, dte: Math.round(e.dte), pts: pts }); D.smilePts[e.code] = byExp[e.code].map(function (o) { return { K: o.K, type: o.type, iv: o.iv }; }); }
                });
              })();
              (function () { /* GEX：各履約價 gamma×OI（造市商多 Call 空 Put 之常見估計，相對量） */
                var byK = {};
                opts.forEach(function (o) { if (o.iv == null || o.oi <= 0) return; var Tyr = Math.max(daysTo(o.ed), 0) / 365; if (Tyr <= 0) return;
                  var dollar = bsGamma(D.spot, o.K, Tyr, o.iv / 100) * o.oi * D.spot * D.spot * 0.0001;
                  byK[o.K] = (byK[o.K] || 0) + (o.type === 'C' ? 1 : -1) * dollar; });
                var arr = Object.keys(byK).map(function (k) { return { K: +k, gex: byK[k] }; }).sort(function (a, b) { return a.K - b.K; });
                var flip = null, cum = 0, pc;
                arr.forEach(function (x) { pc = cum; cum += x.gex; if ((pc <= 0 && cum > 0) || (pc >= 0 && cum < 0)) flip = x.K; });
                D.gex = { byK: arr, flip: flip, net: cum };
              })();
              (function () { /* Put/Call 成交量比 + 大單成交流 */
                var pV = 0, cV = 0; opts.forEach(function (o) { if (o.type === 'P') pV += o.vol; else cV += o.vol; });
                D.pcVol = cV ? pV / cV : 0;
                var tr = (D.trades || []).map(function (t) { var p = String(t.instrument_name || '').split('-'); if (p.length !== 4) return null;
                  return { exp: p[1], K: +p[2], type: p[3], size: t.amount || 0, price: t.price, iv: t.iv, dir: t.direction, block: !!t.block_trade_id }; }).filter(Boolean).sort(function (a, b) { return b.size - a.size; });
                D.flow = tr.slice(0, 8);
                var bull = 0, bear = 0; tr.forEach(function (t) { if ((t.type === 'C' && t.dir === 'buy') || (t.type === 'P' && t.dir === 'sell')) bull += t.size; else bear += t.size; });
                D.flowBias = { bull: bull, bear: bear };
              })();
              onStep('取樣各期限 IV（3/3）…');
              /* 挑 3 個代表到期日；取樣寬度依當前 DVOL 自適應（波動越大取樣越寬，確保涵蓋 25Δ） */
              var allExp = Array.from(new Set(opts.map(function (o) { return o.expiry; })))
                .map(function (e) { return { code: e, dte: daysTo(parseExpiry(e)) }; })
                .filter(function (e) { return e.dte > 0; }).sort(function (a, b) { return a.dte - b.dte; });
              var picks = [];
              [[5, 14], [15, 45], [60, 200]].forEach(function (w) {
                var c = allExp.find(function (e) { return e.dte >= w[0] && e.dte <= w[1] && picks.indexOf(e) < 0; });
                if (c) picks.push(c);
              });
              if (!picks.length && allExp.length) picks.push(allExp[0]); /* 窗口全空時退而取最近到期日 */
              var span = Math.min(0.5, Math.max(0.12, (D.dvol.latest / 100) * 0.55));
              var MULTS = [1 - span, 1 - span * 0.6, 1 - span * 0.3, 1, 1 + span * 0.3, 1 + span * 0.6, 1 + span];
              var jobs = [];
              picks.forEach(function (e) {
                var ks = Array.from(new Set(opts.filter(function (o) { return o.expiry === e.code; }).map(function (o) { return o.K; }))).sort(function (a, b) { return a - b; });
                if (!ks.length) return;
                var targets = Array.from(new Set(MULTS.map(function (m) { return nearest(ks, D.spot * m); })));
                jobs.push(Promise.all(targets.map(function (K) {
                  var t = K < D.spot ? 'P' : 'C';
                  return api('ticker', { instrument_name: 'BTC-' + e.code + '-' + K + '-' + t })
                    .then(function (r) { return { K: K, type: t, iv: r.mark_iv, delta: r.greeks ? r.greeks.delta : 0 }; })
                    .catch(function () { return null; });
                })).then(function (qs) {
                  qs = qs.filter(Boolean); if (!qs.length) return null;
                  var atm = qs.reduce(function (a, b) { return Math.abs(b.K - D.spot) < Math.abs(a.K - D.spot) ? b : a; });
                  var puts = qs.filter(function (q) { return q.type === 'P'; });
                  var calls = qs.filter(function (q) { return q.type === 'C' && q.K > D.spot; });
                  function by25(arr) { return arr.length ? arr.reduce(function (a, b) { return Math.abs(Math.abs(b.delta) - .25) < Math.abs(Math.abs(a.delta) - .25) ? b : a; }) : null; }
                  var p = by25(puts), c = by25(calls);
                  return { expiry: e.code, dte: Math.round(e.dte), atmIV: atm.iv, skew: p && c ? p.iv - c.iv : null };
                }));
              });
              return Promise.all(jobs);
            }).then(function (ivRows) {
              D.ivRows = ivRows.filter(Boolean);
              return D;
            });
          }

          /* ---------- 規則式分析（與週報腳本同邏輯） ---------- */
          function analyze(d) {
            var a = {};
            /* 履約價一律 snap 到 Deribit 實際存在的履約價（近月/遠月各自的網格） */
            function strikesOf(minD, maxD) {
              var set = {};
              d.opts.forEach(function (o) { var dd = daysTo(o.ed); if (dd >= minD && dd <= maxD) set[o.K] = 1; });
              return Object.keys(set).map(Number).sort(function (x, y) { return x - y; });
            }
            var nearStrikes = strikesOf(14, 60);
            var farStrikes = strikesOf(100, 400);
            if (!nearStrikes.length) nearStrikes = strikesOf(0, 400);
            if (!farStrikes.length) farStrikes = nearStrikes;
            var snapNear = function (v) { return nearest(nearStrikes, v); };
            var snapFar = function (v) { return nearest(farStrikes, v); };
            a.volRegime = d.dvol.pct < CFG.volLowPct ? 'low' : d.dvol.pct > CFG.volHighPct ? 'high' : 'mid';
            a.volText = a.volRegime === 'low' ? 'DVOL ' + d.dvol.latest.toFixed(1) + ' 位於近三個月 ' + Math.round(d.dvol.pct) + '% 分位、貼近低檔——低波動壓縮期，選擇權相對便宜，但假突破多。'
              : a.volRegime === 'high' ? 'DVOL ' + d.dvol.latest.toFixed(1) + '（' + Math.round(d.dvol.pct) + '% 分位）接近高檔——選擇權昂貴，賣方相對有利，嚴控尾部風險。'
              : 'DVOL ' + d.dvol.latest.toFixed(1) + '（' + Math.round(d.dvol.pct) + '% 分位），波動率中性。';
            var fs = 0; for (var i = 0; i < d.ivRows.length; i++) { if (d.ivRows[i].skew != null) { fs = d.ivRows[i].skew; break; } }
            a.skewDef = fs > CFG.skewPt; a.skewCall = fs < -CFG.skewPt;
            a.skewText = a.skewDef ? '25Δ Put IV 高於 Call 約 ' + fs.toFixed(1) + ' 點，市場付溢價買下檔保護，偏防禦。'
              : a.skewCall ? '25Δ Call IV 高於 Put 約 ' + (-fs).toFixed(1) + ' 點，上檔追價情緒偏強。' : 'Skew 大致平衡，方向情緒中性。';
            a.fundText = d.perp.funding8h > CFG.fundHot ? '資金費率 +' + d.perp.funding8h.toFixed(3) + '%/8h 偏熱，多頭擁擠。'
              : d.perp.funding8h < CFG.fundCrowdShort ? '資金費率 ' + d.perp.funding8h.toFixed(3) + '%/8h 為負，慎防軋空。'
              : '資金費率 ' + (d.perp.funding8h >= 0 ? '+' : '') + d.perp.funding8h.toFixed(3) + '%/8h 近乎中性。';
            a.basisText = d.basisAnnual > CFG.basisHot ? '期貨年化基差 ' + d.basisAnnual.toFixed(1) + '% 偏高，槓桿擁擠。'
              : d.basisAnnual < CFG.basisCalm ? '期貨年化基差僅 ' + d.basisAnnual.toFixed(1) + '%，槓桿情緒冷靜。'
              : '期貨年化基差 ' + d.basisAnnual.toFixed(1) + '%，溫和正價差。';
            a.putWall = d.putWalls.length ? d.putWalls[0][0] : null;
            a.callWall = d.callWalls.length ? d.callWalls[0][0] : null;
            var grid = d.spot > 80000 ? 2000 : 1000; /* 僅用於永續價位對齊，非選擇權履約價 */
            var snap = function (v) { return Math.round(v / grid) * grid; };
            /* 護翼取「真實網格上往外推 2 檔」，保證與短腿不重疊 */
            function offsetStrike(list, K, steps) {
              var i = list.indexOf(nearest(list, K));
              return list[Math.min(list.length - 1, Math.max(0, i + steps))];
            }
            a.condor = { sp: a.putWall || snapNear(d.spot * .92), sc: a.callWall || snapNear(d.spot * 1.08) };
            a.condor.bp = offsetStrike(nearStrikes, a.condor.sp, -2); a.condor.bc = offsetStrike(nearStrikes, a.condor.sc, 2);
            a.ccStrike = a.callWall || snapNear(d.spot * 1.08);
            a.callSpread = { b: snapFar(d.spot * 1.1), s: snapFar(d.spot * 1.33) };
            a.putSpread = { b: snapNear(d.spot * .97), s: snapNear(d.spot * .88) };
            a.bullPut = { s: snapNear(d.spot * .94), b: snapNear(d.spot * .88) }; /* 賣方看多收租價差 */
            a.buyCallK = snapFar(d.spot * 1.08); a.buyPutK = snapNear(d.spot * .94);
            var front = d.ivRows[0], mid = d.ivRows[d.ivRows.length - 1];
            a.calGood = front && mid && front !== mid && front.atmIV > mid.atmIV;
            a.front = front; a.mid = mid;
            /* 進出場水位僅取「可交易區間」（現價下方 1–10%／上方 1–10%）內的候選：
               距現價 -20% 的深度價外 Put 牆是尾部避險單，不是回踩進場點；
               牆的挑選從 OI 排行由大到小找第一根落在區間內的，區間外的只留給價位圖當參考 */
            function inBand(v, lo, hi) { return typeof v === 'number' && v >= d.spot * lo && v <= d.spot * hi; }
            function wallInBand(walls, lo, hi) {
              for (var w = 0; w < walls.length; w++) { if (inBand(walls[w][0], lo, hi)) return walls[w][0]; }
              return null;
            }
            var supC = [
              (d.maxPain && inBand(d.maxPain.strike, 0.90, 0.99)) ? d.maxPain.strike : null,
              wallInBand(d.putWalls, 0.90, 0.99),
              inBand(d.last30.low, 0.90, 0.99) ? d.last30.low : null
            ].filter(Boolean);
            var sup = supC.length ? Math.max.apply(null, supC) : snap(d.spot * .96);
            var resC = [
              wallInBand(d.callWalls, 1.01, 1.10),
              inBand(d.gamma, 1.01, 1.10) ? d.gamma : null,
              inBand(d.last30.high, 1.01, 1.10) ? d.last30.high : null
            ].filter(Boolean);
            var res = resC.length ? Math.min.apply(null, resC) : snap(d.spot * 1.04);
            var bo = Math.max(res, d.last30.high), bd = Math.min(sup, d.last30.low);
            var boT1 = snap(bo * 1.025), bdT1 = snap(bd * .975);
            a.pp = {
              lz: [sup, sup + grid / 2], ls: Math.min(d.last30.low, sup - grid), lt1: Math.min(snap(d.spot * 1.015), res - grid / 2), lt2: res,
              sz: [res, res + grid / 2], ss: res + grid * 1.5, st1: Math.max(snap(d.spot * .985), sup + grid / 2), st2: sup,
              bo: bo, bos: bo - grid * 1.2, bot1: boT1, bot2: Math.max(boT1 + grid, (a.callWall || snap(d.spot * 1.08)) + grid),
              bd: bd, bds: bd + grid * 1.2, bdt1: bdT1, bdt2: Math.min(bdT1 - grid, (d.putWalls[1] && d.putWalls[1][0]) || snap(d.spot * .9))
            };
            return a;
          }

          /* ---------- 依當前數據產生 買方／賣方／永續 三區塊操作建議 ---------- */
          function buildAdviceBlocks(d, a) {
            var pct = Math.round(d.dvol.pct);
            var pp = a.pp;
            var skewVal = (a.front && a.front.skew != null) ? a.front.skew : 0;
            var midCode = a.mid ? a.mid.expiry : '60–90 天期';
            var frontCode = a.front ? a.front.expiry : '近月';

            /* 買方：IV 低檔=有利（權利金便宜），高檔=不利 */
            var buyStance = a.volRegime === 'low' ? ['環境有利', 'good'] : a.volRegime === 'high' ? ['環境不利', 'bad'] : ['環境中性', 'mid'];
            var buyRows = [];
            buyRows.push('<li><strong>IV 環境：</strong>DVOL 位於 90 日 ' + pct + '% 分位，權利金' + (a.volRegime === 'low' ? '便宜——買方可積極布局，成本站在你這邊' : a.volRegime === 'high' ? '昂貴——避免單腿追買，要買就用價差降低 vega 成本' : '合理——選擇性出手') + '。</li>');
            if (a.skewDef) buyRows.push('<li><strong>方向工具：</strong>Put 比 Call 貴 ' + skewVal.toFixed(1) + ' 個 vol 點——博上漲買 ' + midCode + ' ' + fmt$(a.buyCallK) + ' Call 相對划算；避險別直接買 Put（正在溢價），改用 Put Spread（買 ' + fmt$(a.putSpread.b) + 'P／賣 ' + fmt$(a.putSpread.s) + 'P）。</li>');
            else if (a.skewCall) buyRows.push('<li><strong>方向工具：</strong>Call 比 Put 貴 ' + (-skewVal).toFixed(1) + ' 個 vol 點——追漲成本高；反向布局買 ' + midCode + ' ' + fmt$(a.buyPutK) + ' Put 相對便宜。</li>');
            else buyRows.push('<li><strong>方向工具：</strong>Skew 平衡，Call/Put 定價對等——依自己的方向觀點選邊，無明顯折扣側。</li>');
            if (a.calGood) buyRows.push('<li><strong>波動率工具：</strong>近月 IV（' + a.front.atmIV.toFixed(1) + '%）高於遠月（' + a.mid.atmIV.toFixed(1) + '%）——賣 ' + frontCode + ' ATM＋買 ' + midCode + ' 同履約價的日曆價差，低價持有遠月 vega。</li>');
            else if (a.volRegime === 'low') buyRows.push('<li><strong>波動率工具：</strong>壓縮不會永續——小倉位買 ' + midCode + ' ATM 跨式' + (a.mid ? '（' + a.mid.atmIV.toFixed(1) + '% IV）' : '') + '賭變盤，事件（FOMC/CPI）前 IV 回升即可先出。</li>');
            else buyRows.push('<li><strong>波動率工具：</strong>IV 偏高，不追買波動率；等回落至中低分位再進場。</li>');
            buyRows.push('<li><strong>紀律：</strong>選 60–90 天期避 theta 懸崖、獲利 +100% 先出一半、權利金 -50% 停損（詳見 SOP 頁籤）。</li>');

            /* 賣方：IV 高檔=有利，低檔=不利 */
            var sellStance = a.volRegime === 'high' ? ['環境有利', 'good'] : a.volRegime === 'low' ? ['環境不利', 'bad'] : ['環境中性', 'mid'];
            var sellRows = [];
            sellRows.push('<li><strong>IV 環境：</strong>' + pct + '% 分位的權利金' + (a.volRegime === 'high' ? '肥厚——收租性價比高，是賣方的主場' : a.volRegime === 'low' ? '偏瘦——收租性價比差，縮小倉位、收窄結構或觀望' : '普通——只挑結構優勢明顯的單') + '。</li>');
            sellRows.push('<li><strong>區間收租：</strong>Iron Condor 賣 ' + fmt$(a.condor.sp) + 'P／' + fmt$(a.condor.sc) + 'C，買 ' + fmt$(a.condor.bp) + '／' + fmt$(a.condor.bc) + ' 護翼（30–45 天期），區間依 OI 牆而定。</li>');
            if (a.skewDef) sellRows.push('<li><strong>Skew 機會：</strong>Put 端溢價肥 ' + skewVal.toFixed(1) + ' 點——看不跌可做 Bull Put Spread（賣 ' + fmt$(a.bullPut.s) + 'P／買 ' + fmt$(a.bullPut.b) + 'P）收割恐慌溢價；防禦情緒重時避免裸賣 Put。</li>');
            else sellRows.push('<li><strong>Skew 狀態：</strong>Put/Call 溢價平衡，無特別肥的一側；以 Delta 0.15–0.30 選擇履約價即可。</li>');
            sellRows.push('<li><strong>持現貨加分題：</strong>賣 ' + fmt$(a.ccStrike) + ' Call 收租（' + (a.callWall ? 'OI 牆所在，天然壓力' : '約 +8% 價位') + '）。</li>');
            sellRows.push('<li><strong>紀律：</strong>獲利 50% 平倉、剩 21 天強制離場、虧損達 2 倍權利金止損、事件週減倉（詳見 SOP 頁籤）。</li>');

            /* 永續：依現價在區間中的位置給傾向 */
            var sup = pp.lz[0], res = pp.sz[0];
            var supDist = (d.spot - sup) / d.spot * 100;
            var resDist = (res - d.spot) / d.spot * 100;
            var perpStance, perpCls;
            if (supDist <= resDist * 0.5) { perpStance = '近支撐・偏多'; perpCls = 'good'; }
            else if (resDist <= supDist * 0.5) { perpStance = '近壓力・偏空'; perpCls = 'bad'; }
            else { perpStance = '區間中段・中性'; perpCls = 'mid'; }
            var perpRows = [];
            perpRows.push('<li><strong>位置：</strong>現價距支撐 ' + fmt$(sup) + ' 約 ' + supDist.toFixed(1) + '%、距壓力 ' + fmt$(res) + ' 約 ' + resDist.toFixed(1) + '%——' + (perpCls === 'good' ? '貼近需求區，回踩做多的性價比高於追空' : perpCls === 'bad' ? '貼近壓力區，觸及做空的性價比高於追多' : '兩端都有肉，掛單等價格來，不追中段') + '。</li>');
            perpRows.push('<li><strong>掛單參考：</strong>多單 ' + fmt$(pp.lz[0]) + '–' + fmt$(pp.lz[1]) + '（損 ' + fmt$(pp.ls) + '）；空單 ' + fmt$(pp.sz[0]) + '–' + fmt$(pp.sz[1]) + '（損 ' + fmt$(pp.ss) + '）；分批目標見下表。</li>');
            perpRows.push('<li><strong>突破應對：</strong>日收 &gt; ' + fmt$(pp.bo) + ' 回踩追多；日收 &lt; ' + fmt$(pp.bd) + ' 反彈追空——只認日線收盤' + (a.volRegime === 'low' ? '（低 DVOL 假突破多）' : '') + '。</li>');
            perpRows.push('<li><strong>成本與槓桿：</strong>' + a.fundText + ' 槓桿 ≤ 3–5 倍、單筆風險 ≤ 帳戶 1–2%。</li>');

            function card(badgeCls, badgeTxt, title, stance, rows) {
              return '<div class="wr-card"><span class="wr-badge ' + badgeCls + '">' + badgeTxt + '</span><span class="wr-stance ' + stance[1] + '">' + stance[0] + '</span><h4 style="margin-top:6px">' + title + '</h4><ul class="wr-advice">' + rows.join('') + '</ul></div>';
            }
            return '<div class="wr-h"><span class="no">02b</span>當前盤面操作建議（依上方數據即時判讀）</div>'
              + '<div class="wr-cards3">'
              + card('buy', '買方', '買 Call／Put・買波動率', buyStance, buyRows)
              + card('sell', '賣方', '收租・價差・Covered Call', sellStance, sellRows)
              + card('', '永續合約', '方向交易・區間操作', [perpStance, perpCls], perpRows)
              + '</div>';
          }

          /* ---------- 進階圖表（SVG） ---------- */
          /* 產生「整數級距」的座標刻度（如 5K/10K 一格），讓橫軸更易判讀 */
          function axisTicks(min, max, target) {
            var span = max - min; if (span <= 0) return [min];
            var raw = span / (target || 8), mag = Math.pow(10, Math.floor(Math.log10(raw))), norm = raw / mag;
            var step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
            var ticks = [], start = Math.ceil(min / step) * step;
            for (var v = start; v <= max + step * 1e-6; v += step) ticks.push(v);
            return ticks;
          }
          function smileSVG(smile, spot) {
            if (!smile || !smile.length) return '<div class="wr-foot">目前 IV 資料不足以繪製微笑曲線。</div>';
            var W = 720, H = 250, padL = 46, padR = 14, padT = 14, padB = 28, pw = W - padL - padR, ph = H - padT - padB;
            var aK = [], aI = []; smile.forEach(function (s) { s.pts.forEach(function (p) { aK.push(p.K); aI.push(p.iv); }); });
            var kMin = Math.min.apply(null, aK), kMax = Math.max.apply(null, aK);
            var iMin = Math.min.apply(null, aI), iMax = Math.max.apply(null, aI), ir = (iMax - iMin) || 1; iMin -= ir * 0.12; iMax += ir * 0.12;
            function X(k) { return padL + (k - kMin) / ((kMax - kMin) || 1) * pw; }
            function Y(v) { return padT + (1 - (v - iMin) / (iMax - iMin)) * ph; }
            var cols = ['#0e9cb8', '#c98500', '#9085e9'], s = '';
            for (var t = 0; t <= 3; t++) { var iv = iMin + (iMax - iMin) * t / 3, yy = Y(iv); s += '<line x1="' + padL + '" y1="' + yy.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + yy.toFixed(1) + '" stroke="#232326"/><text x="' + (padL - 5) + '" y="' + (yy + 3.5).toFixed(1) + '" font-size="10" fill="#71717a" text-anchor="end">' + iv.toFixed(0) + '%</text>'; }
            axisTicks(kMin, kMax, 8).forEach(function (kv) { if (kv < kMin || kv > kMax) return; var xx = X(kv);
              s += '<line x1="' + xx.toFixed(1) + '" y1="' + padT + '" x2="' + xx.toFixed(1) + '" y2="' + (padT + ph) + '" stroke="#1c1c1f"/>';
              s += '<text x="' + xx.toFixed(1) + '" y="' + (H - 9) + '" font-size="10" fill="#71717a" text-anchor="middle">$' + Math.round(kv / 1000) + 'K</text>'; });
            s += '<line x1="' + X(spot).toFixed(1) + '" y1="' + padT + '" x2="' + X(spot).toFixed(1) + '" y2="' + (padT + ph) + '" stroke="#06b6d4" stroke-width="1" stroke-dasharray="4 3"/>';
            smile.forEach(function (sm, i) { var pts = sm.pts.map(function (p) { return X(p.K).toFixed(1) + ',' + Y(p.iv).toFixed(1); }).join(' '); s += '<polyline points="' + pts + '" fill="none" stroke="' + cols[i % 3] + '" stroke-width="2" stroke-linejoin="round"/>'; });
            var lgd = '<div class="wr-lgd">' + smile.map(function (sm, i) { return '<span><i style="background:' + cols[i % 3] + '"></i>' + esc(sm.expiry) + '（' + sm.dte + '天）</span>'; }).join('') + '<span><i style="background:#06b6d4"></i>現價</span></div>';
            return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;display:block" role="img" aria-label="波動率微笑">' + s + '</svg>' + lgd;
          }
          function gexSVG(gex, spot) {
            if (!gex || !gex.byK.length) return '<div class="wr-foot">GEX 資料不足。</div>';
            var bars = gex.byK.filter(function (x) { return x.K > spot * 0.7 && x.K < spot * 1.3; }); if (!bars.length) bars = gex.byK;
            var W = 720, H = 220, padL = 10, padR = 10, padT = 16, padB = 26, pw = W - padL - padR, ph = H - padT - padB;
            var mx = Math.max.apply(null, bars.map(function (x) { return Math.abs(x.gex); })) || 1;
            var kMin = Math.min.apply(null, bars.map(function (x) { return x.K; })), kMax = Math.max.apply(null, bars.map(function (x) { return x.K; }));
            function X(k) { return padL + (k - kMin) / ((kMax - kMin) || 1) * pw; }
            var zeroY = padT + ph / 2, bw = Math.max(2, pw / bars.length * 0.66), s = '';
            axisTicks(kMin, kMax, 8).forEach(function (kv) { if (kv < kMin || kv > kMax) return; var xx = X(kv);
              s += '<line x1="' + xx.toFixed(1) + '" y1="' + padT + '" x2="' + xx.toFixed(1) + '" y2="' + (padT + ph) + '" stroke="#1c1c1f"/>'; });
            s += '<line x1="' + padL + '" y1="' + zeroY + '" x2="' + (W - padR) + '" y2="' + zeroY + '" stroke="#5b5b63"/>';
            bars.forEach(function (x) { var h = Math.abs(x.gex) / mx * (ph / 2 - 4), xx = X(x.K) - bw / 2, y = x.gex >= 0 ? zeroY - h : zeroY; s += '<rect x="' + xx.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" fill="' + (x.gex >= 0 ? '#0da271' : '#ef4444') + '" fill-opacity="0.75"/>'; });
            /* 現價與 flip 線；標籤若過近則左右錯開，避免「現價flip」疊字 */
            var spotX = X(spot), flipX = gex.flip ? X(gex.flip) : null;
            var near = flipX != null && Math.abs(flipX - spotX) < 34;
            s += '<line x1="' + spotX.toFixed(1) + '" y1="' + padT + '" x2="' + spotX.toFixed(1) + '" y2="' + (padT + ph) + '" stroke="#06b6d4" stroke-dasharray="4 3"/><text x="' + (spotX + (near ? -5 : 0)).toFixed(1) + '" y="' + (padT - 4) + '" font-size="10" fill="#22d3ee" text-anchor="' + (near ? 'end' : 'middle') + '">現價</text>';
            if (gex.flip) s += '<line x1="' + flipX.toFixed(1) + '" y1="' + padT + '" x2="' + flipX.toFixed(1) + '" y2="' + (padT + ph) + '" stroke="#e4e4e7" stroke-dasharray="2 2"/><text x="' + (flipX + (near ? 5 : 0)).toFixed(1) + '" y="' + (padT - 4) + '" font-size="10" fill="#a1a1aa" text-anchor="' + (near ? 'start' : 'middle') + '">flip</text>';
            axisTicks(kMin, kMax, 8).forEach(function (kv) { if (kv < kMin || kv > kMax) return;
              s += '<text x="' + X(kv).toFixed(1) + '" y="' + (H - 6) + '" font-size="10" fill="#71717a" text-anchor="middle">$' + Math.round(kv / 1000) + 'K</text>'; });
            return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;display:block" role="img" aria-label="Gamma 曝險">' + s + '</svg>';
          }
          function flowHTML(flow) {
            if (!flow || !flow.length) return '<div class="wr-foot">目前無近期成交流資料（或當下成交清淡）。</div>';
            return '<table class="wr-t"><thead><tr><th>合約</th><th>方向</th><th class="num">口數(BTC)</th><th class="num">價格</th><th class="num">IV</th></tr></thead><tbody>'
              + flow.map(function (t) { return '<tr><td>' + esc(t.exp) + ' ' + fmt$(t.K) + ' ' + (t.type === 'C' ? 'Call' : 'Put') + (t.block ? ' <span class="wr-blk">區塊</span>' : '') + '</td><td>' + (t.dir === 'buy' ? '<span class="wr-dl">買</span>' : '<span class="wr-ds">賣</span>') + '</td><td class="num">' + (Math.round(t.size * 10) / 10) + '</td><td class="num">' + (t.price != null ? t.price : '—') + '</td><td class="num">' + (t.iv != null ? t.iv.toFixed(0) + '%' : '—') + '</td></tr>'; }).join('') + '</tbody></table>';
          }

          /* Risk-gated decision support: model assumptions are explicit,
             and missing core fields always produce a wait/no-trade state. */
          function decisionPanel(d) {
            if(!window.BTCOptionsDecision)return '';
            var assessment=window.BTCOptionsDecision.evaluate(d);
            var display=function(list){return '<ul class="wr-advice">'+list.map(function(x){return '<li>'+esc(x)+'</li>';}).join('')+'</ul>';};
            var status=assessment.sufficient?'條件式交易情境':'數據不足・先觀望';
            var info='<div class="wr-h"><span class="no">00</span>選擇權決策儀表・先判斷是否值得交易</div>'
              +'<div class="wr-card" id="wr-decision-panel" role="region" aria-label="BTC 選擇權決策儀表">'
              +'<span class="wr-badge">'+esc(status)+'</span><h4>'+esc(assessment.regime)+'｜'+esc(assessment.bias)+'</h4>'
              +'<p><strong>參考情境：</strong>'+esc(assessment.setup)+'</p>'
              +'<p><strong>啟動條件：</strong>'+esc(assessment.trigger)+'</p>';
            if(assessment.missing.length)info+='<p class="wr-risk">缺少：'+esc(assessment.missing.join('、'))+'</p>';
            info+='<div class="wr-subh">觀察到的數據（非買賣指令）</div>'+display(assessment.clues)
              +'<div class="wr-subh mt">風險與模型限制</div>'+display(assessment.warnings)
              +'<p class="wr-foot">結論是條件式情境，不代表已證實統計優勢。任何指定履約價或價差需再核對同到期日買賣盤、合約乘數、最大可能虧損與手續費；不提供自動下單。</p>'
              +'</div>';
            return info;
          }

          /* ---------- 渲染 ---------- */
          function render(d, a) {
            /* 匯出即時快照給右下角 AI 助理當回答上下文 */
            try {
              window.WR_SNAPSHOT = {
                updatedAt: new Date().toISOString(),
                spot: d.spot, dvol: +d.dvol.latest.toFixed(1), dvolPct: Math.round(d.dvol.pct), volRegime: a.volRegime,
                funding8h: d.perp.funding8h, basisAnnual: +d.basisAnnual.toFixed(1),
                maxPain: d.maxPain ? { strike: d.maxPain.strike, expiry: d.maxPain.expiry } : null,
                callWall: a.callWall, putWall: a.putWall, gammaZone: d.gamma,
                last30: { high: d.last30.high, low: d.last30.low },
                ivRows: d.ivRows.map(function (r) { return { expiry: r.expiry, atmIV: r.atmIV != null ? +r.atmIV.toFixed(1) : null, skew: r.skew != null ? +r.skew.toFixed(1) : null }; }),
                perpLevels: { longZone: a.pp.lz, longStop: a.pp.ls, shortZone: a.pp.sz, shortStop: a.pp.ss, breakoutUp: a.pp.bo, breakoutDown: a.pp.bd },
                strategies: { condor: a.condor, bullPut: a.bullPut, callSpread: a.callSpread, putSpread: a.putSpread, coveredCall: a.ccStrike, buyCallK: a.buyCallK, buyPutK: a.buyPutK },
                realizedVol: (d.hv && d.hv.latest != null) ? +d.hv.latest.toFixed(1) : null,
                pcVolume: d.pcVol ? +d.pcVol.toFixed(2) : null,
                gammaFlip: (d.gex && d.gex.flip) ? d.gex.flip : null,
                optionFlowBias: (d.flowBias && (d.flowBias.bull + d.flowBias.bear) > 0) ? (d.flowBias.bull > d.flowBias.bear * 1.15 ? 'bullish' : d.flowBias.bear > d.flowBias.bull * 1.15 ? 'bearish' : 'neutral') : null
              };
              document.dispatchEvent(new CustomEvent('wr-snapshot'));
            } catch (e) { /* 快照失敗不影響面板 */ }
            var rows = [];
            if (a.callWall) rows.push({ p: a.callWall, w: 68, n: 'Call 未平倉大牆（OI ' + fmtK(d.callWalls[0][1]) + '）・賣 Call 收租區' });
            rows.push({ p: d.last30.high, w: 52, n: '近 30 日高點，突破確認位（日收上破才有效）' });
            rows.push({ p: d.gamma, w: 90, n: 'OI/Gamma 集中區' });
            if (d.maxPain) rows.push({ p: d.maxPain.strike, w: 66, n: 'Max Pain 磁吸位（' + d.maxPain.expiry + ' 到期）' });
            rows.push({ p: d.last30.low, w: 90, n: '近 30 日低點，跌破轉弱' });
            if (a.putWall) rows.push({ p: a.putWall, w: 68, n: 'Put 未平倉大牆（OI ' + fmtK(d.putWalls[0][1]) + '）' });
            var mg = {};
            rows.forEach(function (r) { if (mg[r.p]) { mg[r.p].n += '・' + r.n; mg[r.p].w = Math.max(mg[r.p].w, r.w); } else mg[r.p] = r; });
            var lad = Object.values(mg).map(function (r) { return { price: r.p, cls: r.p >= d.spot ? 'wr-r' : 'wr-s', bar: r.p >= d.spot ? 'wr-br' : 'wr-bs', w: r.w, n: r.n }; });
            lad.push({ price: d.spot + .5, spot: true });
            lad.sort(function (x, y) { return y.price - x.price; });
            var ladH = lad.map(function (l) {
              return l.spot
                ? '<div class="wr-lrow"><div class="wr-lp spot">' + fmt$(d.spot) + ' ◄</div><div class="wr-lb wr-bspot" style="width:90px"></div><div class="wr-ln"><strong>現價（指數）</strong></div></div>'
                : '<div class="wr-lrow"><div class="wr-lp ' + l.cls + '">' + fmt$(l.price) + '</div><div class="wr-lb ' + l.bar + '" style="width:' + l.w + 'px"></div><div class="wr-ln">' + esc(l.n) + '</div></div>';
            }).join('');
            var ivH = d.ivRows.map(function (r) {
              return '<tr><td>' + esc(r.expiry) + '</td><td class="num">' + r.dte + ' 天</td><td class="num">' + r.atmIV.toFixed(1) + '%</td><td class="num">' + (r.skew == null ? '—' : (r.skew >= 0 ? '+' : '') + r.skew.toFixed(1) + ' pt') + '</td></tr>';
            }).join('');
            var vc = a.calGood
              ? { b: '做多波動率', t: '日曆價差 Calendar', body: '近月 IV（' + a.front.atmIV.toFixed(1) + '%）高於遠月（' + a.mid.atmIV.toFixed(1) + '%），賣貴買便宜。', how: '賣 ' + esc(a.front.expiry) + ' ATM ＋ 買 ' + esc(a.mid.expiry) + ' 同履約價。', risk: '價格大幅偏離履約價時兩頭受損。' }
              : a.volRegime === 'low'
                ? { b: '做多波動率', t: '遠月跨式 Straddle', body: 'DVOL 位於 ' + Math.round(d.dvol.pct) + '% 分位，買波動率相對便宜。', how: '買 ' + esc(a.mid ? a.mid.expiry : '60–90 天期') + ' ATM 跨式，等壓縮後變盤。', risk: '持續盤整時 theta 緩慢消耗，設定退出時間。' }
                : { b: '做空波動率', t: '寬跨式收租（帶護翼）', body: '波動率偏高（' + Math.round(d.dvol.pct) + '% 分位），賣方有利。', how: '賣 ' + fmt$(a.condor.sp) + ' Put ＋ 賣 ' + fmt$(a.condor.sc) + ' Call，買 ' + fmt$(a.condor.bp) + '／' + fmt$(a.condor.bc) + ' 護翼。', risk: '高波動代表大行情機率高，倉位縮小。' };
            var pp = a.pp;
            var stamp = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
            /* 匯出波動率微笑給策略試算，讓每檔用自己的市場 IV 定價 */
            try { window.WR_SMILE = { spot: d.spot, updatedAt: Date.now(), expiries: (d.smile || []).map(function (s) { return { expiry: s.expiry, dte: s.dte, pts: s.pts }; }) }; document.dispatchEvent(new CustomEvent('wr-smile')); } catch (e) {}
            /* 進階盤面（04）HTML */
            var ivFront = a.front ? a.front.atmIV : d.dvol.latest;
            var vrp = (d.hv && d.hv.latest != null) ? (ivFront - d.hv.latest) : null;
            var fb = (d.flowBias && (d.flowBias.bull + d.flowBias.bear) > 0) ? (d.flowBias.bull > d.flowBias.bear * 1.15 ? '偏多' : d.flowBias.bear > d.flowBias.bull * 1.15 ? '偏空' : '中性') : '—';
            var advH = '<div class="wr-h"><span class="no">＋</span>進階盤面（Deribit 即時・免登入公開數據）</div>'
              + '<div class="wr-tiles">'
              + '<div class="wr-tile"><div class="k">IV vs 已實現波動</div><div class="v">' + (vrp != null ? (vrp >= 0 ? '+' : '') + vrp.toFixed(1) + ' pt' : '—') + '</div><div class="d">' + (vrp != null ? 'IV ' + ivFront.toFixed(0) + '% vs RV ' + d.hv.latest.toFixed(0) + '%・' + (vrp > 3 ? '選擇權偏貴、賣方有利' : vrp < -3 ? '選擇權偏便宜、買方有利' : '定價合理') : '無 RV 資料') + '</div></div>'
              + '<div class="wr-tile"><div class="k">Put/Call 成交量比</div><div class="v">' + (d.pcVol ? d.pcVol.toFixed(2) : '—') + '</div><div class="d">' + (d.pcVol > 1 ? '賣權成交多・偏避險' : d.pcVol > 0 ? '買權成交多・偏積極' : '') + '</div></div>'
              + '<div class="wr-tile"><div class="k">選擇權成交流向</div><div class="v">' + fb + '</div><div class="d">' + (fb === '偏多' ? '買 Call／賣 Put 為主' : fb === '偏空' ? '買 Put／賣 Call 為主' : '多空成交量相當') + '</div></div>'
              + '</div>'
              + '<div class="wr-subh">波動率微笑／偏斜（IV vs 履約價・已可餵入下方「策略試算」逐檔定價）</div>'
              + '<div class="wr-chart">' + smileSVG(d.smile, d.spot) + '</div>'
              + '<div class="wr-subh mt">Gamma 曝險 GEX（各履約價・綠正紅負・估計值）</div>'
              + '<div class="wr-chart">' + gexSVG(d.gex, d.spot) + '</div>'
              + '<div class="wr-foot">綠＝正 gamma（造市商傾向壓抑波動、利於區間收租）、紅＝負 gamma（助漲助跌、波動放大）。' + (d.gex && d.gex.flip ? 'gamma 翻轉價約 <strong>' + fmt$(d.gex.flip) + '</strong>，現價在其' + (d.spot >= d.gex.flip ? '上方（相對穩定區）' : '下方（波動易放大區）') + '。' : '') + '造市商持倉方向為業界常見假設，非確定值，僅供參考。</div>'
              + '<div class="wr-subh mt">近期大單／區塊成交流（依口數排序前 8）</div>'
              + flowHTML(d.flow);
            var decisionH=decisionPanel(d);
            $('<div class="wr-bar"><span>數據時間：' + stamp + '（台北）・即時計算・僅供參考，非投資建議</span><button type="button" id="wr-refresh">重新整理</button></div>'
              + decisionH
              + '<div class="wr-tiles">'
              + '<div class="wr-tile"><div class="k">BTC 指數</div><div class="v">' + fmt$(d.spot) + '</div><div class="d">永續 ' + fmt$(d.perp.mark) + '・24h ' + fmt$(d.perp.low24) + '–' + fmt$(d.perp.high24) + '</div></div>'
              + '<div class="wr-tile"><div class="k">DVOL</div><div class="v">' + d.dvol.latest.toFixed(1) + '</div><div class="d">90日分位 ' + Math.round(d.dvol.pct) + '%（' + d.dvol.min.toFixed(0) + '–' + d.dvol.max.toFixed(0) + '）</div></div>'
              + '<div class="wr-tile"><div class="k">ATM IV（近月）</div><div class="v">' + (a.front ? a.front.atmIV.toFixed(1) + '%' : '—') + '</div><div class="d">' + d.ivRows.map(function (r) { return esc(r.expiry) + ' ' + r.atmIV.toFixed(0) + '%'; }).join('・') + '</div></div>'
              + '<div class="wr-tile"><div class="k">25Δ Skew</div><div class="v">' + (a.front && a.front.skew != null ? (a.front.skew >= 0 ? 'Put +' : 'Call +') + Math.abs(a.front.skew).toFixed(1) + 'pt' : '—') + '</div><div class="d">' + (a.skewDef ? '偏防禦' : a.skewCall ? '偏追漲' : '中性') + '</div></div>'
              + '<div class="wr-tile"><div class="k">資金費率（8h）</div><div class="v">' + (d.perp.funding8h >= 0 ? '+' : '') + d.perp.funding8h.toFixed(3) + '%</div><div class="d">' + (Math.abs(d.perp.funding8h) < .01 ? '近乎中性' : d.perp.funding8h > 0 ? '多方付費' : '空方付費') + '</div></div>'
              + '<div class="wr-tile"><div class="k">Put/Call OI（60日）</div><div class="v">' + d.pcRatio.toFixed(2) + '</div><div class="d">' + (d.maxPain ? 'Max Pain ' + fmt$(d.maxPain.strike) + '（' + esc(d.maxPain.expiry) + '）' : '') + '</div></div>'
              + '</div>'
              + '<div class="wr-h"><span class="no">01</span>市場結構解讀</div>'
              + '<div class="wr-lead">' + a.volText + ' ' + a.skewText + ' ' + a.fundText + ' ' + a.basisText + '</div>'
              + '<div class="wr-ladder">' + ladH + '</div>'
              + '<table class="wr-t"><thead><tr><th>到期日</th><th>剩餘天數</th><th>ATM IV</th><th>25Δ Skew（Put−Call）</th></tr></thead><tbody>' + ivH + '</tbody></table>'
              + advH
              + '<div class="wr-h"><span class="no">02</span>選擇權策略參考</div>'
              + '<div class="wr-cards">'
              + '<div class="wr-card"><span class="wr-badge">看盤整</span><h4>鐵兀鷹 Iron Condor</h4><p>依 OI 牆設定區間收租。</p><div class="wr-how">賣 ' + fmt$(a.condor.sp) + ' Put ＋ 賣 ' + fmt$(a.condor.sc) + ' Call，買 ' + fmt$(a.condor.bp) + '／' + fmt$(a.condor.bc) + ' 護翼（30–45 天）。</div><p class="wr-risk">風險：重大事件（FOMC、CPI）週減倉。</p></div>'
              + '<div class="wr-card"><span class="wr-badge">持有現貨</span><h4>Covered Call 收租</h4><p>在 Call 牆上方賣出收權利金。</p><div class="wr-how">賣 ' + fmt$(a.ccStrike) + ' 或更高履約價 Call（30–45 天）。' + (a.skewDef ? '加保護用 Put Spread（買 ' + fmt$(a.putSpread.b) + 'P／賣 ' + fmt$(a.putSpread.s) + 'P）較划算。' : '') + '</div><p class="wr-risk">風險：急漲突破履約價時獲利封頂。</p></div>'
              + '<div class="wr-card"><span class="wr-badge' + (a.volRegime === 'high' ? ' warn' : '') + '">' + vc.b + '</span><h4>' + vc.t + '</h4><p>' + vc.body + '</p><div class="wr-how">' + vc.how + '</div><p class="wr-risk">風險：' + vc.risk + '</p></div>'
              + '<div class="wr-card"><span class="wr-badge">中期方向</span><h4>遠月 Call Spread</h4><p>有限成本表達中期看漲。</p><div class="wr-how">買 ' + fmt$(a.callSpread.b) + ' Call／賣 ' + fmt$(a.callSpread.s) + ' Call（120 天以上）。</div><p class="wr-risk">風險：盤整時權利金隨 IV 下滑縮水。</p></div>'
              + '</div>'
              + '<div class="wr-callout"><strong>避免做的事：</strong>' + (a.skewDef ? '市場正為下檔付費（skew 偏 Put），' : '') + '裸賣價外 Put 博權利金風險報酬不佳；' + (a.volRegime === 'low' ? '低波動期追買短天期價外 Call 易被 gamma 牆與 Max Pain 磁吸消耗。' : '高波動期追買貴 IV 的短天期單腿部位勝率偏低。') + '</div>'
              + buildAdviceBlocks(d, a)
              + '<div class="wr-h"><span class="no">03</span>永續合約進出場參考</div>'
              + '<div class="wr-lead">水位僅取距現價 ±10% 內的有效支撐壓力（Max Pain／Put 牆／30日低 vs Call 牆／Gamma 區／30日高）；更遠的深度價外大牆屬尾部避險參考，見上方價位圖。</div>'
              + '<table class="wr-t"><thead><tr><th>情境</th><th>方向</th><th>進場區</th><th>停損</th><th>目標</th></tr></thead><tbody>'
              + '<tr><td>區間操作</td><td class="wr-dl">做多</td><td class="num">' + fmt$(pp.lz[0]) + '–' + fmt$(pp.lz[1]) + ' 回踩</td><td class="num">' + fmt$(pp.ls) + ' 下方</td><td class="num">T1 ' + fmt$(pp.lt1) + '<br>T2 ' + fmt$(pp.lt2) + '</td></tr>'
              + '<tr><td>區間操作</td><td class="wr-ds">做空</td><td class="num">' + fmt$(pp.sz[0]) + '–' + fmt$(pp.sz[1]) + ' 觸及</td><td class="num">' + fmt$(pp.ss) + ' 上方</td><td class="num">T1 ' + fmt$(pp.st1) + '<br>T2 ' + fmt$(pp.st2) + '</td></tr>'
              + '<tr><td>向上突破</td><td class="wr-dl">追多</td><td class="num">日收 &gt; ' + fmt$(pp.bo) + ' 後回踩進場</td><td class="num">' + fmt$(pp.bos) + ' 下方</td><td class="num">T1 ' + fmt$(pp.bot1) + '<br>T2 ' + fmt$(pp.bot2) + '</td></tr>'
              + '<tr><td>向下跌破</td><td class="wr-ds">追空</td><td class="num">日收 &lt; ' + fmt$(pp.bd) + ' 後反彈進場</td><td class="num">' + fmt$(pp.bds) + ' 上方</td><td class="num">T1 ' + fmt$(pp.bdt1) + '<br>T2 ' + fmt$(pp.bdt2) + '</td></tr>'
              + '</tbody></table>'
              + '<ul class="wr-tips">'
              + '<li><strong>槓桿與倉位：</strong>槓桿 ≤ 3–5 倍，單筆虧損 ≤ 帳戶 1–2%——先定停損距離再反推倉位。</li>'
              + '<li><strong>假突破過濾：</strong>只認日線收盤站上／跌破關鍵位，盤中刺穿不追單。</li>'
              + '<li><strong>分批停利：</strong>T1 平一半並把停損移到成本價。</li>'
              + '<li><strong>事件降槓桿：</strong>FOMC、CPI 前 24 小時至少減半槓桿。</li>'
              + '</ul>'
              + '<div class="wr-foot">水位由 Max Pain／Put 牆（支撐）、Call 牆／OI 集中區（壓力）、近 30 日高低點（突破確認）即時推導。規則式自動產生，僅供教育參考，不構成投資建議。數據源：Deribit 公開 API。</div>');
            var rf = document.getElementById('wr-refresh');
            if (rf) rf.addEventListener('click', function () { loaded = false; load(); });
          }

          function load() {
            loading = true;
            $('<div class="wr-status"><span class="wr-spin"></span><span id="wr-step">連線 Deribit…</span></div>');
            var stepEl = function (t) { var el = document.getElementById('wr-step'); if (el) el.textContent = t; };
            fetchAll(stepEl).then(function (d) {
              render(d, analyze(d));
              loaded = true; loading = false;
            }).catch(function (e) {
              loading = false;
              $('<div class="wr-err">數據載入失敗（' + esc(e.message) + '）<button type="button" id="wr-retry">重試</button></div>');
              var rt = document.getElementById('wr-retry');
              if (rt) rt.addEventListener('click', load);
            });
          }

          /* 預設展開並自動載入即時分析 */
          chevron.style.transform = 'rotate(180deg)';
          toggleBtn.setAttribute('aria-expanded', 'true');
          load();
        })();
