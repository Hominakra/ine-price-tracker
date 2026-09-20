import { Router } from "express";
import { config } from "../config.js";
import { store } from "../db/store.js";
import { getProduct, productUrl, searchProducts } from "../services/catalog.js";
import { scrapeAndPersist } from "../scraper/scraperService.js";
import { isScrapeRunning, runScheduledScrape } from "../scheduler.js";

export const router = Router();

router.get("/health", (_req, res) => {
  res.json({ ok: true, store: config.storeUrl, headless: config.headless });
});

router.get("/schedule", async (_req, res, next) => {
  try {
    const schedule = await store.getSchedule();
    res.json({
      interval_ms: config.scrapeIntervalMs,
      interval_hours: config.scrapeIntervalMs / 3_600_000,
      ...schedule,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/products/search", async (req, res, next) => {
  try {
    const q = String(req.query.q || "");
    const items = await searchProducts(q);
    res.json({ query: q, count: items.length, items });
  } catch (error) {
    next(error);
  }
});

router.get("/tracked-products", async (_req, res, next) => {
  try {
    res.json(await store.listTracked());
  } catch (error) {
    next(error);
  }
});

router.post("/tracked-products", async (req, res, next) => {
  try {
    const productId = req.body?.product_id ?? req.body?.productId;
    if (productId == null) {
      res.status(400).json({ error: "product_id is required" });
      return;
    }
    const catalogItem = await getProduct(productId);
    const tracked = await store.addTracked({
      product_id: catalogItem.id,
      product_name: catalogItem.name,
      product_url: productUrl(catalogItem.id),
      brand: catalogItem.brand,
      category: catalogItem.category,
      sku: catalogItem.sku,
    });
    res.status(201).json(tracked);
  } catch (error) {
    next(error);
  }
});

router.get("/tracked-products/:id/history", async (req, res, next) => {
  try {
    const product = await store.getTracked(req.params.id);
    if (!product) {
      res.status(404).json({ error: "Tracked product not found" });
      return;
    }
    res.json(await store.history(product.id));
  } catch (error) {
    next(error);
  }
});

router.get("/tracked-products/:id/logs", async (req, res, next) => {
  try {
    const product = await store.getTracked(req.params.id);
    if (!product) {
      res.status(404).json({ error: "Tracked product not found" });
      return;
    }
    res.json(await store.logs(product.id));
  } catch (error) {
    next(error);
  }
});

router.get("/tracked-products/:id", async (req, res, next) => {
  try {
    const product = await store.getTracked(req.params.id);
    if (!product) {
      res.status(404).json({ error: "Tracked product not found" });
      return;
    }
    const [history, logs] = await Promise.all([
      store.history(product.id),
      store.logs(product.id),
    ]);
    res.json({ ...product, history, logs });
  } catch (error) {
    next(error);
  }
});

router.post("/scrape/all", (req, res) => {
  if (isScrapeRunning()) {
    res.status(202).json({ ok: true, skipped: true, reason: "already-running" });
    return;
  }
  runScheduledScrape("manual").catch((err) => console.error("[scrape/all]", err));
  res.status(202).json({ ok: true, started: true });
});

router.post("/scrape/run", (req, res) => {
  const auth = req.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : req.query.secret;
  if (config.cronSecret && token !== config.cronSecret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (isScrapeRunning()) {
    res.status(202).json({ ok: true, skipped: true, reason: "already-running" });
    return;
  }
  runScheduledScrape("cron").catch((err) => console.error("[scrape/run]", err));
  res.status(202).json({ ok: true, started: true });
});

router.post("/scrape/:productId", async (req, res, next) => {
  try {
    const productId = req.params.productId;
    let tracked =
      (await store.findByProductId(productId)) ||
      (await store.getTracked(productId));
    if (!tracked) {
      const catalogItem = await getProduct(productId);
      tracked = await store.addTracked({
        product_id: catalogItem.id,
        product_name: catalogItem.name,
        product_url: productUrl(catalogItem.id),
        brand: catalogItem.brand,
        category: catalogItem.category,
        sku: catalogItem.sku,
      });
    }
    const saved = await scrapeAndPersist(tracked, {
      headless: req.query.headless === "false" ? false : config.headless,
    });
    const product = await store.getTracked(tracked.id);
    res.json({ ok: true, product, ...saved.quote, history: saved.history });
  } catch (error) {
    next(error);
  }
});
