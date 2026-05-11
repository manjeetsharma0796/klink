import { readFileSync } from "node:fs";
import { join } from "node:path";
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { parseMppServices } from "@/lib/services";
import { truncatePubkey } from "@/lib/formatters";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/_components/ui/table";
import { AddToSessionButton } from "./add-to-session-button";

export const metadata: Metadata = {
  title: "Services · klink",
  description:
    "MPP-protocol services on Solana that klink agents can pay end-to-end. Source of truth: gitbook.",
};

// Server-component build-time read of the gitbook source. The file lives at
// `<repo>/gitbook/services/mpp.md`; this server component executes from
// `apps/web/` so the path is two levels up. If the build is run from a
// different cwd, the readFileSync throws and the build fails loudly — which
// is what we want, because rendering an empty services page silently would
// be worse than a red build.
function loadServices() {
  const path = join(process.cwd(), "..", "..", "gitbook", "services", "mpp.md");
  const md = readFileSync(path, "utf8");
  return parseMppServices(md);
}

export default function ServicesPage() {
  const services = loadServices();

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

        <section className="klink-card overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Service</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>Network</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last verified</TableHead>
                <TableHead className="pr-6 text-right">Whitelist</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.map((s) => (
                <TableRow key={s.url}>
                  <TableCell className="pl-6 font-medium text-olive-deep">{s.name}</TableCell>
                  <TableCell>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="klink-underline font-mono text-xs text-olive-deep"
                    >
                      {s.url.replace(/^https?:\/\//, "")}
                    </a>
                  </TableCell>
                  <TableCell className="text-sm text-olive-deep/80">{s.network}</TableCell>
                  <TableCell className="klink-num text-sm text-olive-deep">{s.price}</TableCell>
                  <TableCell className="font-mono text-xs text-olive-deep" title={s.recipient}>
                    {truncatePubkey(s.recipient)}
                  </TableCell>
                  <TableCell>
                    <span
                      className={
                        s.status.toLowerCase() === "live"
                          ? "rounded-pill bg-sap-green/20 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-olive-deep"
                          : "rounded-pill bg-muted px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
                      }
                    >
                      {s.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-olive-deep/70">
                    {s.lastVerified}
                  </TableCell>
                  <TableCell className="pr-6 text-right">
                    <AddToSessionButton
                      url={s.url}
                      recipient={s.recipient}
                      price={s.price}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>

        <section className="klink-stagger mt-10 grid gap-6 sm:grid-cols-2">
          <div className="klink-card p-6">
            <h2 className="mb-2 text-lg font-semibold text-olive-deep">List your service</h2>
            <p className="text-sm text-olive-deep/80">
              Open a PR to{" "}
              <a
                href="https://github.com/manjeetsharma0796/klink/blob/main/gitbook/services/mpp.md"
                target="_blank"
                rel="noopener noreferrer"
                className="klink-underline font-mono text-olive-deep"
              >
                gitbook/services/mpp.md
              </a>{" "}
              adding a row to the table. We smoke-test before merging. Required fields,
              listing flow, and review criteria live in the gitbook page.
            </p>
          </div>

          <div className="klink-card p-6">
            <h2 className="mb-2 text-lg font-semibold text-olive-deep">Build your own</h2>
            <p className="text-sm text-olive-deep/80">
              Five-step setup using{" "}
              <a
                href="https://www.npmjs.com/package/mppx"
                target="_blank"
                rel="noopener noreferrer"
                className="klink-underline text-olive-deep"
              >
                mppx
              </a>{" "}
              +{" "}
              <a
                href="https://www.npmjs.com/package/@solana/mpp"
                target="_blank"
                rel="noopener noreferrer"
                className="klink-underline text-olive-deep"
              >
                @solana/mpp
              </a>
              . Reference implementation:{" "}
              <a
                href="https://github.com/manjeetsharma0796/service01"
                target="_blank"
                rel="noopener noreferrer"
                className="klink-underline font-mono text-olive-deep"
              >
                service01
              </a>
              . Full walkthrough in the{" "}
              <a
                href="https://app.klinkdotfun.live/services/mpp.md"
                target="_blank"
                rel="noopener noreferrer"
                className="klink-underline text-olive-deep"
              >
                gitbook services page
              </a>
              .
            </p>
          </div>
        </section>

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
