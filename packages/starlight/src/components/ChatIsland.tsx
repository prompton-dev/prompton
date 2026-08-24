import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PromptonChat,
  sessionIdFromCookie,
  browseUrlForSlug,
  resetChatSession,
  touchChatSession,
  titleFromUserText,
  type ChatMessage,
  type ChatPart,
} from "@prompton-dev/ui";
import type { Citation, PageContext, SearchHit } from "@prompton-dev/core";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";

export interface ChatIslandProps {
  agentName: string;
  pageContext: PageContext;
  suggestions: string[];
}

function citationsFromParts(
  parts: Array<{ type: string; output?: unknown; [k: string]: unknown }>,
): Citation[] | undefined {
  const citations: Citation[] = [];
  for (const p of parts) {
    if (!p.type.startsWith("tool-") && p.type !== "tool-result") continue;
    const output = p.output;
    if (!Array.isArray(output)) continue;
    for (const hit of output as SearchHit[]) {
      if (!hit?.slug) continue;
      citations.push({
        slug: hit.slug,
        title: hit.title,
        heading: hit.heading,
        url: hit.url,
        excerpt: hit.excerpt,
      });
    }
  }
  return citations.length ? citations : undefined;
}

function citationsFromMetadata(metadata: unknown): Citation[] | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const citations = (metadata as { citations?: Citation[] }).citations;
  if (!Array.isArray(citations) || citations.length === 0) return undefined;
  return citations.filter((c) => c && typeof c.slug === "string");
}

function uiMessagesToChatMessages(
  messages: Array<{
    id: string;
    role: string;
    parts?: Array<{ type: string; text?: string; toolName?: string; output?: unknown; [k: string]: unknown }>;
    content?: string;
    metadata?: unknown;
  }>,
): ChatMessage[] {
  return messages.map((m) => {
    const parts: ChatPart[] = [];
    if (m.parts?.length) {
      for (const p of m.parts) {
        if (p.type === "text" && typeof p.text === "string") {
          parts.push({ type: "text", text: p.text });
        } else if (p.type === "reasoning" && typeof p.text === "string") {
          parts.push({ type: "reasoning", text: p.text });
        }
      }
    } else if (typeof m.content === "string") {
      parts.push({ type: "text", text: m.content });
    }
    return {
      id: m.id,
      role: (m.role === "user" || m.role === "assistant" ? m.role : "assistant") as ChatMessage["role"],
      parts: parts.length ? parts : [{ type: "text", text: "" }],
      citations: citationsFromMetadata(m.metadata) ?? (m.parts ? citationsFromParts(m.parts) : undefined),
    };
  });
}

function followUpsFor(messages: ChatMessage[], pageContext: PageContext): string[] {
  const last = [...messages].reverse().find((m) => m.role === "assistant");
  if (!last) return [];
  const fromCitations = (last.citations ?? [])
    .slice(0, 2)
    .map((c) =>
      c.heading ? `Tell me more about ${c.heading}` : `Summarize ${c.title}`,
    );
  const slug = (pageContext.slug ?? "").replace(/^\/+|\/+$/g, "");
  const isHome = !slug || slug === "index";
  const title = pageContext.title?.trim();
  const contextual =
    !isHome && title
      ? [`How does ${title} fit with the rest of the docs?`, `Show me a code example for ${title}`]
      : ["How do I deploy Prompton?", "How does indexing work?"];
  const merged = [...fromCitations, ...contextual];
  const seen = new Set<string>();
  return merged.filter((s) => {
    if (seen.has(s)) return false;
    seen.add(s);
    return true;
  }).slice(0, 3);
}

export default function ChatIsland({ agentName, pageContext, suggestions }: ChatIslandProps) {
  const sessionId = useMemo(() => sessionIdFromCookie(), []);
  const [connection, setConnection] = useState<"connecting" | "connected" | "disconnected">(
    "connecting",
  );

  const agent = useAgent({
    agent: agentName,
    name: sessionId,
    onOpen: () => setConnection("connected"),
    onClose: () => setConnection("disconnected"),
    onError: () => setConnection("disconnected"),
  });

  useEffect(() => {
    const sock = agent as { readyState?: number };
    if (typeof sock.readyState === "number") {
      setConnection(sock.readyState === 1 ? "connected" : sock.readyState === 0 ? "connecting" : "disconnected");
    }
  }, [agent]);

  useEffect(() => {
    const a = agent as { call?: (method: string, args: unknown[]) => Promise<unknown> };
    if (typeof a.call === "function") {
      void a.call("setPageContext", [pageContext]).catch(() => {
        /* optional */
      });
    }
  }, [agent, pageContext]);

  const onNavigate = useCallback((slug: string) => {
    window.location.href = browseUrlForSlug(slug);
  }, []);

  const onNewChat = useCallback(() => {
    resetChatSession();
  }, []);

  const {
    messages: rawMessages,
    sendMessage,
    status: rawStatus,
    stop,
    error: chatError,
  } = useAgentChat({
    agent,
    onToolCall: async ({ toolCall, addToolOutput }) => {
      if (toolCall.toolName === "navigateTo") {
        const input = toolCall.input as { slug?: string };
        const slug = input?.slug ?? "";
        addToolOutput({
          toolCallId: toolCall.toolCallId,
          output: { ok: true, slug, navigating: true },
        });
        if (slug) {
          setTimeout(() => onNavigate(slug), 50);
        }
      }
    },
  });

  const messages = useMemo(() => uiMessagesToChatMessages(rawMessages as never), [rawMessages]);
  const followUps = useMemo(
    () => (rawStatus === "ready" ? followUpsFor(messages, pageContext) : []),
    [messages, pageContext, rawStatus],
  );

  useEffect(() => {
    const firstUser = messages.find((m) => m.role === "user");
    const text = firstUser
      ? firstUser.parts
          .filter((p) => p.type === "text" && p.text)
          .map((p) => p.text!)
          .join(" ")
      : "";
    if (text) touchChatSession(sessionId, titleFromUserText(text));
    else touchChatSession(sessionId);
  }, [messages, sessionId]);

  const status =
    rawStatus === "streaming"
      ? "streaming"
      : rawStatus === "submitted"
        ? "submitted"
        : rawStatus === "error"
          ? "error"
          : "ready";

  const onSend = useCallback(
    async (text: string) => {
      await sendMessage({
        role: "user",
        parts: [{ type: "text", text }],
      });
    },
    [sendMessage],
  );

  return (
    <PromptonChat
      config={{
        agentName,
        sessionId,
        pageContext,
        suggestions,
      }}
      messages={messages}
      status={status}
      error={chatError ? String(chatError) : null}
      onSend={onSend}
      onStop={stop}
      onNavigate={onNavigate}
      onNewChat={onNewChat}
      suggestions={suggestions}
      followUps={followUps}
      pageContext={pageContext}
      connection={connection}
    />
  );
}
