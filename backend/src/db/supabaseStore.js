import { createClient } from "@supabase/supabase-js";
import { config } from "../config.js";
import { nowIso, withLatest } from "./enrich.js";

function client() {
  return createClient(config.supabaseUrl, config.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function throwIf(error) {
  if (error) throw error;
}

export class SupabaseStore {
  constructor() {
    this.db = client();
  }

  async latestHistory(trackedProductId, limit = 2) {
    const { data, error } = await this.db
      .from("price_history")
      .select("*")
      .eq("tracked_product_id", trackedProductId)
      .order("scraped_at", { ascending: false })
      .limit(limit);
    throwIf(error);
    return data || [];
  }

  async enrich(product) {
    if (!product) return null;
    const history = await this.latestHistory(product.id, 2);
    return withLatest(product, history);
  }

  async listTracked() {
    const { data, error } = await this.db
      .from("tracked_products")
      .select("*")
      .order("created_at", { ascending: true });
    throwIf(error);
    return Promise.all((data || []).map((row) => this.enrich(row)));
  }

  async getTracked(id) {
    const { data, error } = await this.db
      .from("tracked_products")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    throwIf(error);
    return this.enrich(data);
  }

  async findByProductId(productId) {
    const { data, error } = await this.db
      .from("tracked_products")
      .select("*")
      .eq("product_id", String(productId))
      .maybeSingle();
    throwIf(error);
    return this.enrich(data);
  }

  async addTracked(input) {
    const existing = await this.findByProductId(input.product_id);
    if (existing) return existing;
    const { data, error } = await this.db
      .from("tracked_products")
      .insert({
        product_id: String(input.product_id),
        product_name: input.product_name,
        product_url: input.product_url,
        brand: input.brand || null,
        category: input.category || null,
        sku: input.sku || null,
        tracking_enabled: true,
      })
      .select()
      .single();
    throwIf(error);
    return this.enrich(data);
  }

  async setTracking(id, enabled) {
    const { data, error } = await this.db
      .from("tracked_products")
      .update({ tracking_enabled: enabled, updated_at: nowIso() })
      .eq("id", id)
      .select()
      .maybeSingle();
    throwIf(error);
    return this.enrich(data);
  }

  async insertHistory(trackedProductId, quote) {
    const previous = (await this.latestHistory(trackedProductId, 1))[0];
    const restocked = Boolean(
      previous && Number(previous.stock) === 0 && quote.stock > 0
    );
    const row = {
      tracked_product_id: trackedProductId,
      price: quote.price,
      stock: quote.stock,
      currency: quote.currency,
      availability:
        quote.availability || (quote.stock > 0 ? "in_stock" : "out_of_stock"),
      stock_label: quote.stock_label || null,
      seller: quote.seller || null,
      delivery: quote.delivery || null,
      discount_pct: quote.discount_pct ?? null,
      rating_label: quote.rating_label || null,
      pending: Boolean(quote.pending),
      restocked,
      price_delta:
        previous && previous.price != null
          ? Number((quote.price - Number(previous.price)).toFixed(2))
          : 0,
      scraped_at: nowIso(),
    };
    const { data, error } = await this.db
      .from("price_history")
      .insert(row)
      .select()
      .single();
    throwIf(error);
    return data;
  }

  async insertLog(entry) {
    const { data, error } = await this.db
      .from("scrape_logs")
      .insert({
        tracked_product_id: entry.tracked_product_id,
        started_at: entry.started_at,
        completed_at: entry.completed_at || nowIso(),
        status: entry.status,
        attempt: entry.attempt,
        price: entry.price ?? null,
        stock: entry.stock ?? null,
        error_message: entry.error_message ?? null,
        duration_ms: entry.duration_ms,
      })
      .select()
      .single();
    throwIf(error);
    return data;
  }

  async history(trackedProductId) {
    const { data, error } = await this.db
      .from("price_history")
      .select("*")
      .eq("tracked_product_id", trackedProductId)
      .order("scraped_at", { ascending: true });
    throwIf(error);
    return data || [];
  }

  async logs(trackedProductId) {
    const { data, error } = await this.db
      .from("scrape_logs")
      .select("*")
      .eq("tracked_product_id", trackedProductId)
      .order("started_at", { ascending: false });
    throwIf(error);
    return data || [];
  }

  async getSchedule() {
    const { data, error } = await this.db
      .from("scrape_schedule")
      .select("*")
      .eq("id", "default")
      .maybeSingle();
    throwIf(error);
    return (
      data || {
        last_run_at: null,
        next_run_at: null,
        last_status: null,
      }
    );
  }

  async setSchedule(patch) {
    const current = await this.getSchedule();
    const next = { ...current, ...patch, id: "default" };
    const { data, error } = await this.db
      .from("scrape_schedule")
      .upsert(next)
      .select()
      .single();
    throwIf(error);
    return data;
  }
}
