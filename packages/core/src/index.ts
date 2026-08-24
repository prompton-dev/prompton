/**
 * Shared types for Prompton (Cloudflare-only).
 */

export type PromptonMode = "browse" | "chat";

export interface PageContext {
  slug: string;
  title: string;
  locale?: string;
}

export interface DocChunk {
  id: string;
  slug: string;
  title: string;
  heading: string;
  headingPath: string[];
  content: string;
  locale: string;
}

export interface SearchHit {
  slug: string;
  title: string;
  heading: string;
  excerpt: string;
  score: number;
  url: string;
}

export interface NavItem {
  label: string;
  slug?: string;
  href?: string;
  children?: NavItem[];
}

export interface Citation {
  slug: string;
  title: string;
  heading?: string;
  url: string;
  excerpt?: string;
}

/** GitHub / Starlight–compatible heading id for in-page anchors. */
export function headingSlug(heading: string): string {
  return heading
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Browse URL for a docs slug, optionally deep-linking to a heading. */
export function docsUrlForChunk(slug: string, heading?: string, title?: string): string {
  const clean = (slug || "").replace(/^\/+|\/+$/g, "");
  const path = !clean || clean === "index" ? "/" : `/${clean}/`;
  if (!heading?.trim() || (title && heading.trim() === title.trim())) return path;
  const hash = headingSlug(heading);
  return hash ? `${path}#${hash}` : path;
}

export interface PromptonClientConfig {
  /** Durable Object / agent class name */
  agentName: string;
  sessionId?: string;
  pageContext?: PageContext;
  suggestions?: string[];
}

export interface IndexManifest {
  generatedAt: string;
  pageCount: number;
  chunkCount: number;
  nav: NavItem[];
  pages: Array<{ slug: string; title: string; locale: string }>;
}
