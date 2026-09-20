import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { SupabaseStore } from "./supabaseStore.js";

function nowIso() {
  return new Date().toISOString();
}

function emptyState() {
  return {
    tracked_products: [],
    price_history: [],
    scrape_logs: [],
    schedule: {
      last_run_at: null,
      next_run_at: null,
      last_status: null,
    },
  };
}

class FileStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.queue = Promise.resolve();
  }

  async withLock(fn) {
    const run = this.queue.then(fn, fn);
    this.queue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  async read() {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      return {
        tracked_products: parsed.tracked_products || [],
        price_history: parsed.price_history || [],
        scrape_logs: parsed.scrape_logs || [],
        schedule: parsed.schedule || emptyState().schedule,
      };
    } catch (err) {
      if (err.code === "ENOENT") return emptyState();
      throw err;
    }
  }

  async write(state) {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(state, null, 2));
    await fs.rename(tmp, this.filePath);
  }

  async listTracked() {
    const state = await this.read();
    return state.tracked_products.map((product) =>
      this.withLatest(state, product)
    );
  }

  withLatest(state, product) {
    const history = state.price_history
      .filter((row) => row.tracked_product_id === product.id)
      .sort((a, b) => b.scraped_at.localeCompare(a.scraped_at));
    const last = history[0] || null;
    const previous = history[1] || null;
    const restocked = Boolean(
      previous && previous.stock === 0 && last && last.stock > 0
    );
    const priceDelta =
      last && previous && previous.price != null && last.price != null
        ? Number((last.price - previous.price).toFixed(2))
        : 0;
    return {
      ...product,
      last_price: last?.price ?? null,
      last_stock: last?.stock ?? null,
      last_currency: last?.currency ?? null,
      last_scraped_at: last?.scraped_at ?? null,
      last_availability: last?.availability ?? (last ? (last.stock > 0 ? "in_stock" : "out_of_stock") : null),
      last_stock_label: last?.stock_label ?? null,
      last_seller: last?.seller ?? null,
      last_delivery: last?.delivery ?? null,
      last_discount_pct: last?.discount_pct ?? null,
      restocked,
      price_delta: priceDelta,
      price_dropped: priceDelta < 0,
    };
  }

  async getTracked(id) {
    const state = await this.read();
    const product = state.tracked_products.find((row) => row.id === id);
    return product ? this.withLatest(state, product) : null;
  }

  async findByProductId(productId) {
    const state = await this.read();
    const product = state.tracked_products.find(
      (row) => String(row.product_id) === String(productId)
    );
    return product ? this.withLatest(state, product) : null;
  }

  async addTracked(input) {
    return this.withLock(async () => {
      const state = await this.read();
      const existing = state.tracked_products.find(
        (row) => String(row.product_id) === String(input.product_id)
      );
      if (existing) return this.withLatest(state, existing);
      const row = {
        id: randomUUID(),
        product_id: String(input.product_id),
        product_name: input.product_name,
        product_url: input.product_url,
        brand: input.brand || null,
        category: input.category || null,
        sku: input.sku || null,
        tracking_enabled: true,
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      state.tracked_products.push(row);
      await this.write(state);
      return this.withLatest(state, row);
    });
  }

  async setTracking(id, enabled) {
    return this.withLock(async () => {
      const state = await this.read();
      const product = state.tracked_products.find((row) => row.id === id);
      if (!product) return null;
      product.tracking_enabled = enabled;
      product.updated_at = nowIso();
      await this.write(state);
      return this.withLatest(state, product);
    });
  }

  async insertHistory(trackedProductId, quote) {
    return this.withLock(async () => {
      const state = await this.read();
      const previous = state.price_history
        .filter((row) => row.tracked_product_id === trackedProductId)
        .sort((a, b) => b.scraped_at.localeCompare(a.scraped_at))[0];
      const restocked = Boolean(
        previous && previous.stock === 0 && quote.stock > 0
      );
      const row = {
        id: randomUUID(),
        tracked_product_id: trackedProductId,
        price: quote.price,
        stock: quote.stock,
        currency: quote.currency,
        availability: quote.availability || (quote.stock > 0 ? "in_stock" : "out_of_stock"),
        stock_label: quote.stock_label || null,
        seller: quote.seller || null,
        delivery: quote.delivery || null,
        discount_pct: quote.discount_pct ?? null,
        rating_label: quote.rating_label || null,
        pending: Boolean(quote.pending),
        restocked,
        price_delta:
          previous && previous.price != null
            ? Number((quote.price - previous.price).toFixed(2))
            : 0,
        scraped_at: nowIso(),
      };
      state.price_history.push(row);
      await this.write(state);
      return row;
    });
  }

  async getSchedule() {
    const state = await this.read();
    return state.schedule || emptyState().schedule;
  }

  async setSchedule(patch) {
    return this.withLock(async () => {
      const state = await this.read();
      state.schedule = { ...(state.schedule || emptyState().schedule), ...patch };
      await this.write(state);
      return state.schedule;
    });
  }

  async insertLog(entry) {
    return this.withLock(async () => {
      const state = await this.read();
      const row = {
        id: randomUUID(),
        tracked_product_id: entry.tracked_product_id,
        started_at: entry.started_at,
        completed_at: entry.completed_at || nowIso(),
        status: entry.status,
        attempt: entry.attempt,
        price: entry.price ?? null,
        stock: entry.stock ?? null,
        error_message: entry.error_message ?? null,
        duration_ms: entry.duration_ms,
      };
      state.scrape_logs.push(row);
      await this.write(state);
      return row;
    });
  }

  async history(trackedProductId) {
    const state = await this.read();
    return state.price_history
      .filter((row) => row.tracked_product_id === trackedProductId)
      .sort((a, b) => a.scraped_at.localeCompare(b.scraped_at));
  }

  async logs(trackedProductId) {
    const state = await this.read();
    return state.scrape_logs
      .filter((row) => row.tracked_product_id === trackedProductId)
      .sort((a, b) => b.started_at.localeCompare(a.started_at));
  }
}

export const store =
  config.supabaseUrl && config.supabaseKey
    ? new SupabaseStore()
    : new FileStore(config.dataFile);
