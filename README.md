# INE Product Price Tracker

Full-stack tracker for [INE's mock storefront](https://demo.inelabteamdev.com/). Users search products by name, track them, scrape live price and stock with Playwright, and inspect history plus per-attempt logs.

## Stack

- Frontend: React + Vite (Vercel)
- Backend: Node.js + Express on Render (**Docker**, Playwright image)
- Data: local JSON file by default; Supabase schema included
- Scraper: Playwright Chromium (baked into `backend/Dockerfile`)
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

## Deploy (Render Docker + Vercel)

Chromium must ship **inside the image**. Native Node on Render installs browsers at build time into a cache that is missing at runtime (`browserType.launch: Executable doesn't exist`). Do **not** use `npx playwright install chromium --with-deps`.

### Render (API)

1. Web service, **Docker** runtime, root directory `backend`, Dockerfile `./Dockerfile` (see [backend/Dockerfile](backend/Dockerfile) — `mcr.microsoft.com/playwright:v1.63.0-jammy`, same version as the `playwright` npm package).
2. Health check: `/api/health`.
3. Env (secrets stay in the dashboard; Blueprint `render.yaml` already sets the non-secrets):

| Name | Value |
| --- | --- |
| `STORE_URL` | `https://demo.inelabteamdev.com` |
| `HEADLESS` | `true` |
| `ENABLE_INTERNAL_SCHEDULER` | `false` (free Render sleeps; cron wakes the process) |
| `SCRAPE_INTERVAL_MS` | `7200000` (2 hours) |
| `CRON_SECRET` | same secret you will put on cron-job.org |
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key (backend only) |

4. Redeploy. Confirm `GET https://<render-host>/api/health` returns `{"ok":true,...}`.
5. Track/Scrape from the Vercel app should no longer hit a missing-browser error.

If the service was created as **Node**, switch it to **Docker** in settings (or apply the Blueprint) and redeploy. Keep root directory `backend`.

### Vercel (frontend)

- Root directory: `frontend`
- `VITE_API_URL` = Render origin, no trailing slash, no `/api`

## Scraping schedule

The backend checks every tracked product on the mock store **once every 2 hours**, then writes the new price, stock, availability, and delivery info. The React dashboard polls those saved values, so the website updates after each check.

On a always-on process an internal timer can run; on **free Render the process sleeps**, so the assignment scheduler is [cron-job.org](https://cron-job.org):

`POST https://<your-render-app>/api/scrape/run`

Header: `Authorization: Bearer <CRON_SECRET>`

Schedule: **every 2 hours** (`0 */2 * * *`). Enable the job only after Docker health checks pass. The endpoint returns **202** and scrapes in the background (Render HTTP timeout is ~30s). Failed extracts are logged and never overwrite the last good price.

Do not also enable GitHub Actions on the same URL/secret unless you want two scrapes per window.

### Verify

- Vercel Track on a product (e.g. id `355`) writes a `price_history` row.
- cron-job.org **Run now** (or `curl` with Bearer) returns 202 and a SUCCESS scrape log.
- After the first scheduled tick, a new row appears without opening the dashboard.

## Environment variables

| Name | Purpose |
| --- | --- |
| `PORT` | Backend port (default 4000; Render sets this) |
| `STORE_URL` | Mock store origin |
| `HEADLESS` | `true`/`false` for Playwright |
| `CRON_SECRET` | Shared secret for scheduled runs |
| `ENABLE_INTERNAL_SCHEDULER` | `false` on Render; local can stay `true` |
| `SCRAPE_INTERVAL_MS` | Store-check interval (default `7200000` = 2 hours) |
| `VITE_API_URL` | Frontend only: Render origin, no trailing slash |
| `DATA_FILE` | Local JSON database path |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Optional hosted DB |

## Reliability

The store hides price until the price area is hovered (8 mouse samples, 600ms dwell) and Reveal is clicked. The storefront's own JS then solves a browser challenge. Playwright runs that real browser flow. Failed or empty extracts are logged and never written to price history.
