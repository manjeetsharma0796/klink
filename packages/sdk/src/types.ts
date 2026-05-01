// ---------------------------------------------------------------------------
// Request / response shapes for the Klink Agent Wallet API
// Covers /v1/spend/* and /v1/yield/* (agent-authenticated endpoints)
// ---------------------------------------------------------------------------

// -- Spend: transfer --------------------------------------------------------

export interface SpendTransferRequest {
  recipient: string;
  amount: number;
  memo?: string;
}

export interface SpendTransferResponse {
  tx_signature: string;
  status: "confirmed";
}

// -- Spend: sign-payment ----------------------------------------------------

export interface SpendSignPaymentRequest {
  url: string;
  recipient: string;
  amount: number;
  payment_id?: string;
}

export interface SpendSignPaymentResponse {
  tx_signature: string;
  payment_proof_header: string;
}

// -- Spend: service ---------------------------------------------------------

export interface SpendServiceRequest {
  slug: string;
  path: string;
  body?: unknown;
  max_amount: number;
  method?: "GET" | "POST";
}

export interface SpendServiceResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  tx_signature?: string;
}

// -- Yield: deposit / withdraw ----------------------------------------------

export interface YieldMutationRequest {
  amount: number;
}

export interface YieldMutationResponse {
  tx_signature: string;
  status: "confirmed";
}

// -- Yield: position --------------------------------------------------------

export interface YieldPositionResponse {
  deployed: string;
  accrued: string | null;
  total_balance: string;
}

// -- Errors -----------------------------------------------------------------

export interface KlinkApiErrorBody {
  error: string;
  detail?: string;
  liquid?: string;
  amount?: string;
  deficit?: string;
  quoted?: number;
  max_amount?: number;
}

export type KlinkDenyReason =
  | "OUTSIDE_TIME_WINDOW"
  | "INSUFFICIENT_LIQUID"
  | "URL_NOT_ALLOWED"
  | "QUOTED_OVER_MAX"
  | `ON_CHAIN_REVERT: ${string}`
  | `RETRY_FAILED: ${string}`;

// -- Client config ----------------------------------------------------------

export type FetchLike = (url: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface KlinkClientConfig {
  baseUrl: string;
  apiKey: string;
  fetch?: FetchLike;
}
