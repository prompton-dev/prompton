import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { marked } from "marked";
import type { Citation, PageContext, PromptonClientConfig } from "@prompton/core";

export type ChatRole = "user" | "assistant" | "system";

export interface ChatPart {
  type: "text" | "tool" | "reasoning";
  text?: string;
  toolName?: string;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  parts: ChatPart[];
  citations?: Citation[];
}

export interface PromptonChatProps {
  config: PromptonClientConfig;
  messages: ChatMessage[];
  status: "ready" | "submitted" | "streaming" | "error";
  error?: string | null;
  onSend: (text: string) => void | Promise<void>;
  onStop?: () => void;
  onNavigate?: (slug: string) => void;
  suggestions?: string[];
  pageContext?: PageContext;
}

function renderMarkdown(text: string): string {
  return marked.parse(text, { async: false }) as string;
}

export function PromptonChat({
  messages,
  status,
  error,
  onSend,
  onStop,
  onNavigate,
  suggestions = [],
  pageContext,
}: PromptonChatProps) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  const submit = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      setInput("");
      await onSend(trimmed);
    },
    [busy, onSend],
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit(input);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit(input);
    }
  };

  const empty = messages.length === 0;

  return (
    <div className="prompton-chat" data-prompton-chat>
      {empty ? (
        <div className="prompton-chat__empty">
          <h2>Chat with the docs</h2>
          <p>
            {pageContext
              ? `Ask anything about these docs. Context: ${pageContext.title}.`
              : "Browse pages or ask questions — answers cite your documentation."}
          </p>
          {suggestions.length > 0 && (
            <div className="prompton-chat__suggestions">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="prompton-chat__suggestion"
                  onClick={() => void submit(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="prompton-chat__messages" role="log" aria-live="polite">
          {messages.map((m) => (
            <article
              key={m.id}
              className={`prompton-msg prompton-msg--${m.role}`}
              data-role={m.role}
            >
              <span className="prompton-msg__role">{m.role}</span>
              {m.parts.map((part, i) => {
                if (part.type === "tool") {
                  return (
                    <div key={i} className="prompton-msg__tool">
                      tool: {part.toolName ?? "unknown"}
                    </div>
                  );
                }
                if (part.type === "reasoning" && part.text) {
                  return (
                    <div key={i} className="prompton-msg__tool">
                      {part.text}
                    </div>
                  );
                }
                if (part.type === "text" && part.text) {
                  return (
                    <div
                      key={i}
                      className="prompton-msg__bubble sl-markdown-content"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(part.text) }}
                    />
                  );
                }
                return null;
              })}
              {m.citations && m.citations.length > 0 && (
                <div className="prompton-citations">
                  {m.citations.map((c) => (
                    <button
                      key={`${c.slug}-${c.heading ?? ""}`}
                      type="button"
                      className="prompton-citation"
                      onClick={() => onNavigate?.(c.slug)}
                      title={c.excerpt}
                    >
                      {c.title}
                      {c.heading ? ` · ${c.heading}` : ""}
                    </button>
                  ))}
                </div>
              )}
            </article>
          ))}
          <div ref={bottomRef} />
        </div>
      )}

      <div className="prompton-chat__composer">
        <form className="prompton-chat__form" onSubmit={onSubmit}>
          <textarea
            className="prompton-chat__input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask about the docs…"
            rows={1}
            aria-label="Chat message"
            disabled={busy && !onStop}
          />
          {busy && onStop ? (
            <button type="button" className="prompton-chat__submit" onClick={onStop}>
              Stop
            </button>
          ) : (
            <button type="submit" className="prompton-chat__submit" disabled={!input.trim() || busy}>
              Send
            </button>
          )}
        </form>
        <div className="prompton-chat__status">
          {error ? `Error: ${error}` : busy ? "Thinking…" : "Ready"}
        </div>
      </div>
    </div>
  );
}

export function sessionIdFromCookie(cookieName = "prompton_sid"): string {
  if (typeof document === "undefined") return crypto.randomUUID();
  const match = document.cookie.match(new RegExp(`(?:^|; )${cookieName}=([^;]*)`));
  if (match?.[1]) return decodeURIComponent(match[1]);
  const id = crypto.randomUUID();
  document.cookie = `${cookieName}=${encodeURIComponent(id)}; path=/; max-age=31536000; SameSite=Lax`;
  return id;
}

export function browseUrlForSlug(slug: string): string {
  const path = slug.startsWith("/") ? slug : `/${slug}`;
  const url = new URL(path, window.location.origin);
  url.searchParams.delete("mode");
  return url.pathname + url.search;
}

export type { PromptonClientConfig, PageContext, Citation };
