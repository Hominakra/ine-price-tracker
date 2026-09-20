const API = "/api";

async function request(path, options) {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  search: (q) => request(`/products/search?q=${encodeURIComponent(q)}`),
  tracked: () => request("/tracked-products"),
  schedule: () => request("/schedule"),
  track: (productId) =>
    request("/tracked-products", {
      method: "POST",
      body: JSON.stringify({ product_id: productId }),
    }),
  detail: (id) => request(`/tracked-products/${id}`),
  scrape: (productId) => request(`/scrape/${productId}`, { method: "POST" }),
  scrapeAll: () => request("/scrape/all", { method: "POST" }),
};
