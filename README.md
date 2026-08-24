# Prompton

Self-hosted **agent-based docs** on [Astro Starlight](https://starlight.astro.build/) — same chrome for **Browse** and **Chat**, deployed on your Cloudflare account.

- **Repo:** [prompton-dev/prompton](https://github.com/prompton-dev/prompton)
- **Stack:** Workers · Workers AI · Vectorize · KV · Durable Objects (Agents SDK)

## Monorepo

| Path | Role |
|------|------|
| `packages/core` | Shared types |
| `packages/ui` | Chat UI |
| `packages/starlight` | Starlight Browse/Chat plugin |
| `packages/agent` | `DocsAgent` + RAG sync |
| `packages/indexer` | Markdown → `.prompton/index` |
| `packages/create` | `create-prompton` CLI |
| `examples/starter` | Dogfood / reference site |

## Develop

```bash
pnpm install
pnpm --filter @prompton/agent build
pnpm --filter @prompton/starlight build
pnpm --filter @prompton/starter dev
```

Chat needs Workers AI (remote). After preview is up:

```bash
# secret lives in examples/starter/.dev.vars
pnpm --filter @prompton/starter reindex
```

## Deploy the starter

```bash
cd examples/starter
# KV + Vectorize already wired in wrangler.jsonc for this account
pnpm exec wrangler secret put PROMPTON_REINDEX_SECRET
pnpm run deploy
curl -X POST -H "x-prompton-reindex-secret: $PROMPTON_REINDEX_SECRET" \
  https://prompton.<account>.workers.dev/api/prompton/reindex
```

## Scaffold a new site

```bash
npm create prompton@latest my-docs
```

(Requires publishing `create-prompton` / `@prompton/*` to npm.)

## License

MIT
