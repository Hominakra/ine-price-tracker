const FULLWIDTH_ZERO = 65296;

function decodeFullwidthDigits(text) {
  return [...text]
    .map((ch) => {
      const code = ch.codePointAt(0);
      if (code >= FULLWIDTH_ZERO && code <= FULLWIDTH_ZERO + 9) {
        return String(code - FULLWIDTH_ZERO);
      }
      return ch;
    })
    .join("");
}

export function parsePrice(raw) {
  if (!raw) return null;
  const cleaned = decodeFullwidthDigits(raw)
    .replace(/[\u200b\u200c\u200d\ufeff]/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/Rs\.?/gi, "")
    .replace(/[₹$€]/g, "")
    .replace(/\/-.*/g, "")
    .replace(/\(incl[^)]*\)/gi, "")
    .replace(/incl\.? of all taxes/gi, "")
    .replace(/,/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const match = cleaned.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function parseCurrency(raw) {
  if (!raw) return "INR";
  if (/₹|Rs\.?/i.test(raw)) return "INR";
  if (/\$/.test(raw)) return "USD";
  if (/€/.test(raw)) return "EUR";
  return "INR";
}

export function parseStock(raw) {
  if (!raw) return null;
  const text = raw.replace(/[\u200b\u00a0]/g, " ").trim();
  if (/out of stock/i.test(text)) return 0;
  const match = text.match(/(\d+)\s*(?:left|in stock)/i) || text.match(/(\d+)/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isInteger(value) && value >= 0 ? value : null;
}

export function validateQuote({ price, stock }) {
  if (price == null || !Number.isFinite(price) || price <= 0) {
    throw new Error("Invalid price extracted");
  }
  if (stock == null || !Number.isInteger(stock) || stock < 0) {
    throw new Error("Invalid stock extracted");
  }
}

async function dismissCookies(page) {
  const overlay = page.locator(".cookie-overlay");
  const accept = page.getByRole("button", { name: /accept cookies/i });
  try {
    if (await overlay.isVisible({ timeout: 4000 })) {
      await accept.click({ timeout: 5000 });
    }
  } catch {
    // overlay may already be gone
  }
  await page.evaluate(() => {
    document.querySelector(".cookie-overlay")?.remove();
  }).catch(() => undefined);
}

async function hoverPriceArea(page) {
  const block = page.locator(".price-block").first();
  await block.waitFor({ state: "visible", timeout: 20_000 });
  const box = await block.boundingBox();
  if (!box) throw new Error("Price block has no bounding box");
  const startX = box.x + Math.min(24, box.width / 4);
  const startY = box.y + Math.min(18, box.height / 3);
  await page.mouse.move(startX, startY);
  for (let i = 0; i < 14; i += 1) {
    await page.mouse.move(startX + i * 8, startY + ((i % 4) - 1.5) * 5, {
      steps: 2,
    });
    await page.waitForTimeout(55);
  }
  await page.waitForTimeout(700);
}

async function clickReveal(page) {
  const reveal = page.getByRole("button", { name: /reveal price|try again/i });
  if (await reveal.count()) {
    const first = reveal.first();
    if (await first.isEnabled()) {
      await first.click({ timeout: 8_000, force: true });
      return;
    }
  }
  await page.locator(".price-block").first().click({ timeout: 5_000, force: true });
}

async function waitForQuote(page) {
  const deadline = Date.now() + 55_000;
  while (Date.now() < deadline) {
    const success = page.locator(".price-block.price-success");
    if (await success.count()) {
      const priceText = (
        await success
          .locator(".price-main, .pv-q9, [class*='pv-'], b, span")
          .first()
          .innerText()
          .catch(() => success.innerText())
      ).trim();
      const stockText = (
        await page
          .locator(".stock-badge")
          .first()
          .innerText()
          .catch(() => "")
      ).trim();
      const blockText = await success.innerText();
      const details = await page.evaluate(() => {
        const block = document.querySelector(".price-block.price-success");
        const text = block?.innerText || "";
        const stockText =
          document.querySelector(".stock-badge")?.innerText || "";
        const clean = (value) =>
          (value || "").replace(/[\u200b\u200c\u200d\ufeff]/g, "").trim() || null;
        const delivery = clean((text.match(/Get it by\s+([^\n]+)/i) || [])[1]);
        const seller = clean((text.match(/Sold by\s+([^\n]+)/i) || [])[1]);
        const discount = (text.match(/(\d+)%\s*off/i) || [])[1] || null;
        const rating = (text.match(/([\d.]+k?)\s+ratings/i) || [])[1] || null;
        const pending = /updating/i.test(text);
        return { text, stockText, delivery, seller, discount, rating, pending };
      });
      const price = parsePrice(priceText) ?? parsePrice(details.text || blockText);
      const stock = parseStock(details.stockText || stockText) ?? parseStock(details.text || blockText);
      const currency = parseCurrency(`${priceText}\n${details.text || blockText}`);
      validateQuote({ price, stock });
      const availability = stock > 0 ? "in_stock" : "out_of_stock";
      return {
        price,
        stock,
        currency,
        availability,
        stock_label:
          stock > 0 ? `${stock} in stock` : "Out of stock",
        seller: details.seller,
        delivery: details.delivery,
        discount_pct: details.discount ? Number(details.discount) : null,
        rating_label: details.rating,
        pending: Boolean(details.pending),
        raw: details.text || blockText,
      };
    }

    const error = page.locator(".price-block.price-error");
    if (await error.count()) {
      const message = (await error.innerText()).replace(/\s+/g, " ").trim();
      throw new Error(message || "Storefront reported a price load error");
    }

    const idle = page.locator(".price-block.price-idle");
    const loading = page.locator(".price-block[aria-busy='true']");
    if (await idle.count()) {
      await hoverPriceArea(page);
      await clickReveal(page).catch(() => undefined);
    } else if (!(await loading.count())) {
      await clickReveal(page).catch(() => undefined);
    }
    await page.waitForTimeout(900);
  }
  throw new Error("Timed out waiting for price and stock");
}

export async function scrapeProductPage(context, productUrl) {
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  try {
    await page.goto(productUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await dismissCookies(page);
    await page.locator(".price-block").first().waitFor({ timeout: 20_000 });
    await dismissCookies(page);
    await hoverPriceArea(page);
    await clickReveal(page);
    return await waitForQuote(page);
  } finally {
    await page.close().catch(() => undefined);
  }
}
