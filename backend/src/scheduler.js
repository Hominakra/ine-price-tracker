import { config } from "./config.js";
import { store } from "./db/store.js";
import { scrapeAllTracked } from "./scraper/scraperService.js";

let timer = null;
let running = false;

function nextRunIso(from = Date.now()) {
  return new Date(from + config.scrapeIntervalMs).toISOString();
}

export async function runScheduledScrape(reason = "schedule") {
  if (running) {
    return { ok: false, skipped: true, reason: "already-running" };
  }
  running = true;
  const started = new Date().toISOString();
  console.log(`[scheduler] ${reason} scrape started at ${started}`);
  try {
    const results = await scrapeAllTracked();
    const schedule = await store.setSchedule({
      last_run_at: started,
      last_status: results.every((row) => row.ok)
        ? "SUCCESS"
        : results.some((row) => row.ok)
          ? "PARTIAL"
          : "FAILED",
      last_reason: reason,
      next_run_at: nextRunIso(),
      last_count: results.length,
    });
    console.log(
      `[scheduler] finished ${results.length} products; next run ${schedule.next_run_at}`
    );
    return { ok: true, results, schedule };
  } catch (error) {
    await store.setSchedule({
      last_run_at: started,
      last_status: "FAILED",
      last_reason: reason,
      next_run_at: nextRunIso(),
      last_error: String(error.message || error),
    });
    throw error;
  } finally {
    running = false;
  }
}

export async function startScheduler() {
  if (!config.enableInternalScheduler) {
    console.log("[scheduler] internal 2-hour loop disabled; use cron-job.org");
    return;
  }

  const existing = await store.getSchedule();
  const products = await store.listTracked();
  const latestHistory = products
    .map((row) => row.last_scraped_at)
    .filter(Boolean)
    .sort()
    .at(-1);
  const lastCheck = existing.last_run_at || latestHistory;
  const due =
    !lastCheck ||
    Date.now() - new Date(lastCheck).getTime() >= config.scrapeIntervalMs;

  if (due) {
    setTimeout(() => {
      runScheduledScrape("startup-or-overdue").catch((err) =>
        console.error("[scheduler]", err)
      );
    }, 8_000);
  } else {
    await store.setSchedule({
      last_run_at: existing.last_run_at || lastCheck,
      next_run_at:
        existing.next_run_at || nextRunIso(new Date(lastCheck).getTime()),
    });
  }

  timer = setInterval(() => {
    runScheduledScrape("interval").catch((err) => console.error("[scheduler]", err));
  }, config.scrapeIntervalMs);

  if (timer.unref) timer.unref();
  console.log(
    `[scheduler] checking the mock store every ${config.scrapeIntervalMs / 60000} minutes`
  );
}
