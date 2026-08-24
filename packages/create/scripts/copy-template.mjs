import {
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const starter = path.resolve(root, "../../examples/starter");
const dest = path.resolve(root, "template");

const SKIP = new Set([
  "node_modules",
  "dist",
  ".astro",
  ".wrangler",
  ".prompton",
  ".dev.vars",
  "worker-configuration.d.ts",
]);

function copyDir(src, destDir) {
  mkdirSync(destDir, { recursive: true });
  for (const entry of readdirSync(src)) {
    if (SKIP.has(entry)) continue;
    const from = path.join(src, entry);
    const to = path.join(destDir, entry);
    if (statSync(from).isDirectory()) copyDir(from, to);
    else cpSync(from, to);
  }
}

/** Keep scaffold wrangler free of account-specific IDs and production domains. */
function sanitizeWrangler(filePath) {
  if (!existsSync(filePath)) return;
  let text = readFileSync(filePath, "utf8");
  let idCount = 0;
  text = text.replace(/"(id|preview_id)":\s*"[0-9a-f]{32}"/gi, (_, key) => {
    const pad = idCount < 2 ? "0" : "1";
    idCount += 1;
    return `"${key}": "${pad.repeat(32)}"`;
  });
  text = text.replace(/"name":\s*"prompton"/, '"name": "prompton-docs"');
  // Drop production custom domains from the scaffold
  text = text.replace(
    /,\s*"routes":\s*\[[\s\S]*?\],/,
    ",",
  );
  text = text.replace(/"workers_dev":\s*true,\s*/, "");
  text = text.replace(/"preview_urls":\s*true,\s*/, "");
  writeFileSync(filePath, text);
}

if (!existsSync(starter)) {
  console.error("examples/starter not found");
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
copyDir(starter, dest);
sanitizeWrangler(path.join(dest, "wrangler.jsonc"));
console.log(`Copied starter → ${dest}`);
