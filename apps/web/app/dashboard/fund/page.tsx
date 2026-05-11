"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction } from "@solana/web3.js";
import { useOnChainVault } from "@/_hooks/use-on-chain-vault";
import { useWalletData } from "@/_hooks/use-wallet";
import { useProgress } from "@/app/_components/progress-context";
import { Button } from "@/app/_components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/_components/ui/card";
import { Input } from "@/app/_components/ui/input";
import { Label } from "@/app/_components/ui/label";
import { Skeleton } from "@/app/_components/ui/skeleton";
import { useToast } from "@/app/_components/ui/use-toast";
import { api } from "@/lib/api-client";
import { USDC_DECIMALS, USDC_MINT } from "@/lib/constants";
import { getRpcConnection } from "@/lib/on-chain";
import { dodoCheckoutResponseSchema, fundDepositAddressSchema } from "@/lib/schemas";
import { useState } from "react";
import useSWR from "swr";
import { PageHeader } from "../_components/page-header";

export default function FundPage() {
  const { wallet } = useWalletData();
  // GET /v1/fund/deposit-address requires wallet_id — see apps/api/src/routes/fund.ts.
  // Skip the fetch entirely when no wallet exists yet so we don't 400 on every load.
  const fund = useSWR<unknown>(wallet ? `/v1/fund/deposit-address?wallet_id=${wallet.id}` : null);
  const fundParsed = fund.data ? fundDepositAddressSchema.safeParse(fund.data) : null;
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  // T-249: Fund-from-connected-wallet state + dependencies.
  const { publicKey, signTransaction, connected } = useWallet();
  const onChain = useOnChainVault(publicKey?.toBase58() ?? null);
  const progress = useProgress();
  const [walletAmount, setWalletAmount] = useState("");
  const [walletBusy, setWalletBusy] = useState(false);

  async function copyAta() {
    if (fundParsed?.success) {
      await navigator.clipboard.writeText(fundParsed.data.usdc_ata);
      toast({ title: "Address copied" });
    }
  }

  async function dodoCheckout(usd: number) {
    if (!wallet) return;
    setBusy(true);
    try {
      // T-244 — pass return URLs so Dodo redirects back to a klink-owned
      // page after payment instead of stranding the customer on Dodo's
      // confirmation screen. The session id is also stashed in
      // sessionStorage as a fallback in case Dodo doesn't append it as a
      // query param on redirect.
      const origin = window.location.origin;
      const r = await api.post<unknown>("/v1/fund/dodo-checkout", {
        amount_usd: usd,
        wallet_id: wallet.id,
        success_url: `${origin}/dashboard/fund/return`,
        cancel_url: `${origin}/dashboard/fund?cancelled=1`,
      });
      const parsed = dodoCheckoutResponseSchema.parse(r);
      try {
        sessionStorage.setItem("klink:dodo-pending-session", parsed.dodo_session_id);
      } catch {
        // Private browsing / quota, return page falls back to URL param.
      }
      window.location.assign(parsed.checkout_url);
    } catch (e) {
      toast({ title: "Checkout failed", description: String(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  // T-249: build + sign + submit a client-side SPL token transfer from the
  // owner's USDC ATA to the vault's USDC ATA. No backend round-trip.
  async function fundFromConnected() {
    if (!connected || !publicKey || !signTransaction) {
      toast({ title: "Connect a wallet first", variant: "destructive" });
      return;
    }
    if (!onChain.data?.vaultPda) {
      toast({
        title: "Vault not ready",
        description: "Create the vault from Overview before funding.",
        variant: "destructive",
      });
      return;
    }
    const usdc = Number(walletAmount);
    if (!Number.isFinite(usdc) || usdc <= 0) {
      toast({ title: "Enter a positive USDC amount", variant: "destructive" });
      return;
    }
    const baseUnits = BigInt(Math.round(usdc * 1_000_000));
    const endProgress = progress.start();
    setWalletBusy(true);
    try {
      const { createTransferCheckedInstruction, getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } =
        await import("@solana/spl-token");
      const conn = getRpcConnection();
      const vaultPda = new PublicKey(onChain.data.vaultPda);
      const ownerAta = getAssociatedTokenAddressSync(USDC_MINT, publicKey, false);
      const vaultAta = getAssociatedTokenAddressSync(USDC_MINT, vaultPda, true);

      // Pre-flight balance read so we don't burn fees on a doomed tx.
      let ownerBalance: bigint;
      try {
        const r = await conn.getTokenAccountBalance(ownerAta);
        ownerBalance = BigInt(r.value.amount);
      } catch {
        toast({
          title: "No devnet USDC in this wallet",
          description:
            "The connected wallet has no USDC ATA on devnet. Use the Direct deposit QR or Add card option instead.",
          variant: "destructive",
        });
        return;
      }
      if (ownerBalance < baseUnits) {
        toast({
          title: "Insufficient USDC balance",
          description: `Wallet has ${(Number(ownerBalance) / 1_000_000).toFixed(2)} USDC; tried to send ${usdc}.`,
          variant: "destructive",
        });
        return;
      }

      const ix = createTransferCheckedInstruction(
        ownerAta, // from
        USDC_MINT, // mint
        vaultAta, // to
        publicKey, // authority
        baseUnits,
        USDC_DECIMALS,
        [],
        TOKEN_PROGRAM_ID,
      );
      const tx = new Transaction().add(ix);
      tx.feePayer = publicKey;
      const { blockhash } = await conn.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;

      const signed = await signTransaction(tx);
      const signature = await conn.sendRawTransaction(signed.serialize());
      await conn.confirmTransaction(signature, "confirmed");

      toast({
        title: `Funded ${usdc} USDC`,
        description: `tx ${signature.slice(0, 12)}…`,
      });
      setWalletAmount("");
      onChain.mutate();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("User rejected")) {
        toast({ title: "Cancelled in wallet" });
      } else {
        toast({ title: "Fund failed", description: msg, variant: "destructive" });
      }
    } finally {
      endProgress();
      setWalletBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Top up"
        title="Fund"
        subtitle="Move USDC into the vault — from your connected Phantom, by direct deposit, or with a card."
      />
      <div className="klink-stagger grid gap-6 lg:grid-cols-3">
        {/* T-249: connected-wallet path. Most-natural option for a user
            who is already signed in via Phantom; sits first so it's the
            default path the eye lands on. */}
        <Card>
          <CardHeader>
            <span className="klink-eyebrow">Phantom</span>
            <CardTitle>From connected wallet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!wallet ? (
              <p className="text-sm text-muted-foreground">
                No vault yet. Create one from Overview.
              </p>
            ) : !connected ? (
              <p className="text-sm text-muted-foreground">
                Connect a wallet to fund directly.
              </p>
            ) : (
              <>
                <Label htmlFor="wallet-fund">Amount (USDC)</Label>
                <div className="flex gap-2">
                  <Input
                    id="wallet-fund"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.000001"
                    value={walletAmount}
                    onChange={(e) => setWalletAmount(e.target.value)}
                    placeholder="100"
                  />
                  <Button
                    disabled={walletBusy || !walletAmount || Number(walletAmount) <= 0}
                    onClick={fundFromConnected}
                  >
                    {walletBusy ? "Signing..." : "Fund wallet"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Sends USDC from your Phantom directly to the vault. Free, no card fee. Phantom prompts you to sign.
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <span className="klink-eyebrow">On-chain</span>
            <CardTitle>Direct deposit (QR)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!wallet ? (
              <p className="text-sm text-muted-foreground">
                No wallet yet. Create one from Overview.
              </p>
            ) : fund.isLoading ? (
              <Skeleton className="h-40 w-40" />
            ) : fundParsed?.success ? (
              <>
                <div className="rounded-2xl bg-cream p-2 shadow-[var(--shadow-pill)] ring-1 ring-olive-deep/[0.06]">
                  <img
                    src={fundParsed.data.qr_data_url}
                    alt="Vault USDC ATA QR"
                    className="h-40 w-40 rounded-xl"
                  />
                </div>
                <p className="break-all font-mono text-[11px] text-muted-foreground">
                  {fundParsed.data.usdc_ata}
                </p>
                <Button variant="secondary" size="sm" onClick={copyAta}>
                  Copy address
                </Button>
                <p className="text-[12px] text-muted-foreground">
                  Send USDC on Solana to this address. Confirms in ~400ms.
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Couldn't load deposit address. Check api logs.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <span className="klink-eyebrow">Fiat</span>
            <CardTitle>Add card / fiat (Dodo)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              {[10, 50, 100, 250].map((v) => (
                <Button
                  key={v}
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => dodoCheckout(v)}
                >
                  ${v}
                </Button>
              ))}
            </div>
            <Label htmlFor="custom">Custom amount (USD)</Label>
            <div className="flex gap-2">
              <Input
                id="custom"
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="100"
              />
              <Button disabled={busy || !amount} onClick={() => dodoCheckout(Number(amount))}>
                Add
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Card processing fee applies. Settles to your vault on confirmation.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
