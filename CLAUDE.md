# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Prompton is a self-hosted **agent-based docs** system: an Astro Starlight site that renders the same
chrome for a **Browse** pane (normal docs) and a **Chat** pane (RAG over those docs), served by a
single Cloudflare Worker. Published as npm packages under `@prompton-dev/*` plus `create-prompton`.

pnpm workspace (`packages/*`, `examples/*`), Node ≥22, pnpm 10.34.5, TypeScript 7, ESM everywhere.

## Commands

```bash
pnpm install

# Build all workspace packages in dependency order (core → ui → agent → indexer → starlight)
pnpm build:packages

# Run the dogfood site (examples/starter). Packages must be built first — their
# `exports` point at dist/.
pnpm dev            # == pnpm --filter @prompton-dev/starter dev

# Watch-build one package while the site runs
pnpm --filter @prompton-dev/agent dev

pnpm typecheck      # tsc --noEmit across all packages + the starter
pnpm test           # vitest run (unit tests over the pure logic)
pnpm test:watch
```

There is **no linter or formatter** in this repo. The gates are `pnpm test`, `pnpm typecheck`, and a
successful build — CI runs all three plus a scaffold-template drift check.

Tests live next to their sources as `src/**/*.test.ts` and are excluded from every build tsconfig
and from the published tarballs (`ui`/`starlight` publish raw `src`, so their `files` arrays carry
`!src/**/*.test.*` too). `vitest.config.ts` aliases `@prompton-dev/core` to source, so tests run
without building first. Scope is the pure logic only — slug/URL derivation, markdown chunking, hit
ranking, lexical search, rate limiting. Anything needing the Workers runtime is deliberately
untested here.

`examples/starter` typechecks via `tsconfig.typecheck.json`, not `astro check` — the Astro language
server needs a TypeScript API that TS 7 no longer exposes. That config also sets `allowJs: false`,
because Astro's base config would otherwise pull Starlight's raw `.ts` sources into the program and
report errors from `node_modules`.

Full-repo `pnpm build` also builds `examples/starter`, which needs `CLOUDFLARE_API_TOKEN` /
`CLOUDFLARE_ACCOUNT_ID` in the environment — the Astro Cloudflare adapter resolves the `remote`
bindings (Workers AI, Vectorize) at build time. Use `pnpm build:packages` when you only touch
library code.

### Starter site (`examples/starter`)

```bash
pnpm --filter @prompton-dev/starter dev      # astro dev on :4321
pnpm --filter @prompton-dev/starter index    # regenerate .prompton/index from src/content/docs
pnpm --filter @prompton-dev/starter reindex  # POST the built index into KV + Vectorize (local)
pnpm --filter @prompton-dev/starter deploy   # astro build && wrangler deploy
```

Chat needs Workers AI and Vectorize, which are **remote-only** even in local dev (see the `remote:
true` flags in `wrangler.jsonc`); `examples/starter/.dev.vars` holds the local token and
`PROMPTON_REINDEX_SECRET`.

## Architecture

### Request path

Everything goes through one Worker (`examples/starter/src/worker.ts`), with
`assets.run_worker_first: true` so the Worker sees requests before static HTML:

1. `POST /api/prompton/reindex` → auth (constant-time secret compare, or Cloudflare Access email
   header when `PROMPTON_REINDEX_ALLOW_ACCESS`), KV rate limit, then `syncDocsIndex`.
2. `/agents/*` → `routeAgentRequest` from the Agents SDK → the `DocsAgent` Durable Object
   (WebSocket). **WebSocket upgrades are deliberately not rate-limited or blocked on seeding** —
   don't add awaits on that path.
3. Everything else → Astro SSR via `@astrojs/cloudflare/handler`.

`seedOnce` lazily loads `/.prompton/index/*` out of the ASSETS binding into KV on first request if
KV is empty, so a fresh deploy has retrieval data without an explicit reindex.

### Indexing pipeline (`packages/indexer` → `packages/agent/src/sync.ts`)

- `promptonIndexer()` is an Astro integration that runs on `astro:build:done`. It chunks markdown by
  `#`–`###` headings into `DocChunk`s and writes `.prompton/index/{manifest.json,nav.json,chunks.jsonl,pages/*.md}`,
  copying the same tree into `public/.prompton/index` and the client build dir so ASSETS can serve it.
- `syncDocsIndex` (runs *inside* the Worker) writes `nav`/`manifest`/`chunks`/`page:{slug}` to the
  `DOCS` KV namespace, then embeds chunks in batches of 20 with `@cf/baai/bge-m3` and upserts to
  Vectorize. Vectorize failures are collected as `warnings`, not thrown — the site stays up.
- `packages/indexer` also ships a `prompton-index` CLI for generating the index without a build.

`examples/starter/scripts/sync-index.mjs` only *prints* wrangler commands; it does not upload.

### Retrieval and chat (`packages/agent`)

`DocsAgent extends AIChatAgent` (from `@cloudflare/ai-chat`, on the Agents SDK). Per message:

