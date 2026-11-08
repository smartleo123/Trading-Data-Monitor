(function () {
      'use strict';
      var KEY_LS = 'groq_api_key', WEB_LS = 'ha_web_search';
      var fab = document.getElementById('ha-fab'), panel = document.getElementById('ha-panel');
      var msgsEl = document.getElementById('ha-msgs'), input = document.getElementById('ha-input');
      var sendBtn = document.getElementById('ha-send'), chips = document.getElementById('ha-chips');
      var modeEl = document.getElementById('ha-mode'), settings = document.getElementById('ha-settings');
      var keyInput = document.getElementById('ha-key');
      var webBtn = document.getElementById('ha-web'), webHint = document.getElementById('ha-web-hint');
      var resizeEl = document.getElementById('ha-resize');
      var badgeEl = document.getElementById('ha-badge');
      var SIZE_LS = 'ha_size', ECON_SEEN_LS = 'ha_econ_seen';
      var history = [];           /* {role,content} 只留對話，system 每次即時重建 */
      var busy = false, lastFreeAt = 0, econShown = false;

      /* ══ 今日重要經濟數據 ══
         優先「即時」：經公用代理抓 TradingView 經濟日曆資料端點（伺服器端取用不受瀏覽器 CORS 限制，
           與本頁證交所數據同一機制）——動態、免維護。
         取不到時退回「內建行事曆」：規則型（非農＝每月第一個週五、初領失業金＝每週四，永不過期）＋
           官方固定日期（BLS CPI 排程至 2026/12、Fed FOMC 排程至 2027/12）。 */
      function pad2(n) { return ('0' + n).slice(-2); }
      function ymd(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
      /* 官方固定日期（美東發布日）：CPI 為 BLS 已公布排程；FOMC 至 2027 為 Fed 暫定排程 */
      var ECON_CPI = { '2026-07-14': '6月', '2026-08-12': '7月', '2026-09-11': '8月', '2026-10-14': '9月', '2026-11-10': '10月', '2026-12-10': '11月' };
      var ECON_FOMC = ['2026-07-29', '2026-09-16', '2026-10-28', '2026-12-09',
        '2027-01-27', '2027-03-17', '2027-04-28', '2027-06-09', '2027-07-28', '2027-09-15', '2027-10-27', '2027-12-08'];
      function builtinEconFor(d) {
        var key = ymd(d), out = [];
        if (ECON_CPI[key]) out.push({ n: '美國 CPI 消費者物價指數（' + ECON_CPI[key] + '）', t: '台北 20:30', imp: 'high' });
        if (ECON_FOMC.indexOf(key) >= 0) out.push({ n: 'FOMC 聯準會利率決議', t: '台北隔日 02:00', imp: 'high' });
        var dow = d.getDay(); /* 0=日..6=六 */
        if (dow === 5 && d.getDate() <= 7) out.push({ n: '美國非農就業報告 (NFP)', t: '台北 20:30', imp: 'high' });
        if (dow === 4) out.push({ n: '美國初領失業金人數', t: '台北 20:30', imp: 'med' });
        return out;
      }
      var liveEcon = null; /* null＝未取得（用內建）；陣列＝TradingView 即時結果 */
      function todaysEcon() { return liveEcon !== null ? liveEcon : builtinEconFor(new Date()); }
      /* 事件英文標題 → 中文（關鍵字比對，未命中就用原文） */
      function zhEcon(t) {
        t = t || '';
        if (/Nonfarm|Non-Farm/i.test(t)) return '美國非農就業 (NFP)';
        if (/Jobless Claims/i.test(t)) return '美國初領失業金';
        if (/Fed Interest Rate|FOMC|Rate Decision/i.test(t)) return 'FOMC 利率決議';
        if (/Consumer Price Index|\bCPI\b/i.test(t)) return '美國 CPI' + (/Core/i.test(t) ? '（核心）' : '');
        if (/Producer Price Index|\bPPI\b/i.test(t)) return '美國 PPI 生產者物價';
        if (/\bPCE\b/i.test(t)) return '美國 PCE 物價指數';
        if (/Retail Sales/i.test(t)) return '美國零售銷售';
        if (/Gross Domestic Product|\bGDP\b/i.test(t)) return '美國 GDP';
        if (/ISM.*Manufacturing/i.test(t)) return 'ISM 製造業 PMI';
        if (/ISM.*(Services|Non-Manufacturing)/i.test(t)) return 'ISM 服務業 PMI';
        if (/Unemployment Rate/i.test(t)) return '美國失業率';
        if (/Michigan/i.test(t)) return '密大消費者信心';
        return t;
      }
      function haPxFetch(u) {
        var c = new AbortController(); var t = setTimeout(function () { try { c.abort(); } catch (e) {} }, 9000);
        return fetch(u, { cache: 'no-store', signal: c.signal }).then(function (r) { clearTimeout(t); return r; }, function (e) { clearTimeout(t); throw e; });
      }
      function fetchLiveEcon() {
        var d = new Date();
        var start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
        var end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
        var api = 'https://economic-calendar.tradingview.com/events?from=' + start.toISOString() + '&to=' + end.toISOString() + '&countries=US';
        var proxies = [
          'https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent(api),
          'https://corsproxy.io/?url=' + encodeURIComponent(api),
          'https://api.allorigins.win/raw?url=' + encodeURIComponent(api)
        ];
        var i = 0;
        function tryOne() {
          if (i >= proxies.length) return Promise.reject(new Error('econ proxy failed'));
          return haPxFetch(proxies[i++]).then(function (r) { if (!r.ok) throw 0; return r.text(); })
            .then(function (txt) { var j = JSON.parse(txt); if (!j || j.status !== 'ok' || !Array.isArray(j.result)) throw 0; return j; })
            .catch(function () { return tryOne(); });
        }
        return tryOne().then(function (j) {
          var out = j.result.filter(function (e) { return e.importance >= 0; }).map(function (e) {
            var dt = new Date(e.date), tpe = new Date(dt.getTime() + 8 * 3600000);
            return { n: zhEcon(e.title), t: '台北 ' + pad2(tpe.getUTCHours()) + ':' + pad2(tpe.getUTCMinutes()), imp: e.importance >= 1 ? 'high' : 'med', live: true };
          });
          out.sort(function (a, b) { return (b.imp === 'high') - (a.imp === 'high'); });
          liveEcon = out.slice(0, 6);
          refreshBadge();
          return liveEcon;
        });
      }
      function econSeenToday() { try { return localStorage.getItem(ECON_SEEN_LS) === ymd(new Date()); } catch (e) { return false; } }
      function markEconSeen() { try { localStorage.setItem(ECON_SEEN_LS, ymd(new Date())); } catch (e) {} }
      function refreshBadge() {
        var evs = todaysEcon();
        if (evs.length && !econSeenToday() && !panel.classList.contains('open')) {
          badgeEl.textContent = evs.length; badgeEl.style.display = 'flex';
        } else { badgeEl.style.display = 'none'; }
      }
      function econSummaryHTML() {
        var evs = todaysEcon(); if (!evs.length) return '';
        var d = new Date(), ds = (d.getMonth() + 1) + '/' + d.getDate();
        var rows = evs.map(function (e) {
          return '• ' + e.n + '　<span style="color:#8b8b93">' + e.t + '</span>　' + (e.imp === 'high' ? '<span style="color:#ef4444;font-weight:700">高影響</span>' : '<span style="color:#c98500;font-weight:700">中</span>');
        }).join('<br>');
        var src = (liveEcon !== null) ? '即時日曆' : '內建排程';
        return '<strong>📅 今日重要數據（' + ds + '）</strong>　<span style="color:#52525b;font-size:11px">' + src + '</span><br>' + rows
          + '<br><span style="color:#a1a1aa">數據公布前後波動放大：賣方留意 IV Crush、永續注意流動性與滑價、進場前先設停損。想針對某項數據怎麼佈局，直接問我。</span>';
      }
      function injectEconSummary() { var h = econSummaryHTML(); if (h) { addMsg('assistant', h); econShown = true; } }

      /* ── 視窗大小可調（拖曳左上角；面板錨定右下，故往左上拉即放大） ── */
      function clampW(w) { return Math.max(300, Math.min(w, Math.min(window.innerWidth - 24, 720))); }
      function clampH(h) { return Math.max(360, Math.min(h, window.innerHeight - 110)); }
      function applySize() {
        var s; try { s = JSON.parse(localStorage.getItem(SIZE_LS) || 'null'); } catch (e) { s = null; }
        if (s && s.w && s.h) { panel.style.width = clampW(s.w) + 'px'; panel.style.height = clampH(s.h) + 'px'; }
      }
      (function () {
        var resizing = false, anchorR = 0, anchorB = 0;
        resizeEl.addEventListener('pointerdown', function (e) {
          resizing = true;
          var r = panel.getBoundingClientRect(); anchorR = r.right; anchorB = r.bottom; /* 右下角固定 */
          try { resizeEl.setPointerCapture(e.pointerId); } catch (err) {}
          e.preventDefault();
        });
        resizeEl.addEventListener('pointermove', function (e) {
          if (!resizing) return;
          panel.style.width = clampW(anchorR - e.clientX) + 'px';
          panel.style.height = clampH(anchorB - e.clientY) + 'px';
        });
        function end(e) {
          if (!resizing) return; resizing = false;
          try { resizeEl.releasePointerCapture(e.pointerId); } catch (err) {}
          try { localStorage.setItem(SIZE_LS, JSON.stringify({ w: parseInt(panel.style.width, 10), h: parseInt(panel.style.height, 10) })); } catch (err) {}
        }
        resizeEl.addEventListener('pointerup', end);
        resizeEl.addEventListener('pointercancel', end);
        window.addEventListener('resize', function () { if (panel.style.width) { panel.style.width = clampW(parseInt(panel.style.width, 10)) + 'px'; panel.style.height = clampH(parseInt(panel.style.height, 10)) + 'px'; } });
      })();

      function groqKey() { try { return localStorage.getItem(KEY_LS) || ''; } catch (e) { return ''; } }
      function webOn() { try { return localStorage.getItem(WEB_LS) === '1'; } catch (e) { return false; } }
      function updateMode() {
        var k = groqKey(), w = webOn();
        var base = k ? (w ? 'Groq・Compound 網搜' : 'Groq・Llama 3.3 70B') : (w ? '免費・SearchGPT 網搜' : '免費模式');
        modeEl.textContent = base;
        modeEl.style.color = (k || w) ? '#22d3ee' : '';
      }
      function updateWebUI() {
        var w = webOn();
        webBtn.setAttribute('aria-checked', w ? 'true' : 'false');
        webHint.textContent = w ? '開啟：會連網搜尋最新資訊補充本頁數據' : '關閉：只依本頁數據＋既有知識';
        updateMode();
      }

      /* ── system prompt：跨市場即時快照 + 操作紀律 ── */
      function fm(v) { return typeof v === 'number' ? '$' + Math.round(v).toLocaleString('en-US') : '—'; }
      function sgn(v) { return typeof v === 'number' ? (v >= 0 ? '+' : '') + v : '—'; }
      function sysPrompt() {
        var lines = ['你是「HakuTrade AI 助理」，鑲在使用者自建的跨市場交易儀表板右下角，用繁體中文協助分析與操作決策。你涵蓋三大市場、不限於選擇權：加密貨幣（現貨／選擇權／永續合約）、美股（個股／ETF／指數期貨／選擇權）、台股（個股／ETF／台指期／籌碼）。',
          '回答原則：先判斷使用者問的是哪個市場、哪種商品（個股、期貨、還是選擇權），對症回答；先給結論再給理由；一般問題約 200 字內，要求詳細才展開；能引用下方即時數據就引用並標明，數據沒有涵蓋的（例如某支美股個股即時報價）就依你的知識與使用者提供的價位分析，並提醒以券商即時報價為準；對高風險操作明確提示風險、部位控管與停損；不確定或缺數據時直說，不要編造數字。'];

        /* 今日重要經濟數據（本地行事曆） */
        var _ev = todaysEcon();
        if (_ev.length)
          lines.push('【今日重要經濟數據】' + _ev.map(function (e) { return e.n + '（' + e.t + '，' + (e.imp === 'high' ? '高影響' : '中影響') + '）'; }).join('；') + '。若使用者問今天有什麼數據，據此回答，並提醒公布前後波動放大、注意 IV 與流動性。');

        /* 加密貨幣：BTC 選擇權面板快照 */
        var s = window.WR_SNAPSHOT;
        if (s) {
          var iv = (s.ivRows || []).map(function (r) { return r.expiry + ' ATM IV ' + (r.atmIV != null ? r.atmIV + '%' : '—') + (r.skew != null ? '（25Δ skew ' + (r.skew > 0 ? '+' : '') + r.skew + 'pt' + (r.skew > 0 ? '，Put 貴' : r.skew < 0 ? '，Call 貴' : '') + '）' : ''); }).join('；');
          lines.push('【加密貨幣・BTC 選擇權即時數據（' + s.updatedAt + ' 更新，來源 Deribit）】',
            'BTC 指數現價 ' + fm(s.spot) + '。DVOL ' + s.dvol + '，位於 90 日 ' + s.dvolPct + '% 分位（' + (s.volRegime === 'low' ? '低波動壓縮，選擇權便宜' : s.volRegime === 'high' ? '高波動，選擇權昂貴' : '波動中性') + '）。',
            '永續資金費率 ' + (s.funding8h >= 0 ? '+' : '') + s.funding8h.toFixed(3) + '%/8h；期貨年化基差 ' + s.basisAnnual + '%。',
            'IV 期限結構：' + iv + '。',
            'Max Pain ' + (s.maxPain ? fm(s.maxPain.strike) + '（' + s.maxPain.expiry + ' 到期）' : '—') + '；Call OI 牆 ' + fm(s.callWall) + '；Put OI 牆 ' + fm(s.putWall) + '；Gamma 集中區 ' + fm(s.gammaZone) + '。',
            '近 30 日高低點 ' + fm(s.last30.high) + ' / ' + fm(s.last30.low) + '。',
            '永續參考水位：多單掛 ' + fm(s.perpLevels.longZone[0]) + '–' + fm(s.perpLevels.longZone[1]) + '（損 ' + fm(s.perpLevels.longStop) + '）；空單掛 ' + fm(s.perpLevels.shortZone[0]) + '–' + fm(s.perpLevels.shortZone[1]) + '（損 ' + fm(s.perpLevels.shortStop) + '）；日收上破 ' + fm(s.perpLevels.breakoutUp) + ' 追多、下破 ' + fm(s.perpLevels.breakoutDown) + ' 追空。',
            '面板算出的參考結構：Iron Condor 賣 ' + fm(s.strategies.condor.sp) + 'P/' + fm(s.strategies.condor.sc) + 'C；Bull Put Spread 賣 ' + fm(s.strategies.bullPut.s) + 'P買 ' + fm(s.strategies.bullPut.b) + 'P；Covered Call ' + fm(s.strategies.coveredCall) + '；買方看漲參考 ' + fm(s.strategies.buyCallK) + ' Call、看跌參考 ' + fm(s.strategies.buyPutK) + ' Put。');
          var adv = [];
          if (s.realizedVol != null) adv.push('已實現波動率 ' + s.realizedVol + '%（IV−RV 波動率風險溢價 ' + (s.dvol - s.realizedVol >= 0 ? '+' : '') + (s.dvol - s.realizedVol).toFixed(1) + 'pt，正值＝選擇權偏貴利賣方、負值＝偏便宜利買方）');
          if (s.pcVolume != null) adv.push('Put/Call 成交量比 ' + s.pcVolume);
          if (s.gammaFlip != null) adv.push('Gamma 翻轉價約 ' + fm(s.gammaFlip) + '（現價於其' + (s.spot >= s.gammaFlip ? '上方＝相對穩定' : '下方＝波動易放大') + '）');
          if (s.optionFlowBias) adv.push('選擇權大單流向偏' + (s.optionFlowBias === 'bullish' ? '多（買Call/賣Put）' : s.optionFlowBias === 'bearish' ? '空（買Put/賣Call）' : '中性'));
          if (adv.length) lines.push('進階盤面：' + adv.join('；') + '。');
        } else {
          lines.push('【加密貨幣】BTC 選擇權面板即時數據尚在載入，暫無現價與 IV。若使用者問加密貨幣操作，請他稍等幾秒面板載入，或先回答不需即時數據的部分。');
        }

        /* 台股：籌碼面板快照（使用者開過台股頁籤才有） */
        var tw = window.TW_CHIPS_SNAPSHOT;
        if (tw && tw.inst) {
          var twl = ['【台股・籌碼即時數據（' + tw.updatedAt + ' 更新，來源 TWSE 證交所）】',
            '三大法人（' + tw.inst.date + '）：外資 ' + sgn(tw.inst.foreign) + ' 億、投信 ' + sgn(tw.inst.trust) + ' 億、自營商 ' + sgn(tw.inst.dealer) + ' 億，合計 ' + sgn(tw.inst.total) + ' 億（' + (tw.inst.total >= 0 ? '法人偏買方' : '法人偏賣方') + '）。'];
          if (tw.margin) twl.push('融資餘額 ' + tw.margin.finBalance + ' 億（今日 ' + sgn(tw.margin.finChg) + ' 億，' + (tw.margin.finChg > 0 ? '槓桿升溫' : tw.margin.finChg < 0 ? '槓桿降溫' : '平穩') + '）；融券 ' + tw.margin.shortBalance.toLocaleString() + ' 張；券資比 ' + (tw.margin.shortMarginRatio != null ? tw.margin.shortMarginRatio + '%' : '—') + '。');
          if (tw.stockLeaders) {
            twl.push('法人買超前五：' + tw.stockLeaders.topBuy.map(function (x) { return x.name + '(' + x.code + ') ' + sgn(x.netLots) + '張'; }).join('、') + '。');
            twl.push('法人賣超前五：' + tw.stockLeaders.topSell.map(function (x) { return x.name + '(' + x.code + ') ' + sgn(x.netLots) + '張'; }).join('、') + '。');
          }
          lines.push.apply(lines, twl);
        } else {
          lines.push('【台股】籌碼數據（三大法人／融資融券）需使用者先切到「台股」頁籤才會載入。若使用者問台股籌碼但這裡沒有數字，請提醒他先開啟台股頁籤，我就能引用即時籌碼。個股技術面與基本面仍可依你的知識回答。');
        }

        /* 美股：以報價卡與 TradingView 圖表為主，無結構化籌碼 */
        lines.push('【美股】本頁美股區以即時報價卡與 TradingView 圖表為主，無結構化籌碼數據。分析美股個股／ETF／指數期貨時，依標的價位、技術面、財報與總經事件並結合你的知識判斷，提醒使用者以券商即時報價為準。');

        /* 跨市場操作紀律 */
        lines.push('【操作紀律】',
          '共通：單筆風險 ≤ 帳戶 1–2%；進場前先定停損與目標價、算好風險報酬比（至少 1:1.5）；順勢操作、虧損不逆勢加碼；重大事件（FOMC/CPI/財報/結算）前降槓桿或減倉。',
          '選擇權（詳見面板 SOP 頁籤）：買方 Delta 0.30–0.45、選 60–90 天期避 theta 懸崖、獲利 +100% 出一半、-50% 停損；賣方 Delta 0.15–0.30、獲利 50% 平倉、剩 21 天離場、事件前不新開淨賣方；IV 高分位別單腿追買、改用價差。',
          '加密永續：槓桿 ≤ 3–5 倍、突破只認日線收盤、資金費率過熱時慎防多殺多。',
          '台股個股：注意 10% 漲跌停、現股當沖需開通資格與注意處置股、除權息與資券最後回補日；對照上方籌碼——法人連續買超＋融券高位（潛在回補動能）偏多，法人倒貨＋融資過熱偏空。',
          '台指期：注意每月第三個週三結算、轉倉時點、夜盤流動性較差；可搭配三大法人與融資融券籌碼判斷方向。',
          '美股：注意 PDT 當沖規則（帳戶 < $2.5 萬時 5 個交易日內當沖 ≤ 3 次）、盤前盤後流動性差易跳空、財報日與 FOMC 波動放大；指數期貨（ES/NQ/MES/MNQ 等）注意保證金與季度轉倉、近全天候交易。',
          '一律限價單優先於市價單，尤其流動性差或波動大的標的。');
        if (webOn())
          lines.push('【連網模式：開啟】你可以搜尋網路上的最新資訊（新聞、總經數據、個股消息）來補充本頁未涵蓋的部分；引用外部資訊時簡短標明來源與時間，並與本頁即時數據交叉比對。');
        else
          lines.push('【連網模式：關閉】本次不連網搜尋，只依上方本頁即時數據與你既有的知識判斷。若某個問題明顯需要最新外部消息（例如剛發生的新聞、今天的美股個股報價），就說明你沒有即時外部資料、可能已過時，並提醒使用者可打開輸入框上方的「連網搜尋」開關。不要杜撰最新消息或即時報價。');
        return lines.join('\n');
      }

      /* ── UI helpers ── */
      function esc(t) { return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
      function mdLite(t) {
        return esc(t)
          .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
          .replace(/`([^`\n]+)`/g, '<code>$1</code>');
      }
      function addMsg(role, html, cls) {
        var div = document.createElement('div');
        div.className = 'ha-msg ' + (role === 'user' ? 'u' : 'a') + (cls ? ' ' + cls : '');
        div.innerHTML = html;
        msgsEl.appendChild(div);
        msgsEl.scrollTop = msgsEl.scrollHeight;
        return div;
      }
      function setBusy(b) { busy = b; sendBtn.disabled = b; input.disabled = b; }

      /* ── 後端呼叫（依「連網搜尋」開關切換模型） ── */
      function fetchAI(url, options, checkResponse) {
        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, 30000);
        return fetch(url, Object.assign({}, options, { signal: controller.signal }))
          .then(function (r) { checkResponse(r); return r.json(); })
          .catch(function (e) { if (e.name === 'AbortError') throw new Error('AI 回應逾時，請稍後重試。'); throw e; })
          .finally(function () { clearTimeout(timer); });
      }
      function callAI(messages) {
        var k = groqKey(), web = webOn();
        if (k) {
          /* 連網 → groq/compound-mini（內建網搜）；否則 Llama 3.3 70B */
          return fetchAI('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + k },
            body: JSON.stringify({ model: web ? 'groq/compound-mini' : 'llama-3.3-70b-versatile', messages: messages, temperature: 0.4, max_tokens: 1024 })
          }, function (r) {
            if (r.status === 401 || r.status === 403) throw new Error('Groq 金鑰無效或過期，請到設定（齒輪）更新；或清除金鑰改走免費通道。');
            if (r.status === 429) throw new Error('Groq 免費額度暫時用罄，稍後再試，或先清除金鑰改走免費通道。');
            if (!r.ok) throw new Error('Groq 服務回應 ' + r.status + '，請稍後再試。');
          }).then(function (j) { if (!j.choices || !j.choices[0] || typeof j.choices[0].message?.content !== 'string') throw new Error('AI 回傳格式異常，請稍後再試。'); return j.choices[0].message.content; });
        }
        /* Pollinations 匿名層：客戶端先擋 15 秒節流，避免必然的 429 */
        var wait = 15000 - (Date.now() - lastFreeAt);
        var p = wait > 0 ? new Promise(function (res) { setTimeout(res, wait); }) : Promise.resolve();
        return p.then(function () {
          lastFreeAt = Date.now();
          /* 連網 → searchgpt（內建網搜）；否則 openai */
          return fetchAI('https://text.pollinations.ai/openai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: web ? 'searchgpt' : 'openai', messages: messages, temperature: 0.4, referrer: 'hakutrade' })
          }, function (r) {
            if (r.status === 429) throw new Error('免費通道限流中（匿名約 15 秒一則），請稍候幾秒再送，或到設定貼上免費 Groq 金鑰解除限制。');
            if (!r.ok) throw new Error('免費 AI 通道回應 ' + r.status + '。可稍後再試，或到設定（齒輪）貼上免費 Groq 金鑰。');
          });
        }).then(function (j) {
          if (j && j.choices && typeof j.choices[0]?.message?.content === 'string') return j.choices[0].message.content;
          throw new Error('免費通道回傳格式異常，請稍後再試。');
        });
      }

      function send(text) {
        text = (text || input.value).trim();
        if (!text || busy) return;
        input.value = ''; input.style.height = 'auto';
        chips.style.display = 'none';
        addMsg('user', esc(text));
        history.push({ role: 'user', content: text });
        var typing = addMsg('assistant', '思考中 <i></i><i></i><i></i>', 'typing');
        if (!groqKey() && Date.now() - lastFreeAt < 15000) typing.innerHTML = '免費通道節流中，稍等幾秒… <i></i><i></i><i></i>';
        setBusy(true);
        Promise.resolve().then(function () {
          var messages = [{ role: 'system', content: sysPrompt() }].concat(history.slice(-12));
          return callAI(messages);
        }).then(function (reply) {
          typing.remove();
          addMsg('assistant', mdLite(reply));
          history.push({ role: 'assistant', content: reply });
        }).catch(function (e) {
          typing.remove();
          addMsg('assistant', esc(e && e.message ? e.message : '連線失敗，請稍後再試。'), 'err');
          history.pop(); /* 失敗的問題移出歷史，讓使用者可原文重送 */
          input.value = text;
        }).finally(function () { setBusy(false); input.focus(); });
      }

      /* ── 事件 ── */
      fab.addEventListener('click', function () {
        var open = panel.classList.toggle('open');
        if (open) {
          applySize();
          if (!msgsEl.children.length) {
            addMsg('assistant', '嗨，我是 HakuTrade AI 助理，涵蓋<strong>加密貨幣、美股、台股</strong>——選擇權、個股、期貨都能聊。我看得到本頁的<strong>即時數據</strong>：BTC 選擇權（現價、DVOL、IV、skew、OI 牆、資金費率）與台股籌碼（三大法人、融資融券；開過台股頁籤後）。想做什麼操作，直接問我合不合理。');
            injectEconSummary(); /* 若今日有重要數據，主動提示 */
          }
          markEconSeen(); refreshBadge(); /* 點開＝已讀，紅點消失 */
          updateWebUI(); input.focus();
        }
      });
      document.getElementById('ha-close').addEventListener('click', function () { panel.classList.remove('open'); });
      document.getElementById('ha-gear').addEventListener('click', function () {
        settings.classList.toggle('open');
        keyInput.value = groqKey();
      });
      document.getElementById('ha-key-save').addEventListener('click', function () {
        try { var v = keyInput.value.trim(); if (v) localStorage.setItem(KEY_LS, v); else localStorage.removeItem(KEY_LS); } catch (e) {}
        updateMode(); settings.classList.remove('open');
        addMsg('assistant', groqKey() ? '已切換至 <strong>Groq 通道</strong>（' + (webOn() ? 'Compound 網搜模型' : 'Llama 3.3 70B') + '），金鑰只存在你這台瀏覽器。' : '已改走免費通道（約 15 秒可問一則）。');
      });
      document.getElementById('ha-key-clear').addEventListener('click', function () {
        try { localStorage.removeItem(KEY_LS); } catch (e) {}
        keyInput.value = ''; updateMode();
      });
      /* 連網搜尋開關（狀態存 localStorage） */
      webBtn.addEventListener('click', function () {
        var next = !webOn();
        try { localStorage.setItem(WEB_LS, next ? '1' : '0'); } catch (e) {}
        updateWebUI();
        if (msgsEl.children.length) addMsg('assistant', next
          ? '已開啟<strong>連網搜尋</strong>——之後的問題我會視需要搜尋最新網路資訊，來補充本頁未涵蓋的內容（回覆可能略慢幾秒）。'
          : '已關閉連網搜尋——只依本頁即時數據與我既有的知識回答。');
      });
      sendBtn.addEventListener('click', function () { send(); });
      /* 依需求：Enter 只換行，不送出；一律按送出鈕才送 */
      input.addEventListener('input', function () { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 96) + 'px'; });
      chips.addEventListener('click', function (e) { if (e.target.tagName === 'BUTTON') send(e.target.textContent); });
      updateWebUI();
      refreshBadge(); /* 載入時先以內建行事曆顯示紅色未讀數字（即時） */
      fetchLiveEcon().catch(function () {}); /* 最佳努力抓 TradingView 即時日曆；成功則覆寫、失敗維持內建 */
    })();
