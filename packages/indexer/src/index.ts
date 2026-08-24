import type { DocChunk, IndexManifest, NavItem } from "@prompton/core";
import { glob } from "glob";
import matter from "gray-matter";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

export interface IndexOptions {
  contentDir: string;
  outDir: string;
  site?: string;
  locale?: string;
}

export interface ChunkedPage {
  slug: string;
  title: string;
  locale: string;
  body: string;
  chunks: DocChunk[];
}

function slugFromFile(file: string, contentDir: string): string {
  const rel = path.relative(contentDir, file).replace(/\\/g, "/");
  return rel
    .replace(/\.(md|mdx)$/, "")
    .replace(/(^|\/)index$/, "")
    .replace(/\/$/, "");
}

function chunkMarkdown(
  slug: string,
  title: string,
  body: string,
  locale: string,
): DocChunk[] {
  const lines = body.split("\n");
  const chunks: DocChunk[] = [];
  let heading = title;
  let headingPath = [title];
  let buffer: string[] = [];
  let chunkIndex = 0;

  const flush = () => {
    const content = buffer.join("\n").trim();
    if (!content) return;
    chunks.push({
      id: `${locale}:${slug}#${chunkIndex}`,
      slug,
      title,
      heading,
      headingPath: [...headingPath],
      content,
      locale,
    });
    chunkIndex += 1;
    buffer = [];
  };

  for (const line of lines) {
    const h = /^(#{1,3})\s+(.+)$/.exec(line);
    if (h) {
      flush();
      const level = h[1].length;
      const text = h[2].trim();
      heading = text;
      headingPath = headingPath.slice(0, level - 1);
      headingPath[level - 1] = text;
      continue;
    }
    buffer.push(line);
  }
  flush();

  if (chunks.length === 0) {
    chunks.push({
      id: `${locale}:${slug}#0`,
      slug,
      title,
      heading: title,
      headingPath: [title],
      content: body.trim() || title,
      locale,
    });
  }
  return chunks;
}

export async function collectDocs(options: IndexOptions): Promise<ChunkedPage[]> {
  const pattern = path.join(options.contentDir, "**/*.{md,mdx}").replace(/\\/g, "/");
  const files = await glob(pattern, { nodir: true });
  const locale = options.locale ?? "en";
  const pages: ChunkedPage[] = [];

  for (const file of files.sort()) {
    const raw = await readFile(file, "utf8");
    const { data, content } = matter(raw);
    if (data.draft === true) continue;
    const slug = slugFromFile(file, options.contentDir);
    if (slug === "404") continue;
    const title = String(data.title ?? (slug || "Home"));
    const chunks = chunkMarkdown(slug, title, content, locale);
    pages.push({ slug, title, locale, body: content, chunks });
  }
  return pages;
}

export function buildNav(pages: ChunkedPage[]): NavItem[] {
  return pages.map((p) => ({
    label: p.title,
    slug: p.slug,
    href: p.slug ? `/${p.slug}/` : "/",
  }));
}

export async function writeIndexArtifacts(
  pages: ChunkedPage[],
  outDir: string,
): Promise<IndexManifest> {
  await mkdir(outDir, { recursive: true });
  const nav = buildNav(pages);
  const allChunks = pages.flatMap((p) => p.chunks);
  const manifest: IndexManifest = {
    generatedAt: new Date().toISOString(),
    pageCount: pages.length,
    chunkCount: allChunks.length,
    nav,
    pages: pages.map((p) => ({ slug: p.slug, title: p.title, locale: p.locale })),
  };

  await writeFile(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  await writeFile(path.join(outDir, "nav.json"), JSON.stringify(nav, null, 2));
  await writeFile(path.join(outDir, "chunks.jsonl"), allChunks.map((c) => JSON.stringify(c)).join("\n") + "\n");

  const pagesDir = path.join(outDir, "pages");
  await mkdir(pagesDir, { recursive: true });
  for (const p of pages) {
    const safe = p.slug.replace(/\//g, "__") || "index";
    await writeFile(path.join(pagesDir, `${safe}.md`), p.body);
  }

  return manifest;
}

export async function indexDocs(options: IndexOptions): Promise<IndexManifest> {
  const pages = await collectDocs(options);
  return writeIndexArtifacts(pages, options.outDir);
}

export type { DocChunk, IndexManifest, NavItem };
