---
title: Indexing docs
description: How Prompton turns Markdown into Vectorize vectors and KV pages.
---

## Build-time index

On `astro build`, the `@prompton/indexer` integration:

1. Reads `src/content/docs/**/*.{md,mdx}`
2. Chunks on headings
3. Writes `.prompton/index/` (`manifest.json`, `chunks.jsonl`, page bodies, nav)

## Upload to Cloudflare

After `astro build`, the index is also copied to `public/.prompton/index` (served as static assets).

Seed KV + Vectorize from the running Worker (requires `PROMPTON_REINDEX_SECRET`):

```bash
# local preview (.dev.vars)
curl -X POST -H "x-prompton-reindex-secret: $PROMPTON_REINDEX_SECRET" \
  http://127.0.0.1:4321/api/prompton/reindex

# after deploy
curl -X POST -H "x-prompton-reindex-secret: $PROMPTON_REINDEX_SECRET" \
  https://your-worker.example/api/prompton/reindex
```

The endpoint:

1. Reads `/.prompton/index/*` from Workers Static Assets
2. Writes `nav`, `manifest`, `chunks`, and `page:{slug}` into the `DOCS` KV namespace
3. Embeds chunks with Workers AI (`@cf/baai/bge-m3`) and upserts Vectorize

If Vectorize is unavailable locally, chat still works via **lexical search** over the KV `chunks` catalog. For semantic search in `astro preview`, set `"remote": true` on the Vectorize binding in `wrangler.jsonc` (after creating the index).

You can run the local chunker anytime:

```bash
npm run index
```

## How chat uses the index

On each question, `DocsAgent` retrieves top chunks first, then generates an answer. Citations in the UI come from those retrieval hits (not from model tool calls).
