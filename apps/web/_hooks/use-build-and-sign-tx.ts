"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import { useCallback, useState } from "react";
import { ApiError, api } from "../lib/api-client";
import { getRpcConnection } from "../lib/on-chain";
import { type BuildTxResponse, buildTxResponseSchema } from "../lib/schemas";

export type BuildAndSignError =
  | { kind: "BUILD"; message: string; cause?: unknown }
  | { kind: "PHANTOM"; message: string; cause?: unknown }
  | { kind: "SUBMIT"; message: string; cause?: unknown }
  | { kind: "TIMEOUT"; message: string }
  | { kind: "NOT_CONNECTED"; message: string };

export interface SubmitResult {
  signature: string;
  buildResponse: BuildTxResponse & Record<string, unknown>;
}

export function useBuildAndSignTx() {
  const { signTransaction, connected } = useWallet();
  const [phase, setPhase] = useState<
    "idle" | "building" | "signing" | "submitting" | "confirming" | "done" | "error"
  >("idle");
  const [error, setError] = useState<BuildAndSignError | null>(null);

  const run = useCallback(
    async (
      endpoint: string,
      method: "POST" | "DELETE" | "PATCH" = "POST",
      body?: unknown,
    ): Promise<SubmitResult> => {
      setError(null);
      if (!connected || !signTransaction) {
        const e: BuildAndSignError = { kind: "NOT_CONNECTED", message: "wallet not connected" };
        setError(e);
        setPhase("error");
        throw new Error(e.message);
      }

      let resp: BuildTxResponse;
      try {
        setPhase("building");
        const raw =
          method === "POST"
            ? await api.post<unknown>(endpoint, body)
            : method === "PATCH"
              ? await api.patch<unknown>(endpoint, body)
              : await api.del<unknown>(endpoint);
        resp = buildTxResponseSchema.parse(raw) as BuildTxResponse;
      } catch (e) {
        const err: BuildAndSignError = {
          kind: "BUILD",
          message: e instanceof ApiError ? e.code : String(e),
          cause: e,
        };
        setError(err);
        setPhase("error");
        throw e;
      }

      // Self-heal short-circuit: backend found the on-chain side already
      // done (e.g. vault PDA exists from a previous session) and only
      // backfilled the DB. Nothing for Phantom to sign.
      if (resp.alreadyExists) {
        setPhase("done");
        return { signature: "", buildResponse: resp as BuildTxResponse & Record<string, unknown> };
      }

      let signed: Transaction;
      try {
        setPhase("signing");
        // Schema's refine guarantees txBase64 is present when alreadyExists is not true.
        const tx = Transaction.from(Buffer.from(resp.txBase64 as string, "base64"));
        signed = await signTransaction(tx);
      } catch (e) {
        const err: BuildAndSignError = { kind: "PHANTOM", message: String(e), cause: e };
        setError(err);
        setPhase("error");
        throw e;
      }

      let signature: string;
      try {
        setPhase("submitting");
        const conn = getRpcConnection();
        signature = await conn.sendRawTransaction(signed.serialize());
        setPhase("confirming");
        await Promise.race([
          conn.confirmTransaction(signature, "confirmed"),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("confirm timeout")), 30_000),
          ),
        ]);
        setPhase("done");
      } catch (e) {
        const err: BuildAndSignError =
          e instanceof Error && e.message === "confirm timeout"
            ? { kind: "TIMEOUT", message: "tx not confirmed in 30s" }
            : { kind: "SUBMIT", message: String(e), cause: e };
        setError(err);
        setPhase("error");
        throw e;
      }

      return { signature, buildResponse: resp as BuildTxResponse & Record<string, unknown> };
    },
    [connected, signTransaction],
  );

  const reset = useCallback(() => {
    setPhase("idle");
    setError(null);
  }, []);

  return { run, reset, phase, error };
}
