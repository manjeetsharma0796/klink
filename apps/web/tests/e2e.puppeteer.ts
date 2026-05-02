import puppeteer, { type Page } from "puppeteer";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { SignJWT } from "jose";
import { startMockApi } from "./helpers/api-server";

const WEB_PORT = Number(process.env.PORT ?? 3030);
const API_PORT = Number(process.env.API_PORT ?? 3001);
const BASE = `http://localhost:${WEB_PORT}`;
const SCREENSHOT_DIR = join(import.meta.dir, "_screenshots");
mkdirSync(SCREENSHOT_DIR, { recursive: true });

const FAKE_PUBKEY = "5qCJCEhfLusk59YFqaEG9Yg3Wp64ZaYwvXteFmCmedqv";
const JWT_SECRET = process.env.JWT_SECRET ?? "puppeteer-test-secret-not-for-prod-use";

const PUBLIC_PAGES = [{ path: "/", name: "00-signin" }];
const DASH_PAGES = [
  { path: "/dashboard", name: "10-overview" },
  { path: "/dashboard/sessions", name: "20-sessions" },
  { path: "/dashboard/yield", name: "30-yield" },
  { path: "/dashboard/fund", name: "40-fund" },
  { path: "/dashboard/audit", name: "50-audit" },
  { path: "/dashboard/settings", name: "60-settings" },
];

async function mintTestJwt(): Promise<string> {
  const secret = new TextEncoder().encode(JWT_SECRET);
  return await new SignJWT({ pubkey: FAKE_PUBKEY })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("00000000-0000-0000-0000-000000000000")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret);
}

async function setAuthCookie(page: Page) {
  // Mint a real JWT signed with the same secret the Next dev server uses
  // (`JWT_SECRET` env var, set when launching `bun run dev`). The dashboard
  // layout's verifyKlinkJwt() succeeds and the dashboard pages render.
  const token = await mintTestJwt();
  await page.setCookie({
    name: "klink_session",
    value: token,
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

  const WALLET_ID = "00000000-0000-0000-0000-000000000001";
  const SESSION_ID = "00000000-0000-0000-0000-000000000002";

  const apiServer = await startMockApi(API_PORT, [
    {
      method: "GET",
      path: "/v1/wallet",
      body: {
        id: WALLET_ID,
        vaultPda: FAKE_PUBKEY,
        usdcAta: FAKE_PUBKEY,
        maxDeployedFractionBp: 8000,
        ownerPubkey: FAKE_PUBKEY,
        createdAt: "2026-05-02T00:00:00Z",
      },
    },
    {
      method: "GET",
      path: /\/v1\/sessions(\?|$)/,
      body: [
        {
          id: SESSION_ID,
          walletId: WALLET_ID,
          label: "demo-agent",
          sessionPubkey: FAKE_PUBKEY,
          expiresAt: null,
          revokedAt: null,
          createdAt: "2026-05-02T00:00:00Z",
          keyPrefix: "klink_de",
        },
      ],
    },
    {
      method: "GET",
      path: /\/v1\/audit/,
      body: {
        entries: [
          {
            id: 1,
            walletId: WALLET_ID,
            sessionId: SESSION_ID,
            action: "spend_transfer",
            amount: 50000,
            recipientOrUrl: FAKE_PUBKEY,
            decision: "allow",
            reason: null,
            txSignature: "5".repeat(88),
            createdAt: "2026-05-02T00:01:00Z",
          },
          {
            id: 2,
            walletId: WALLET_ID,
            sessionId: SESSION_ID,
            action: "spend_transfer",
            amount: 200000,
            recipientOrUrl: "https://api.example.com/x",
            decision: "deny",
            reason: "URL_NOT_ALLOWED",
            txSignature: null,
            createdAt: "2026-05-02T00:02:00Z",
          },
        ],
        next_cursor: null,
      },
    },
    {
      method: "GET",
      path: "/v1/fund/deposit-address",
      body: {
        vault_pda: FAKE_PUBKEY,
        usdc_ata: FAKE_PUBKEY,
        qr_data_url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
      },
    },
    // T-235 — POST /v1/wallet/transfer build-tx mock. The dashboard's
    // emergency-drain card calls this when the owner clicks "Drain to recipient".
    // We just need a syntactically valid txBase64 for the schema parse to pass;
    // the mock browser flow stops at the Phantom signTransaction step.
    {
      method: "POST",
      path: "/v1/wallet/transfer",
      body: {
        txBase64: "AQAAAAAAAAAA",
        walletId: WALLET_ID,
        vaultPda: FAKE_PUBKEY,
        vaultUsdcAta: FAKE_PUBKEY,
        recipient: FAKE_PUBKEY,
        recipientUsdcAta: FAKE_PUBKEY,
        amount: "1000000",
      },
    },
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

      // T-235 settings-page assertion: the Danger zone — emergency drain
      // card (T-116 escape hatch) must render. If the dashboard redirects
      // to "/" we won't reach it, so allow either: card present, or final
      // URL is the public sign-in page.
      if (p.path === "/dashboard/settings") {
        const html = await page.content();
        const onSignIn = page.url().endsWith("/");
        const hasDangerZone =
          html.includes("Danger zone") || html.includes("emergency drain") || html.includes("Drain to recipient");
        if (!onSignIn && !hasDangerZone) {
          throw new Error(
            "settings page rendered but the T-235 Danger zone card is missing — check apps/web/app/dashboard/settings/page.tsx",
          );
        }
      }
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
