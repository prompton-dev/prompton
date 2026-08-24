---
title: Getting started
description: Scaffold and run a Prompton docs site on Cloudflare.
---

## Prerequisites

- Node.js 22+
- A [Cloudflare](https://dash.cloudflare.com/) account
- Wrangler (`npx wrangler`)

## Create a project

```bash
npm create prompton@latest my-docs
cd my-docs
npm install
```

## Local development

```bash
npm run dev
```

Open the site, then use the **Browse / Chat** toggle in the header. Chat mode connects to `DocsAgent` over the Agents SDK WebSocket.

## Cloudflare resources

Create Vectorize and KV before the first deploy (or update IDs in `wrangler.jsonc`):

```bash
npx wrangler vectorize create prompton-docs --dimensions=1024 --metric=cosine
npx wrangler kv namespace create PROMPTON_DOCS
npx wrangler kv namespace create PROMPTON_SESSION
```

Paste the returned KV IDs into `wrangler.jsonc`. Keep the Vectorize binding `index_name` as `prompton-docs` (or rename both).

For **local preview** semantic search, add `"remote": true` on the Vectorize binding so Wrangler talks to your real index (Vectorize has no local emulator). Without it, chat falls back to lexical search over KV after `POST /api/prompton/reindex`.

Then:

```bash
npm run build
npm run deploy
# seed production index (requires PROMPTON_REINDEX_SECRET Worker secret)
curl -X POST -H "x-prompton-reindex-secret: $PROMPTON_REINDEX_SECRET" \
  https://<your-worker>.workers.dev/api/prompton/reindex
```

## Next steps

- [Browse and Chat](/guides/browse-chat/)
- [Cloudflare stack](/guides/cloudflare/)
- [Indexing docs](/guides/indexing/)
