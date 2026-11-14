// One command for the whole system:
//   1. Node + SQLite server   (127.0.0.1:4000)
//   2. C++ client, bridge mode (localhost:8080)  <- the website talks only to this
//   3. Next.js website         (localhost:3000)
// Ctrl+C stops all three.
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const exe = join(root, "hacktrack-client", "build", process.platform === "win32" ? "hacktrack.exe" : "hacktrack");
if (!existsSync(exe)) {
  console.error(`C++ client not built (${exe}).\nRun: npm run client:build`);
  process.exit(1);
}
if (!existsSync(join(root, "node_modules"))) {
  console.error("Website dependencies missing. Run: npm install");
  process.exit(1);
}

const children = [];
const colors = { server: "\x1b[36m", client: "\x1b[33m", web: "\x1b[35m" };
function start(name, cmd, args, opts = {}) {
  const child = spawn(cmd, args, { cwd: root, shell: process.platform === "win32" && cmd === "npm", ...opts });
  const tag = `${colors[name]}[${name}]\x1b[0m `;
  const pipe = (stream) => stream.on("data", (d) => String(d).split(/\r?\n/).filter(Boolean).forEach((l) => console.log(tag + l)));
  pipe(child.stdout);
  pipe(child.stderr);
  child.on("exit", (code) => { console.log(`${tag}exited (${code})`); shutdown(); });
  children.push(child);
  return child;
}
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  for (const c of children) {
    try {
      // On Windows `npm run dev` runs inside cmd.exe: kill the whole tree, or
      // the Next.js server is orphaned and keeps port 3000 busy.
      if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(c.pid), "/T", "/F"], { stdio: "ignore" });
      else c.kill();
    } catch {}
  }
  setTimeout(() => process.exit(0), 300);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function waitFor(url, label) {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(url); if (r.ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  console.error(`${label} did not start in time`);
  shutdown();
}

start("server", process.execPath, [join(root, "server", "src", "index.mjs")]);
await waitFor("http://127.0.0.1:4000/v1/health", "Server");
start("client", exe, ["--bridge"]);
await waitFor("http://127.0.0.1:8080/api/health", "C++ client");
start("web", "npm", ["run", "dev"]);
console.log("\n  Open http://localhost:3000  (Ctrl+C stops everything)\n");
