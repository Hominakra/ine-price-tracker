# INE Product Price Tracker

Full-stack tracker for [INE's mock storefront](https://demo.inelabteamdev.com/). Users search products by name, track them, scrape live price and stock with Playwright, and inspect history plus per-attempt logs.

## Stack

- Frontend: React + Vite (Vercel)
- Backend: Node.js + Express (Render)
- Data: local JSON file by default; Supabase schema included
- Scraper: Playwright Chromium
- Schedule: POST `/api/scrape/run` every 2 hours via cron-job.org

## Local setup

```bash
cd backend
copy .env.example .env
npm install
npx playwright install chromium

cd ../frontend
npm install
npm run dev
```

In another terminal:

```bash
cd backend
npm start
```

Open http://localhost:5173

### Manual scrape (CLI)

```bash
cd backend
node src/cli.js 355
node src/cli.js 355 --headed
```

## Scraping schedule

The backend checks every tracked product on the mock store **once every 2 hours**, then writes the new price, stock, availability, and delivery info. The React dashboard polls those saved values, so the website updates after each check.

While the Node process is running it uses an internal 2-hour timer. On free-tier Render the process sleeps, so also point [cron-job.org](https://cron-job.org) (or GitHub Actions) at:

`POST https://<your-render-app>/api/scrape/run`

Header: `Authorization: Bearer <CRON_SECRET>`

That request both wakes the backend and runs the scrape. Failed extracts are logged and never overwrite the last good price.

## Environment variables

| Name | Purpose |
| --- | --- |
| `PORT` | Backend port (default 4000) |
| `STORE_URL` | Mock store origin |
| `HEADLESS` | `true`/`false` for Playwright |
| `CRON_SECRET` | Shared secret for scheduled runs |
| `SCRAPE_INTERVAL_MS` | Store-check interval (default `7200000` = 2 hours) |
| `VITE_API_URL` | Frontend only: Render origin, no trailing slash |
| `DATA_FILE` | Local JSON database path |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Optional hosted DB |

## Reliability

The store hides price until the price area is hovered (8 mouse samples, 600ms dwell) and Reveal is clicked. The storefront's own JS then solves a browser challenge. Playwright runs that real browser flow. Failed or empty extracts are logged and never written to price history.
