#!/usr/bin/env node
import prompts from "prompts";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

async function main() {
  const argName = process.argv[2];
  const response = await prompts(
    [
      {
        type: argName ? null : "text",
        name: "name",
        message: "Project name",
        initial: "my-docs",
      },
    ],
    { onCancel: () => process.exit(1) },
  );

  const name = (argName || response.name || "my-docs").trim();
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
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      name: string;
      private?: boolean;
      dependencies?: Record<string, string>;
    };
    pkg.name = name;
    // Prefer published package versions outside the monorepo
    if (pkg.dependencies) {
      for (const key of Object.keys(pkg.dependencies)) {
        if (pkg.dependencies[key] === "workspace:*") {
          pkg.dependencies[key] = "^0.1.0";
        }
      }
    }
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  }

  console.log(`
Created ${name} (Cloudflare / Starlight + Prompton)

  cd ${name}
  npm install
  npm run dev

Before deploy, create Vectorize + KV and update wrangler.jsonc:

  npx wrangler vectorize create prompton-docs --dimensions=1024 --metric=cosine
  npx wrangler kv namespace create PROMPTON_DOCS
  npx wrangler kv namespace create PROMPTON_SESSION

  npm run index
  npm run deploy
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
