(function () {
      'use strict';
      var LOADING = '<span class="q-loading"><span class="q-spin"></span>資料獲取中</span>';
      var TIMEOUT_TEXT = '<span class="q-loading">暫時無法取得，將自動重試</span>';
      var TIMEOUT_MS = 20000;

      function setLoading(el) {
        if (el && el.innerText.trim() === '--') el.innerHTML = LOADING;
      }
      function expire(els) {
        els.forEach(function (el) {
          if (el.querySelector && el.querySelector('.q-spin')) el.innerHTML = TIMEOUT_TEXT;
        });
      }

      /* 加密貨幣 + 美股卡：頁面載入即開始抓，逾時計時同步起算 */
      var mainIds = ['btc-price', 'eth-price', 'bnb-price', 'sol-price', 'xrp-price', 'hype-price', 'mstr-price', 'strc-price'];
      var mainEls = [];
      mainIds.forEach(function (id) { var el = document.getElementById(id); if (el) { mainEls.push(el); setLoading(el); } });
      setTimeout(function () { expire(mainEls); }, TIMEOUT_MS);

      /* 台股卡：失敗與盤後備援由 dashboard.js 管理，避免 20 秒計時器覆蓋有效報價狀態。 */
      var twEls = Array.prototype.slice.call(document.querySelectorAll('[data-tw-price]'));
      twEls.forEach(setLoading);
      // No generic timeout: sequential public quote proxies may need longer, and official closing-price fallback is shown independently.
    })();
