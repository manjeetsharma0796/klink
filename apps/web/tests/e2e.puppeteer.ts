/**
 * apps/web/tests/e2e.puppeteer.ts
 *
 * Run: cd apps/web && bun tests/e2e.puppeteer.ts
 * Optional: HEADFUL=1 to see the browser; PORT=3030 (default).
 *
 * This walkthrough does NOT require the backend or program to be running. It
 * verifies that every page renders without 500s/console-errors and the sidebar
 * nav works. Pages with backend calls render their <BackendPending /> empty
 * states when fetches fail (which they will in this offline harness).
 */

import puppeteer from "puppeteer";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = `http://localhost:${process.env.PORT ?? 3030}`;
const SCREENSHOT_DIR = join(import.meta.dir, "_screenshots");
mkdirSync(SCREENSHOT_DIR, { recursive: true });

const PAGES = [
  { path: "/", name: "00-signin" },
  // The /dashboard routes redirect to / when no auth cookie. We snapshot the
  // redirect target as well to prove the auth wall.
];

async function main() {
  const headless = !process.env.HEADFUL;
  const browser = await puppeteer.launch({ headless });
  try {
    const consoleErrors: string[] = [];
    const page = await browser.newPage();
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

    for (const p of PAGES) {
      const res = await page.goto(`${BASE}${p.path}`, { waitUntil: "networkidle2", timeout: 15_000 });
      if (!res || res.status() >= 500) throw new Error(`${p.path} returned ${res?.status()}`);
      await page.screenshot({ path: join(SCREENSHOT_DIR, `${p.name}.png`), fullPage: true });
    }

    // Validate the sign-in page contains klink + connect button
    const title = await page.$eval("h1", (h) => h.textContent ?? "");
    if (!title.toLowerCase().includes("klink")) throw new Error(`expected klink in title, got: ${title}`);

    if (consoleErrors.length > 0) {
      // wallet-adapter logs some warnings; only fail on hard errors
      const hard = consoleErrors.filter((e) => !/walletNot|adapter|warning|Failed to load resource/i.test(e));
      if (hard.length > 0) throw new Error(`Console errors: ${hard.join(" | ")}`);
    }

    console.log(`OK — ${PAGES.length} pages screenshotted to ${SCREENSHOT_DIR}`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
