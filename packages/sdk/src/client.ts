import type {
  FetchLike,
  KlinkApiErrorBody,
  KlinkClientConfig,
  SpendServiceRequest,
  SpendServiceResponse,
  SpendSignPaymentRequest,
  SpendSignPaymentResponse,
  SpendTransferRequest,
  SpendTransferResponse,
  YieldMutationRequest,
  YieldMutationResponse,
  YieldPositionResponse,
} from "./types";

export class KlinkApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: KlinkApiErrorBody,
  ) {
    super(body.error);
    this.name = "KlinkApiError";
  }
}

const HTTP_STATUS: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  402: "Payment Required",
  403: "Forbidden",
  404: "Not Found",
  409: "Conflict",
  500: "Internal Server Error",
  502: "Bad Gateway",
  503: "Service Unavailable",
};

async function errorBody(res: globalThis.Response): Promise<KlinkApiErrorBody> {
  try {
    return (await res.json()) as KlinkApiErrorBody;
  } catch {
    return { error: res.statusText || HTTP_STATUS[res.status] || `HTTP ${res.status}` };
  }
}

export class KlinkClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly _fetch: FetchLike;

  constructor(config: KlinkClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.apiKey = config.apiKey;
    this._fetch = config.fetch ?? globalThis.fetch;
  }

  // -- Spend ----------------------------------------------------------------

  async spendTransfer(req: SpendTransferRequest): Promise<SpendTransferResponse> {
    return this.post("/v1/spend/transfer", req);
  }

  async spendSignPayment(req: SpendSignPaymentRequest): Promise<SpendSignPaymentResponse> {
    return this.post("/v1/spend/sign-payment", req);
  }

  async spendService(req: SpendServiceRequest): Promise<SpendServiceResponse> {
    const res = await this.rawRequest("POST", "/v1/spend/service", req);
    const body = await res.text();
    const txSig = res.headers.get("x-tx-signature") ?? undefined;
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k] = v;
    });
    return { status: res.status, headers, body, tx_signature: txSig };
  }

  // -- Yield ----------------------------------------------------------------

  async yieldDeposit(req: YieldMutationRequest): Promise<YieldMutationResponse> {
    return this.post("/v1/yield/deposit", req);
  }

  async yieldWithdraw(req: YieldMutationRequest): Promise<YieldMutationResponse> {
    return this.post("/v1/yield/withdraw", req);
  }

  async yieldPosition(): Promise<YieldPositionResponse> {
    return this.get("/v1/yield/position");
  }

  // -- Internal -------------------------------------------------------------

  private async rawRequest(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<globalThis.Response> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.apiKey}`,
    };
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      headers["content-type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    return this._fetch(url, init);
  }

  private async get<T>(path: string): Promise<T> {
    const res = await this.rawRequest("GET", path);
    if (!res.ok) throw new KlinkApiError(res.status, await errorBody(res));
    return res.json() as Promise<T>;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await this.rawRequest("POST", path, body);
    if (!res.ok) throw new KlinkApiError(res.status, await errorBody(res));
    return res.json() as Promise<T>;
  }
}
