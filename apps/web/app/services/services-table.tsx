import { readFileSync } from "node:fs";
import { join } from "node:path";
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

/**
 * Server-component build-time read of the gitbook source. The file lives at
 * `<repo>/gitbook/services/mpp.md`; this component executes from `apps/web/`
 * so the path is two levels up. If the build runs from a different cwd the
 * readFileSync throws and the build fails loudly, which is what we want
 * because rendering an empty services list silently would be worse.
 */
function loadServices() {
  const path = join(process.cwd(), "..", "..", "gitbook", "services", "mpp.md");
  const md = readFileSync(path, "utf8");
  return parseMppServices(md);
}

/**
 * Renders the curated MPP services table + the two pointer cards (List your
 * service / Build your own). Used by both the public `/services` page and
 * the in-dashboard `/dashboard/services` page so they stay in lockstep.
 */
export function ServicesTable() {
  const services = loadServices();
  return (
    <>
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
                <TableCell className="text-sm text-olive-deep/70">{s.lastVerified}</TableCell>
                <TableCell className="pr-6 text-right">
                  <AddToSessionButton url={s.url} recipient={s.recipient} price={s.price} />
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
            adding a row to the table. We smoke-test before merging. Required fields, listing
            flow, and review criteria live in the gitbook page.
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
    </>
  );
}
