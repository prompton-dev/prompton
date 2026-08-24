import { useCallback, useEffect, useMemo } from "react";
import {
  PromptonChat,
  sessionIdFromCookie,
  browseUrlForSlug,
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
        } else if (p.type.startsWith("tool-") || p.type === "tool-invocation") {
          parts.push({
            type: "tool",
            toolName: (p.toolName as string) ?? p.type.replace(/^tool-/, ""),
          });
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

export default function ChatIsland({ agentName, pageContext, suggestions }: ChatIslandProps) {
  const sessionId = useMemo(() => sessionIdFromCookie(), []);

  const agent = useAgent({
    agent: agentName,
    name: sessionId,
  });

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
          // Brief delay so the tool result is acknowledged before unload
          setTimeout(() => onNavigate(slug), 50);
        }
      }
    },
  });

  const messages = useMemo(() => uiMessagesToChatMessages(rawMessages as never), [rawMessages]);

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
      suggestions={suggestions}
      pageContext={pageContext}
    />
  );
}
