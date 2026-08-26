import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PromptonChat,
  sessionIdFromCookie,
  resetChatSession,
  touchChatSession,
  titleFromUserText,
  type ChatMessage,
  type ChatPart,
} from "@prompton-dev/ui";
import type { Citation, PageContext, SearchHit } from "@prompton-dev/core";
import { useAgent } from "agents/react";
import { getAgentMessages, useAgentChat } from "@cloudflare/ai-chat/react";

type Connection = "idle" | "connecting" | "connected" | "disconnected";

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
  /*
    The composer is on every docs page, but the Durable Object must not be.
    `live` gates both ways in: `enabled` keeps the WebSocket closed, and
    `getInitialMessages: null` suppresses the /get-messages fetch that would
    otherwise instantiate the object at render time anyway.
  */
  const [live, setLive] = useState(false);
  const liveRef = useRef(false);
  const [connection, setConnection] = useState<Connection>("idle");
  const connectionRef = useRef<Connection>("idle");
  connectionRef.current = connection;
  const pendingRef = useRef<string | null>(null);
  const pageContextRef = useRef(pageContext);
  pageContextRef.current = pageContext;

  useEffect(() => {
    document.querySelectorAll("[data-prompton-ssr-fallback]").forEach((el) => {
      el.setAttribute("hidden", "");
    });
  }, []);

  const agent = useAgent({
    agent: agentName,
    name: sessionId,
    enabled: live,
    onOpen: () => setConnection("connected"),
    onClose: () => setConnection((cur) => (cur === "idle" ? cur : "disconnected")),
    onError: () => setConnection((cur) => (cur === "idle" ? cur : "disconnected")),
  });
  const agentRef = useRef<typeof agent | null>(null);
  agentRef.current = agent;

  useEffect(() => {
    if (!live) {
      setConnection("idle");
      return;
    }
    const sock = agent as { readyState?: number };
    setConnection(sock.readyState === 1 ? "connected" : "connecting");
  }, [agent, live]);

  /*
    Only ever sent on an open socket. Calls made while the socket is closed are
    queued by the SDK but expire after 30s, and the rejection is unobservable —
    the agent would answer without knowing which page the reader is on.
  */
  useEffect(() => {
    if (connection !== "connected") return;
    const a = agentRef.current as {
      call?: (method: string, args: unknown[]) => Promise<unknown>;
    } | null;
    if (typeof a?.call !== "function") return;
    void a.call("setPageContext", [pageContextRef.current]).catch(() => {
      /* optional */
    });
  }, [connection, pageContext]);

  const onNavigate = useCallback((href: string) => {
    window.location.href = href;
  }, []);

  const onNewChat = useCallback(() => {
    resetChatSession();
  }, []);

  // PageFrame owns the URL/mode; the panel just asks to be dismissed.
  const onClose = useCallback(() => {
    window.dispatchEvent(new CustomEvent("prompton:close-chat"));
  }, []);

  // retrieve-then-generate agent — no client tools (navigateTo removed)
  const {
    messages: rawMessages,
    setMessages,
    sendMessage,
    status: rawStatus,
    stop,
    error: chatError,
  } = useAgentChat({
    agent,
    getInitialMessages: null,
    /*
      `setMessages` otherwise echoes whatever it is given straight back to the
      agent as `cf_agent_chat_messages`. The only thing this component passes to
      it is history that was just read *from* the agent, so the round-trip is
      pure waste — and it would race a concurrent write on the server.
    */
    syncMessagesToServer: false,
  });

  /*
    History is fetched by hand because `getInitialMessages` is off. The promise
    the SDK would have memoised is cached per agent+name for the life of the
    page, so re-enabling it later is not an option.
  */
  const activate = useCallback(() => {
    if (liveRef.current) return;
    liveRef.current = true;
    setLive(true);
    void (async () => {
      try {
        const prior = await getAgentMessages({
          agent: agentName,
          name: sessionId,
          host: window.location.origin,
        });
        if (!Array.isArray(prior) || prior.length === 0) return;
        // Never clobber a message the reader already sent from the rail.
        setMessages((current) => (current.length ? current : (prior as typeof current)));
      } catch {
        /* a fresh thread is a fine outcome */
      }
    })();
  }, [agentName, sessionId, setMessages]);

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
      activate();
      if (connectionRef.current !== "connected") {
        // Flushed by the effect below once the socket opens.
        pendingRef.current = text;
        return;
      }
      await sendMessage({
        role: "user",
        parts: [{ type: "text", text }],
      });
    },
    [activate, sendMessage],
  );

  const onSendRef = useRef(onSend);
  onSendRef.current = onSend;

  useEffect(() => {
    if (connection !== "connected") return;
    const text = pendingRef.current;
    if (!text) return;
    pendingRef.current = null;
    void sendMessage({ role: "user", parts: [{ type: "text", text }] });
  }, [connection, sendMessage]);

  useEffect(() => {
    const onActivate = () => activate();
    const onAsk = (e: Event) => {
      const text = (e as CustomEvent<{ text?: string }>).detail?.text?.trim();
      if (!text) return;
      void onSendRef.current(text);
    };
    const onMode = (e: Event) => {
      if ((e as CustomEvent<{ mode?: string }>).detail?.mode === "chat") activate();
    };
    window.addEventListener("prompton:chat-activate", onActivate);
    window.addEventListener("prompton:chat-ask", onAsk);
    window.addEventListener("prompton:mode", onMode);
    return () => {
      window.removeEventListener("prompton:chat-activate", onActivate);
      window.removeEventListener("prompton:chat-ask", onAsk);
      window.removeEventListener("prompton:mode", onMode);
    };
  }, [activate]);

  // Deep link straight into ?mode=chat — connect without waiting for a focus.
  useEffect(() => {
    if (document.documentElement.getAttribute("data-prompton-mode") === "chat") activate();
  }, [activate]);

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
      onClose={onClose}
      onActivate={activate}
      suggestions={suggestions}
      followUps={followUps}
      pageContext={pageContext}
      connection={connection}
    />
  );
}
