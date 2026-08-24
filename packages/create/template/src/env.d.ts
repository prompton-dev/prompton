/// <reference types="@cloudflare/workers-types" />

interface Env {
  AI: Ai;
  VECTORIZE: VectorizeIndex;
  DOCS: KVNamespace;
  SESSION: KVNamespace;
  ASSETS: Fetcher;
  DocsAgent: DurableObjectNamespace;
  /** Required for POST /api/prompton/reindex (header: x-prompton-reindex-secret or Bearer) */
  PROMPTON_REINDEX_SECRET?: string;
  /** When "1"/"true", Cloudflare Access-authenticated requests may reindex without the secret */
  PROMPTON_REINDEX_ALLOW_ACCESS?: string;
}
