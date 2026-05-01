import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";

export interface TestWallet { keypair: Keypair; pubkey: string; }

export function newTestWallet(): TestWallet {
  const keypair = Keypair.generate();
  return { keypair, pubkey: keypair.publicKey.toBase58() };
}

/** Best-effort airdrop on devnet. Skips silently if rate-limited. */
export async function maybeAirdrop(rpcUrl: string, w: TestWallet): Promise<void> {
  const conn = new Connection(rpcUrl, "confirmed");
  try {
    const sig = await conn.requestAirdrop(w.keypair.publicKey, LAMPORTS_PER_SOL);
    await conn.confirmTransaction(sig, "confirmed");
  } catch {
    // Devnet faucet often rate-limits; tests don't depend on real airdrop
  }
}
