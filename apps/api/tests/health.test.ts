import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { Server } from "node:http";
import { createApp } from "../src/app";

const PORT = 3001;
let server: Server;

beforeAll(() => {
  const app = createApp();
  server = app.listen(PORT);
});

afterAll(() => {
  server.close();
});

describe("GET /health", () => {
  it("returns 200 with { ok: true }", async () => {
    const res = await fetch(`http://localhost:${PORT}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });
});
