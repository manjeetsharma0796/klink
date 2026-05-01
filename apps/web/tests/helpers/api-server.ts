import { createServer, type Server } from "node:http";

interface Stub { method: string; path: RegExp | string; status?: number; body: unknown; }

export function startMockApi(port: number, stubs: Stub[]): Promise<Server> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
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
      res.setHeader("access-control-allow-origin", "*");
      res.setHeader("access-control-allow-credentials", "true");
      res.end(JSON.stringify(stub.body));
    });
    server.listen(port, () => resolve(server));
  });
}
