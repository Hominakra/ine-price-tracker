import { config } from "./config.js";
import { getProduct, productUrl } from "./services/catalog.js";
import { store } from "./db/store.js";
import { scrapeAndPersist } from "./scraper/scraperService.js";

const productId = process.argv[2] || "355";
const headless = process.argv.includes("--headed") ? false : config.headless;

const catalogItem = await getProduct(productId);
const tracked = await store.addTracked({
  product_id: catalogItem.id,
  product_name: catalogItem.name,
  product_url: productUrl(catalogItem.id),
  brand: catalogItem.brand,
  category: catalogItem.category,
  sku: catalogItem.sku,
});

console.log(`Scraping ${tracked.product_name} (${tracked.product_url}) headless=${headless}`);
const saved = await scrapeAndPersist(tracked, { headless });
console.log(JSON.stringify({ ok: true, ...saved.quote }, null, 2));
process.exit(0);
