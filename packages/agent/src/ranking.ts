import type { Citation, PageContext, SearchHit } from "@prompton-dev/core";
import { docsUrlForChunk } from "@prompton-dev/core";

export function hitKey(h: Pick<SearchHit, "slug" | "heading">): string {
  return `${h.slug}::${h.heading ?? ""}`;
}

/** Merge ranked hit lists; boost the reader's current page; dedupe by slug+heading. */
export function rankHits(
  lists: SearchHit[][],
  pageContext: PageContext | undefined,
  topK = 6,
): SearchHit[] {
  const byKey = new Map<string, SearchHit>();
  for (const list of lists) {
    for (const hit of list) {
      const key = hitKey(hit);
      const existing = byKey.get(key);
      if (!existing || hit.score > existing.score) byKey.set(key, hit);
    }
  }

  const preferred = pageContext?.slug;
  const ranked = [...byKey.values()].sort((a, b) => {
    const aBoost = preferred && a.slug === preferred ? 1000 : 0;
    const bBoost = preferred && b.slug === preferred ? 1000 : 0;
    return b.score + bBoost - (a.score + aBoost);
  });

  return ranked.slice(0, topK);
}

export function citationsFromHits(hits: SearchHit[], max = 4): Citation[] {
  const seen = new Set<string>();
  const out: Citation[] = [];
  for (const h of hits) {
    const key = hitKey(h);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      slug: h.slug,
      title: h.title,
      heading: h.heading || undefined,
      url: docsUrlForChunk(h.slug, h.heading || undefined, h.title),
      excerpt: h.excerpt,
    });
    if (out.length >= max) break;
  }
  return out;
}
