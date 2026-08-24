#!/usr/bin/env node
import { indexDocs } from "./index.js";
import path from "node:path";

async function main() {
  const args = process.argv.slice(2);
  let contentDir = "src/content/docs";
  let outDir = ".prompton/index";
  let locale = "en";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--content" && args[i + 1]) contentDir = args[++i];
    else if (args[i] === "--out" && args[i + 1]) outDir = args[++i];
    else if (args[i] === "--locale" && args[i + 1]) locale = args[++i];
  }

  const root = process.cwd();
  const manifest = await indexDocs({
    contentDir: path.resolve(root, contentDir),
    outDir: path.resolve(root, outDir),
    locale,
  });
  console.log(
    `Indexed ${manifest.pageCount} pages / ${manifest.chunkCount} chunks → ${outDir}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
