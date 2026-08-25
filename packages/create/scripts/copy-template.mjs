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
const version = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version;

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
  text = text.replace(/,\s*"routes":\s*\[[\s\S]*?\],/, ",");
  text = text.replace(/"workers_dev":\s*true,\s*/, "");
  text = text.replace(/"preview_urls":\s*true,\s*/, "");
  writeFileSync(filePath, text);
}

function sanitizePackageJson(filePath) {
  if (!existsSync(filePath)) return;
  const pkg = JSON.parse(readFileSync(filePath, "utf8"));
  pkg.name = "my-docs";
  pkg.private = true;
  delete pkg.publishConfig;
  for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
    const deps = pkg[field];
    if (!deps) continue;
    for (const [name, range] of Object.entries(deps)) {
      if (range === "workspace:*" && name.startsWith("@prompton-dev/")) {
        deps[name] = `^${version}`;
      }
    }
  }
  writeFileSync(filePath, JSON.stringify(pkg, null, 2) + "\n");
}

function sanitizeAstroConfig(filePath) {
  if (!existsSync(filePath)) return;
  let text = readFileSync(filePath, "utf8");
  text = text.replace(/site:\s*["']https:\/\/prompton\.dev["']/, 'site: "https://example.com"');
  text = text.replace(
    /title:\s*["']Prompton["']/,
    'title: "Docs"',
  );
  text = text.replace(
    /description:\s*["']Conversational documentation sites on Cloudflare["']/,
    'description: "Documentation"',
  );
  writeFileSync(filePath, text);
}

function sanitizeWorker(filePath) {
  if (!existsSync(filePath)) return;
  let text = readFileSync(filePath, "utf8");
  // Drop product-site www→apex redirect from scaffolds
  text = text.replace(
    /\n\s*\/\/ Canonical host: www → apex\n\s*if \(url\.hostname === "www\.prompton\.dev"\) \{[\s\S]*?\}\n/,
    "\n",
  );
  writeFileSync(filePath, text);
}

/**
 * Scaffolds need an ignore file, but npm renames a published `.gitignore` to
 * `.npmignore`. Ship it dot-less and let the CLI restore the dot on copy.
 */
function writeGitignore(dir) {
  writeFileSync(
    path.join(dir, "gitignore"),
    [
      "node_modules",
      "dist",
      ".astro",
      ".wrangler",
      ".prompton",
      "public/.prompton",
      "",
      "# Secrets - never commit",
      ".dev.vars",
      ".dev.vars.*",
      "!.dev.vars.example",
      ".env",
      ".env.*",
      "!.env.example",
      "",
      "worker-configuration.d.ts",
      "*.tsbuildinfo",
      "*.local",
      ".DS_Store",
      "",
    ].join("\n"),
  );
}

function writeDevVarsExample(dir) {
  writeFileSync(
    path.join(dir, ".dev.vars.example"),
    [
      "PROMPTON_REINDEX_SECRET=dev-reindex-secret",
      "# Optional: allow Cloudflare Access–authenticated reindex without the secret",
      "# PROMPTON_REINDEX_ALLOW_ACCESS=1",
      "",
    ].join("\n"),
  );
}

if (!existsSync(starter)) {
  console.error("examples/starter not found");
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
copyDir(starter, dest);
sanitizeWrangler(path.join(dest, "wrangler.jsonc"));
sanitizePackageJson(path.join(dest, "package.json"));
sanitizeAstroConfig(path.join(dest, "astro.config.mjs"));
sanitizeWorker(path.join(dest, "src/worker.ts"));
writeGitignore(dest);
writeDevVarsExample(dest);
console.log(`Copied starter → ${dest} (packages @ ^${version})`);
