import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

let cached: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set — required for any DB-touching endpoint");
  }
  const client = postgres(url);
  cached = drizzle(client);
  return cached;
}
