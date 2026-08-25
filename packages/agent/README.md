# @prompton-dev/agent

The `DocsAgent` Durable Object behind [Prompton](https://prompton.dev) — retrieval-augmented chat
over your Starlight docs, running on Cloudflare Workers AI, Vectorize, and KV.

```bash
npm install @prompton-dev/agent
```

Peers: `agents`, `@cloudflare/ai-chat`, `ai`, `workers-ai-provider`, `zod`.

## Usage

Export the agent from your Worker and route to it:

```ts
import { routeAgentRequest } from "agents";
import { DocsAgent } from "@prompton-dev/agent";

export { DocsAgent };

export default {
  async fetch(request, env, ctx) {
    return (await routeAgentRequest(request, env)) ?? new Response("Not found", { status: 404 });
  },
};
```

Required bindings: `AI`, `VECTORIZE`, `DOCS` (KV). Optional: `SESSION` (KV, used for rate-limit
counters), `ASSETS`.

```jsonc
"durable_objects": { "bindings": [{ "name": "DocsAgent", "class_name": "DocsAgent" }] },
"migrations": [{ "tag": "v1", "new_sqlite_classes": ["DocsAgent"] }]
```

## How retrieval works

Each message runs a Vectorize query **and** a lexical scan over the KV chunk catalog, then merges
them — so chat still answers when Vectorize is empty, cold, or erroring. `rankHits` dedupes by
slug + heading and boosts the page the reader is currently on. Citations ride on the response
stream's `messageMetadata`.

The agent is a retrieve-then-generate loop with **no client tools**; it answers only from retrieved
excerpts.

Models are pinned: `@cf/baai/bge-m3` for embeddings, `@cf/meta/llama-3.3-70b-instruct-fp8-fast`
for chat.

## Indexing

Push a built index into KV + Vectorize from your Worker:

```ts
import { syncDocsIndex } from "@prompton-dev/agent";

const result = await syncDocsIndex(env, payload); // { pages, chunks, vectors, warnings }
```

Vectorize failures are collected in `warnings` rather than thrown — KV lexical search keeps the site
answering. Generate `payload` with [`@prompton-dev/indexer`](https://www.npmjs.com/package/@prompton-dev/indexer).

## Also exported

`retrieve`, `rankHits`, `citationsFromHits`, `lexicalSearch`, `loadChunksFromKv`,
`consumeRateLimit`, `clientIp`, `docsSystemPrompt`, `CHAT_MODEL`, `EMBEDDING_MODEL`.

## License

MIT
