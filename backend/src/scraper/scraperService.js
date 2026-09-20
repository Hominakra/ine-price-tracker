import { config } from "../config.js";
import { store } from "../db/store.js";
import { launchBrowser, newContext } from "./browser.js";
import { scrapeProductPage } from "./productScraper.js";
import { withRetries } from "./retry.js";

export async function scrapeTrackedProduct(product, { headless = config.headless } = {}) {
  const browser = await launchBrowser({ headless });
  try {
    const context = await newContext(browser);
    return await withRetries(
      config.maxAttempts,
      async () => scrapeProductPage(context, product.product_url),
      async ({ attempt, status, result, error, duration_ms }) => {
        const startedAt = new Date(Date.now() - duration_ms).toISOString();
        await store.insertLog({
          tracked_product_id: product.id,
          started_at: startedAt,
          completed_at: new Date().toISOString(),
          status,
          attempt,
          price: result?.price ?? null,
          stock: result?.stock ?? null,
          error_message: error ? String(error.message || error) : null,
          duration_ms,
        });
      },
      { giveUpMs: config.scrapeGiveUpMs }
    );
  } finally {
    await Promise.race([
      browser.close().catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, 4000)),
    ]);
  }
}

export async function scrapeAndPersist(product, options) {
  const quote = await scrapeTrackedProduct(product, options);
  const history = await store.insertHistory(product.id, quote);
  return { quote, history };
}

export async function scrapeAllTracked(options) {
  const products = (await store.listTracked()).filter(
    (row) => row.tracking_enabled
  );
  const results = [];
  for (const product of products) {
    try {
      const saved = await scrapeAndPersist(product, options);
      results.push({
        id: product.id,
        product_id: product.product_id,
        name: product.product_name,
        ok: true,
        ...saved.quote,
      });
    } catch (error) {
      results.push({
        id: product.id,
        product_id: product.product_id,
        name: product.product_name,
        ok: false,
        error: String(error.message || error),
      });
    }
  }
  return results;
}
