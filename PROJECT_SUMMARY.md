# INE Product Price Tracker — project summary

Full-stack tracker for INE’s mock store: [https://demo.inelabteamdev.com](https://demo.inelabteamdev.com). Users search products, track them, scrape live price and stock, and view history plus scrape logs.

## What works

- **Frontend:** React + Vite dashboard (search, track, price, stock, delivery, restock, history, logs).
- **Backend:** Node.js + Express + Playwright (hover price area, click Reveal, retries, validation).
- **Database:** Supabase PostgreSQL (`tracked_products`, `price_history`, `scrape_logs`, `scrape_schedule`). Extra columns include availability, seller, delivery, discount, restocked, price delta.
- **GitHub (public):** [https://github.com/Hominakra/ine-price-tracker](https://github.com/Hominakra/ine-price-tracker)  
  `.env`, `node_modules`, and `backend/data` are not in the repo.
- **Render:** Express API as **Docker** (`backend/Dockerfile`, Playwright Chromium in the image). Health check `/api/health` should return `{"ok":true,...}`.
- **Vercel:** frontend, with `VITE_API_URL` pointing at the Render origin.

Local JSON store is only a fallback if Supabase env vars are missing.

## Scraper behavior

Prices are **not** on the catalog. The product page hides price until hover (8+ mouse samples, ~600ms dwell) and **Reveal price**. Playwright runs the store’s own JS (challenge / session / encrypted quote).

- Invalid or empty prices are **never** written to `price_history`.
- Each attempt is logged as `SUCCESS`, `RETRIED`, or `FAILED`.
- Scheduled scrapes retry until a valid price or a cap (15 attempts or ~4 minutes).
- `POST /api/scrape/run` returns **202** and scrapes in the background (Render HTTP timeout is ~30s).

## Trial scrapes (Supabase)

Ironwood Trackpad Lite was scraped live and stored:

| When (UTC) | Price | Stock |
| --- | --- | --- |
| 2026-09-20 11:55 | ₹3,274 | 170 |
| 2026-09-20 13:01 | ₹5,130 | 168 |
| 2026-09-20 13:03 | ₹5,130 | 168 |
| 2026-09-20 13:05 | ₹5,446 | 44 |

After that, no new automatic rows appeared until an **external** cron hit Render. Manual runs fetch and store; cron-job.org every **2 hours** must POST `/api/scrape/run` to keep recording.

## Deploy notes

**Render (Docker)**

- Runtime: **Docker** (not native Node). Root directory: `backend`. Dockerfile: `./Dockerfile`.
- Health check: `/api/health`.
- Do **not** use `playwright install --with-deps` (fails `su` on Render; browsers are already in the image).
- Env: `STORE_URL`, `HEADLESS=true`, `ENABLE_INTERNAL_SCHEDULER=false`, `CRON_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SCRAPE_INTERVAL_MS=7200000`.
- Dashboard: if the existing service is Node, switch to Docker and redeploy. Confirm health, then Track from Vercel.

**Vercel**

- Root directory: `frontend`
- Env: `VITE_API_URL` = Render origin, no trailing slash, no `/api`.

**Supabase URL** is `https://<project-ref>.supabase.co`, not the dashboard settings page. Use the **service_role** key in the backend only.

## Playwright on Render

Native Node fails with `browserType.launch: Executable doesn't exist` because Chromium is downloaded at build into a cache that is missing at runtime. The fix is Docker: `backend/Dockerfile` (`mcr.microsoft.com/playwright:v1.63.0-jammy`, matching npm `playwright`). Blueprint: [render.yaml](render.yaml).

## Scheduling (assignment: every 2 hours)

Free Render sleeps. Use [cron-job.org](https://cron-job.org) as the primary scheduler (do not also enable GitHub Actions on the same URL unless you want double scrapes):

- `POST https://<render-url>/api/scrape/run`
- Header: `Authorization: Bearer <CRON_SECRET>`
- Every **2 hours** (`0 */2 * * *`), after Docker health is green.
- Manual **Run now** should return 202; then check `price_history` / scrape logs.

## Still to finish for the assignment (dashboard)

These cannot be done from the repo alone:

1. Render: switch the web service to **Docker**, set env above, redeploy, confirm `/api/health`.
2. cron-job.org: create the 2-hour POST with the same `CRON_SECRET`.
3. Verify Vercel Track/Scrape and a new `price_history` row.
4. 2–4 minute headed recording: `cd backend && node src/cli.js 355 --headed`
5. Email with live Vercel link, GitHub URL, recording, README, design note, resume PDF.

## Local run

```powershell
cd backend
npm install
npx playwright install chromium
npm start

cd frontend
npm install
npm run dev
```

Open http://localhost:5173. Headed scrape: `node src/cli.js 355 --headed`.
