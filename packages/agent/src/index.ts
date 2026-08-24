import { AIChatAgent } from "@cloudflare/ai-chat";
import { callable } from "agents";
import { createWorkersAI } from "workers-ai-provider";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateText,
} from "ai";
import type { Citation, PageContext, SearchHit } from "@prompton-dev/core";
import { CHAT_MODEL, EMBEDDING_MODEL } from "./models.js";
import { lexicalSearch, loadChunksFromKv } from "./sync.js";
import { consumeRateLimit } from "./rate-limit.js";

export interface DocsAgentEnv {
  AI: Ai;
  VECTORIZE: VectorizeIndex;
  DOCS: KVNamespace;
  /** Used for Astro sessions and Prompton rate-limit counters */
  SESSION?: KVNamespace;
  DocsAgent: DurableObjectNamespace;
  ASSETS?: Fetcher;
}

export interface DocsAgentState {
  pageContext?: PageContext;
}

function docsSystemPrompt(pageContext: PageContext | undefined, hits: SearchHit[]): string {
  const ctx = pageContext
    ? `The reader is currently on docs page "${pageContext.title}" (slug: ${pageContext.slug}). Prefer that page when relevant.`
    : "The reader is browsing the documentation site.";

  const retrieved =
    hits.length === 0
      ? "No retrieval hits. Answer from general product knowledge of Prompton and say when you are unsure."
      : hits
          .map(
            (h, i) =>
              `[${i + 1}] ${h.title}${h.heading ? ` › ${h.heading}` : ""} (${h.slug || "/"})\n${h.excerpt}`,
          )
          .join("\n\n");

  return [
    "You are Prompton, a documentation assistant embedded in a Starlight docs site.",
    "Answer using ONLY the retrieved documentation excerpts below.",
    "Write a clear prose answer in markdown. Cite page titles or slugs inline when useful.",
    "Do not call tools. Do not output tool JSON.",
    "Be concise and practical. Use short code blocks when helpful.",
    ctx,
    "",
    "Retrieved docs:",
    retrieved,
  ].join("\n");
}

function hitKey(h: Pick<SearchHit, "slug" | "heading">): string {
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
      url: h.url,
      excerpt: h.excerpt,
    });
    if (out.length >= max) break;
  }
  return out;
}

async function vectorSearch(env: DocsAgentEnv, query: string, topK: number): Promise<SearchHit[]> {
  try {
    const result = (await env.AI.run(
      EMBEDDING_MODEL,
      { text: [query] },
      { gateway: { id: "default" } },
    )) as { data?: number[][] };
    const values = result.data?.[0];
    if (!values) return [];
    const matches = await env.VECTORIZE.query(values, { topK, returnMetadata: "all" });
    return (matches.matches ?? []).map((m) => {
      const meta = (m.metadata ?? {}) as Record<string, string>;
      return {
        slug: meta.slug ?? "",
        title: meta.title ?? meta.slug ?? "Untitled",
        heading: meta.heading ?? "",
        excerpt: meta.excerpt ?? meta.content?.slice(0, 240) ?? "",
        score: (m.score ?? 0) * 10,
        url: meta.url ?? (meta.slug ? `/${meta.slug}/` : "/"),
      };
    });
  } catch {
    return [];
  }
}

async function retrieve(
  env: DocsAgentEnv,
  query: string,
  pageContext: PageContext | undefined,
  topK = 6,
): Promise<SearchHit[]> {
  const chunks = await loadChunksFromKv(env.DOCS);
  const lexicalHits = lexicalSearch(chunks, query, topK);
  const vectorHits = await vectorSearch(env, query, topK);
  return rankHits([vectorHits, lexicalHits], pageContext, topK);
}

function lastUserText(messages: AIChatAgent["messages"]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user") continue;
    const parts = (m as { parts?: Array<{ type: string; text?: string }> }).parts;
    if (parts?.length) {
      return parts
        .filter((p) => p.type === "text" && p.text)
        .map((p) => p.text!)
        .join("\n");
    }
    const content = (m as { content?: string }).content;
    if (typeof content === "string") return content;
  }
  return "";
}

/** Progressive chunks on word boundaries for a readable stream feel. */
async function* streamWords(text: string, pauseMs = 18): AsyncGenerator<string> {
  // Prefer emitting ~1–3 words at a time so the typewriter is visible.
  const tokens = text.match(/\S+\s*|\s+/g) ?? [text];
  let buf = "";
  for (const token of tokens) {
    buf += token;
    if (buf.length >= 12 || /\n$/.test(buf)) {
      yield buf;
      buf = "";
      if (pauseMs > 0) await new Promise((r) => setTimeout(r, pauseMs));
    }
  }
  if (buf) yield buf;
}

export class DocsAgent extends AIChatAgent<DocsAgentEnv, DocsAgentState> {
  initialState: DocsAgentState = {};

  async onChatMessage() {
    const kv = this.env.SESSION ?? this.env.DOCS;
    if (kv) {
      const limited = await consumeRateLimit(kv, `chat:${this.name}`, {
        limit: 20,
        windowSec: 60,
      });
      if (!limited.ok) {
        const stream = createUIMessageStream({
          execute: async ({ writer }) => {
            const id = crypto.randomUUID();
            const msg = `You're sending messages too quickly. Wait about ${limited.retryAfter}s and try again.`;
            writer.write({ type: "start" });
            writer.write({ type: "text-start", id });
            writer.write({ type: "text-delta", id, delta: msg });
            writer.write({ type: "text-end", id });
            writer.write({ type: "finish" });
          },
        });
        return createUIMessageStreamResponse({ stream });
      }
    }

    const workersai = createWorkersAI({ binding: this.env.AI });
    const model = workersai(CHAT_MODEL);
    const query = lastUserText(this.messages);
    const hits = query ? await retrieve(this.env, query, this.state.pageContext) : [];
    const citations = citationsFromHits(hits);

    // Open the UI stream before generateText so the client leaves "submitted"
    // sooner; then progressive-stream the completed answer (avoids Workers AI
    // native+OpenAI double-emit while keeping a readable typewriter).
    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const id = crypto.randomUUID();
        writer.write({ type: "start", messageMetadata: { citations } });
        writer.write({ type: "text-start", id });

        const { text } = await generateText({
          model,
          system: docsSystemPrompt(this.state.pageContext, hits),
          messages: await convertToModelMessages(this.messages),
        });

        for await (const delta of streamWords(text)) {
          writer.write({ type: "text-delta", id, delta });
        }
        writer.write({ type: "text-end", id });
        writer.write({ type: "finish", messageMetadata: { citations } });
      },
    });

    return createUIMessageStreamResponse({ stream });
  }

  @callable()
  async setPageContext(pageContext: PageContext) {
    this.setState({ ...this.state, pageContext });
    return this.state.pageContext;
  }
}

export { docsSystemPrompt, CHAT_MODEL, EMBEDDING_MODEL, retrieve };
export { syncDocsIndex, lexicalSearch, loadChunksFromKv } from "./sync.js";
export type { SyncPayload, SyncResult, SyncEnv } from "./sync.js";
export { consumeRateLimit, clientIp } from "./rate-limit.js";
export type { RateLimitOptions, RateLimitResult } from "./rate-limit.js";
