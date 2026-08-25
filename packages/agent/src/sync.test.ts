import { describe, expect, it } from "vitest";
import type { DocChunk } from "@prompton-dev/core";
import { lexicalSearch } from "./sync.js";

function chunk(partial: Partial<DocChunk> & { slug: string }): DocChunk {
  return {
    id: partial.id ?? partial.slug,
    title: partial.title ?? "Title",
    heading: partial.heading ?? "",
    headingPath: partial.headingPath ?? [],
    content: partial.content ?? "",
    locale: "en",
    ...partial,
  };
}

describe("lexicalSearch", () => {
  const chunks = [
    chunk({ slug: "guides/indexing", title: "Indexing", content: "How the indexer chunks markdown" }),
    chunk({ slug: "guides/cloudflare", title: "Cloudflare", content: "Workers and Vectorize" }),
  ];

  it("ignores queries with only short tokens", () => {
    expect(lexicalSearch(chunks, "a of to")).toEqual([]);
    expect(lexicalSearch(chunks, "")).toEqual([]);
  });

  it("drops chunks with no term overlap", () => {
    expect(lexicalSearch(chunks, "kubernetes")).toEqual([]);
  });

  it("weights title matches above body matches", () => {
    const [top] = lexicalSearch(chunks, "indexing");
    expect(top.slug).toBe("guides/indexing");
    // body hit (1) + title hit (2)
    expect(top.score).toBe(3);
  });

  it("adds a heading bonus", () => {
    const withHeading = [chunk({ slug: "a", title: "T", heading: "Vectorize", content: "Vectorize notes" })];
    expect(lexicalSearch(withHeading, "vectorize")[0].score).toBe(2);
  });

  it("returns browse urls and truncated excerpts", () => {
    const long = [chunk({ slug: "a", title: "T", content: `vectorize ${"x".repeat(500)}` })];
    const [result] = lexicalSearch(long, "vectorize");
    expect(result.url).toBe("/a/");
    expect(result.excerpt).toHaveLength(240);
  });

  it("respects topK", () => {
    expect(lexicalSearch(chunks, "guides workers indexer markdown vectorize", 1)).toHaveLength(1);
  });
});
