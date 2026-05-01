import puppeteer, { type Page } from "puppeteer";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { startMockApi } from "./helpers/api-server";

const WEB_PORT = Number(process.env.PORT ?? 3030);
const API_PORT = Number(process.env.API_PORT ?? 3001);
const BASE = `http://localhost:${WEB_PORT}`;
const SCREENSHOT_DIR = join(import.meta.dir, "_screenshots");
mkdirSync(SCREENSHOT_DIR, { recursive: true });

const FAKE_PUBKEY = "5qCJCEhfLusk59YFqaEG9Yg3Wp64ZaYwvXteFmCmedqv";

const PUBLIC_PAGES = [{ path: "/", name: "00-signin" }];
const DASH_PAGES = [
  { path: "/dashboard", name: "10-overview" },
  { path: "/dashboard/sessions", name: "20-sessions" },
  { path: "/dashboard/yield", name: "30-yield" },
  { path: "/dashboard/fund", name: "40-fund" },
  { path: "/dashboard/audit", name: "50-audit" },
  { path: "/dashboard/settings", name: "60-settings" },
];

async function setAuthCookie(page: Page) {
  // Inject a fake klink session cookie. The dashboard's verifyKlinkJwt() will
  // fail and redirect — we accept this and snapshot the redirect target. To
  // actually reach /dashboard, you'd need the real JWT secret + signed token,
  // which is out of scope for this offline harness.
  await page.setCookie({
    name: "klink_session",
    value: "stub.signed.cookie",
    domain: "localhost",
    httpOnly: true,
    path: "/",
  });
}

async function snapshot(page: Page, name: string) {
  await page.screenshot({ path: join(SCREENSHOT_DIR, `${name}.png`), fullPage: true });
}

async function main() {
  const headless = !process.env.HEADFUL;

  const apiServer = await startMockApi(API_PORT, [
    { method: "GET", path: "/v1/wallet", body: { error: "WALLET_NOT_FOUND" }, status: 404 },
    { method: "GET", path: /\/v1\/sessions(\?|$)/, body: [] },
    { method: "GET", path: /\/v1\/audit/, body: { entries: [], next_cursor: null } },
    { method: "GET", path: "/v1/fund/deposit-address", body: { vault_pda: FAKE_PUBKEY, usdc_ata: FAKE_PUBKEY, qr_data_url: "data:image/png;base64,iVBORw0K" } },
  ]);

  const browser = await puppeteer.launch({ headless });
  try {
    const errors: string[] = [];
    const page = await browser.newPage();
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

    for (const p of PUBLIC_PAGES) {
      const res = await page.goto(`${BASE}${p.path}`, { waitUntil: "networkidle2", timeout: 15_000 });
      if (!res || res.status() >= 500) throw new Error(`${p.path} → ${res?.status()}`);
      await snapshot(page, p.name);
    }

    await setAuthCookie(page);
    for (const p of DASH_PAGES) {
      const res = await page.goto(`${BASE}${p.path}`, { waitUntil: "networkidle2", timeout: 15_000 });
      if (!res) throw new Error(`${p.path} → no response`);
      // Either renders the dashboard (rare with stub cookie) or redirects to /. Both are OK.
      await snapshot(page, p.name);
    }

    const hard = errors.filter((e) => !/walletNot|adapter|warning|Failed to fetch|Failed to load resource/i.test(e));
    if (hard.length > 0) throw new Error(`Console errors: ${hard.join(" | ")}`);

    console.log(`OK — ${PUBLIC_PAGES.length + DASH_PAGES.length} pages screenshotted to ${SCREENSHOT_DIR}`);
  } finally {
    await browser.close();
    await new Promise<void>((r) => apiServer.close(() => r()));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
