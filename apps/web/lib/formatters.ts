import { USDC_DECIMALS } from "./constants";

const USDC_BASE = 10 ** USDC_DECIMALS;

export function formatUsdc(baseUnits: number | bigint): string {
  const n = typeof baseUnits === "bigint" ? Number(baseUnits) : baseUnits;
  return `$${(n / USDC_BASE).toFixed(2)}`;
}

export function parseUsdcInput(s: string): number | null {
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * USDC_BASE);
}

export function truncatePubkey(pk: string): string {
  if (pk.length <= 8) return pk;
  return `${pk.slice(0, 4)}…${pk.slice(-4)}`;
}

export function formatTimestamp(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().replace("T", " ").slice(0, 19);
}
