// Starts a throw-away server (fresh database, port 4100), runs the C++
// end-to-end tests (report Table 3) against it, then stops the server.
// Run: node scripts/integration.mjs
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const exe = join(root, "hacktrack-client", "build", process.platform === "win32" ? "ht_integration.exe" : "ht_integration");
if (!existsSync(exe)) {
  console.error(`Build the client first (missing ${exe})`);
  process.exit(1);
}
const dir = mkdtempSync(join(tmpdir(), "hacktrack-"));
const env = { ...process.env, HACKTRACK_DB: join(dir, "test.db"), PORT: "4100" };

const server = spawn(process.execPath, [join(root, "server", "src", "index.mjs")], { env, stdio: ["ignore", "pipe", "inherit"] });
await new Promise((resolve, reject) => {
  server.stdout.on("data", (d) => { if (String(d).includes("HackTrack server on")) resolve(); });
  server.on("exit", (c) => reject(new Error(`server exited ${c}`)));
});

const r = spawnSync(exe, { stdio: "inherit", env: { ...process.env, HT_TEST_PORT: "4100" } });
server.kill();
await new Promise((res) => server.on("exit", res));
rmSync(dir, { recursive: true, force: true });
process.exit(r.status ?? 1);
