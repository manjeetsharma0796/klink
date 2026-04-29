import express, { type Express } from "express";
import { requireApiKey } from "./auth/api-key";
import { requireDashboardJwt } from "./auth/jwt";
import { siwsHandlers } from "./auth/siws";
import { getAuditHandler } from "./routes/audit";
import { postDodoCheckoutHandler, postDodoWebhookHandler } from "./routes/dodo";
import { getFundDepositAddressHandler } from "./routes/fund";
import {
  deleteSessionHandler,
  patchSessionAllowlistHandler,
  postSessionHandler,
} from "./routes/session";
import {
  postSpendServiceHandler,
  postSpendSignPaymentHandler,
  postSpendTransferHandler,
} from "./routes/spend";
import { postWalletHandler } from "./routes/wallet";
import {
  getYieldPositionHandler,
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

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  // SIWS auth (T-203)
  app.post("/v1/auth/siws/nonce", siwsHandlers.nonce);
  app.post("/v1/auth/siws", siwsHandlers.siws);

  // Wallet (T-205): build init_vault tx for owner Phantom to sign + submit.
  app.post("/v1/wallet", requireDashboardJwt, postWalletHandler);

  // Session (T-206 + T-207): build add_session / revoke_session /
  // update_session_allowlist txs. Owner-authenticated.
  app.post("/v1/session", requireDashboardJwt, postSessionHandler);
  app.delete("/v1/session/:id", requireDashboardJwt, deleteSessionHandler);
  app.patch("/v1/session/:id/allowlist", requireDashboardJwt, patchSessionAllowlistHandler);

  // Spend (T-210/T-211/T-212): API-key-authenticated. Backend signs with the
  // session keypair (decrypted from DB) and submits.
  app.post("/v1/spend/transfer", requireApiKey, postSpendTransferHandler);
  app.post("/v1/spend/sign-payment", requireApiKey, postSpendSignPaymentHandler);
  app.post("/v1/spend/service", requireApiKey, postSpendServiceHandler);

  // Yield (T-213): kamino_deposit / kamino_withdraw via session signer + read.
  app.post("/v1/yield/deposit", requireApiKey, postYieldDepositHandler);
  app.post("/v1/yield/withdraw", requireApiKey, postYieldWithdrawHandler);
  app.get("/v1/yield/position", requireApiKey, getYieldPositionHandler);

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
