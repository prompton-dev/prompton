import { describe, expect, it } from "vitest";
import { docsUrlForChunk, headingSlug } from "./index.js";

describe("headingSlug", () => {
  it("lowercases and hyphenates", () => {
    expect(headingSlug("Getting Started")).toBe("getting-started");
  });

  it("strips accents and punctuation", () => {
    expect(headingSlug("Déployer sur Cloudflare!")).toBe("deployer-sur-cloudflare");
  });

  it("collapses repeated separators and trims edges", () => {
    expect(headingSlug("  --Browse / Chat--  ")).toBe("browse-chat");
  });

  it("returns an empty string when nothing survives", () => {
    expect(headingSlug("!!!")).toBe("");
  });
});

describe("docsUrlForChunk", () => {
  it("maps the index slug to root", () => {
    expect(docsUrlForChunk("")).toBe("/");
    expect(docsUrlForChunk("index")).toBe("/");
  });

  it("builds a trailing-slash path for nested slugs", () => {
    expect(docsUrlForChunk("guides/indexing")).toBe("/guides/indexing/");
  });

  it("tolerates surrounding slashes", () => {
    expect(docsUrlForChunk("/guides/indexing/")).toBe("/guides/indexing/");
  });

  it("appends a heading anchor", () => {
    expect(docsUrlForChunk("guides/indexing", "Chunking rules")).toBe(
      "/guides/indexing/#chunking-rules",
    );
  });

  it("omits the anchor when the heading is just the page title", () => {
    expect(docsUrlForChunk("guides/indexing", "Indexing", "Indexing")).toBe(
      "/guides/indexing/",
    );
  });

  it("omits the anchor when the heading slugifies to nothing", () => {
    expect(docsUrlForChunk("guides/indexing", "???")).toBe("/guides/indexing/");
  });
});
