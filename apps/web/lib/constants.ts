import { PublicKey } from "@solana/web3.js";

// Next.js inlines NEXT_PUBLIC_* env vars at build time via static analysis of
// `process.env.NAME` literals — dynamic access like `process.env[k]` is NOT
// rewritten and reads as undefined on the client.

export const SOLANA_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
export const KLINK_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_KLINK_PROGRAM_ID ??
    "DPPE8TAuw5qyWbw5MqcXcAtH2d5RYF5XBXTiN2pKzM3L",
);
export const USDC_MINT = new PublicKey(
  process.env.NEXT_PUBLIC_USDC_MINT ?? "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
);
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000";
export const DEVTOOLS_ENABLED = process.env.NEXT_PUBLIC_DEVTOOLS === "1";

// USDC has 6 decimals; base units = display × 1_000_000.
export const USDC_DECIMALS = 6;
export const MAX_BP = 10_000;
export const MAX_RECIPIENTS = 10;

// Per spec §2.4 instruction bitmap
export const INSTRUCTION_BITS = {
  TRANSFER_USDC: 0,
  KAMINO_DEPOSIT: 1,
  KAMINO_WITHDRAW: 2,
} as const;