- KV fixed-window rate limit (20/60s per DO name).
- `retrieve()` runs **both** a Vectorize query and a `lexicalSearch` over the KV chunk catalog, then
  `rankHits` merges/dedupes by `slug::heading` and applies a +1000 score boost to the reader's
  current page. The lexical path is the fallback when Vectorize is empty or errors.
- Retrieved hits go into the system prompt; the agent is explicitly told **not** to call tools.
- The response is `generateText` (not `streamText`) wrapped in a `createUIMessageStream`, then
  re-emitted word-by-word via `streamWords`. This is intentional: it avoids a Workers AI
  native+OpenAI double-emit while keeping a typewriter feel. `citations` ride on the stream's
  `messageMetadata` at both `start` and `finish`.
- `setPageContext` is a `@callable()` RPC the client calls on mount/navigation.

Models are pinned in `packages/agent/src/models.ts` (`@cf/baai/bge-m3`,
`@cf/meta/llama-3.3-70b-instruct-fp8-fast`).

### Browse/Chat mode switching (`packages/starlight`)

The Starlight plugin overrides `Head`, `PageFrame`, `Header`, `Search`, and `Sidebar`. Mode is
driven by the `?mode=chat` query param, materialized as `html[data-prompton-mode]`:

- `Head.astro` sets the attribute in an **inline pre-paint script** — required because Starlight
  prerenders pages and cannot see `?mode=chat` at build time.
- `PageFrame.astro` keeps **both panes mounted** and toggles visibility with CSS; the mode links do
  a `history.pushState` soft switch (plus `b`/`c` keyboard shortcuts) so the chat WebSocket survives
  toggling.
- Plugin options reach components through a `globalThis.__PROMPTON__` handoff set in
  `config:setup` (Starlight plugins have no other channel to component props).
- `packages/starlight` exports `./components/*` from `src/`, not `dist/` — editing an `.astro`
  component needs no rebuild, but editing `src/index.ts` does.

Chat sessions are Durable Object names: a `prompton_sid` cookie plus a localStorage list
(`packages/ui/src/sessions.ts`) that both `ChatIsland.tsx` and the vanilla script in `Sidebar.astro`
read — the two implementations must stay in sync on `STORAGE_KEY`, event name, and title rules.

### Package graph

`core` (pure types + URL/slug helpers, no deps) ← `ui` (React chat components) ← `starlight`
(Astro/Starlight chrome), and `core` ← `agent` / `indexer`. Peer dependencies are wide ranges;
`devDependencies` pin the versions actually built against.

## Editing rules worth knowing

- **`packages/create/template/` is generated — never edit it by hand.** `pnpm --filter
  create-prompton build` regenerates it from `examples/starter` via
  `packages/create/scripts/copy-template.mjs`, which strips account-specific KV IDs, the
  `prompton.dev` custom domains/`workers_dev`, the `www→apex` redirect in `worker.ts`, rewrites
  `workspace:*` deps to `^<create-prompton version>`, and writes `.dev.vars.example` plus a
  dot-less `gitignore`. Change the starter, then rebuild — CI fails on drift via
  `git diff --exit-code -- packages/create/template`.
- **The scaffold's ignore file ships as `template/gitignore`, without the dot, on purpose.** npm
  renames a published `.gitignore` to `.npmignore`, so the dot is restored by `copyDir` in
  `cli.ts` at scaffold time. Keep both halves in sync or generated projects lose secret-ignoring.
  That sanitizer works by regex against specific strings in the starter — if you rename or reword
  those lines (the `// Canonical host: www → apex` comment, `"name": "prompton"`, the `site:`/
  `title:` values in `astro.config.mjs`), update `copy-template.mjs` to match.
- **Releasing goes through changesets.** Add `pnpm changeset` in any PR that changes published
  behavior, then release with:

  ```bash
  pnpm version-packages   # changeset version + regenerate the scaffold template
  # commit, PR, merge, then publish by cutting a GitHub Release
  ```

  All six published packages are a `fixed` group, so they always move to one shared version even
  when a changeset touches only one — `create-prompton` pins the others at `^<its own version>` in
  the generated template, so they cannot drift apart. `@prompton-dev/starter` is in `ignore`.

  `version-packages` deliberately chains `pnpm --filter create-prompton build`: bumping the version
  changes the deps pinned into `packages/create/template/package.json`, and skipping the rebuild
  fails CI's template drift check.

  There is intentionally **no changesets bot PR**. Anything opened with the default `GITHUB_TOKEN`
  does not trigger workflows, so the `Build` check would never report and the branch ruleset would
  block the merge forever. Run `version-packages` locally and open the PR yourself; a PAT would be
  the alternative if this is ever automated.
- Publishing runs on GitHub Release / `workflow_dispatch` via npm **Trusted Publishing (OIDC)** —
  never add `NPM_TOKEN`/`NODE_AUTH_TOKEN` to `.github/workflows/publish.yml`.
- CI (`.github/workflows/ci.yml`) builds each package explicitly and deploys the starter + reindexes
  on pushes to `main`; deploy steps self-skip when `CLOUDFLARE_API_TOKEN` is absent.
- `tsconfig.base.json` sets `verbatimModuleSyntax` and `isolatedModules` — use `import type` for
  type-only imports and `.js` extensions on relative imports.
