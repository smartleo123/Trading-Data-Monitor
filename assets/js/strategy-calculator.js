(function () {
      'use strict';
      var box = document.getElementById('wr-calc');
      if (!box) return;
      var built = false, state = null;

      function ncdf(x) { var t = 1 / (1 + 0.2316419 * Math.abs(x)); var d = 0.3989423 * Math.exp(-x * x / 2);
        var p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x > 0 ? 1 - p : p; }
      /* Black-76：以「遠期價 F」定價（F = 現價 × (1 + 年化基差×T)），r=0 折現。
         較 BS-用現價-r=0 更貼近交易所——交易所選擇權是以期貨／遠期定價，非現貨。 */
      function b76(type, F, K, T, sig) {
        if (T <= 0 || sig <= 0) return type === 'C' ? Math.max(F - K, 0) : Math.max(K - F, 0);
        var sq = sig * Math.sqrt(T);
        var d1 = (Math.log(F / K) + 0.5 * sig * sig * T) / sq, d2 = d1 - sq;
        return type === 'C' ? F * ncdf(d1) - K * ncdf(d2) : K * ncdf(-d2) - F * ncdf(-d1);
      }
      function fwd(T) { return state.spot * (1 + (state.basis || 0) / 100 * T); }
      /* 市場波動率微笑：從面板 window.WR_SMILE 取「與 DTE 最接近的到期日」，在該履約價內插 IV */
      function smileIvFor(K) {
        var sm = window.WR_SMILE; if (!sm || !sm.expiries || !sm.expiries.length) return null;
        var e = sm.expiries.reduce(function (a, b) { return Math.abs(b.dte - state.dte) < Math.abs(a.dte - state.dte) ? b : a; });
        var pts = e.pts; if (!pts || pts.length < 2) return null;
        if (K <= pts[0].K) return pts[0].iv; if (K >= pts[pts.length - 1].K) return pts[pts.length - 1].iv;
        for (var i = 1; i < pts.length; i++) { if (K <= pts[i].K) { var a = pts[i - 1], c = pts[i]; return a.iv + (c.iv - a.iv) * (K - a.K) / ((c.K - a.K) || 1); } }
        return null;
      }
      function ivFor(K) { if (state.useSmile) { var s = smileIvFor(K); if (s != null && s > 0) return s; } return state.iv; }
      function theoPrice(type, K) { var T = state.dte / 365; return b76(type, fwd(T), K, T, ivFor(K) / 100); }
      function niceStep(S) { var e = Math.pow(10, Math.floor(Math.log10(S)) - 1); return e < 1 ? 1 : e; }
      function snap(S, mul) { var st = niceStep(S); return Math.round(S * mul / st) * st; }
      function usd(n) { if (n === Infinity) return '無上限'; if (n === -Infinity) return '無下限'; var s = n < 0 ? '-' : ''; return s + '$' + Math.round(Math.abs(n)).toLocaleString('en-US'); }

      /* 策略樣板：legs(S)→[{t:'C'|'P'|'U', d:+1買/-1賣, K}] */
      var STRATS = [
        { k: 'long-call', n: '買進買權 Long Call', legs: function (S) { return [{ t: 'C', d: 1, K: snap(S, 1.03) }]; } },
        { k: 'long-put', n: '買進賣權 Long Put', legs: function (S) { return [{ t: 'P', d: 1, K: snap(S, 0.97) }]; } },
        { k: 'short-call', n: '賣出買權 Short Call（裸賣）', legs: function (S) { return [{ t: 'C', d: -1, K: snap(S, 1.05) }]; } },
        { k: 'short-put', n: '賣出賣權 Short Put（收租）', legs: function (S) { return [{ t: 'P', d: -1, K: snap(S, 0.95) }]; } },
        { k: 'bull-call', n: '買權多頭價差 Bull Call', legs: function (S) { return [{ t: 'C', d: 1, K: snap(S, 1.0) }, { t: 'C', d: -1, K: snap(S, 1.1) }]; } },
        { k: 'bear-put', n: '賣權空頭價差 Bear Put', legs: function (S) { return [{ t: 'P', d: 1, K: snap(S, 1.0) }, { t: 'P', d: -1, K: snap(S, 0.9) }]; } },
        { k: 'bull-put', n: '賣權多頭價差 Bull Put（收租）', legs: function (S) { return [{ t: 'P', d: -1, K: snap(S, 0.97) }, { t: 'P', d: 1, K: snap(S, 0.9) }]; } },
        { k: 'bear-call', n: '買權空頭價差 Bear Call（收租）', legs: function (S) { return [{ t: 'C', d: -1, K: snap(S, 1.03) }, { t: 'C', d: 1, K: snap(S, 1.1) }]; } },
        { k: 'straddle', n: '買進跨式 Long Straddle', legs: function (S) { return [{ t: 'C', d: 1, K: snap(S, 1.0) }, { t: 'P', d: 1, K: snap(S, 1.0) }]; } },
        { k: 'strangle', n: '買進勒式 Long Strangle', legs: function (S) { return [{ t: 'C', d: 1, K: snap(S, 1.05) }, { t: 'P', d: 1, K: snap(S, 0.95) }]; } },
        { k: 'short-straddle', n: '賣出跨式 Short Straddle（收租）', legs: function (S) { return [{ t: 'C', d: -1, K: snap(S, 1.0) }, { t: 'P', d: -1, K: snap(S, 1.0) }]; } },
        { k: 'iron-condor', n: '鐵兀鷹 Iron Condor（收租）', legs: function (S) { return [{ t: 'P', d: 1, K: snap(S, 0.88) }, { t: 'P', d: -1, K: snap(S, 0.95) }, { t: 'C', d: -1, K: snap(S, 1.05) }, { t: 'C', d: 1, K: snap(S, 1.12) }]; } },
        { k: 'covered-call', n: '掩護性買權 Covered Call', legs: function (S) { return [{ t: 'U', d: 1, K: 0 }, { t: 'C', d: -1, K: snap(S, 1.05) }]; } },
        { k: 'protective-put', n: '保護性賣權 Protective Put', legs: function (S) { return [{ t: 'U', d: 1, K: 0 }, { t: 'P', d: 1, K: snap(S, 0.95) }]; } },
        { k: 'custom', n: '⊕ 自訂部位 Custom（自由增減）', legs: function (S) { return [{ t: 'C', d: 1, K: snap(S, 1.0) }]; } }
      ];

      function defaults() {
        var s = window.WR_SNAPSHOT;
        var spot = (s && s.spot) ? s.spot : null;
        var iv = null;
        if (s && s.ivRows && s.ivRows.length) { for (var i = 0; i < s.ivRows.length; i++) { if (s.ivRows[i].atmIV != null) { iv = s.ivRows[i].atmIV; break; } } }
        var basis = (s && typeof s.basisAnnual === 'number') ? s.basisAnnual : 0;
        return { spot: spot, iv: iv != null ? iv : 45, dte: 30, basis: basis };
      }

      function buildLegs(stratKey, S) {
        var st = STRATS.filter(function (x) { return x.k === stratKey; })[0] || STRATS[0];
        return st.legs(S).map(function (l) {
          return { t: l.t, d: l.d, K: l.K, qty: l.qty || 1, prem: l.t === 'U' ? 0 : Math.round(theoPrice(l.t, l.K)), premAuto: true, entry: S };
        });
      }

      function legPnl(l, S) {
        var intr = l.t === 'C' ? Math.max(S - l.K, 0) : l.t === 'P' ? Math.max(l.K - S, 0)
          : l.t === 'F' ? (S - l.K) : (S - l.entry);
        var prem = (l.t === 'U' || l.t === 'F') ? 0 : l.prem;
        return l.d * (l.qty || 1) * (intr - prem);
      }
      function totalPnl(legs, S) { var p = 0; for (var i = 0; i < legs.length; i++) p += legPnl(legs[i], S); return p; }

      function metrics(legs, S0) {
        var strikes = legs.filter(function (l) { return l.t !== 'U'; }).map(function (l) { return l.K; });
        var kinks = [0].concat(strikes).concat([S0 * 3]);
        var vals = kinks.map(function (k) { return totalPnl(legs, k); });
        var upSlope = legs.reduce(function (a, l) { return a + ((l.t === 'C' || l.t === 'U' || l.t === 'F') ? l.d * (l.qty || 1) : 0); }, 0);
        var maxP = upSlope > 0 ? Infinity : Math.max.apply(null, vals);
        var maxL = upSlope < 0 ? -Infinity : Math.min.apply(null, vals);
        /* 到期損益在履約價之間為直線；逐段求根，最後一段無價格上限。 */
        var points = Array.from(new Set([0].concat(strikes))).sort(function (a, b) { return a - b; });
        var be = [], eps = 1e-8;
        function addRoot(x) { if (x >= 0 && Number.isFinite(x) && !be.some(function (b) { return Math.abs(b - x) < eps; })) be.push(x); }
        points.forEach(function (x, i) {
          var y = totalPnl(legs, x);
          if (Math.abs(y) < eps) addRoot(x);
          if (i + 1 < points.length) {
            var next = points[i + 1], yNext = totalPnl(legs, next);
            if (y * yNext < 0) addRoot(x - y * (next - x) / (yNext - y));
          } else if (Math.abs(upSlope) > eps) {
            var root = x - y / upSlope;
            if (root > x) addRoot(root);
          }
        });
        be.sort(function (a, b) { return a - b; });
        var netDebit = legs.reduce(function (a, l) { return a + ((l.t === 'U' || l.t === 'F') ? 0 : l.d * (l.qty || 1) * l.prem); }, 0);
        var rr = (maxP > 0 && maxP !== Infinity && maxL < 0 && maxL !== -Infinity) ? (maxP / Math.abs(maxL)) : null;
        return { maxP: maxP, maxL: maxL, be: be, netDebit: netDebit, rr: rr, atSpot: totalPnl(legs, S0) };
      }

      function drawPayoff(el, legs, S0) {
        var strikes = legs.filter(function (l) { return l.t !== 'U'; }).map(function (l) { return l.K; });
        var allx = strikes.concat([S0]);
        var xMin = Math.max(0, Math.min.apply(null, allx) * 0.8), xMax = Math.max.apply(null, allx) * 1.2;
        var W = 720, H = 300, padL = 60, padR = 16, padT = 14, padB = 30, plotW = W - padL - padR, plotH = H - padT - padB;
        var N = 140, xs = [], ys = [], yMin = Infinity, yMax = -Infinity;
        for (var i = 0; i <= N; i++) { var s = xMin + (xMax - xMin) * i / N, p = totalPnl(legs, s); xs.push(s); ys.push(p); if (p < yMin) yMin = p; if (p > yMax) yMax = p; }
        var pad = (yMax - yMin) * 0.12 || Math.abs(yMax) || 100; yMin -= pad; yMax += pad; if (yMin > 0) yMin = -pad; if (yMax < 0) yMax = pad;
        function X(v) { return padL + (v - xMin) / (xMax - xMin) * plotW; }
        function Y(p) { return padT + (1 - (p - yMin) / (yMax - yMin)) * plotH; }
        var zeroY = Y(0);
        var s = '';
        /* Y 軸格線＋刻度 */
        for (var t = 0; t <= 4; t++) { var pv = yMin + (yMax - yMin) * t / 4, yy = Y(pv);
          s += '<line x1="' + padL + '" y1="' + yy.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + yy.toFixed(1) + '" stroke="#232326" stroke-width="1"/>';
          s += '<text x="' + (padL - 6) + '" y="' + (yy + 3.5).toFixed(1) + '" font-size="11" fill="#71717a" text-anchor="end">' + usd(pv) + '</text>'; }
        /* X 軸價格刻度 */
        for (var t2 = 0; t2 <= 4; t2++) { var xv = xMin + (xMax - xMin) * t2 / 4;
          s += '<text x="' + X(xv).toFixed(1) + '" y="' + (H - 9) + '" font-size="11" fill="#71717a" text-anchor="middle">$' + Math.round(xv / 1000) + 'K</text>'; }
        /* 損益面積：綠(獲利,零線上) / 紅(虧損,零線下)，用 clip 分割 */
        var poly = xs.map(function (x, i) { return X(x).toFixed(1) + ',' + Y(ys[i]).toFixed(1); }).join(' ');
        var area = X(xs[0]).toFixed(1) + ',' + zeroY.toFixed(1) + ' ' + poly + ' ' + X(xs[xs.length - 1]).toFixed(1) + ',' + zeroY.toFixed(1);
        s += '<defs><clipPath id="scAbove"><rect x="0" y="0" width="' + W + '" height="' + Math.max(0, zeroY).toFixed(1) + '"/></clipPath>'
          + '<clipPath id="scBelow"><rect x="0" y="' + zeroY.toFixed(1) + '" width="' + W + '" height="' + Math.max(0, H - zeroY).toFixed(1) + '"/></clipPath></defs>';
        s += '<polygon points="' + area + '" fill="#0da271" fill-opacity="0.16" clip-path="url(#scAbove)"/>';
        s += '<polygon points="' + area + '" fill="#ef4444" fill-opacity="0.16" clip-path="url(#scBelow)"/>';
        /* 零線 */
        s += '<line x1="' + padL + '" y1="' + zeroY.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + zeroY.toFixed(1) + '" stroke="#5b5b63" stroke-width="1.5"/>';
        /* 損益線 */
        s += '<polyline points="' + poly + '" fill="none" stroke="#d4d4d8" stroke-width="2" stroke-linejoin="round"/>';
        /* 現價標記 */
        s += '<line x1="' + X(S0).toFixed(1) + '" y1="' + padT + '" x2="' + X(S0).toFixed(1) + '" y2="' + (padT + plotH) + '" stroke="#06b6d4" stroke-width="1" stroke-dasharray="4 3"/>';
        s += '<text x="' + X(S0).toFixed(1) + '" y="' + (padT + 10) + '" font-size="10.5" fill="#22d3ee" text-anchor="middle">現價 $' + Math.round(S0 / 1000) + 'K</text>';
        /* 損益兩平標記 */
        var m = metrics(legs, S0);
        m.be.forEach(function (b) { if (b >= xMin && b <= xMax) {
          s += '<circle cx="' + X(b).toFixed(1) + '" cy="' + zeroY.toFixed(1) + '" r="3.5" fill="#e4e4e7"/>';
          s += '<text x="' + X(b).toFixed(1) + '" y="' + (zeroY - 7).toFixed(1) + '" font-size="10" fill="#a1a1aa" text-anchor="middle">$' + Math.round(b).toLocaleString() + '</text>'; } });
        /* hover 元件 */
        s += '<line id="sc-guide" x1="0" y1="' + padT + '" x2="0" y2="' + (padT + plotH) + '" stroke="#52525b" stroke-width="1" stroke-dasharray="3 3" style="opacity:0"/>';
        s += '<circle id="sc-dot" r="4.5" fill="#d4d4d8" stroke="#0b0b0d" stroke-width="1.5" style="opacity:0"/>';
        el.innerHTML = '<svg id="sc-svg" viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;display:block" role="img" aria-label="到期損益圖">' + s + '</svg>'
          + '<div class="sc-tip" id="sc-tip"></div>';
        var svg = el.querySelector('#sc-svg'), tip = el.querySelector('#sc-tip'), guide = el.querySelector('#sc-guide'), dot = el.querySelector('#sc-dot');
        function move(ev) {
          var r = svg.getBoundingClientRect();
          var cx = ((ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left) / r.width * W;
          var xv = xMin + (Math.max(padL, Math.min(W - padR, cx)) - padL) / plotW * (xMax - xMin);
          var pv = totalPnl(legs, xv), px = X(xv), py = Y(pv);
          guide.setAttribute('x1', px); guide.setAttribute('x2', px); guide.style.opacity = 1;
          dot.setAttribute('cx', px); dot.setAttribute('cy', py); dot.style.opacity = 1;
          tip.innerHTML = '<span class="d">到期 $' + Math.round(xv).toLocaleString() + '</span><br><span class="v ' + (pv >= 0 ? 'pos' : 'neg') + '">' + (pv >= 0 ? '+' : '') + usd(pv) + '</span>';
          tip.style.left = (px / W * r.width) + 'px'; tip.style.top = (py / H * r.height) + 'px'; tip.style.opacity = 1;
        }
        function leave() { guide.style.opacity = 0; dot.style.opacity = 0; tip.style.opacity = 0; }
        svg.addEventListener('mousemove', move); svg.addEventListener('mouseleave', leave);
        svg.addEventListener('touchmove', move, { passive: true }); svg.addEventListener('touchend', leave);
      }

      function parseNum(v) {
        var text = String(v).trim();
        if (!/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d*)?$/.test(text)) return NaN;
        var n = Number(text.replace(/,/g, '')); return Number.isFinite(n) ? n : NaN;
      }
      function validateInput(inp, valid, message) {
        inp.setCustomValidity(valid ? '' : message);
        inp.setAttribute('aria-invalid', String(!valid));
        inp.title = valid ? '' : message;
        return valid;
      }
      function premInput(i) { return box.querySelector('#sc-legs-body input[data-leg="' + i + '"][data-f="prem"]'); }

      function markCustom() { state.strat = 'custom'; var sel = box.querySelector('#sc-select'); if (sel) sel.value = 'custom'; }
      function autoPrem(l) { return (l.t === 'U' || l.t === 'F') ? 0 : Math.round(theoPrice(l.t, l.K)); }
      function theoTxt(l) { return '理論：$' + autoPrem(l).toLocaleString('en-US'); }
      function refreshTheo(i) { var sp = box.querySelector('#sc-theo-' + i); if (sp) sp.textContent = theoTxt(state.legs[i]); }

      /* 只在「策略／新增／刪除／改方向或類型」時重建部位列（逐字輸入時不重建，游標才不會跳） */
      function renderLegs() {
        var body = box.querySelector('#sc-legs-body');
        if (!state.legs.length) { body.innerHTML = '<tr><td colspan="6"><div class="sc-empty">尚無部位——按下方「＋ 新增部位」開始自組，或從上方選一個預設策略。</div></td></tr>'; return; }
        var opt = function (v, txt, cur) { return '<option value="' + v + '"' + (v === cur ? ' selected' : '') + '>' + txt + '</option>'; };
        body.innerHTML = state.legs.map(function (l, i) {
          var dSel = '<select class="' + (l.d > 0 ? 'd-buy' : 'd-sell') + '" data-leg="' + i + '" data-f="d">' + opt('1', '買', String(l.d)) + opt('-1', '賣', String(l.d)) + '</select>';
          var tSel = '<select data-leg="' + i + '" data-f="t">' + opt('C', '買權 Call', l.t) + opt('P', '賣權 Put', l.t) + opt('F', '期貨 Futures', l.t) + opt('U', '現貨 BTC', l.t) + '</select>';
          var kCell = l.t === 'U' ? '<span style="color:#8b8b93">—</span>' : '<input type="text" inputmode="decimal" autocomplete="off" data-leg="' + i + '" data-f="K" value="' + l.K + '">';
          var pCell = (l.t === 'U' || l.t === 'F') ? '<span style="color:#8b8b93">—</span>' : '<input type="text" inputmode="decimal" autocomplete="off" data-leg="' + i + '" data-f="prem" value="' + l.prem + '"><span class="theo" id="sc-theo-' + i + '" data-leg="' + i + '" title="Black-Scholes 理論價・點此套用">' + theoTxt(l) + '</span>';
          var qCell = '<input type="text" inputmode="numeric" autocomplete="off" data-leg="' + i + '" data-f="qty" value="' + (l.qty || 1) + '" style="width:56px">';
          return '<tr><td>' + dSel + '</td><td>' + tSel + '</td><td class="r">' + kCell + '</td><td class="r">' + pCell + '</td><td class="r">' + qCell + '</td><td class="r"><button class="sc-rm" data-leg="' + i + '" title="刪除此部位">✕</button></td></tr>';
        }).join('');
        /* 數字輸入：逐字更新，不重建列 */
        body.querySelectorAll('input').forEach(function (inp) {
          inp.addEventListener('input', function () {
            var i = +inp.getAttribute('data-leg'), f = inp.getAttribute('data-f'), v = parseNum(inp.value);
            var valid = Number.isFinite(v) && (f === 'qty' ? v > 0 && v <= 100 : f === 'K' ? v > 0 : v >= 0);
            validateInput(inp, valid, f === 'qty' ? 'BTC 數量請輸入 0–100 間正數' : f === 'K' ? '履約價請輸入大於 0 的數字' : '權利金請輸入不小於 0 的數字');
            if (!valid) { renderOutputs(); return; }
            markCustom();
            if (f === 'K') { invalidateQuotes('履約價改變，報價需重新核對');
              state.legs[i].K = v;
              refreshTheo(i);
              if (state.legs[i].premAuto) { state.legs[i].prem = autoPrem(state.legs[i]);
                var pin = premInput(i); if (pin && document.activeElement !== pin) pin.value = state.legs[i].prem; }
            } else if (f === 'qty') { state.legs[i].qty = v; invalidateQuotes('數量改變，掛單深度需重新核對'); }
            else { state.legs[i].prem = v; state.legs[i].premAuto = false; invalidateQuotes('手動輸入權利金，市場報價驗證失效'); }
            renderOutputs();
          });
        });
        /* 點「理論：$…」套用該理論價 */
        body.querySelectorAll('.theo').forEach(function (sp) {
          sp.addEventListener('click', function () {
            var i = +sp.getAttribute('data-leg'); state.legs[i].prem = autoPrem(state.legs[i]); state.legs[i].premAuto = true; invalidateQuotes('已改用理論價');
            var pin = premInput(i); if (pin) { pin.value = state.legs[i].prem; validateInput(pin, true, ''); }
            renderOutputs();
          });
        });
        /* 方向／類型選單：離散事件，可安全重建列 */
        body.querySelectorAll('select').forEach(function (se) {
          se.addEventListener('change', function () {
            var i = +se.getAttribute('data-leg'), f = se.getAttribute('data-f');
            if (f === 'd') state.legs[i].d = +se.value;
            else { state.legs[i].t = se.value;
              if (state.legs[i].t === 'U') state.legs[i].entry = state.spot;
              else if (state.legs[i].t === 'F') { state.legs[i].K = Math.round(state.spot); state.legs[i].prem = 0; }
              else if (state.legs[i].premAuto) state.legs[i].prem = autoPrem(state.legs[i]); }
            invalidateQuotes('部位設定已變更'); markCustom(); renderLegs(); renderOutputs();
          });
        });
        /* 刪除部位 */
        body.querySelectorAll('.sc-rm').forEach(function (btn) {
          btn.addEventListener('click', function () { state.legs.splice(+btn.getAttribute('data-leg'), 1); markCustom(); renderLegs(); renderOutputs(); });
        });
      }
      function addLeg() {
        var l = { t: 'C', d: 1, K: snap(state.spot, 1.0), qty: 1, prem: 0, premAuto: true, entry: state.spot };
        l.prem = autoPrem(l); state.legs.push(l); markCustom(); renderLegs(); renderOutputs();
      }

      /* 只更新損益指標與到期損益圖（可安全地在每次輸入時呼叫） */
      function renderOutputs() {
        var S0 = state.spot;
        if (box.querySelector('[aria-invalid="true"]')) {
          box.querySelector('#sc-metrics').innerHTML = '<div class="sc-empty" role="alert">請修正標示的輸入：履約價與現價須大於 0、到期天數須大於 0、權利金不得為負、口數須為至少 1 的整數。修正後才會顯示試算結果。</div>';
          box.querySelector('#sc-chart').innerHTML = '';
          return;
        }
        if (!state.legs.length) {
          box.querySelector('#sc-metrics').innerHTML = '<div class="sc-empty" style="grid-column:1/-1">尚無部位，新增後即時試算損益。</div>';
          box.querySelector('#sc-chart').innerHTML = '<div class="sc-empty">尚無部位可繪製損益圖。</div>';
          return;
        }
        var m = metrics(state.legs, S0);
        var rrTxt = m.rr != null ? ('1 : ' + m.rr.toFixed(2)) : '—';
        var netTxt = m.netDebit > 0 ? ('淨支出 ' + usd(m.netDebit)) : m.netDebit < 0 ? ('淨收入 ' + usd(-m.netDebit)) : '$0';
        box.querySelector('#sc-metrics').innerHTML =
          tile('最大獲利', usd(m.maxP), m.maxP > 0 ? 'pos' : 'neu', '到期最佳情況') +
          tile('最大虧損', usd(m.maxL), 'neg', '到期最差情況') +
          tile('風險報酬比', rrTxt, 'neu', '獲利 ÷ 虧損') +
          tile('淨權利金', netTxt, m.netDebit > 0 ? 'neg' : 'pos', '建倉現金流（含各部位口數）') +
          tile('損益兩平', m.be.length ? m.be.map(function (b) { return '$' + Math.round(b).toLocaleString(); }).join('、') : '—', 'neu', '到期損益 = 0 的價位') +
          tile('到期＠現價', (m.atSpot >= 0 ? '+' : '') + usd(m.atSpot), m.atSpot >= 0 ? 'pos' : 'neg', '若到期時 = 現價');
        drawPayoff(box.querySelector('#sc-chart'), state.legs, S0);
      }
      function tile(k, v, cls, sub) { return '<div class="sc-tile"><div class="k">' + k + '</div><div class="v ' + cls + '">' + v + '</div><div class="s">' + sub + '</div></div>'; }

      /* 改現價/IV/DTE：保留使用者設定的履約價，只更新「理論」權利金與現貨成本基準（不重建輸入框） */
      function recomputeAuto() { invalidateQuotes('現價或 IV 改變，需刷新市場報價');
        state.legs.forEach(function (l, i) {
          if (l.t === 'U') { l.entry = state.spot; return; }
          refreshTheo(i); /* 理論價提示隨現價/IV/DTE 即時更新 */
          if (l.premAuto) { l.prem = autoPrem(l);
            var pin = premInput(i); if (pin && document.activeElement !== pin) pin.value = l.prem; }
        });
        renderOutputs();
      }

      function rebuildLegs() { invalidateQuotes('策略／到期日變更'); state.legs = buildLegs(state.strat, state.spot); renderLegs(); renderOutputs(); }

      function build() {
        var d = defaults();
        if (d.spot == null) { box.innerHTML = '<div class="wr-status" style="padding:24px 2px;color:#a1a1aa">等「即時分析」頁籤載入 BTC 現價後，這裡會自動帶入現價與 ATM IV。可先切到即時分析等它載入，再回來試算。</div>'; return; }
        built = true;
        state = { strat: 'long-call', spot: Math.round(d.spot), iv: +d.iv.toFixed(1), dte: d.dte, basis: +d.basis.toFixed(1), useSmile: true, legs: [] };
        box.innerHTML =
          '<div class="sc-wrap">'
          + '<div><div class="sc-hd">參數（現價即時帶入；IV 由波動率微笑逐檔自動套用、基差即時帶入，皆無需手動輸入；部位數量由各腿設定，單位 BTC；損益以 USD 估算）</div>'
          + '<div class="sc-inputs">'
          + '<div class="sc-field"><label>標的現價 (USD)</label><input id="sc-spot" type="text" inputmode="decimal" autocomplete="off" value="' + state.spot + '"></div>'
          + '<div class="sc-field"><label>到期天數 DTE</label><input id="sc-dte" type="text" inputmode="decimal" autocomplete="off" value="' + state.dte + '"></div>'
          + '<div class="sc-field"><label>年化基差（即時帶入）</label><input id="sc-basis-view" type="text" value="' + (state.basis >= 0 ? '+' : '') + state.basis + '%" readonly tabindex="-1" title="由面板即時期貨基差自動帶入，用於理論價的遠期定價，無需手動輸入"></div>'
          + '</div></div>'
          + '<div class="sc-strat"><div class="sc-field"><label>策略</label><select id="sc-select"></select></div>'
          + '<button class="sc-btn" id="sc-reload">↺ 以即時數據重設</button></div>'
          + '<div class="sc-help"><b>理論價已用「波動率微笑」逐檔定價。</b> 不同履約價在市場上的隱含波動率（IV）其實各不相同——通常價外選擇權的 IV 比價平的高，畫成曲線像微笑（波動率微笑／偏斜）。本試算<b>每個部位都用它自己履約價的市場 IV</b> 估權利金，比所有部位套同一個 IV 更貼近交易所實際報價。資料取自「即時分析」的進階盤面；若尚未載入、或某履約價超出微笑範圍，會自動退回用上方的 IV 估算。</div>'
          + '<div><div class="sc-hd">部位（方向／類型可下拉切換；權利金旁的「理論：$…」是 Black-76 模型價，你可直接在框內輸入自己的實際報價，點理論價可套用回去。可自由增減部位自組策略）</div>'
          + '<table class="sc-legs"><thead><tr><th>方向</th><th>類型</th><th style="text-align:right">履約/進場價</th><th style="text-align:right">權利金 (USD)</th><th style="text-align:right">口數</th><th></th></tr></thead><tbody id="sc-legs-body"></tbody></table>'
          + '<button class="sc-add" id="sc-add">＋ 新增部位</button></div>'
          + '<div><div class="sc-hd">損益指標</div><div class="sc-metrics" id="sc-metrics"></div></div>'
          + '<div><div class="sc-hd">到期損益圖（橫軸＝到期標的價、縱軸＝損益；滑鼠移動看任一價位損益）</div>'
          + '<div class="sc-chart" id="sc-chart"></div>'
          + '<div class="sc-legend"><span><i style="background:#0da271"></i>獲利區</span><span><i style="background:#ef4444"></i>虧損區</span><span><i style="background:#06b6d4"></i>現價</span><span><i style="background:#e4e4e7"></i>損益兩平</span></div></div>'
          + '<div class="sc-note">到期損益按已輸入的建倉權利金估算；不同價格及 IV 情境採理論模型估值（並非平倉 Bid/Ask）；費用僅以指定假設計入，未含滑價。期貨部位為線性損益＝方向×口數×(到期價−進場價)，在「履約/進場價」欄填你的進場價，無權利金、無時間價值，常用來與選擇權搭配（如避險、合成部位）。理論價（選擇權）用 Black-76、以「遠期價＝現價×(1＋年化基差×T)」定價，並由波動率微笑逐檔套用各履約價的市場 IV；若微笑尚未載入或超出範圍會退回單一 IV，與交易所各檔報價仍可能有落差——實際下單請以你在框內輸入的市場報價為準。僅供教育試算，非投資建議。</div>'
          + '</div>';
        var sel = box.querySelector('#sc-select');
        sel.innerHTML = STRATS.map(function (s) { return '<option value="' + s.k + '">' + s.n + '</option>'; }).join('');
        sel.value = state.strat;
        sel.addEventListener('change', function () { state.strat = sel.value; rebuildLegs(); });
        /* 現價/DTE 改變只重算理論權利金與圖，保留使用者微調過的履約價，不重建腿位列 */
        box.querySelector('#sc-spot').addEventListener('input', function (e) { var v = parseNum(e.target.value); if (validateInput(e.target, Number.isFinite(v) && v > 0, '請輸入大於 0 的數字')) { state.spot = v; recomputeAuto(); } else renderOutputs(); });
        box.querySelector('#sc-dte').addEventListener('input', function (e) { var v = parseNum(e.target.value); if (validateInput(e.target, Number.isFinite(v) && v > 0, '請輸入大於 0 的數字')) { state.dte = v; recomputeAuto(); } else renderOutputs(); });
        box.querySelector('#sc-reload').addEventListener('click', function () {
          var d2 = defaults(); if (d2.spot == null) return;
          state.spot = Math.round(d2.spot); state.iv = +d2.iv.toFixed(1); state.basis = +d2.basis.toFixed(1);
          box.querySelector('#sc-spot').value = state.spot; validateInput(box.querySelector('#sc-spot'), true, '');
          var bv = box.querySelector('#sc-basis-view'); if (bv) bv.value = (state.basis >= 0 ? '+' : '') + state.basis + '%';
          if (state.strat === 'custom') recomputeAuto(); else rebuildLegs();
        });
        box.querySelector('#sc-add').addEventListener('click', addLeg);
        rebuildLegs();
      }

      /* 首次開啟策略試算頁籤時建置；資料未就緒則等 wr-snapshot 事件 */
      window.WR_initCalc = function () { if (!built) build(); };
      document.addEventListener('wr-snapshot', function () { if (!built && !box.classList.contains('hidden')) build(); });
    })();
