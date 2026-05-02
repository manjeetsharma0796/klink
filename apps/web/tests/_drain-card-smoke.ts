/**
 * One-off smoke harness for the T-235 emergency-drain card.
 *
 * Runs against the LIVE local dev stack (web on 3030, api on 3000) instead
 * of the mock api the broader e2e harness boots. Mints a JWT against the
 * web's real JWT_SECRET so the dashboard layout's verifyKlinkJwt() passes,
 * then asserts the Danger zone card is in the rendered settings page.
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { SignJWT } from "jose";
import puppeteer from "puppeteer";

const WEB_PORT = Number(process.env.PORT ?? 3030);
const BASE = `http://localhost:${WEB_PORT}`;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET env var is required (must match apps/web/.env.local)");

const FAKE_PUBKEY = process.env.OWNER_PUBKEY ?? "6fELFcucWR7CPrBrRmfAs8tNjvt5dUnQDk3cguAtdrjZ";
const SCREENSHOT_DIR = join(import.meta.dir, "_screenshots");
mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function mintJwt(): Promise<string> {
  return await new SignJWT({ pubkey: FAKE_PUBKEY })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("00000000-0000-0000-0000-000000000000")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(JWT_SECRET));
}

async function main() {
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setCookie({
      name: "klink_session",
      value: await mintJwt(),
      domain: "localhost",
      httpOnly: true,
      path: "/",
    });
    const res = await page.goto(`${BASE}/dashboard/settings`, {
      waitUntil: "domcontentloaded",
      timeout: 20_000,
    });
    if (!res) throw new Error("no response from /dashboard/settings");

    // First diagnostic — hit the same /api/v1/wallet endpoint the page uses,
    // surface the status so we can tell loading-stuck-on-API apart from
    // page-failed-to-render-card.
    const apiProbe = await page.evaluate(async () => {
      const r = await fetch("/api/v1/wallet", { credentials: "include" });
      const text = await r.text();
      return { status: r.status, body: text.slice(0, 200) };
    });
    console.log(`  /api/v1/wallet → ${apiProbe.status}: ${apiProbe.body}`);

    // Wait for either the Danger zone card to render OR the "No wallet yet"
    // message — both are valid terminal states (the test only needs the
    // former; the latter signals a config issue we should report explicitly).
    const settled = await page.waitForFunction(
      () => {
        const t = document.body.textContent ?? "";
        return (
          t.includes("Danger zone") ||
          t.includes("Drain to recipient") ||
          t.includes("No wallet yet")
        );
      },
      { timeout: 25_000 },
    ).catch((e: Error) => ({ timeout: e.message }));

    const finalUrl = page.url();
    const html = await page.content();
    await page.screenshot({
      path: join(SCREENSHOT_DIR, "T-235-settings-drain-card.png"),
      fullPage: true,
    });

    if (finalUrl.endsWith("/")) {
      throw new Error(
        `Auth bounced us to "/" — JWT_SECRET likely doesn't match what the dashboard verifies with. Got url=${finalUrl}`,
      );
    }
    if (settled && typeof settled === "object" && "timeout" in settled) {
      throw new Error(`page never reached a terminal state: ${settled.timeout}`);
    }
    if (html.includes("No wallet yet")) {
      throw new Error(
        "settings page rendered but with 'No wallet yet' — /api/v1/wallet returned no row for this owner pubkey. " +
          "Set OWNER_PUBKEY to an account that has a wallet, or POST /v1/wallet first.",
      );
    }

    const checks = [
      ["Danger zone — emergency drain card heading", /Danger zone — emergency drain/],
      ["Recipient pubkey label", /Recipient pubkey/],
      ["Amount \\(USDC\\) label", /Amount \(USDC\)/],
      ["Drain to recipient button", /Drain to recipient/],
    ] as const;

    let anyMissing = false;
    for (const [name, pat] of checks) {
      const ok = pat.test(html);
      console.log(`  [${ok ? "OK" : "MISS"}] ${name}`);
      if (!ok) anyMissing = true;
    }
    if (anyMissing) {
      throw new Error("one or more T-235 elements were missing from the rendered settings page");
    }

    console.log(`OK — settings page rendered with the T-235 drain card. Screenshot: ${SCREENSHOT_DIR}/T-235-settings-drain-card.png`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
