import express, { type Express } from "express";
import { requireDashboardJwt } from "./auth/jwt";
import { siwsHandlers } from "./auth/siws";
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

  return app;
}
