---
title: Cloudflare stack
description: Workers AI, Vectorize, KV, Durable Objects, and AI Gateway.
---

## Bindings

| Binding | Product | Role |
|---------|---------|------|
| `AI` | Workers AI (+ AI Gateway) | Embeddings and chat completion |
| `VECTORIZE` | Vectorize | Semantic search over doc chunks |
| `DOCS` | KV | Full page Markdown + nav JSON |
| `SESSION` | KV | Astro sessions (optional) |
| `DocsAgent` | Durable Object | Chat agent with SQLite history |
| `ASSETS` | Static Assets | Prerendered Starlight HTML/CSS/JS |

## DocsAgent

`DocsAgent` extends `AIChatAgent` from `@cloudflare/ai-chat`. On each turn it:

1. Persists messages in SQLite on the Durable Object
2. Retrieves relevant chunks (lexical over KV locally; Vectorize when available)
3. Generates a grounded answer with Workers AI (`generateText`)
4. Attaches citation metadata for the chat UI

## Worker entry

The custom Worker routes `/agents/*` to the Agents SDK first, then falls through to Astro:

```ts
import { handle } from "@astrojs/cloudflare/handler";
import { routeAgentRequest } from "agents";
import { DocsAgent } from "@prompton/agent";

export { DocsAgent };

export default {
  async fetch(request, env, ctx) {
    const agentResponse = await routeAgentRequest(request, env);
    if (agentResponse) return agentResponse;
    return handle(request, env, ctx);
  },
};
```
