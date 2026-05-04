/**
 * T-236 — Smoke test for the Dodo webhook signature path.
 *
 * Crafts a Standard Webhooks-signed POST against the local /v1/webhooks/dodo
 * route using the real DODO_WEBHOOK_SECRET, then asserts the response is
 * `200 { status: "unknown_session" }` (since the synthetic session_id won't
 * match any row in dodo_payments). A 401 means the running server is still
 * on the pre-T-236 signature scheme and didn't pick up the hot-reload.
 *
 * Run:
 *   bun apps/api/scripts/dodo-webhook-smoke.ts
 *
 * Prereqs:
 *   - apps/api running on http://localhost:3000
 *   - DODO_WEBHOOK_SECRET set in env (already in apps/api/.env)
 */
import { Buffer } from "node:buffer";
import { createHmac } from "node:crypto";
import { config as loadDotenv } from "dotenv";

loadDotenv({ path: new URL("../.env", import.meta.url).pathname.replace(/^\//, "") });

const SECRET = process.env.DODO_WEBHOOK_SECRET;
if (!SECRET) {
  console.error("DODO_WEBHOOK_SECRET not set in apps/api/.env");
  process.exit(2);
}

function decodeSecret(secret: string): Buffer {
  const stripped = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  return Buffer.from(stripped, "base64");
}

function signStandardWebhook(opts: {
  id: string;
  ts: string;
  body: Buffer;
  secret: string;
}): string {
  const key = decodeSecret(opts.secret);
  const payload = Buffer.concat([
    Buffer.from(opts.id, "utf8"),
    Buffer.from(".", "utf8"),
    Buffer.from(opts.ts, "utf8"),
    Buffer.from(".", "utf8"),
    opts.body,
  ]);
  return `v1,${createHmac("sha256", key).update(payload).digest("base64")}`;
}

async function main() {
  const url = process.env.WEBHOOK_URL || "http://localhost:3000/v1/webhooks/dodo";
  const id = `msg_smoke_${Date.now().toString(36)}`;
  const ts = String(Math.floor(Date.now() / 1000));
  const body = Buffer.from(
    JSON.stringify({
      type: "payment.succeeded",
      data: {
        id: `sess_smoke_${Date.now().toString(36)}`,
        status: "paid",
        amount: 1000,
        currency: "USD",
      },
    }),
    "utf8",
  );

  // ---- Test 1: correctly-signed request --------------------------------------
  const goodSig = signStandardWebhook({ id, ts, body, secret: SECRET! });
  const goodResp = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "webhook-id": id,
      "webhook-timestamp": ts,
      "webhook-signature": goodSig,
    },
    body,
  });
  const goodText = await goodResp.text();
  console.log(`[good-sig] ${goodResp.status}  ${goodText}`);
  const goodOk = goodResp.status === 200 && goodText.includes("unknown_session");

  // ---- Test 2: tampered body should 401 --------------------------------------
  const tamperedBody = Buffer.from(
    body.toString("utf8").replace('"amount":1000', '"amount":9999'),
    "utf8",
  );
  const tamperResp = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "webhook-id": id,
      "webhook-timestamp": ts,
      "webhook-signature": goodSig,
    },
    body: tamperedBody,
  });
  const tamperText = await tamperResp.text();
  console.log(`[tampered] ${tamperResp.status}  ${tamperText}`);
  const tamperOk = tamperResp.status === 401;

  // ---- Test 3: wrong-secret signature should 401 -----------------------------
  const wrongSig = signStandardWebhook({
    id,
    ts,
    body,
    secret: "whsec_d3JvbmdfaGV5XzEyMzQ1Njc4OTAxMjM0NQ==",
  });
  const wrongResp = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "webhook-id": id,
      "webhook-timestamp": ts,
      "webhook-signature": wrongSig,
    },
    body,
  });
  const wrongText = await wrongResp.text();
  console.log(`[wrong-secret] ${wrongResp.status}  ${wrongText}`);
  const wrongOk = wrongResp.status === 401;

  // ---- Test 4: stale timestamp (>300s) should 401 ----------------------------
  const staleTs = String(Math.floor(Date.now() / 1000) - 600);
  const staleSig = signStandardWebhook({ id, ts: staleTs, body, secret: SECRET! });
  const staleResp = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "webhook-id": id,
      "webhook-timestamp": staleTs,
      "webhook-signature": staleSig,
    },
    body,
  });
  const staleText = await staleResp.text();
  console.log(`[stale-ts ] ${staleResp.status}  ${staleText}`);
  const staleOk = staleResp.status === 401;

  // ---- Test 5: legacy x-dodo-signature only — must 401 (proves we no longer accept it)
  const legacyResp = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-dodo-signature": createHmac("sha256", SECRET!).update(body).digest("hex"),
    },
    body,
  });
  const legacyText = await legacyResp.text();
  console.log(`[legacy   ] ${legacyResp.status}  ${legacyText}`);
  const legacyOk = legacyResp.status === 401;

  console.log("\n=== Summary ===");
  console.log(`good-sig (200 + unknown_session): ${goodOk ? "PASS" : "FAIL"}`);
  console.log(`tampered (401):                   ${tamperOk ? "PASS" : "FAIL"}`);
  console.log(`wrong-secret (401):               ${wrongOk ? "PASS" : "FAIL"}`);
  console.log(`stale-timestamp (401):            ${staleOk ? "PASS" : "FAIL"}`);
  console.log(`legacy x-dodo-signature (401):    ${legacyOk ? "PASS" : "FAIL"}`);

  if (!(goodOk && tamperOk && wrongOk && staleOk && legacyOk)) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("smoke test crashed:", err);
  process.exit(2);
});
