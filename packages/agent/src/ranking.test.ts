import { describe, expect, it } from "vitest";
import type { SearchHit } from "@prompton-dev/core";
import { citationsFromHits, rankHits } from "./ranking.js";

function hit(partial: Partial<SearchHit> & { slug: string }): SearchHit {
  return {
    title: partial.title ?? partial.slug,
    heading: partial.heading ?? "",
    excerpt: partial.excerpt ?? "excerpt",
    score: partial.score ?? 1,
    url: partial.url ?? `/${partial.slug}/`,
    ...partial,
  };
}

describe("rankHits", () => {
  it("dedupes by slug+heading, keeping the higher score", () => {
    const ranked = rankHits(
      [[hit({ slug: "a", heading: "H", score: 2 })], [hit({ slug: "a", heading: "H", score: 9 })]],
      undefined,
    );
    expect(ranked).toHaveLength(1);
    expect(ranked[0].score).toBe(9);
  });

  it("treats different headings on one page as distinct hits", () => {
    const ranked = rankHits([[hit({ slug: "a", heading: "One" }), hit({ slug: "a", heading: "Two" })]], undefined);
    expect(ranked).toHaveLength(2);
  });

  it("sorts by score descending", () => {
    const ranked = rankHits([[hit({ slug: "low", score: 1 }), hit({ slug: "high", score: 5 })]], undefined);
    expect(ranked.map((h) => h.slug)).toEqual(["high", "low"]);
  });

  it("boosts the page the reader is currently on", () => {
    const ranked = rankHits(
      [[hit({ slug: "other", score: 100 }), hit({ slug: "current", score: 1 })]],
      { slug: "current", title: "Current" },
    );
    expect(ranked[0].slug).toBe("current");
  });

  it("respects topK", () => {
    const hits = Array.from({ length: 10 }, (_, i) => hit({ slug: `s${i}`, score: i }));
    expect(rankHits([hits], undefined, 3)).toHaveLength(3);
  });
});

describe("citationsFromHits", () => {
  it("derives deep-linked urls and drops empty headings", () => {
    const [withHeading, withoutHeading] = citationsFromHits([
      hit({ slug: "guides/a", title: "A", heading: "Deep Section" }),
      hit({ slug: "guides/b", title: "B", heading: "" }),
    ]);
    expect(withHeading.url).toBe("/guides/a/#deep-section");
    expect(withHeading.heading).toBe("Deep Section");
    expect(withoutHeading.url).toBe("/guides/b/");
    expect(withoutHeading.heading).toBeUndefined();
  });

  it("dedupes and caps the list", () => {
    const hits = [
      hit({ slug: "a", heading: "H" }),
      hit({ slug: "a", heading: "H" }),
      hit({ slug: "b" }),
      hit({ slug: "c" }),
      hit({ slug: "d" }),
      hit({ slug: "e" }),
    ];
    expect(citationsFromHits(hits)).toHaveLength(4);
    expect(citationsFromHits(hits, 2).map((c) => c.slug)).toEqual(["a", "b"]);
  });
});
