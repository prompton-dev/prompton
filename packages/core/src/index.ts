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
