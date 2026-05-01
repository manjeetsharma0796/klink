import { createServer, type Server } from "node:http";

interface Stub { method: string; path: RegExp | string; status?: number; body: unknown; }

export function startMockApi(port: number, stubs: Stub[]): Promise<Server> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      // CORS preflight + headers for cross-origin fetch with credentials.
      // Echo the request origin (cannot wildcard when credentials: include).
      const origin = (req.headers.origin as string | undefined) ?? "http://localhost:3030";
      res.setHeader("access-control-allow-origin", origin);
      res.setHeader("access-control-allow-credentials", "true");
      res.setHeader("access-control-allow-methods", "GET, POST, PATCH, DELETE, OPTIONS");
      res.setHeader("access-control-allow-headers", "content-type, authorization");
      if (req.method === "OPTIONS") { res.statusCode = 204; res.end(); return; }

      const stub = stubs.find((s) => {
        if (s.method !== req.method) return false;
        if (typeof s.path === "string") return req.url === s.path;
        return s.path.test(req.url ?? "");
      });
      if (!stub) {
        res.statusCode = 404;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: "MOCK_NOT_FOUND" }));
        return;
      }
      res.statusCode = stub.status ?? 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(stub.body));
    });
    server.listen(port, () => resolve(server));
  });
}
