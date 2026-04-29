import { and, eq } from "drizzle-orm";
import type { Request, Response } from "express";
import qrcode from "qrcode";
import { getDb } from "../db/client";
import { wallets } from "../db/schema";

/**
 * `GET /v1/fund/deposit-address?wallet_id=<uuid>` — T-217.
 *
 * Owner-authenticated. Returns the vault's USDC ATA so the dashboard can
 * surface a "send USDC here" address + a QR data-url for mobile scanning.
 *
 * The actual deposit happens off-platform (Phantom / Coinbase / Backpack /
 * exchange withdrawal) — this endpoint is read-only.
 */
export async function getFundDepositAddressHandler(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: "auth required" });
    return;
  }
  const walletId = typeof req.query.wallet_id === "string" ? req.query.wallet_id : "";
  if (!walletId) {
    res.status(400).json({ error: "wallet_id query param required" });
    return;
  }

  const db = getDb();
  const rows = await db
    .select({ vaultPda: wallets.vaultPda, usdcAta: wallets.usdcAta })
    .from(wallets)
    .where(and(eq(wallets.id, walletId), eq(wallets.userId, userId)))
    .limit(1);
  const row = rows[0];
  if (!row) {
    res.status(404).json({ error: "wallet not found" });
    return;
  }

  let qrDataUrl: string;
  try {
    qrDataUrl = await qrcode.toDataURL(row.usdcAta, { errorCorrectionLevel: "M", width: 256 });
  } catch (err) {
    console.error("[GET /v1/fund/deposit-address] qr render failed:", err);
    res.status(500).json({ error: "qr render failed" });
    return;
  }

  res.json({
    vault_pda: row.vaultPda,
    usdc_ata: row.usdcAta,
    qr_data_url: qrDataUrl,
  });
}
