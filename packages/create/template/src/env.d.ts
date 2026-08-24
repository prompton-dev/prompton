/// <reference types="@cloudflare/workers-types" />

interface Env {
  AI: Ai;
  VECTORIZE: VectorizeIndex;
  DOCS: KVNamespace;
  SESSION: KVNamespace;
  ASSETS: Fetcher;
  DocsAgent: DurableObjectNamespace;
  /** Required for POST /api/prompton/reindex (header: x-prompton-reindex-secret) */
  PROMPTON_REINDEX_SECRET?: string;
}
