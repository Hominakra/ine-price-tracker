import { config } from "../config.js";

let cache = { items: [], loadedAt: 0 };
const TTL_MS = 15 * 60 * 1000;

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Store request failed (${res.status}) for ${url}`);
  return res.json();
}

export async function loadCatalog(force = false) {
  if (!force && cache.items.length && Date.now() - cache.loadedAt < TTL_MS) {
    return cache.items;
  }

  const pageSize = 100;
  const first = await fetchJson(
    `${config.storeUrl}/api/catalog?page=1&pageSize=${pageSize}`
  );
  const items = [...(first.items || [])];
  const pages = Number(first.pages || 1);
  for (let page = 2; page <= pages; page += 1) {
    const data = await fetchJson(
      `${config.storeUrl}/api/catalog?page=${page}&pageSize=${pageSize}`
    );
    items.push(...(data.items || []));
  }

  const unique = new Map();
  for (const item of items) unique.set(String(item.id), item);
  cache = { items: [...unique.values()], loadedAt: Date.now() };
  return cache.items;
}

export function productUrl(productId) {
  return `${config.storeUrl}/product/${productId}`;
}

export async function searchProducts(query) {
  const q = String(query || "").trim().toLowerCase();
  const items = await loadCatalog();
  if (!q) return items.slice(0, 40);
  return items
    .filter((item) => {
      const haystack = [item.name, item.brand, item.sku, item.category, item.slug]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    })
    .slice(0, 40)
    .map((item) => ({
      ...item,
      product_url: productUrl(item.id),
    }));
}

export async function getProduct(productId) {
  const res = await fetchJson(`${config.storeUrl}/api/product/${productId}`);
  return { ...res, product_url: productUrl(res.id) };
}
