import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/**
 * T-246 — apply pending Drizzle migrations on every server startup.
 *
 * Why in-process and not a separate deploy step: Render runs the same
 * `cd apps/api && bun src/index.ts` start command on every cold-start /
 * redeploy and doesn't natively run repo migrations as a pre-deploy hook
 * for our setup. Wiring migrate() in here keeps the DB schema in sync
 * with the deployed code without depending on Render config to be right.
 *
 * Idempotent: drizzle's migrator tracks applied migrations in a
 * `__drizzle_migrations` table and skips already-applied entries. The
 * second-and-later calls per cold-start are no-ops (one round-trip).
 *
 * Failure behaviour: caller should refuse to start the HTTP server if
 * this rejects — a server running against a stale schema will silently
 * 500 every fund-checkout / audit query it issues. Better to fail the
 * deploy than to promote a broken instance.
 */
export async function runMigrations(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.warn("[migrate] DATABASE_URL not set — skipping migrations");
    return;
  }
  const client = postgres(url, { max: 1 });
  try {
    const t0 = Date.now();
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
    console.log(`[migrate] applied in ${Date.now() - t0}ms`);
  } finally {
    await client.end();
  }
}
