(function () {
      'use strict';
      /* 系列色（已通過色彩驗證器：dark surface #141416） */
      var C_FOREIGN = '#3987e5', C_TRUST = '#c98500', C_DEALER = '#9085e9';
      var twcLoaded = false, twcLoading = false;

      /* ── 共用：經公用代理抓證交所 JSON（多家輪替＋逾時容錯） ── */
      function pxFetch(u) { /* 加 9 秒逾時，避免某代理 hang 住拖垮整條輪替 */
        var c = new AbortController();
        var t = setTimeout(function () { try { c.abort(); } catch (e) {} }, 9000);
        return fetch(u, { cache: 'no-store', signal: c.signal }).then(
          function (r) { clearTimeout(t); return r; },
          function (e) { clearTimeout(t); throw e; });
      }
      function viaProxy(url) {
        /* 免金鑰公用代理，健康的排前面；allorigins 近期常逾時故降到後段 */
        var proxies = [
          function (u) { return { url: 'https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent(u), wrap: 'raw' }; },
          function (u) { return { url: 'https://corsproxy.io/?url=' + encodeURIComponent(u), wrap: 'raw' }; },
          function (u) { return { url: 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u), wrap: 'raw' }; },
          function (u) { return { url: 'https://api.allorigins.win/get?url=' + encodeURIComponent(u), wrap: 'json' }; },
          function (u) { return { url: 'https://thingproxy.freeboard.io/fetch/' + u, wrap: 'raw' }; }
        ];
        function tryOne(i) {
          if (i >= proxies.length) return Promise.reject(new Error('proxies failed'));
          var p = proxies[i](url);
          return pxFetch(p.url).then(function (r) { if (!r.ok) throw 0; return r.text(); }).then(function (txt) {
            if (p.wrap === 'json') { var w = JSON.parse(txt); return JSON.parse(w.contents); }
            return JSON.parse(txt);
          }).catch(function () { return tryOne(i + 1); });
        }
        return tryOne(0);
      }
      function num(s) { var v = parseFloat(String(s).replace(/,/g, '')); return isNaN(v) ? 0 : v; }
      function fmtE(v, dec) { return (v >= 0 ? '+' : '') + v.toFixed(dec === undefined ? 1 : dec); }
      function cls(v) { return v >= 0 ? 'twc-pos' : 'twc-neg'; }

      /* 交易日清單：從今天往回走，跳過週末（假日靠回應為空自動再往前） */
      function dateList(n) {
        var out = [], d = new Date();
        while (out.length < n) {
          var day = d.getDay();
          if (day !== 0 && day !== 6) {
            out.push(d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0'));
          }
          d.setDate(d.getDate() - 1);
        }
        return out;
      }

      /* ── 三大法人（BFI82U 每日 + T86 個股） ── */
      function parseBFI(j) {
        var rows = (j && j.data) || [];
        if (!rows.length) return null;
        var f = 0, t = 0, dl = 0;
        rows.forEach(function (r) {
          var name = String(r[0]), diff = num(r[3]);
          if (name.indexOf('外資') === 0) f += diff;
          else if (name.indexOf('投信') === 0) t += diff;
          else if (name.indexOf('自營商') === 0) dl += diff;
        });
        return { f: f / 1e8, t: t / 1e8, d: dl / 1e8 }; /* 億元 */
      }
      function loadInst(days) {
        var results = {}, queue = days.slice(), active = 0, done = 0;
        return new Promise(function (resolve) {
          function pump() {
            while (active < 3 && queue.length) {
              (function (dt) {
                active++;
                viaProxy('https://www.twse.com.tw/rwd/zh/fund/BFI82U?date=' + dt + '&response=json')
                  .then(function (j) { var p = parseBFI(j); if (p) results[dt] = p; })
                  .catch(function () {})
                  .then(function () { active--; done++; (queue.length || active) ? pump() : resolve(results); });
              })(queue.shift());
            }
            if (!queue.length && !active && done) resolve(results);
          }
          pump();
        });
      }
      function loadT86(days, i) {
        i = i || 0;
        if (i >= Math.min(days.length, 6)) return Promise.resolve(null);
        return viaProxy('https://www.twse.com.tw/rwd/zh/fund/T86?date=' + days[i] + '&selectType=ALLBUT0999&response=json')
          .then(function (j) {
            if (j && j.data && j.data.length) return { date: days[i], rows: j.data };
            return loadT86(days, i + 1);
          }).catch(function () { return loadT86(days, i + 1); });
      }

      /* ── 融資融券（MI_MARGN） ── */
      function findTable(j, kw) {
        if (j && j.tables) { for (var i = 0; i < j.tables.length; i++) { if ((j.tables[i].title || '').indexOf(kw) >= 0) return j.tables[i]; } }
        if (j && (j.title || '').indexOf(kw) >= 0) return j;
        return null;
      }
      function parseMargin(j) {
        var t = findTable(j, '信用交易統計');
        if (!t || !t.data) return null;
        var out = {};
        t.data.forEach(function (r) {
          var name = String(r[0]);
          if (name.indexOf('融資金額') >= 0) { out.finPrev = num(r[4]) / 1e5; out.finNow = num(r[5]) / 1e5; } /* 仟元→億 */
          else if (name.indexOf('融券') === 0) { out.shortPrev = num(r[4]); out.shortNow = num(r[5]); }        /* 張 */
          else if (name.indexOf('融資') === 0) { out.finUnitNow = num(r[5]); }                                  /* 張 */
        });
        return (out.finNow !== undefined) ? out : null;
      }
      function loadMargin(days) {
        var results = {}, queue = days.slice(), active = 0, done = 0;
        return new Promise(function (resolve) {
          function pump() {
            while (active < 3 && queue.length) {
              (function (dt) {
                active++;
                viaProxy('https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN?date=' + dt + '&selectType=MS&response=json')
                  .then(function (j) { var p = parseMargin(j); if (p) results[dt] = p; })
                  .catch(function () {})
                  .then(function () { active--; done++; (queue.length || active) ? pump() : resolve(results); });
              })(queue.shift());
            }
            if (!queue.length && !active && done) resolve(results);
          }
          pump();
        });
      }

      /* ── 圖表（SVG 手繪；含 <title> 懸浮提示與圖例） ── */
      function barChart(el, series) { /* series: [{date, f, t, d}] 舊→新 */
        if (!series.length) { el.innerHTML = '<span class="twc-err">近期數據暫時無法取得。</span>'; return; }
        var W = 720, H = 200, pad = 34;
        var maxAbs = 1;
        series.forEach(function (s) {
          var pos = Math.max(0, s.f) + Math.max(0, s.t) + Math.max(0, s.d);
          var neg = Math.min(0, s.f) + Math.min(0, s.t) + Math.min(0, s.d);
          maxAbs = Math.max(maxAbs, pos, -neg);
        });
        var zero = H / 2, scale = (H / 2 - 14) / maxAbs;
        var bw = Math.min(22, (W - pad - 8) / series.length - 4);
        var rects = '';
        series.forEach(function (s, i) {
          var x = pad + i * ((W - pad - 8) / series.length) + 2;
          var upY = zero, dnY = zero;
          [['f', C_FOREIGN, '外資'], ['t', C_TRUST, '投信'], ['d', C_DEALER, '自營商']].forEach(function (cfg) {
            var v = s[cfg[0]], h = Math.abs(v) * scale;
            if (h < 0.5) return;
            var y; if (v >= 0) { y = upY - h; upY -= h + 1; } else { y = dnY + 1; dnY += h + 1; }
            rects += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw + '" height="' + h.toFixed(1) + '" rx="1.5" fill="' + cfg[1] + '"><title>' + s.date + ' ' + cfg[2] + ' ' + fmtE(v) + ' 億</title></rect>';
          });
        });
        var yLbl = maxAbs.toFixed(0);
        el.innerHTML = '<div class="twc-legend"><span><i style="background:' + C_FOREIGN + '"></i>外資</span><span><i style="background:' + C_TRUST + '"></i>投信</span><span><i style="background:' + C_DEALER + '"></i>自營商</span></div>'
          + '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto" role="img" aria-label="三大法人近20日買賣超">'
          + '<line x1="' + pad + '" y1="' + zero + '" x2="' + W + '" y2="' + zero + '" stroke="#3f3f46" stroke-width="1"/>'
          + '<text x="2" y="16" font-size="10" fill="#8b8b93">+' + yLbl + '億</text><text x="2" y="' + (H - 6) + '" font-size="10" fill="#8b8b93">-' + yLbl + '億</text>'
          + rects + '</svg>';
      }
      function lineChart(el, series) { /* [{date, v}] 舊→新，億元：X 軸日期、Y 軸餘額、hover 浮窗 */
        if (!series.length) { el.innerHTML = '<span class="twc-err">近期數據暫時無法取得。</span>'; return; }
        var W = 720, H = 236, padL = 54, padR = 14, padT = 26, padB = 30;
        var n = series.length, plotW = W - padL - padR, plotH = H - padT - padB;
        var vs = series.map(function (s) { return s.v; });
        var mn = Math.min.apply(null, vs), mx = Math.max.apply(null, vs), span = (mx - mn) || Math.abs(mx) || 1;
        var yMin = mn - span * 0.1, yMax = mx + span * 0.1;
        function X(i) { return padL + (n === 1 ? plotW / 2 : i / (n - 1) * plotW); }
        function Y(v) { return padT + (1 - (v - yMin) / (yMax - yMin)) * plotH; }
        var C = '#0e9cb8'; /* 單一系列青（已通過色彩驗證器 on #141416） */
        var s = '';
        /* Y 軸格線與刻度（4 段） */
        for (var t = 0; t <= 4; t++) {
          var yv = yMin + (yMax - yMin) * (t / 4), yy = Y(yv);
          s += '<line x1="' + padL + '" y1="' + yy.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + yy.toFixed(1) + '" stroke="#27272a" stroke-width="1"/>';
          s += '<text x="' + (padL - 6) + '" y="' + (yy + 3.5).toFixed(1) + '" font-size="11" fill="#71717a" text-anchor="end">' + Math.round(yv) + '</text>';
        }
        s += '<text x="' + (padL - 6) + '" y="12" font-size="10.5" fill="#8b8b93" text-anchor="end">億元</text>';
        /* X 軸日期刻度（約 5 個） */
        var stepX = Math.max(1, Math.round((n - 1) / 4));
        for (var i = 0; i < n; i += stepX) {
          s += '<text x="' + X(i).toFixed(1) + '" y="' + (H - 9) + '" font-size="11" fill="#71717a" text-anchor="middle">' + series[i].date + '</text>';
        }
        if ((n - 1) % stepX !== 0) s += '<text x="' + X(n - 1).toFixed(1) + '" y="' + (H - 9) + '" font-size="11" fill="#71717a" text-anchor="middle">' + series[n - 1].date + '</text>';
        /* 面積漸層＋折線 */
        var line = series.map(function (r, i) { return X(i).toFixed(1) + ',' + Y(r.v).toFixed(1); }).join(' ');
        var gid = 'twg' + Math.round(X(0));
        s += '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + C + '" stop-opacity="0.28"/><stop offset="1" stop-color="' + C + '" stop-opacity="0"/></linearGradient></defs>';
        s += '<polygon points="' + X(0).toFixed(1) + ',' + (padT + plotH) + ' ' + line + ' ' + X(n - 1).toFixed(1) + ',' + (padT + plotH) + '" fill="url(#' + gid + ')"/>';
        s += '<polyline points="' + line + '" fill="none" stroke="' + C + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
        /* hover 元件（預設隱藏） */
        s += '<line id="mgc-guide" x1="0" y1="' + padT + '" x2="0" y2="' + (padT + plotH) + '" stroke="#52525b" stroke-width="1" stroke-dasharray="3 3" style="opacity:0"/>';
        s += '<circle id="mgc-dot" r="4" fill="' + C + '" stroke="#0b0b0d" stroke-width="1.5" style="opacity:0"/>';
        el.style.position = 'relative';
        el.innerHTML = '<svg id="mgc-svg" viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;display:block" role="img" aria-label="近20日融資餘額趨勢">' + s + '</svg>'
          + '<div class="twc-tip" id="mgc-tip"></div>';
        var svg = el.querySelector('#mgc-svg'), tip = el.querySelector('#mgc-tip'), guide = el.querySelector('#mgc-guide'), dot = el.querySelector('#mgc-dot');
        function onMove(ev) {
          var r = svg.getBoundingClientRect();
          var cx = ((ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left) / r.width * W;
          var frac = (cx - padL) / plotW; var idx = Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1))));
          var px = X(idx), py = Y(series[idx].v);
          guide.setAttribute('x1', px); guide.setAttribute('x2', px); guide.style.opacity = 1;
          dot.setAttribute('cx', px); dot.setAttribute('cy', py); dot.style.opacity = 1;
          tip.innerHTML = '<span class="d">' + series[idx].date + '</span>　<span class="v">' + Math.round(series[idx].v).toLocaleString() + ' 億</span>';
          tip.style.left = (px / W * r.width) + 'px'; tip.style.top = (py / H * r.height) + 'px'; tip.style.opacity = 1;
        }
        function onLeave() { guide.style.opacity = 0; dot.style.opacity = 0; tip.style.opacity = 0; }
        svg.addEventListener('mousemove', onMove); svg.addEventListener('mouseleave', onLeave);
        svg.addEventListener('touchmove', onMove, { passive: true }); svg.addEventListener('touchend', onLeave);
      }

      /* ── 主載入 ── */
      window.TW_CHIPS_SNAPSHOT = window.TW_CHIPS_SNAPSHOT || {};
      function twSnap(patch) {
        Object.assign(window.TW_CHIPS_SNAPSHOT, patch, { updatedAt: new Date().toISOString() });
        try { document.dispatchEvent(new CustomEvent('tw-chips-snapshot')); } catch (e) {}
      }
      window.loadTwChips = function (force) {
        if (twcLoading || (twcLoaded && !force)) return;
        twcLoading = true;
        var spinner = '<span class="q-loading-sm"><span class="q-spin"></span>獲取中</span>';
        document.getElementById('twc-inst-tiles').innerHTML = '<div class="twc-tile"><div class="k">三大法人數據</div><div class="v">' + spinner + '</div></div>';
        document.getElementById('twc-inst-chart').innerHTML = spinner;
        document.getElementById('twc-margin-tiles').innerHTML = '<div class="twc-tile"><div class="k">融資融券數據</div><div class="v">' + spinner + '</div></div>';
        document.getElementById('twc-margin-chart').innerHTML = spinner;
        document.getElementById('twc-rank-buy').innerHTML = spinner;
        document.getElementById('twc-rank-sell').innerHTML = spinner;
        var days = dateList(26); /* 抓 26 個平日，扣掉假日後湊 20 個交易日 */

        /* 三大法人 */
        loadInst(days).then(function (res) {
          var dts = Object.keys(res).sort();
          var series = dts.slice(-20).map(function (dt) {
            var r = res[dt];
            return { date: dt.slice(4, 6) + '/' + dt.slice(6, 8), f: r.f, t: r.t, d: r.d };
          });
          barChart(document.getElementById('twc-inst-chart'), series);
          if (series.length) {
            var last = series[series.length - 1], total = last.f + last.t + last.d;
            twSnap({ inst: { date: last.date, foreign: +last.f.toFixed(1), trust: +last.t.toFixed(1), dealer: +last.d.toFixed(1), total: +total.toFixed(1) } });
            document.getElementById('twc-inst-tiles').innerHTML =
              '<div class="twc-tile"><div class="k">外資（' + last.date + '）</div><div class="v ' + cls(last.f) + '">' + fmtE(last.f) + ' 億</div></div>'
              + '<div class="twc-tile"><div class="k">投信</div><div class="v ' + cls(last.t) + '">' + fmtE(last.t) + ' 億</div></div>'
              + '<div class="twc-tile"><div class="k">自營商</div><div class="v ' + cls(last.d) + '">' + fmtE(last.d) + ' 億</div></div>'
              + '<div class="twc-tile"><div class="k">三大法人合計</div><div class="v ' + cls(total) + '">' + fmtE(total) + ' 億</div><div class="d">' + (total >= 0 ? '法人偏買方' : '法人偏賣方') + '</div></div>';
          } else {
            document.getElementById('twc-inst-tiles').innerHTML = '<div class="twc-tile"><div class="k">三大法人</div><div class="v twc-err" style="font-size:13px">暫時無法取得</div></div>';
          }
        });

        /* T86 個股排行＋前50大法人欄 */
        loadT86(days).then(function (t86) {
          if (!t86) {
            document.getElementById('twc-rank-buy').innerHTML = '<span class="twc-err">暫時無法取得。</span>';
            document.getElementById('twc-rank-sell').innerHTML = '';
            return;
          }
          var rows = t86.rows.map(function (r) {
            return { code: String(r[0]).trim(), name: String(r[1]).trim(), foreign: num(r[4]), trust: num(r[10]), net: num(r[r.length - 1]) };
          });
          window.TW_INST_MAP = {};
          rows.forEach(function (r) { window.TW_INST_MAP[r.code] = r.net; });
          if (typeof window.fillTwInstColumn === 'function') window.fillTwInstColumn();
          var sorted = rows.slice().sort(function (a, b) { return b.net - a.net; });
          var brief = function (r) { return { code: r.code, name: r.name, netLots: Math.round(r.net / 1000) }; };
          twSnap({ stockLeaders: { topBuy: sorted.slice(0, 5).map(brief), topSell: sorted.slice(-5).reverse().map(brief) } });
          function tbl(list) {
            return '<table class="twc-t"><thead><tr><th>代號</th><th>名稱</th><th style="text-align:right">外資(張)</th><th style="text-align:right">投信(張)</th><th style="text-align:right">合計(張)</th></tr></thead><tbody>'
              + list.map(function (r) {
                  return '<tr><td class="num" style="text-align:left;color:#e4e4e7">' + r.code + '</td><td>' + r.name + '</td>'
                    + '<td class="num ' + cls(r.foreign) + '">' + Math.round(r.foreign / 1000).toLocaleString() + '</td>'
                    + '<td class="num ' + cls(r.trust) + '">' + Math.round(r.trust / 1000).toLocaleString() + '</td>'
                    + '<td class="num ' + cls(r.net) + '">' + Math.round(r.net / 1000).toLocaleString() + '</td></tr>';
                }).join('') + '</tbody></table>';
          }
          document.getElementById('twc-rank-buy').innerHTML = tbl(sorted.slice(0, 10));
          document.getElementById('twc-rank-sell').innerHTML = tbl(sorted.slice(-10).reverse());
        });

        /* 融資融券 */
        loadMargin(days).then(function (res) {
          var dts = Object.keys(res).sort();
          var series = dts.slice(-20).map(function (dt) { return { date: dt.slice(4, 6) + '/' + dt.slice(6, 8), v: res[dt].finNow }; });
          lineChart(document.getElementById('twc-margin-chart'), series);
          if (dts.length) {
            var m = res[dts[dts.length - 1]];
            var chg = m.finNow - m.finPrev, sChg = m.shortNow - m.shortPrev;
            var ratio = m.finUnitNow ? (m.shortNow / m.finUnitNow * 100) : null;
            twSnap({ margin: { finBalance: +m.finNow.toFixed(1), finChg: +chg.toFixed(1), shortBalance: m.shortNow, shortChg: sChg, shortMarginRatio: ratio != null ? +ratio.toFixed(2) : null } });
            document.getElementById('twc-margin-tiles').innerHTML =
              '<div class="twc-tile"><div class="k">融資餘額</div><div class="v">' + m.finNow.toFixed(0) + ' 億</div><div class="d ' + cls(chg) + '">今日 ' + fmtE(chg) + ' 億</div></div>'
              + '<div class="twc-tile"><div class="k">融券餘額</div><div class="v">' + m.shortNow.toLocaleString() + ' 張</div><div class="d ' + cls(-sChg) + '">今日 ' + (sChg >= 0 ? '+' : '') + sChg.toLocaleString() + ' 張</div></div>'
              + '<div class="twc-tile"><div class="k">券資比</div><div class="v">' + (ratio != null ? ratio.toFixed(2) + '%' : '—') + '</div><div class="d">融券張數／融資張數</div></div>'
              + '<div class="twc-tile"><div class="k">解讀</div><div class="v" style="font-size:13px;line-height:1.6;font-weight:600;color:#a1a1aa">' + (chg > 5 ? '融資快速增加，散戶槓桿升溫' : chg < -5 ? '融資退潮，槓桿降溫（籌碼沉澱）' : '融資變化平穩') + '</div></div>';
          } else {
            document.getElementById('twc-margin-tiles').innerHTML = '<div class="twc-tile"><div class="k">融資融券</div><div class="v twc-err" style="font-size:13px">暫時無法取得</div></div>';
          }
          twcLoaded = true; twcLoading = false;
        });
      };

      /* 台股頁籤首次開啟時載入籌碼數據（重量級分析，不隨頁面預載） */
      if (typeof window.initTwStockView === 'function') {
        var _init = window.initTwStockView;
        window.initTwStockView = function () { _init(); loadTwChips(); };
      }
    })();
