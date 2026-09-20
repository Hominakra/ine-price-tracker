# Design note

## How scraping stays reliable

The mock store does not put price or stock in the catalog HTML. Product pages show a hidden price block until the user hovers with several mouse moves and at least 600ms dwell, then clicks **Reveal price**. The storefront JavaScript then runs a challenge/session/price flow (WASM, proof-of-work, encrypted payload). Reproducing that protocol by hand is brittle; Playwright lets the store's own code do the work.

The scraper therefore:

1. Opens the product page in Chromium.
2. Moves the mouse across `.price-block` more than eight times and waits 700ms.
3. Clicks Reveal / Try again with trusted Playwright events.
4. Re-hovers and re-clicks if the store silently drops a click (it does this randomly).
5. Waits through loading, store-side retries, and slow responses.
6. Parses price/stock after stripping zero-width spaces, non-breaking spaces, and fullwidth digits.
7. Validates before insert. Invalid or missing values abort the attempt.
8. Retries up to three times with backoff. Each attempt is logged as SUCCESS, RETRIED, or FAILED. History is written only after SUCCESS.

Catalog search uses `/api/catalog` pages and filters client-side because the store search query string is ignored.

## Trade-offs

- **Playwright over raw HTTP.** HTTP cannot obtain a live price without cloning the challenge stack. A real browser is the assignment-appropriate choice.
- **Local JSON store first.** The app runs without Supabase credentials. `supabase/schema.sql` matches the same tables for deployment.
- **External cron, not `setInterval`.** Free-tier backends sleep; cron-job.org should hit `POST /api/scrape/run`.

## What the first AI pass got wrong

- Treating the listing page as enough: prices are not on the grid, only on `/product/:id` after hover + reveal.
- Assuming `/api/catalog?q=` searches. It does not; results must be filtered locally after paging the catalog.
- Clicking Reveal immediately. Without enough hover samples and dwell, the button stays disabled.
- Storing the raw innerText as price. The UI injects zero-width characters and can use fullwidth digits.
- Trusting a single click. The store wraps the click handler in a function that sometimes no-ops, so the scraper must detect a still-idle price block and click again.
