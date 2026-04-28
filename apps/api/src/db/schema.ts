import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// Per design spec §3.3 — Postgres data model. Nine tables + two enums.

export const auditDecisionEnum = pgEnum("audit_decision", ["allow", "deny"]);
export const dodoPaymentStatusEnum = pgEnum("dodo_payment_status", [
  "pending",
  "settled",
  "failed",
]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  phantomPubkey: varchar("phantom_pubkey", { length: 44 }).notNull().unique(),
  email: varchar("email", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const wallets = pgTable("wallets", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  vaultPda: varchar("vault_pda", { length: 44 }).notNull().unique(),
  usdcAta: varchar("usdc_ata", { length: 44 }).notNull(),
  maxDeployedFractionBp: integer("max_deployed_fraction_bp").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  walletId: uuid("wallet_id")
    .notNull()
    .references(() => wallets.id, { onDelete: "cascade" }),
  sessionPubkey: varchar("session_pubkey", { length: 44 }).notNull().unique(),
  // base64 of iv(12) || tag(16) || ciphertext — produced by encryptSessionSecret() (T-208)
  encryptedSessionSecret: text("encrypted_session_secret").notNull(),
  label: varchar("label", { length: 255 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  // first ~8 chars of the issued token, shown in dashboard for identification
  keyPrefix: varchar("key_prefix", { length: 16 }).notNull(),
  // bcrypt or argon2 hash of the full token (T-204)
  hashedToken: text("hashed_token").notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const offChainPolicies = pgTable("off_chain_policies", {
  walletId: uuid("wallet_id")
    .primaryKey()
    .references(() => wallets.id, { onDelete: "cascade" }),
  // [{ pattern: "https://api.example.com/*", max_per_call: 100000 }]
  // wildcards restricted to path segments only (validated at insert)
  allowedUrls: jsonb("allowed_urls").notNull().default(sql`'[]'::jsonb`),
  // 0..1440 minute-of-day (in `timezone`)
  timeWindowStartMin: integer("time_window_start_min").notNull().default(0),
  timeWindowEndMin: integer("time_window_end_min").notNull().default(1440),
  // 7-bit DOW mask: bit 0 = Mon ... bit 6 = Sun. Default 0b1111111 = every day.
  timeWindowDowBitmask: integer("time_window_dow_bitmask").notNull().default(127),
  timezone: varchar("timezone", { length: 64 }).notNull().default("UTC"),
});

export const serviceCatalog = pgTable("service_catalog", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  baseUrl: text("base_url").notNull(),
  paymentRecipientPubkey: varchar("payment_recipient_pubkey", { length: 44 }).notNull(),
  // USDC base units (6 decimals); 0 = no per-call cap
  defaultMaxPerCall: bigint("default_max_per_call", { mode: "number" }).notNull().default(0),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLog = pgTable("audit_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  walletId: uuid("wallet_id").references(() => wallets.id, { onDelete: "cascade" }),
  // session_id null when the action wasn't session-scoped (e.g. fund_dodo)
  sessionId: uuid("session_id").references(() => sessions.id, { onDelete: "set null" }),
  // e.g. "spend_transfer", "pay_service", "kamino_deposit", "fund_dodo"
  action: varchar("action", { length: 64 }).notNull(),
  // USDC base units; null for non-spend actions
  amount: bigint("amount", { mode: "number" }),
  recipientOrUrl: text("recipient_or_url"),
  decision: auditDecisionEnum("decision").notNull(),
  // short reason code (e.g. "URL_NOT_ALLOWED", "OUTSIDE_TIME_WINDOW")
  reason: text("reason"),
  // Solana tx signature when decision == allow and on-chain submission succeeded
  txSignature: varchar("tx_signature", { length: 100 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const dodoPayments = pgTable("dodo_payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Dodo's session id — used as the idempotency key for webhooks
  dodoSessionId: varchar("dodo_session_id", { length: 255 }).notNull().unique(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  walletId: uuid("wallet_id")
    .notNull()
    .references(() => wallets.id, { onDelete: "cascade" }),
  // amount in USD cents (integer)
  amountUsd: bigint("amount_usd", { mode: "number" }).notNull(),
  // amount disbursed to vault, in USDC base units
  amountUsdc: bigint("amount_usdc", { mode: "number" }).notNull(),
  status: dodoPaymentStatusEnum("status").notNull().default("pending"),
  // signature of the treasury → vault transfer when status = settled
  treasuryTxSignature: varchar("treasury_tx_signature", { length: 100 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  settledAt: timestamp("settled_at", { withTimezone: true }),
});

export const treasuryDisbursements = pgTable("treasury_disbursements", {
  id: uuid("id").primaryKey().defaultRandom(),
  dodoPaymentId: uuid("dodo_payment_id")
    .notNull()
    .references(() => dodoPayments.id, { onDelete: "cascade" }),
  amountUsdc: bigint("amount_usdc", { mode: "number" }).notNull(),
  txSignature: varchar("tx_signature", { length: 100 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
