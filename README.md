# Trading-Data-Monitor

Static market dashboard published through GitHub Pages from `main`.

## Local preview

Run `python3 -m http.server 8000`, then open http://localhost:8000.

## Regression tests

Requires Node.js 20 or newer:

```sh
npm ci
npm test
```

The tests execute the page in jsdom with mocked fetch, timers, icons and canvas.
They cover market switching, option payoff break-even prices, input validation,
manual position preservation, request deduplication, stale quote status, missing
icon scripts, and AI success/timeout recovery. No real API keys or external API
requests are needed. The jsdom suite does not verify browser layout or live provider availability.

## Runtime behavior

- Main crypto quote cards refresh every 5 seconds while the page is visible;
  each symbol has at most one active fetch and a 9-second request timeout.
- Taiwan quote cards show offline when a refresh fails or takes over 10 seconds;
  the last available price remains visible. A successful refresh restores status.
- AI requests time out after 30 seconds, including response body loading, and
  restore the input and send button so the question can be retried.
- Invalid calculator inputs hide results until corrected. Break-even prices
  are solved on each linear payoff segment, including the unbounded upper tail.

## Browser tests (Playwright)

The browser suite uses **Chromium** at desktop (1440 × 900) and Pixel-sized Android mobile
viewports. It exercises real mouse/touch click handling, market and chart tabs,
quote rendering, the AI panel, responsive container bounds, and the TradingView
widget mount point. Third-party market responses and widget scripts are mocked for
repeatable CI; **these tests do not verify live TradingView/CoinGlass availability**.

Run locally on Node.js 20+:

```sh
npm ci
npm install --no-save --package-lock=false @playwright/test@1.56.1
npx playwright install chromium
npm run test:e2e
```

A standalone HTTP test server is started automatically. GitHub Actions runs these
browser tests on each PR, push to `main`, and manually through workflow dispatch.
On failure, screenshots, traces, and an HTML report are uploaded as CI artifacts.
The existing `npm test` jsdom suite remains unchanged and runs independently.

## Crypto market analysis embeds

