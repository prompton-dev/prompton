# Prompton

Self-hosted **agent-based docs** on [Astro Starlight](https://starlight.astro.build/) — same chrome for **Browse** and **Chat**, deployed on your Cloudflare account.

- **Site:** [prompton.dev](https://prompton.dev) ([www](https://www.prompton.dev))
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
| `examples/starter` | Dogfood / reference site (`prompton.dev`) |

## Develop

```bash
pnpm install
pnpm --filter @prompton-dev/agent build
pnpm --filter @prompton-dev/starlight build
pnpm --filter @prompton-dev/starter dev
```

Chat needs Workers AI (remote). After preview is up:

```bash
# secret lives in examples/starter/.dev.vars
pnpm --filter @prompton-dev/starter reindex
```

## Deploy

```bash
cd examples/starter
pnpm exec wrangler secret put PROMPTON_REINDEX_SECRET
pnpm run deploy
curl -X POST -H "x-prompton-reindex-secret: $PROMPTON_REINDEX_SECRET" \
  https://prompton.dev/api/prompton/reindex
```

Custom domains `prompton.dev` and `www.prompton.dev` are declared in `examples/starter/wrangler.jsonc`.

## CI

GitHub Actions (`.github/workflows/ci.yml`) builds on every PR/push and deploys the starter on `main`.

Repo secrets required for deploy:

| Secret | Purpose |
|--------|---------|
| `CLOUDFLARE_API_TOKEN` | Workers deploy (Edit Workers + Account read) |
| `CLOUDFLARE_ACCOUNT_ID` | `2d19b3b18648f0776ff1435cba466210` |
| `PROMPTON_REINDEX_SECRET` | Same value as the Worker secret |

Optional repo variable: `PROMPTON_URL` (defaults to `https://prompton.dev`).

## Scaffold a new site

```bash
npm create prompton@latest my-docs
```

Published under the **`prompton-dev`** npm org:

- `@prompton-dev/core`
- `@prompton-dev/ui`
- `@prompton-dev/agent`
- `@prompton-dev/indexer`
- `@prompton-dev/starlight`
- `create-prompton`

## License

MIT
