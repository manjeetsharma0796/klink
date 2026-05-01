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
 *
 * QR encodes a Solana Pay URL (`solana:<vault_pda>?spl-token=<USDC_MINT>`)
 * rather than the bare ATA. Solana Pay-aware wallets (Phantom, Solflare,
 * Backpack) auto-fill recipient + token; bare-ATA scans force the sender to
 * pick USDC and type the amount manually. Spec: solana.com/docs/intro/wallet
 * (transfer-request scheme). The recipient is the vault PDA (the owner of
 * the USDC ATA) — wallets derive the ATA from `recipient + spl-token`. PDAs
 * are off-curve but valid Solana Pay recipients.
 */

/**
 * Best-effort USDC mint read. Server-side env, so a misconfig is a 500 not
 * a 400. Cached in module scope after first successful read since it can't
 * change at runtime.
 */
let cachedUsdcMint: string | null = null;
function readUsdcMint(): string {
  if (cachedUsdcMint) return cachedUsdcMint;
  const v = process.env.USDC_MINT;
  if (!v) throw new Error("USDC_MINT is not set");
  cachedUsdcMint = v;
  return v;
}

/** Build the Solana Pay URL. Pure for testability. */
export function buildSolanaPayUrl(vaultPda: string, usdcMint: string): string {
  return `solana:${vaultPda}?spl-token=${usdcMint}`;
}

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

  let usdcMint: string;
  try {
    usdcMint = readUsdcMint();
  } catch (err) {
    console.error("[GET /v1/fund/deposit-address] missing USDC_MINT env:", err);
    res.status(500).json({ error: "server misconfigured" });
    return;
  }

  const payUrl = buildSolanaPayUrl(row.vaultPda, usdcMint);

  let qrDataUrl: string;
  try {
    qrDataUrl = await qrcode.toDataURL(payUrl, { errorCorrectionLevel: "M", width: 256 });
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
