import express, { type Express } from "express";
import { requireApiKey } from "./auth/api-key";
import { requireDashboardJwt } from "./auth/jwt";
import { siwsHandlers } from "./auth/siws";
import { getAuditHandler } from "./routes/audit";
import { postDodoCheckoutHandler, postDodoWebhookHandler } from "./routes/dodo";
import { getFundDepositAddressHandler } from "./routes/fund";
import {
  deleteSessionHandler,
  getSessionHandler,
  getSessionsHandler,
  patchSessionAllowlistHandler,
  postRotateSessionKeyHandler,
  postSessionHandler,
} from "./routes/session";
import {
  postSpendServiceHandler,
  postSpendSignPaymentHandler,
  postSpendTransferHandler,
} from "./routes/spend";
import {
  getWalletHandler,
  patchOffChainPolicyHandler,
  postWalletHandler,
  postWalletPolicyHandler,
  postWalletTransferHandler,
} from "./routes/wallet";
import {
  getYieldPositionHandler,
  postOwnerYieldDepositHandler,
  postOwnerYieldWithdrawHandler,
  postYieldDepositHandler,
  postYieldWithdrawHandler,
} from "./routes/yield";

export function createApp(): Express {
  const app = express();
  // Capture raw bytes alongside JSON parsing so the Dodo webhook (T-215) can
  // HMAC-verify the exact payload Dodo signed. Other routes ignore rawBody.
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );

  // Debug request/response logger. Disabled by setting KLINK_DEBUG_HTTP=0.
  if (process.env.KLINK_DEBUG_HTTP !== "0") {
    app.use((req, res, next) => {
      const t0 = Date.now();
      const reqId = Math.random().toString(36).slice(2, 8);
      const bodyPreview =
        req.body && typeof req.body === "object" ? Object.keys(req.body).join(",") : "";
      console.log(
        `[http ${reqId}] → ${req.method} ${req.originalUrl}` +
          (bodyPreview ? ` body{${bodyPreview}}` : ""),
      );

      // Patch res.json so we can preview the response shape being sent.
      const origJson = res.json.bind(res);
      res.json = ((body: unknown) => {
        const shape =
          body && typeof body === "object" ? Object.keys(body as Record<string, unknown>) : [];
        const errStr =
          (body as { error?: unknown })?.error !== undefined
            ? ` error=${JSON.stringify((body as { error: unknown }).error)}`
            : "";
        const user = (req as { user?: { pubkey?: string; id?: string } }).user;
        const userTag = user?.pubkey ? ` user=${user.pubkey.slice(0, 8)}…` : "";
        console.log(
          `[http ${reqId}] ← ${res.statusCode} ${Date.now() - t0}ms` +
            ` keys=[${shape.join(",")}]${errStr}${userTag}`,
        );
        return origJson(body);
      }) as typeof res.json;
      next();
    });
  }

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  // SIWS auth (T-203)
  app.post("/v1/auth/siws/nonce", siwsHandlers.nonce);
  app.post("/v1/auth/siws", siwsHandlers.siws);

  // Wallet (T-205): build init_vault tx for owner Phantom to sign + submit.
  app.post("/v1/wallet", requireDashboardJwt, postWalletHandler);
  // Wallet read (T-224) + on-chain policy build-tx (T-221) + off-chain policy upsert (T-223).
  app.get("/v1/wallet", requireDashboardJwt, getWalletHandler);
  app.post("/v1/wallet/policy", requireDashboardJwt, postWalletPolicyHandler);
  app.patch("/v1/wallet/off-chain-policy", requireDashboardJwt, patchOffChainPolicyHandler);
  // T-235 — owner escape-hatch (T-116 backend wiring): build owner_transfer_usdc
  // tx so the owner can drain USDC out of the vault without a session.
  app.post("/v1/wallet/transfer", requireDashboardJwt, postWalletTransferHandler);

  // Session (T-206 + T-207): build add_session / revoke_session /
  // update_session_allowlist txs. Owner-authenticated.
  app.post("/v1/session", requireDashboardJwt, postSessionHandler);
  app.delete("/v1/session/:id", requireDashboardJwt, deleteSessionHandler);
  app.patch("/v1/session/:id/allowlist", requireDashboardJwt, patchSessionAllowlistHandler);
  // T-230: rotate the bearer for an existing session without touching the
  // on-chain PDA. Old keys are revoked atomically; new plaintext returned once.
  app.post("/v1/session/:id/rotate-key", requireDashboardJwt, postRotateSessionKeyHandler);
  // Session reads (T-218 list + T-219 single+on-chain).
  app.get("/v1/sessions", requireDashboardJwt, getSessionsHandler);
  app.get("/v1/sessions/:id", requireDashboardJwt, getSessionHandler);

  // Spend (T-210/T-211/T-212): API-key-authenticated. Backend signs with the
  // session keypair (decrypted from DB) and submits.
  app.post("/v1/spend/transfer", requireApiKey, postSpendTransferHandler);
  app.post("/v1/spend/sign-payment", requireApiKey, postSpendSignPaymentHandler);
  app.post("/v1/spend/service", requireApiKey, postSpendServiceHandler);

  // Yield (T-213): kamino_deposit / kamino_withdraw via session signer + read.
  app.post("/v1/yield/deposit", requireApiKey, postYieldDepositHandler);
  app.post("/v1/yield/withdraw", requireApiKey, postYieldWithdrawHandler);
  app.get("/v1/yield/position", requireApiKey, getYieldPositionHandler);

  // Yield owner-flow (T-222): build-tx variants for the dashboard so the owner
  // can deposit/withdraw without a session keypair (Option<Session> = None
  // on chain). Auth surface separated from agent paths above.
  app.post("/v1/wallet/yield/deposit", requireDashboardJwt, postOwnerYieldDepositHandler);
  app.post("/v1/wallet/yield/withdraw", requireDashboardJwt, postOwnerYieldWithdrawHandler);

  // Audit (T-216): cursor-paginated read scoped to caller's wallets.
  app.get("/v1/audit", requireDashboardJwt, getAuditHandler);

  // Fund (T-217): vault USDC ATA + QR data-url for off-platform deposits.
  app.get("/v1/fund/deposit-address", requireDashboardJwt, getFundDepositAddressHandler);

  // Dodo fiat-in (T-214 + T-215). Checkout is dashboard-JWT; the webhook is
  // public + HMAC-authed (Dodo can't carry our JWT).
  app.post("/v1/fund/dodo-checkout", requireDashboardJwt, postDodoCheckoutHandler);
  app.post("/v1/webhooks/dodo", postDodoWebhookHandler);

  return app;
}
