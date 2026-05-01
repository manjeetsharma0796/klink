import { Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

/**
 * Load the treasury keypair from `TREASURY_SECRET_KEY`. Accepts either:
 *   - solana-keygen JSON array form: `[12,34,...,255]` (64 bytes)
 *   - Phantom-export base58 form: `5Jh...` (single base58 string)
 *
 * The treasury wallet is the network-fee payer for every backend-signed tx
 * (agent spend/yield via T-226, Dodo disbursement via T-215). It is NOT a
 * signer for the on-chain instruction's `session_signer` slot — that's the
 * per-session keypair. Both keypairs sign the transaction: treasury for the
 * Solana-level fee, session for the program-level authority check.
 *
 * Throws if the env var is unset or malformed. Callers should let this
 * surface as a 500 (server misconfigured), not a 4xx.
 */
export function loadTreasury(): Keypair {
  const raw = process.env.TREASURY_SECRET_KEY;
  if (!raw) throw new Error("TREASURY_SECRET_KEY is not set");
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) {
    const arr = JSON.parse(trimmed) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(arr));
  }
  return Keypair.fromSecretKey(bs58.decode(trimmed));
}

export function loadTreasuryAta(): PublicKey {
  const v = process.env.TREASURY_USDC_ATA;
  if (!v) throw new Error("TREASURY_USDC_ATA is not set");
  return new PublicKey(v);
}
