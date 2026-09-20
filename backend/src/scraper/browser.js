import { chromium } from "playwright";
import { config } from "../config.js";

export async function launchBrowser({ headless = config.headless } = {}) {
  return chromium.launch({
    headless,
    args: ["--disable-blink-features=AutomationControlled"],
  });
}

export async function newContext(browser) {
  return browser.newContext({
    viewport: { width: 1365, height: 900 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    locale: "en-IN",
  });
}
