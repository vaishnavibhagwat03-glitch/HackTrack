// HTTP entry point. Binds to localhost only: the C++ client is its only caller.
import { createServer } from "node:http";
import { createApp } from "./app.mjs";
import { openDb, DEFAULT_DB } from "./db.mjs";
import { seed } from "./seed.mjs";

const PORT = Number(process.env.PORT ?? 4000);
const HOST = process.env.HOST ?? "127.0.0.1";
// Fraction of requests answered with 503, to demonstrate the client's retry queue.
let chaos = Number(process.env.HACKTRACK_CHAOS ?? 0);

const db = openDb(DEFAULT_DB);
if (!db.prepare("SELECT 1 FROM event WHERE id = 1").get()) {
  console.log("Empty database - seeding demo data...");
  seed(db);
}
const handle = createApp(db);

const server = createServer((req, res) => {
  const started = Date.now();
  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const send = (status, body) => {
      const text = JSON.stringify(body);
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(text) });
      res.end(text);
      console.log(`${new Date().toISOString().slice(11, 19)} ${req.method} ${url.pathname} -> ${status} (${Date.now() - started} ms)`);
    };

    // Dev-only switch so the retry behaviour can be shown live.
    if (url.pathname === "/v1/_chaos" && req.method === "POST") {
      chaos = Math.min(1, Math.max(0, Number(url.searchParams.get("rate") ?? 0)));
      return send(200, { chaos });
    }
    if (chaos > 0 && url.pathname !== "/v1/health" && Math.random() < chaos)
      return send(503, { error: "ServiceUnavailable", message: "Simulated server failure (chaos mode)" });

    let body = {};
    if (chunks.length) {
      try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
      catch { return send(400, { error: "InvalidJson", message: "Request body is not valid JSON" }); }
    }
    const ip = String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "").split(",")[0].trim();
    const out = handle({ method: req.method, path: url.pathname, query: url.searchParams, headers: req.headers, body, ip });
    send(out.status, out.body);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`HackTrack server on http://${HOST}:${PORT}  (db: ${DEFAULT_DB}${chaos ? `, chaos ${chaos}` : ""})`);
});
