import type { DocChunk, IndexManifest, NavItem, SearchHit } from "@prompton-dev/core";
import { EMBEDDING_MODEL } from "./models.js";

export interface SyncEnv {
  AI: Ai;
  VECTORIZE: VectorizeIndex;
  DOCS: KVNamespace;
}

export interface SyncPayload {
  manifest: IndexManifest;
  nav: NavItem[];
  chunks: DocChunk[];
  pages: Array<{ slug: string; body: string }>;
}

export interface SyncResult {
  pages: number;
  chunks: number;
  vectors: number;
  warnings: string[];
}

async function embedTexts(ai: Ai, texts: string[]): Promise<number[][]> {
  const result = (await ai.run(
    EMBEDDING_MODEL,
    { text: texts },
    { gateway: { id: "default" } },
  )) as { data?: number[][] };
  if (!result.data?.length) throw new Error("Embedding failed");
  return result.data;
}

/** Upload nav, page bodies, chunk catalog to KV; embed + upsert Vectorize. */
export async function syncDocsIndex(env: SyncEnv, payload: SyncPayload): Promise<SyncResult> {
  const warnings: string[] = [];

  await env.DOCS.put("nav", JSON.stringify(payload.nav));
  await env.DOCS.put("manifest", JSON.stringify(payload.manifest));
  await env.DOCS.put("chunks", JSON.stringify(payload.chunks));

  for (const page of payload.pages) {
    await env.DOCS.put(`page:${page.slug}`, page.body);
  }

  let vectors = 0;
  const batchSize = 20;
  try {
    for (let i = 0; i < payload.chunks.length; i += batchSize) {
      const batch = payload.chunks.slice(i, i + batchSize);
      const embeddings = await embedTexts(
        env.AI,
        batch.map((c) => `${c.title}\n${c.heading}\n${c.content}`.slice(0, 6000)),
      );
      await env.VECTORIZE.upsert(
        batch.map((c, idx) => ({
          id: c.id,
          values: embeddings[idx],
          metadata: {
            slug: c.slug,
            title: c.title,
            heading: c.heading,
            excerpt: c.content.slice(0, 240),
            url: c.slug ? `/${c.slug}/` : "/",
            content: c.content.slice(0, 500),
          },
        })),
      );
      vectors += batch.length;
    }
  } catch (err) {
    warnings.push(`Vectorize upsert skipped: ${(err as Error).message}`);
  }

  return {
    pages: payload.pages.length,
    chunks: payload.chunks.length,
    vectors,
    warnings,
  };
}

/** Lexical fallback when Vectorize is empty or unavailable. */
export function lexicalSearch(chunks: DocChunk[], query: string, topK = 6): SearchHit[] {
  const terms = query
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length > 2);
  if (!terms.length) return [];

  const scored = chunks.map((c) => {
    const hay = `${c.title} ${c.heading} ${c.content}`.toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (hay.includes(t)) score += 1;
      if (c.title.toLowerCase().includes(t)) score += 2;
      if (c.heading.toLowerCase().includes(t)) score += 1;
    }
    return { c, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ c, score }) => ({
      slug: c.slug,
      title: c.title,
      heading: c.heading,
      excerpt: c.content.slice(0, 240),
      score,
      url: c.slug ? `/${c.slug}/` : "/",
    }));
}

export async function loadChunksFromKv(docs: KVNamespace): Promise<DocChunk[]> {
  const raw = await docs.get("chunks");
  if (!raw) return [];
  return JSON.parse(raw) as DocChunk[];
}
