import { z } from "zod";

const pubkey = z.string().min(32).max(44);
const uuid = z.string().uuid();

export const walletSchema = z.object({
  id: uuid,
  vaultPda: pubkey,
  usdcAta: pubkey,
  maxDeployedFractionBp: z.number().int().min(0).max(10000),
  ownerPubkey: pubkey,
  createdAt: z.string(),
});
export type Wallet = z.infer<typeof walletSchema>;

export const sessionRowSchema = z.object({
  id: uuid,
  walletId: uuid,
  label: z.string(),
  sessionPubkey: pubkey,
  expiresAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  keyPrefix: z.string(),
  createdAt: z.string(),
});
export type SessionRow = z.infer<typeof sessionRowSchema>;

export const sessionsListSchema = z.array(sessionRowSchema);

// Real backend returns u64 fields as decimal strings (JSON can't represent
// >2^53 safely). On-chain block is null when the session PDA hasn't been
// created on-chain yet (between POST /v1/session and the owner submitting
// the build-tx) or when the RPC read failed.
export const sessionOnChainSchema = z.object({
  maxPerTx: z.string(),
  dailyCap: z.string(),
  dailySpent: z.string(),
  dailyWindowStart: z.number().int(),
  expiry: z.number().int(),
  allowedRecipients: z.array(pubkey),
  allowedRecipientsCount: z.number().int().min(0),
  allowedInstructions: z.number().int().min(0).max(0xffffffff),
});
export type SessionOnChain = z.infer<typeof sessionOnChainSchema>;

export const sessionDetailSchema = sessionRowSchema.extend({
  onChain: sessionOnChainSchema.nullable(),
  onChainError: z.string().nullable(),
  offChainPolicy: z
    .object({
      allowedUrls: z.array(z.object({ pattern: z.string(), max_per_call: z.number() })),
      timeWindowStartMin: z.number().int().min(0).max(1440),
      timeWindowEndMin: z.number().int().min(0).max(1440),
      timeWindowDowBitmask: z.number().int().min(0).max(127),
      timezone: z.string(),
    })
    .nullable(),
});
export type SessionDetail = z.infer<typeof sessionDetailSchema>;

export const buildTxResponseSchema = z.object({
  txBase64: z.string(),
  vaultPda: pubkey.optional(),
  vaultUsdcAta: pubkey.optional(),
});
export type BuildTxResponse = z.infer<typeof buildTxResponseSchema>;

export const postSessionResponseSchema = z.object({
  txBase64: z.string(),
  sessionId: uuid,
  sessionPubkey: pubkey,
  apiKey: z.string(),
  keyPrefix: z.string(),
  expiresAt: z.string().nullable(),
  vaultPda: pubkey,
  usdcAta: pubkey,
});
export type PostSessionResponse = z.infer<typeof postSessionResponseSchema>;

export const fundDepositAddressSchema = z.object({
  vault_pda: pubkey,
  usdc_ata: pubkey,
  qr_data_url: z.string().startsWith("data:image"),
});
export type FundDepositAddress = z.infer<typeof fundDepositAddressSchema>;

export const auditEntrySchema = z.object({
  id: z.number().int(),
  walletId: uuid.nullable(),
  sessionId: uuid.nullable(),
  action: z.string(),
  amount: z.number().nullable(),
  recipientOrUrl: z.string().nullable(),
  decision: z.enum(["allow", "deny"]),
  reason: z.string().nullable(),
  txSignature: z.string().nullable(),
  createdAt: z.string(),
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;

export const auditPageSchema = z.object({
  entries: z.array(auditEntrySchema),
  next_cursor: z.number().int().nullable(),
});
export type AuditPage = z.infer<typeof auditPageSchema>;

export const dodoCheckoutResponseSchema = z.object({
  checkout_url: z.string().url(),
  dodo_session_id: z.string(),
});
export type DodoCheckoutResponse = z.infer<typeof dodoCheckoutResponseSchema>;
