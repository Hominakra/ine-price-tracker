import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./services/api.js";

function money(price, currency = "INR") {
  if (price == null) return "—";
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(price);
  } catch {
    return `${currency} ${price}`;
  }
}

function statusClass(status) {
  if (status === "SUCCESS" || status === "in_stock") return "ok";
  if (status === "RETRIED" || status === "PARTIAL") return "retry";
  return "fail";
}

function when(value) {
  if (!value) return "not yet";
  return new Date(value).toLocaleString();
}

function availabilityLabel(item) {
  if (item.last_stock == null) return "Not checked yet";
  if (item.last_availability === "out_of_stock" || item.last_stock === 0) {
    return "Out of stock";
  }
  return item.last_stock_label || `${item.last_stock} in stock`;
}

export default function App() {
  const [query, setQuery] = useState("Ironwood");
  const [results, setResults] = useState([]);
  const [tracked, setTracked] = useState([]);
  const [schedule, setSchedule] = useState(null);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const selectedIdRef = useRef(null);

  async function refreshTracked(id) {
    const [rows, sched] = await Promise.all([api.tracked(), api.schedule()]);
    setTracked(rows);
    setSchedule(sched);
    const keep = id || selectedIdRef.current;
    if (keep) {
      const detail = await api.detail(keep);
      selectedIdRef.current = detail.id;
      setSelected(detail);
    } else if (rows[0]) {
      const detail = await api.detail(rows[0].id);
      selectedIdRef.current = detail.id;
      setSelected(detail);
    }
  }

  useEffect(() => {
    refreshTracked().catch((err) => setError(err.message));
    const timer = setInterval(() => {
      refreshTracked().catch(() => undefined);
    }, 20_000);
    return () => clearInterval(timer);
  }, []);

  async function onSearch(event) {
    event.preventDefault();
    setBusy("search");
    setError("");
    try {
      const data = await api.search(query);
      setResults(data.items);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function onTrack(productId) {
    setBusy(`track-${productId}`);
    setError("");
    setNotice("Tracking and fetching the current store price…");
    try {
      const row = await api.track(productId);
      await api.scrape(row.product_id);
      await refreshTracked(row.id);
      setNotice("Price and availability saved from the live store.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function onScrape(product) {
    setBusy(`scrape-${product.id}`);
    setError("");
    setNotice("Checking the live storefront…");
    try {
      await api.scrape(product.product_id);
      await refreshTracked(product.id);
      setNotice("Dashboard updated from the website.");
    } catch (err) {
      setError(err.message);
      try {
        await refreshTracked(product.id);
      } catch {
        // keep existing selection
      }
    } finally {
      setBusy("");
    }
  }

  async function onScrapeAll() {
    setBusy("all");
    setError("");
    setNotice("Refreshing every tracked product from the store…");
    try {
      await api.scrapeAll();
      await refreshTracked(selected?.id);
      setNotice("All tracked prices were refreshed from the website.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  const history = selected?.history || [];
  const logs = selected?.logs || [];
  const trackedIds = useMemo(
    () => new Set(tracked.map((row) => String(row.product_id))),
    [tracked]
  );

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1 className="brand">INE Product Price Tracker</h1>
          <p className="muted">
            Live prices are scraped from the mock store every 2 hours. The dashboard
            refreshes automatically when a check finishes.
          </p>
        </div>
        <div className="schedule">
          <div>Last store check: {when(schedule?.last_run_at)}</div>
          <div>Next store check: {when(schedule?.next_run_at)}</div>
          <button onClick={onScrapeAll} disabled={Boolean(busy)}>
            {busy === "all" ? "Refreshing…" : "Refresh all now"}
          </button>
        </div>
      </header>

      <form className="search-row" onSubmit={onSearch}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by partial or full product name, brand, or SKU"
        />
        <button type="submit" disabled={busy === "search"}>
          {busy === "search" ? "Searching…" : "Search"}
        </button>
      </form>

      {error ? <div className="error">{error}</div> : null}
      {notice ? <div className="notice">{notice}</div> : null}

      <div className="grid">
        {results.map((item) => (
          <article className="card" key={item.id}>
            <div className="meta">{item.category} · {item.brand}</div>
            <h3>{item.name}</h3>
            <div className="meta">{item.sku}</div>
            <button
              onClick={() => onTrack(item.id)}
              disabled={busy.startsWith("track") || trackedIds.has(String(item.id))}
            >
              {trackedIds.has(String(item.id)) ? "Tracking" : "Track"}
            </button>
          </article>
        ))}
      </div>

      <h2>Tracked products</h2>
      <div className="grid">
        {tracked.map((item) => (
          <article
            className={`card ${selected?.id === item.id ? "selected" : ""}`}
            key={item.id}
          >
            <h3>{item.product_name}</h3>
            <div className="price">{money(item.last_price, item.last_currency)}</div>
            <div className={`meta ${item.last_stock === 0 ? "fail" : "ok"}`}>
              {availabilityLabel(item)}
            </div>
            {item.restocked ? <div className="badge">Back in stock</div> : null}
            {item.price_dropped ? (
              <div className="badge">Price dropped {money(Math.abs(item.price_delta), item.last_currency)}</div>
            ) : null}
            {item.last_delivery ? <div className="meta">Get it by {item.last_delivery}</div> : null}
            {item.last_seller ? <div className="meta">Sold by {item.last_seller}</div> : null}
            <div className="meta">Checked {when(item.last_scraped_at)}</div>
            <div className="toolbar">
              <button className="secondary" onClick={() => {
                selectedIdRef.current = item.id;
                api.detail(item.id).then(setSelected);
              }}>
                History
              </button>
              <button onClick={() => onScrape(item)} disabled={Boolean(busy)}>
                {busy === `scrape-${item.id}` ? "Scraping…" : "Update from store"}
              </button>
            </div>
          </article>
        ))}
      </div>

      {selected ? (
        <div className="layout">
          <section className="panel">
            <h2>{selected.product_name}</h2>
            <p className="muted">
              {selected.brand} · {selected.sku}
            </p>
            <div className="facts">
              <div>
                <span className="meta">Current price</span>
                <strong>{money(selected.last_price, selected.last_currency)}</strong>
              </div>
              <div>
                <span className="meta">Availability</span>
                <strong className={selected.last_stock === 0 ? "fail" : "ok"}>
                  {availabilityLabel(selected)}
                </strong>
              </div>
              <div>
                <span className="meta">Restock / delivery</span>
                <strong>
                  {selected.restocked
                    ? "Just restocked"
                    : selected.last_stock === 0
                      ? "Waiting for restock"
                      : selected.last_delivery || "In stock now"}
                </strong>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Price</th>
                  <th>Availability</th>
                  <th>Change</th>
                </tr>
              </thead>
              <tbody>
                {[...history].reverse().map((row) => (
                  <tr key={row.id}>
                    <td>{new Date(row.scraped_at).toLocaleString()}</td>
                    <td>{money(row.price, row.currency)}</td>
                    <td>
                      {row.availability === "out_of_stock" || row.stock === 0
                        ? "Out of stock"
                        : row.stock_label || `${row.stock} in stock`}
                      {row.delivery ? ` · ${row.delivery}` : ""}
                    </td>
                    <td>
                      {row.restocked
                        ? "Restocked"
                        : row.price_delta < 0
                          ? `Dropped ${money(Math.abs(row.price_delta), row.currency)}`
                          : row.price_delta > 0
                            ? `Up ${money(row.price_delta, row.currency)}`
                            : "No change"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="panel">
            <h2>Scrape log</h2>
            <table>
              <thead>
                <tr>
                  <th>Attempt</th>
                  <th>Status</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((row) => (
                  <tr key={row.id}>
                    <td>#{row.attempt}</td>
                    <td className={statusClass(row.status)}>{row.status}</td>
                    <td>
                      {row.status === "SUCCESS"
                        ? `${money(row.price)} / ${row.stock} · ${row.duration_ms}ms`
                        : `${row.error_message || ""} · ${row.duration_ms}ms`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      ) : null}
    </div>
  );
}
