import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

export const config = {
  port: Number(process.env.PORT || 4000),
  storeUrl: (process.env.STORE_URL || "https://demo.inelabteamdev.com").replace(/\/$/, ""),
  headless: String(process.env.HEADLESS ?? "true").toLowerCase() !== "false",
  cronSecret: process.env.CRON_SECRET || "",
  dataFile: process.env.DATA_FILE
    ? path.resolve(process.env.DATA_FILE)
    : path.join(__dirname, "..", "data", "store.json"),
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  maxAttempts: 3,
  scrapeTimeoutMs: 90_000,
  scrapeIntervalMs: Number(process.env.SCRAPE_INTERVAL_MS || 2 * 60 * 60 * 1000),
  enableInternalScheduler:
    String(process.env.ENABLE_INTERNAL_SCHEDULER ?? "true").toLowerCase() !==
    "false",
};
