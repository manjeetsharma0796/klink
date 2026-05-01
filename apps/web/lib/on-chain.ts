import { Connection, PublicKey } from "@solana/web3.js";
import { KLINK_PROGRAM_ID, SOLANA_RPC_URL, USDC_MINT } from "./constants";

export interface DecodedVault {
  owner: Uint8Array;
  maxDeployedFractionBp: number;
  deployedAmount: bigint;
  bump: number;
}

const VAULT_SIZE = 51; // 8 disc + 32 owner + 2 max_bp + 8 deployed + 1 bump

export function decodeVault(buf: Buffer | Uint8Array): DecodedVault {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  if (b.length < VAULT_SIZE) {
    throw new Error(`Vault buffer too small: ${b.length} < ${VAULT_SIZE}`);
  }
  return {
    owner: new Uint8Array(b.subarray(8, 40)),
    maxDeployedFractionBp: b.readUInt16LE(40),
    deployedAmount: b.readBigUInt64LE(42),
    bump: b.readUInt8(50),
  };
}

export function deriveVaultPda(owner: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), owner.toBuffer()],
    KLINK_PROGRAM_ID,
  );
  return pda;
}

export async function fetchVault(connection: Connection, owner: PublicKey): Promise<DecodedVault | null> {
  const pda = deriveVaultPda(owner);
  const info = await connection.getAccountInfo(pda);
  if (!info) return null;
  return decodeVault(info.data);
}

export async function fetchUsdcAtaBalance(
  connection: Connection,
  vaultPda: PublicKey,
): Promise<bigint> {
  const { getAssociatedTokenAddressSync } = await import("@solana/spl-token");
  const ata = getAssociatedTokenAddressSync(USDC_MINT, vaultPda, true);
  try {
    const r = await connection.getTokenAccountBalance(ata);
    return BigInt(r.value.amount);
  } catch {
    return BigInt(0); // ATA not yet created
  }
}

export function getRpcConnection(): Connection {
  return new Connection(SOLANA_RPC_URL, "confirmed");
}
