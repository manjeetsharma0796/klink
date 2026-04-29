import express, { type Express } from "express";
import { requireDashboardJwt } from "./auth/jwt";
import { siwsHandlers } from "./auth/siws";
import { postSessionHandler } from "./routes/session";
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

  // Session (T-206): build add_session tx + mint API key. Owner-authenticated.
  app.post("/v1/session", requireDashboardJwt, postSessionHandler);

  return app;
}
