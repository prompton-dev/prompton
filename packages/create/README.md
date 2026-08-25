# create-prompton

Scaffold a [Prompton](https://prompton.dev) docs site — Astro Starlight with a built-in docs agent,
deployed to your own Cloudflare account.

```bash
npm create prompton@latest my-docs
```

Flags: `-y` / `--yes` to skip the prompt.

## What you get

A ready-to-deploy Astro Starlight site with Browse/Chat mode switching, a `DocsAgent` Durable
Object, the build-time indexer wired into `astro.config.mjs`, an authenticated
`POST /api/prompton/reindex` endpoint, and a `wrangler.jsonc` with every binding declared.

## After scaffolding

```bash
cd my-docs
cp .dev.vars.example .dev.vars
npm install
npm run dev
```

Chat needs Workers AI and Vectorize, which are remote-only even in local dev.

To deploy, create the resources and paste the ids into `wrangler.jsonc`:

```bash
npx wrangler vectorize create prompton-docs --dimensions=1024 --metric=cosine
npx wrangler kv namespace create PROMPTON_DOCS
npx wrangler kv namespace create PROMPTON_SESSION
npx wrangler secret put PROMPTON_REINDEX_SECRET
npm run deploy
```

Full walkthrough: [prompton.dev/guides/getting-started](https://prompton.dev/guides/getting-started/)

## License

MIT
