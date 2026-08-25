# @prompton-dev/indexer

Turns a Starlight content directory into the index [Prompton](https://prompton.dev) serves to its
docs agent: heading-scoped chunks, a nav tree, and per-page markdown.

```bash
npm install @prompton-dev/indexer
```

## As an Astro integration

Runs on `astro:build:done` and writes the index into your build output so the Worker's `ASSETS`
binding can serve it:

```js
import { promptonIndexer } from "@prompton-dev/indexer/astro";

export default defineConfig({
  integrations: [
    promptonIndexer({ contentDir: "src/content/docs", outDir: ".prompton/index" }),
  ],
});
```

## As a CLI

```bash
npx prompton-index --content src/content/docs --out .prompton/index [--locale en]
```

## Output

```
.prompton/index/
  manifest.json   # generatedAt, pageCount, chunkCount, nav, pages
  nav.json        # NavItem[]
  chunks.jsonl    # one DocChunk per line
  pages/<slug>.md # full page bodies (slashes in slugs become __)
```

Markdown is split on `#`–`###` headings, each chunk keeping its `headingPath` for breadcrumbs and
deep links. Frontmatter `draft: true` pages and `404` are skipped.

## Programmatic

```ts
import { indexDocs, collectDocs, chunkMarkdown, buildNav } from "@prompton-dev/indexer";

const manifest = await indexDocs({ contentDir, outDir, locale: "en" });
```

## License

MIT
