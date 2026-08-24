#!/usr/bin/env node
/**
 * Upload .prompton/index artifacts to KV + Vectorize via Wrangler API bindings in a one-shot Worker script.
 * For local/dev, prefer: wrangler kv key put + a small upload worker.
 *
 * This script writes a sync manifest and prints wrangler commands for operators.
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const indexDir = path.resolve(root, ".prompton/index");

async function main() {
  const manifest = JSON.parse(await readFile(path.join(indexDir, "manifest.json"), "utf8"));
  const nav = await readFile(path.join(indexDir, "nav.json"), "utf8");
  const chunks = (await readFile(path.join(indexDir, "chunks.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));

  console.log(`Prompton sync plan`);
  console.log(`  pages: ${manifest.pageCount}`);
  console.log(`  chunks: ${chunks.length}`);
  console.log(`
KV:
  wrangler kv key put --binding=DOCS nav '${nav.replace(/'/g, "'\\''")}'

  # For each page under .prompton/index/pages/*.md:
  # wrangler kv key put --binding=DOCS page:{slug} --path .prompton/index/pages/{file}.md

Vectorize:
  Embed chunks with Workers AI @cf/baai/bge-m3 (1024-dim for bge-m3) then:
  wrangler vectorize insert prompton-docs --file=vectors.ndjson

See docs: guides/indexing
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
