import { describe, expect, it } from "vitest";
import { buildNav, chunkMarkdown, slugFromFile } from "./index.js";

describe("slugFromFile", () => {
  const contentDir = "/repo/src/content/docs";

  it("drops the extension", () => {
    expect(slugFromFile(`${contentDir}/guides/indexing.md`, contentDir)).toBe("guides/indexing");
    expect(slugFromFile(`${contentDir}/guides/indexing.mdx`, contentDir)).toBe("guides/indexing");
  });

  it("collapses index files to their parent path", () => {
    expect(slugFromFile(`${contentDir}/index.mdx`, contentDir)).toBe("");
    expect(slugFromFile(`${contentDir}/guides/index.md`, contentDir)).toBe("guides");
  });
});

describe("chunkMarkdown", () => {
  it("splits on h1-h3 and tracks the heading path", () => {
    const body = [
      "Intro paragraph.",
      "",
      "## Setup",
      "Install it.",
      "",
      "### Details",
      "More words.",
    ].join("\n");

    const chunks = chunkMarkdown("guides/indexing", "Indexing", body, "en");

    expect(chunks.map((c) => c.heading)).toEqual(["Indexing", "Setup", "Details"]);
    expect(chunks[0].content).toBe("Intro paragraph.");
    expect(chunks[2].headingPath).toEqual(["Indexing", "Setup", "Details"]);
  });

  it("does not emit empty chunks for back-to-back headings", () => {
    const chunks = chunkMarkdown("s", "T", "## A\n## B\nbody", "en");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].heading).toBe("B");
  });

  it("ignores headings deeper than h3", () => {
    const chunks = chunkMarkdown("s", "T", "#### Deep\ntext", "en");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toContain("#### Deep");
  });

  it("always yields at least one chunk for an empty page", () => {
    const chunks = chunkMarkdown("s", "Title", "   ", "en");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe("Title");
  });

  it("builds stable locale-scoped ids", () => {
    const chunks = chunkMarkdown("guides/a", "A", "one\n\n## Two\ntwo", "en");
    expect(chunks.map((c) => c.id)).toEqual(["en:guides/a#0", "en:guides/a#1"]);
  });
});

describe("buildNav", () => {
  it("maps the index page to root and others to trailing-slash hrefs", () => {
    const nav = buildNav([
      { slug: "", title: "Home", locale: "en", body: "", chunks: [] },
      { slug: "guides/a", title: "A", locale: "en", body: "", chunks: [] },
    ]);
    expect(nav).toEqual([
      { label: "Home", slug: "", href: "/" },
      { label: "A", slug: "guides/a", href: "/guides/a/" },
    ]);
  });
});
