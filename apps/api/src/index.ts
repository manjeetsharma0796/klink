import "dotenv/config";
import { createApp } from "./app";
import { runMigrations } from "./db/migrate";

const PORT = Number(process.env.PORT ?? 3000);

// T-246 — apply pending DB migrations BEFORE serving any traffic. If the
// migration fails (DATABASE_URL wrong, schema conflict, etc.) we exit
// non-zero so Render keeps the previous deploy live instead of promoting
// an instance that would silently 500 on every DB-touching endpoint.
runMigrations()
  .then(() => {
    const app = createApp();
    app.listen(PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`klink api listening on :${PORT}`);
    });
  })
  .catch((err) => {
    console.error("[startup] migrate failed, refusing to start:", err);
    process.exit(1);
  });
