import express, { type Express } from "express";
import { siwsHandlers } from "./auth/siws";

export function createApp(): Express {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  // SIWS auth (T-203)
  app.post("/v1/auth/siws/nonce", siwsHandlers.nonce);
  app.post("/v1/auth/siws", siwsHandlers.siws);

  return app;
}
