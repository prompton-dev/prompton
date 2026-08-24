---
title: Getting started
description: Scaffold and ship a Prompton docs site on Cloudflare in about 15 minutes.
---

## Goal

By the end of this guide you have a Starlight docs site with **Browse / Chat**, deployed on your Cloudflare account, with answers grounded in your Markdown.

## Prerequisites

- Node.js 22+
- A [Cloudflare](https://dash.cloudflare.com/) account
- Wrangler available via `npx wrangler`

## 1. Scaffold

```bash
npm create prompton@latest my-docs
cd my-docs
npm install
```

## 2. Create Cloudflare resources

```bash
npx wrangler vectorize create prompton-docs --dimensions=1024 --metric=cosine
npx wrangler kv namespace create PROMPTON_DOCS
npx wrangler kv namespace create PROMPTON_SESSION
```

Paste the two KV **id** values into `wrangler.jsonc` (`DOCS` and `SESSION`). Keep the Vectorize `index_name` as `prompton-docs` (or rename the binding and the create command together).

For local semantic search, keep `"remote": true` on the Vectorize binding (Vectorize has no local emulator). Without it, chat still works via lexical search over KV after reindex.

## 3. Run locally

```bash
# optional: put PROMPTON_REINDEX_SECRET=dev-secret in .dev.vars
npm run dev
```

Open the site → **Chat** in the header (or `?mode=chat`). Ask a question after seeding:

```bash
curl -X POST -H "x-prompton-reindex-secret: dev-secret" \
  http://127.0.0.1:4321/api/prompton/reindex
```

Auto-seed also runs on first agent traffic when `/.prompton/index/*` is present from a prior `npm run build`.

## 4. Deploy

```bash
npx wrangler secret put PROMPTON_REINDEX_SECRET
npm run build
npm run deploy
```

Seed production:

```bash
curl -X POST -H "x-prompton-reindex-secret: $PROMPTON_REINDEX_SECRET" \
  https://<your-worker>.workers.dev/api/prompton/reindex
```

Attach a custom domain in the Cloudflare dashboard (Workers → your worker → Domains & Routes) when you are ready.

## Checklist

| Step | Done when |
|------|-----------|
| Scaffold | `npm run dev` serves Starlight |
| Bindings | KV IDs + Vectorize name in `wrangler.jsonc` |
| Chat | Browse/Chat toggle works; agent connects |
| Index | Reindex returns `{ ok: true, ... }` |
| Deploy | Worker URL loads and Chat answers with Sources |

## Next steps

- [Browse and Chat](/guides/browse-chat/) — mode toggle, sessions, citations
- [Cloudflare stack](/guides/cloudflare/) — bindings and Agents SDK
- [Indexing docs](/guides/indexing/) — build-time chunks → Vectorize