- BTC candlesticks use an official TradingView widget.
- ETF daily net flows embed the attributed TFTC Bitcoin ETF flows image
  (https://www.tftc.io/bitcoin-etf-flows; licensed CC BY 4.0 on that page);
  Farside's original flow table is linked alongside the chart at
  https://farside.co.uk/btc/. These are *daily* ETF data, not real-time flows.
- Fear & Greed uses Alternative.me's officially embeddable, self-updating index
  image, with a visible attribution/source link.
- External images can fail due to upstream availability or browser filtering:
  in-panel source links and a fallback message remain available.
- Browser tests mock external images to verify the integration and fallback UI
  separately from live provider reliability.

## Scheduled 0050 holding weights

An independent GitHub Actions workflow (`.github/workflows/update-0050.yml`) is
scheduled at **19:30 Asia/Taipei on weekdays** (11:30 UTC; GitHub cron may be
delayed). It first tries issuer JSON and falls back to the complete MoneyDJ ETF holding table when the issuer returns HTML or invalid data. It validates
40–60 unique four-digit symbols and a plausible total portfolio weight, and
writes `assets/data/0050-holdings.json` **only if the validated data changed**.
If the API returns invalid data, the workflow fails and keeps the last valid
snapshot intact. After a successful commit, the workflow explicitly requests a
GitHub Pages rebuild (bot pushes alone do not trigger branch Pages builds).

The dashboard first loads that static snapshot when Taiwan-market holdings are
needed. It displays the issuer's **trade date only when the source actually
supplies one**; otherwise it shows the retrieval timestamp as a distinct item.
If no published snapshot exists, it clearly identifies the old bundled holdings
as stale. The manual browser-proxy refresh button remains as a best-effort
fallback, not the default mechanism.

**Important:** The issuer's API is not a documented, guaranteed public data feed and returned HTML in an initial GitHub runner test. MoneyDJ is a third-party summary, so the dashboard now identifies which provider supplied each successful snapshot. Both sources can restrict automated access. Run the workflow manually from the
Actions tab after deployment to validate actual source access. No automated
daily update can be guaranteed until a live run succeeds. Weights are holdings
of **0050**, not the stock's share of total Taiwan-market capitalization.

## Taiwan stock quotes

The current Taiwan quote cards use Yahoo chart quotes via public web proxies.
They can be delayed or unavailable. The UI uses the provider timestamp where
available and does not claim a missing timestamp means a live quote. TWSE's
public post-close API is not a substitute for licensed real-time intraday data.
For consistently live quotes in a public dashboard, use a vendor feed with the
appropriate redistribution license and keep credentials on a backend.

## TDCC stock & ETF ownership distribution lookup

The Taiwan-stock section now defaults to **0050** but allows users to enter any
TDCC-listed 4–6 character stock or ETF symbol (for example: `2330`, `0056`,
`00878`). A weekly GitHub Actions job downloads the official complete TDCC
open-data dataset `1-5`, validates each security separately, and publishes a
small index plus per-symbol-prefix JSON shards at
`assets/data/tdcc/index.json` and `assets/data/tdcc/<prefix>.json`.
A user downloads only the index and the shard for the requested symbol;
the source report is never downloaded wholesale to the browser.

The table shows all 15 holding ranges, the adjustment row, and the total,
with cumulative **number of holders** and cumulative **percentage of holders**
calculated from the smallest to largest range. Grade 16 does not add persons.
If the symbol is not covered by TDCC, or an entire shard is unavailable, the
interface displays an explicit warning with an official lookup link.
The previous `assets/data/0050-distribution.json` is still published as
a backwards-compatible default fallback.

GitHub Actions schedules a weekly refresh on Saturday 10:00 Asia/Taipei.
TDCC data are weekly snapshots, not real-time brokerage shareholder registers.
Data source: https://www.tdcc.com.tw/portal/zh/smWeb/qryStock

## TWSE institutional, margin and 0050 closing prices

The "三大法人籌碼動向" and "融資融券" panels used to trigger dozens of
cross-origin TWSE requests through unreliable public CORS proxies on each
visitor's browser. They now load a small same-origin, GitHub-published
`assets/data/tw-market-snapshot.json` instead. The daily GitHub Actions
workflow (`.github/workflows/update-tw-market.yml`) runs at 19:50 Taipei
time on weekdays and downloads the official TWSE BFI82U (institutional
daily net flows), T86 (per-stock institutional net buying), MI_MARGN
(margin balances), and STOCK_DAY_ALL (closing prices) reports.

- The charts use the latest *validated* official daily rows. Date labels
  are included; gaps due to holidays or source errors are possible.
- The 0050 component table uses the bulk TWSE latest closing prices for
  listed stocks and T86 net institutional trading shares (displayed as lots).
  Price retrieval date is distinct from trading date when the official API
  does not expose an as-of date per stock.
- The weekly 0050 component holdings snapshot remains a separate data source.
- Failed source requests do not replace existing validated data. The UI
  shows a clear unavailable state rather than an indefinite loading spinner.
- The daily market snapshot is after-hours data, **not live intraday quotes**.
  This data covers TWSE (listed securities) and is not a full TPEx market feed.

## BTC options conditional decision support and market scoping

The TDCC holder distribution is contained exclusively inside the Taiwan stock
view. The right-side section navigation discovers its own Taiwan-only
`data-nav="集保戶股權分散表"` entry and removes it on US/crypto tab changes.

The BTC options live panel adds a risk-gated decision-support summary, based
on the fetched Deribit index spot, DVOL percentile, ATM IV, and optional
skew, funding rate, PCR, trade flow and realized volatility. It distinguishes
low, middle and high implied-volatility environments, while requiring an
external price/market confirmation before any proposed scenario is actionable.
When critical inputs are missing, it outputs a no-trade/observe state.
OI walls, maximum pain and approximated dealer gamma exposure are explicitly
flagged as uncertain inferences, **not deterministic support/resistance**.
Any modeled IV–realized spread may use mismatched tenors, and the module does
not claim backtested profitability, quote-executable option premium, or
brokerage account suitability. It never places orders.

## Deribit executable quote-based BTC options calculator

The strategy calculator now selects a real Deribit expiry, rather than using
only an arbitrary DTE, and downloads live public `ticker` and
`get_instrument` records for the exact option contract for each leg.
It builds option entries from **best ask for buys** and **best bid for sells**.
BTC option premiums are native BTC amounts: USD indicative cost per
underlying-BTC contract is `premium_btc * BTC_USD * contract_size`.
The amount multiplier is verified from instrument metadata. Invalid, stale
(older than 120 seconds), unusually wide spread (>25%), insufficient top
level size, non-open, or absent quotes do **not** qualify as executable
reference pricing. Exchange top-of-book quotes are not guaranteed fills.

The calculator preserves theoretical/manual fallback with an explicit warning
when any option leg cannot be validated. It also lets users set an illustrative
round-trip fee per BTC amount (default zero), derives expiration payoff,
maximum loss, maximum profit, break-even prices, and a Black-76
mark-to-model P&L grid for BTC spot -10% to +10% and IV +/-10
volatility points at a hypothetical horizon seven days before expiry.
This grid is **not** future executable bid/ask or a projected realized return;
it excludes liquidity changes, actual exit costs beyond user assumptions,
liquidations, and assignment/settlement-specific costs.

No trading APIs, authentication or order placement are used.

## Deribit inverse-option quote audit and historical replay (November 2026)

The read-only market-data pipeline records a production Deribit quote-book
sample every four hours using official `get_time`, `get_index_price`,
`get_instruments`, and `get_order_book` endpoints. Source audit metadata
resides in `assets/data/deribit/source-audit.json`; independently checked
contract books are appended to `assets/data/deribit/quote-history.json`
under timestamped observations. Invalid, stale, illiquid, contradictory or
wrong-contract responses are rejected without inventing values.

The BTC inverse option calculation now keeps an option's original premium
in BTC; BTC expiration settlement uses
`max(S-K,0)/S - premium_btc` for calls, or
`max(K-S,0)/S - premium_btc` for puts. USD-equivalent settlement
P&L is BTC P&L multiplied by the *exit/settlement* BTC/USD price;
using the entry BTC/USD price forever is incorrect. The resulting
USD-marked max loss and break-even can differ from a linear USD option.
Official methodology: https://support.deribit.com/hc/en-us/articles/31424939096093-Inverse-Options

The new strategy replay uses only genuine archived **entry ask / entry bid**
and **exit bid / exit ask** for the *same* option contract, with depth and
timestamp validation on both ends, explicit fee assumptions, and no overlapping
holds. Strategies: long call, long straddle, bull-call debit spread,
bear-put debit spread and iron condor. Available horizons: 1, 3 or 7 days.
Missing exit books and market closures cause skipped trades, never synthesized
fills. Exchange top-of-book may not be executable at the shown size due to
latency and adverse selection.

**No pre-collection historical order-book archive exists in this repository.**
The history must accumulate from the first successful scheduled capture.
Less than 20 complete trades explicitly suppresses profitability claims.
This is forward-collected historical quote replay, not a backfilled study
of years of verified real fills. Win rate, profit factor, average BTC P&L and
drawdown appear only with enough eligible observations. No automatic orders
are sent. An actual quantitative trading edge would require much more data,
out-of-sample validation, execution simulation and robustness tests.
