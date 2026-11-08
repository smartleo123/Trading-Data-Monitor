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

The browser suite uses **Chromium** at desktop (1440 × 900) and iPhone-sized mobile
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
