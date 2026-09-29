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
requests are needed. These tests do not verify browser layout, external chart
iframes, or live provider availability.

## Runtime behavior

- Main crypto quote cards refresh every 5 seconds while the page is visible;
  each symbol has at most one active fetch and a 9-second request timeout.
- Taiwan quote cards show offline when a refresh fails or takes over 10 seconds;
  the last available price remains visible. A successful refresh restores status.
- AI requests time out after 30 seconds, including response body loading, and
  restore the input and send button so the question can be retried.
- Invalid calculator inputs hide results until corrected. Break-even prices
  are solved on each linear payoff segment, including the unbounded upper tail.
