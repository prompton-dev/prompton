#!/usr/bin/env node
import prompts from "prompts";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(path.resolve(__dirname, "../package.json"), "utf8")) as {
  version: string;
};
const VERSION = pkg.version;

function copyDir(src: string, dest: string) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    if (entry === "node_modules" || entry === "dist" || entry === ".astro" || entry === ".wrangler") {
      continue;
    }
    const from = path.join(src, entry);
    const to = path.join(dest, entry);
    if (statSync(from).isDirectory()) copyDir(from, to);
    else cpSync(from, to);
  }
}

function parseArgs(argv: string[]) {
  const out: { name?: string; yes: boolean } = { yes: false };
  for (const arg of argv) {
    if (arg === "-y" || arg === "--yes") out.yes = true;
    else if (!arg.startsWith("-") && !out.name) out.name = arg;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let name = args.name;

  if (!name) {
    if (args.yes) {
      name = "my-docs";
    } else {
      const response = await prompts(
        [
          {
            type: "text",
            name: "name",
            message: "Project name",
            initial: "my-docs",
          },
        ],
        { onCancel: () => process.exit(1) },
      );
      name = String(response.name || "my-docs").trim();
    }
  }

  name = String(name).trim() || "my-docs";
  const target = path.resolve(process.cwd(), name);

  if (existsSync(target) && readdirSync(target).length > 0) {
    console.error(`Directory ${name} is not empty.`);
    process.exit(1);
  }

  const template = path.resolve(__dirname, "../template");
  if (!existsSync(template)) {
    console.error("Template missing. Reinstall create-prompton or build from the monorepo.");
    process.exit(1);
  }

  copyDir(template, target);

  const pkgPath = path.join(target, "package.json");
  if (existsSync(pkgPath)) {
    const projectPkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      name: string;
      private?: boolean;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    projectPkg.name = name;
    projectPkg.private = true;
    for (const field of ["dependencies", "devDependencies"] as const) {
      const deps = projectPkg[field];
      if (!deps) continue;
      for (const key of Object.keys(deps)) {
        if (deps[key] === "workspace:*" || (key.startsWith("@prompton-dev/") && deps[key]?.startsWith("workspace:"))) {
          deps[key] = `^${VERSION}`;
        }
      }
    }
    writeFileSync(pkgPath, JSON.stringify(projectPkg, null, 2) + "\n");
  }

  const title = name
    .replace(/^@.*\//, "")
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ") || "Docs";

  const astroPath = path.join(target, "astro.config.mjs");
  if (existsSync(astroPath)) {
    let astro = readFileSync(astroPath, "utf8");
    astro = astro.replace(/title:\s*["'][^"']*["']/, `title: ${JSON.stringify(title)}`);
    writeFileSync(astroPath, astro);
  }

  console.log(`
Created ${name} with create-prompton@${VERSION}

  cd ${name}
  cp .dev.vars.example .dev.vars   # optional local reindex secret
  npm install
  npm run build && npm run reindex # after \`npm run dev\` is up, or use auto-seed
  npm run dev

Ship checklist (≈15 min): https://prompton.dev/guides/getting-started/

  npx wrangler vectorize create prompton-docs --dimensions=1024 --metric=cosine
  npx wrangler kv namespace create PROMPTON_DOCS
  npx wrangler kv namespace create PROMPTON_SESSION
  # paste KV ids into wrangler.jsonc, then:
  npx wrangler secret put PROMPTON_REINDEX_SECRET
  npm run deploy
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
