import express, { type Express } from "express";
import { requireApiKey } from "./auth/api-key";
import { requireDashboardJwt } from "./auth/jwt";
import { siwsHandlers } from "./auth/siws";
import { getAuditHandler } from "./routes/audit";
import { getFundDepositAddressHandler } from "./routes/fund";
import {
  deleteSessionHandler,
  patchSessionAllowlistHandler,
  postSessionHandler,
} from "./routes/session";
import { postSpendTransferHandler } from "./routes/spend";
import { postWalletHandler } from "./routes/wallet";

export function createApp(): Express {
  const app = express();
  app.use(express.json());

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

  // Spend (T-210): API-key-authenticated direct USDC transfer. Backend signs
  // with the session keypair (decrypted from DB) and submits.
  app.post("/v1/spend/transfer", requireApiKey, postSpendTransferHandler);

  // Audit (T-216): cursor-paginated read scoped to caller's wallets.
  app.get("/v1/audit", requireDashboardJwt, getAuditHandler);

  // Fund (T-217): vault USDC ATA + QR data-url for off-platform deposits.
  app.get("/v1/fund/deposit-address", requireDashboardJwt, getFundDepositAddressHandler);

  return app;
}
