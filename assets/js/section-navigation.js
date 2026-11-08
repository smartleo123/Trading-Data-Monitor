(function () {
      'use strict';
      /* 區塊清單改由 DOM 驅動：掃描各頁籤容器內帶 data-nav 屬性的元素，
         順序 = 頁面實際順序。之後新增/搬移區塊只要在該區塊加 data-nav="名稱" 即可。 */
      var nav = document.getElementById('section-nav');
      var currentView = 'crypto';
      var items = [];

      /* 頂欄高度動態量測（頂欄在窄視窗會換行變高，不能寫死） */
      function headerOffset() {
        var h = document.querySelector('.sticky.top-0');
        return (h ? h.offsetHeight : 72) + 24;
      }

      function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

      function buildNav(view) {
        currentView = view;
        nav.innerHTML = '';
        items = [];
        var container = document.getElementById('market-view-' + view);
        if (!container) return;
        var off = headerOffset();
        container.querySelectorAll('[data-nav]').forEach(function (el) {
          var label = el.getAttribute('data-nav');
          if (!label) return;
          el.style.scrollMarginTop = off + 'px';
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'sn-item';
          btn.setAttribute('title', label);
          btn.innerHTML = '<span class="sn-label">' + esc(label) + '</span><span class="sn-dot"></span>';
          btn.addEventListener('click', function () {
            /* 點擊立即高亮，平滑捲動期間鎖定不被 scroll 事件蓋掉 */
            items.forEach(function (it) { it.btn.classList.remove('sn-active'); });
            btn.classList.add('sn-active');
            lockUntil = Date.now() + 900;
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          });
          nav.appendChild(btn);
          items.push({ el: el, btn: btn });
        });
        updateMode();
        updateActive();
      }

      /* 右側留白不足時切為圓點模式，避免蓋到內容卡片（依導覽實際寬度動態判斷） */
      function updateMode() {
        var main = document.querySelector('main');
        if (!main) return;
        /* 內容實際邊緣 = main 右緣扣除其 padding（卡片不會貼到 main 邊上） */
        var padR = parseFloat(getComputedStyle(main).paddingRight) || 0;
        var contentRight = main.getBoundingClientRect().right - padR;
        var margin = window.innerWidth - contentRight;
        nav.classList.remove('sn-compact');
        if (margin < nav.offsetWidth + 22) nav.classList.add('sn-compact');
      }

      /* 捲動時高亮：取「頂端已越過視窗上緣＋緩衝」的最後一個區塊 */
      var ticking = false;
      var lockUntil = 0;
      function updateActive() {
        if (!items.length) return;
        if (Date.now() < lockUntil) return;
        var active = 0;
        var off = headerOffset() + 40;
        for (var i = 0; i < items.length; i++) {
          if (items[i].el.getBoundingClientRect().top <= off) active = i;
        }
        /* 捲到頁面最底部時，一律視為位於最後一個區塊（避免短頁面點最後一項卻高亮不到） */
        if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) active = items.length - 1;
        items.forEach(function (it, i) { it.btn.classList.toggle('sn-active', i === active); });
        magnify(null); /* 依新的 active 狀態重算縮放 */
      }
      window.addEventListener('scroll', function () {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function () { updateActive(); ticking = false; });
      }, { passive: true });

      /* ===== macOS Dock 式放大特效 =====
         游標在導覽上移動時，依「游標與各項目垂直距離」做高斯衰減放大：
         最近的項目放最大（約 1.45x），鄰近項目次之；選中(active)項恆常保持 1.26x。 */
      var SIGMA = 52, PEAK = 0.45, ACTIVE_SCALE = 1.26;
      function magnify(cursorY) {
        items.forEach(function (it) {
          var base = it.btn.classList.contains('sn-active') ? ACTIVE_SCALE : 1;
          var s = base;
          if (cursorY != null) {
            var r = it.btn.getBoundingClientRect();
            var d = cursorY - (r.top + r.height / 2);
            var boost = 1 + PEAK * Math.exp(-(d * d) / (2 * SIGMA * SIGMA));
            s = Math.max(base, boost);
          }
          it.btn.style.transform = 'scale(' + s.toFixed(3) + ')';
        });
      }
      nav.addEventListener('mousemove', function (e) { magnify(e.clientY); }, { passive: true });
      nav.addEventListener('mouseleave', function () { magnify(null); });
      window.addEventListener('resize', function () { updateMode(); updateActive(); }, { passive: true });

      /* 掛勾頁籤切換：包裝原本的 switchMarketView，切換後重建清單並回到頂部區塊 */
      if (typeof window.switchMarketView === 'function') {
        var _orig = window.switchMarketView;
        window.switchMarketView = function (view) {
          _orig(view);
          buildNav(view);
        };
      }
      buildNav(currentView);
    })();
