import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { marked } from "marked";
import type { Citation, PageContext, PromptonClientConfig } from "@prompton-dev/core";

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

marked.setOptions({ gfm: true, breaks: false });

function renderMarkdown(text: string): string {
  return marked.parse(text, { async: false }) as string;
}

function dedupeCitations(citations: Citation[] | undefined): Citation[] {
  if (!citations?.length) return [];
  const seen = new Set<string>();
  const out: Citation[] = [];
  for (const c of citations) {
    const key = `${c.slug}::${c.heading ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

function messageHasVisibleText(m: ChatMessage): boolean {
  return m.parts.some((p) => p.type === "text" && Boolean(p.text?.trim()));
}

function plainTextFromMessage(m: ChatMessage): string {
  return m.parts
    .filter((p) => p.type === "text" && p.text)
    .map((p) => p.text!)
    .join("\n")
    .trim();
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
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const busy = status === "submitted" || status === "streaming";
  const waitingForReply =
    busy &&
    (messages.length === 0 ||
      messages[messages.length - 1]?.role === "user" ||
      (messages[messages.length - 1]?.role === "assistant" &&
        !messageHasVisibleText(messages[messages.length - 1]!)));

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [input]);

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

  const copyMessage = useCallback(async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1600);
    } catch {
      /* clipboard may be denied */
    }
  }, []);

  const empty = messages.length === 0;
  const statusLabel = error
    ? `Error: ${error}`
    : status === "submitted"
      ? "Searching docs…"
      : status === "streaming"
        ? "Writing…"
        : "Ready";

  return (
    <div className="prompton-chat" data-prompton-chat>
      {empty ? (
        <div className="prompton-chat__empty">
          <h2>Chat with the docs</h2>
          <p>
            {pageContext
              ? "Ask a question — answers are grounded in these docs and cite the pages they came from."
              : "Browse pages or ask questions — answers cite your documentation."}
          </p>
          {pageContext ? (
            <div className="prompton-chat__context" title={pageContext.slug || "/"}>
              Reading <strong>{pageContext.title}</strong>
            </div>
          ) : null}
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
          {messages.map((m, idx) => {
            const citations = dedupeCitations(m.citations);
            const textParts = m.parts.filter((p) => p.type === "text" && p.text);
            const isLast = idx === messages.length - 1;
            const streamingThis =
              isLast && m.role === "assistant" && status === "streaming" && textParts.length > 0;
            const showCitations = citations.length > 0 && !(isLast && busy);
            const plain = plainTextFromMessage(m);
            return (
              <article
                key={m.id}
                className={`prompton-msg prompton-msg--${m.role}`}
                data-role={m.role}
              >
                <div className="prompton-msg__meta">
                  <span className="prompton-msg__role">
                    {m.role === "user" ? "You" : "Prompton"}
                  </span>
                  {m.role === "assistant" && plain && !busy ? (
                    <button
                      type="button"
                      className="prompton-msg__copy"
                      onClick={() => void copyMessage(m.id, plain)}
                    >
                      {copiedId === m.id ? "Copied" : "Copy"}
                    </button>
                  ) : null}
                </div>
                {textParts.map((part, i) => (
                  <div
                    key={i}
                    className={[
                      "prompton-msg__bubble",
                      "sl-markdown-content",
                      streamingThis ? "prompton-msg__bubble--streaming" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(part.text!) }}
                  />
                ))}
                {m.role === "assistant" && textParts.length === 0 && busy ? (
                  <div className="prompton-msg__bubble prompton-msg__bubble--pending" aria-hidden>
                    <span className="prompton-typing">
                      <i />
                      <i />
                      <i />
                    </span>
                  </div>
                ) : null}
                {showCitations ? (
                  <div className="prompton-citations" aria-label="Sources">
                    <span className="prompton-citations__label">Sources</span>
                    {citations.map((c) => (
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
                ) : null}
              </article>
            );
          })}
          {waitingForReply && messages[messages.length - 1]?.role === "user" ? (
            <article className="prompton-msg prompton-msg--assistant" data-role="assistant">
              <span className="prompton-msg__role">Prompton</span>
              <div className="prompton-msg__bubble prompton-msg__bubble--pending" aria-live="polite">
                <span className="prompton-typing">
                  <i />
                  <i />
                  <i />
                </span>
              </div>
            </article>
          ) : null}
          <div ref={bottomRef} />
        </div>
      )}

      <div className="prompton-chat__composer">
        {error ? (
          <div className="prompton-chat__error" role="alert">
            Something went wrong. Check your connection and try again.
            <span className="prompton-chat__error-detail">{error}</span>
          </div>
        ) : null}
        <form className="prompton-chat__form" onSubmit={onSubmit}>
          <textarea
            ref={textareaRef}
            className="prompton-chat__input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={
              pageContext ? `Ask about ${pageContext.title}…` : "Ask about the docs…"
            }
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
        <div className="prompton-chat__status">{statusLabel}</div>
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
  const url = new URL(path.endsWith("/") || path === "/" ? path : `${path}/`, window.location.origin);
  url.searchParams.delete("mode");
  return url.pathname + url.search;
}

/** Start a fresh chat session (new Durable Object name via cookie). */
export function resetChatSession(cookieName = "prompton_sid"): string {
  const id = crypto.randomUUID();
  document.cookie = `${cookieName}=${encodeURIComponent(id)}; path=/; max-age=31536000; SameSite=Lax`;
  return id;
}

export type { PromptonClientConfig, PageContext, Citation };
