function nowIso() {
  return new Date().toISOString();
}

export function withLatest(product, historyDesc) {
  const last = historyDesc[0] || null;
  const previous = historyDesc[1] || null;
  const restocked = Boolean(
    previous && Number(previous.stock) === 0 && last && Number(last.stock) > 0
  );
  const priceDelta =
    last && previous && previous.price != null && last.price != null
      ? Number((Number(last.price) - Number(previous.price)).toFixed(2))
      : Number(last?.price_delta || 0);
  return {
    ...product,
    last_price: last?.price != null ? Number(last.price) : null,
    last_stock: last?.stock != null ? Number(last.stock) : null,
    last_currency: last?.currency ?? null,
    last_scraped_at: last?.scraped_at ?? null,
    last_availability:
      last?.availability ??
      (last ? (Number(last.stock) > 0 ? "in_stock" : "out_of_stock") : null),
    last_stock_label: last?.stock_label ?? null,
    last_seller: last?.seller ?? null,
    last_delivery: last?.delivery ?? null,
    last_discount_pct:
      last?.discount_pct != null ? Number(last.discount_pct) : null,
    restocked: last?.restocked || restocked,
    price_delta: priceDelta,
    price_dropped: priceDelta < 0,
  };
}

export { nowIso };
