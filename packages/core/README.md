# @prompton-dev/core

Shared types and URL helpers for [Prompton](https://prompton.dev) — self-hosted agent-based docs on
Astro Starlight and Cloudflare.

Zero dependencies. Every other Prompton package depends on this one; you rarely install it directly.

```bash
npm install @prompton-dev/core
```

## Types

`PromptonMode`, `PageContext`, `DocChunk`, `SearchHit`, `NavItem`, `Citation`, `IndexManifest`,
`PromptonClientConfig`.

## Helpers

```ts
import { docsUrlForChunk, headingSlug } from "@prompton-dev/core";

headingSlug("Browse / Chat");
// "browse-chat"  — GitHub/Starlight-compatible anchor id

docsUrlForChunk("guides/indexing", "Chunking rules");
// "/guides/indexing/#chunking-rules"

docsUrlForChunk("guides/indexing", "Indexing", "Indexing");
// "/guides/indexing/"  — anchor omitted when the heading is the page title

docsUrlForChunk("index");
// "/"
```

## License

MIT
