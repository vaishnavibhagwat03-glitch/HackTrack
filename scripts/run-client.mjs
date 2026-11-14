// Runs the built C++ client (or its unit tests) with the given arguments.
//   node scripts/run-client.mjs --demo | --bench | --console | --bridge
//   node scripts/run-client.mjs --tests   (data-structure + algorithm tests)
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const build = join(root, "hacktrack-client", "build");
const exe = (name) => join(build, process.platform === "win32" ? `${name}.exe` : name);

const args = process.argv.slice(2);
const run = (file, a = []) => {
  if (!existsSync(file)) {
    console.error(`Missing ${file}\nBuild the C++ client first: npm run client:build`);
    process.exit(1);
  }
  const r = spawnSync(file, a, { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

if (args[0] === "--tests") {
  run(exe("ht_tests"));
  run(exe("ht_algorithms"));
} else {
  run(exe("hacktrack"), args);
}
