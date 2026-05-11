import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { ServicesTable } from "./services-table";

export const metadata: Metadata = {
  title: "Services · klink",
  description:
    "MPP-protocol services on Solana that klink agents can pay end-to-end. Source of truth: gitbook.",
};

export default function ServicesPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60 bg-cream">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Link href="/" className="group flex items-center gap-3">
            <Image
              src="/logo.png"
              alt="klink"
              width={28}
              height={28}
              className="rounded transition-transform group-hover:rotate-[-6deg]"
            />
            <span className="text-lg font-bold tracking-tight text-olive-deep">klink</span>
          </Link>
          <Link
            href="/dashboard"
            className="rounded-pill bg-sap-green px-4 py-2 text-sm font-semibold text-primary-foreground transition-all duration-[var(--dur-base)] ease-[var(--ease-klink)] hover:opacity-90 active:scale-[0.97]"
          >
            Open dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12">
        <section className="klink-reveal mb-10 max-w-3xl">
          <p className="klink-eyebrow mb-3 text-olive-deep/70">Services directory</p>
          <h1 className="mb-4 text-4xl font-bold tracking-tight text-olive-deep sm:text-5xl">
            Services your agent can pay
          </h1>
          <p className="text-lg text-olive-deep/80">
            MPP-protocol services on Solana that klink agents are verified to spend against end-to-end.
            Point your agent at any URL below via{" "}
            <code className="rounded bg-card px-1.5 py-0.5 font-mono text-sm text-olive-deep ring-1 ring-border">
              POST /v1/spend/mpp
            </code>
            ; klink handles the 402 challenge, on-chain payment, retry, and audit.
          </p>
        </section>

        <ServicesTable />

        <footer className="mt-16 border-t border-border/60 pt-6 text-sm text-olive-deep/60">
          Source of truth:{" "}
          <a
            href="https://github.com/manjeetsharma0796/klink/blob/main/gitbook/services/mpp.md"
            target="_blank"
            rel="noopener noreferrer"
            className="klink-underline font-mono"
          >
            gitbook/services/mpp.md
          </a>
          . This page is rebuilt automatically on every PR merge.
        </footer>
      </main>
    </div>
  );
}
