import { AIChatAgent } from "@cloudflare/ai-chat";
import { callable } from "agents";
import { createWorkersAI } from "workers-ai-provider";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateText,
} from "ai";
import type { PageContext, SearchHit } from "@prompton-dev/core";
import { CHAT_MODEL, EMBEDDING_MODEL } from "./models.js";
import { lexicalSearch, loadChunksFromKv } from "./sync.js";

export interface DocsAgentEnv {
  AI: Ai;
  VECTORIZE: VectorizeIndex;
  DOCS: KVNamespace;
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

async function retrieve(env: DocsAgentEnv, query: string, topK = 6): Promise<SearchHit[]> {
  const chunks = await loadChunksFromKv(env.DOCS);
  const lexicalHits = lexicalSearch(chunks, query, topK);
  if (lexicalHits.length > 0) return lexicalHits;

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
        score: m.score ?? 0,
        url: meta.url ?? (meta.slug ? `/${meta.slug}/` : "/"),
      };
    });
  } catch {
    return [];
  }
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

export class DocsAgent extends AIChatAgent<DocsAgentEnv, DocsAgentState> {
  initialState: DocsAgentState = {};

  async onChatMessage() {
    const workersai = createWorkersAI({ binding: this.env.AI });
    const model = workersai(CHAT_MODEL);
    const query = lastUserText(this.messages);
    const hits = query ? await retrieve(this.env, query) : [];
    const citations = hits.map((h) => ({
      slug: h.slug,
      title: h.title,
      heading: h.heading,
      url: h.url,
      excerpt: h.excerpt,
    }));

    // Non-streaming generate avoids a workers-ai-provider bug where native
    // `response` + OpenAI `choices[].delta` chunks both emit, doubling tokens.
    const { text } = await generateText({
      model,
      system: docsSystemPrompt(this.state.pageContext, hits),
      messages: await convertToModelMessages(this.messages),
    });

    const stream = createUIMessageStream({
      execute({ writer }) {
        const id = crypto.randomUUID();
        writer.write({ type: "start", messageMetadata: { citations } });
        writer.write({ type: "text-start", id });
        writer.write({ type: "text-delta", id, delta: text });
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
