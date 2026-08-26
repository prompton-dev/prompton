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
import { docsUrlForChunk } from "@prompton-dev/core";
import {
  startNewChatSession,
} from "./sessions.js";

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
  /** Navigate to a browse URL (path + optional hash). */
  onNavigate?: (href: string) => void;
  onNewChat?: () => void;
  /** Dismiss the panel and return to reading. */
  onClose?: () => void;
  suggestions?: string[];
  /** Contextual prompts shown under the latest assistant reply */
  followUps?: string[];
  pageContext?: PageContext;
  /** Called when the reader engages the composer — used to open the socket lazily. */
  onActivate?: () => void;
  connection?: "idle" | "connecting" | "connected" | "disconnected";
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
  onNewChat,
  onClose,
  suggestions = [],
  followUps = [],
  pageContext,
  onActivate,
  connection = "connected",
}: PromptonChatProps) {
  const [input, setInput] = useState("");
  const [lastSent, setLastSent] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  // Follow new messages, unless the reader has deliberately scrolled up.
  const stickToBottomRef = useRef(true);
  const didInitialScrollRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const busy = status === "submitted" || status === "streaming";
  // "idle" and "connecting" still accept input — the send is queued until open.
  const offline = connection === "disconnected";
  const canSend = !busy && !offline;
  const waitingForReply =
    busy &&
    (messages.length === 0 ||
      messages[messages.length - 1]?.role === "user" ||
      (messages[messages.length - 1]?.role === "assistant" &&
        !messageHasVisibleText(messages[messages.length - 1]!)));

  /*
    Scroll the container itself rather than `scrollIntoView` on a sentinel: a
    smooth scroll is cancelled when the panel goes from hidden to visible, which
    left the reader parked on the oldest message right after asking a question.
  */
  useEffect(() => {
    const box = messagesRef.current;
    if (!box || messages.length === 0) return;
    // The first paint of a hydrated thread always lands on the newest message.
    const first = !didInitialScrollRef.current;
    if (!first && !stickToBottomRef.current) return;
    didInitialScrollRef.current = true;

    const jump = () => {
      box.scrollTop = box.scrollHeight;
    };
    jump();
    // Code blocks and web fonts settle a frame or two late and change the
    // height, so re-assert rather than trusting the first measurement.
    const frame = requestAnimationFrame(jump);
    const timer = window.setTimeout(jump, 150);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [messages, status]);

  const onMessagesScroll = useCallback(() => {
    const box = messagesRef.current;
    if (!box) return;
    stickToBottomRef.current = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  }, []);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, 128);
    el.style.height = `${next}px`;
    // A single line can round to a fraction over the box and show a scrollbar
    // at rest; only allow scrolling once the field has actually hit its cap.
    el.style.overflowY = el.scrollHeight > 128 ? "auto" : "hidden";
  }, [input]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (typing) return;
      if (e.key !== "/") return;
      if (document.documentElement.getAttribute("data-prompton-mode") !== "chat") return;
      e.preventDefault();
      textareaRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /*
    Focus the composer whenever the panel becomes visible — on load for a
    ?mode=chat deep link, and on every soft switch after that. Watching the
    attribute keeps this working without the panel being remounted.
  */
  useEffect(() => {
    const root = document.documentElement;
    let timer = 0;
    const focusIfChat = () => {
      if (root.getAttribute("data-prompton-mode") !== "chat") return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => textareaRef.current?.focus(), 80);
    };
    focusIfChat();
    const observer = new MutationObserver(focusIfChat);
    observer.observe(root, { attributes: true, attributeFilter: ["data-prompton-mode"] });
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, []);

  const submit = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy || offline) return;
      setLastSent(trimmed);
      setInput("");
      await onSend(trimmed);
    },
    [busy, offline, onSend],
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit(input);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit(input);
    } else if (e.key === "Escape" && onClose) {
      e.preventDefault();
      onClose();
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
    : connection === "disconnected"
      ? "Disconnected — reconnecting…"
      : connection === "connecting"
        ? "Connecting…"
        : status === "submitted"
          ? "Searching docs…"
          : status === "streaming"
            ? waitingForReply
              ? "Thinking…"
              : "Writing…"
            : "Ready · / focus · C chat · B browse";

  return (
    <section className="prompton-chat" data-prompton-chat aria-label="Chat with the docs">
      <div className="prompton-chat__toolbar">
        <span className="prompton-chat__toolbar-label">Chat</span>
        <div className="prompton-chat__toolbar-actions">
          {onNewChat ? (
            <button type="button" className="prompton-chat__new" onClick={onNewChat}>
              New chat
            </button>
          ) : null}
          {onClose ? (
            <button
              type="button"
              className="prompton-chat__close"
              onClick={onClose}
              aria-label="Close chat"
              title="Close chat (Esc)"
            >
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden focusable="false">
                <path
                  d="m4 4 8 8M12 4l-8 8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          ) : null}
        </div>
      </div>
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
        <div
          className="prompton-chat__messages"
          role="log"
          aria-live="polite"
          ref={messagesRef}
          onScroll={onMessagesScroll}
        >
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
                        onClick={() =>
                          onNavigate?.(c.url || docsUrlForChunk(c.slug, c.heading, c.title))
                        }
                        title={c.excerpt}
                      >
                        {c.title}
                        {c.heading && c.heading !== c.title ? ` · ${c.heading}` : ""}
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
          {!busy && followUps.length > 0 ? (
            <div className="prompton-chat__followups" aria-label="Follow-up questions">
              {followUps.map((s) => (
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
          ) : null}
          <div ref={bottomRef} />
        </div>
      )}

      <div className="prompton-chat__composer">
        {error ? (
          <div className="prompton-chat__error" role="alert">
            <div className="prompton-chat__error-body">
              Something went wrong. Check your connection and try again.
              <span className="prompton-chat__error-detail">{error}</span>
            </div>
            {lastSent ? (
              <button
                type="button"
                className="prompton-chat__error-retry"
                onClick={() => void submit(lastSent)}
                disabled={!canSend}
              >
                Retry
              </button>
            ) : null}
          </div>
        ) : null}
        <form className="prompton-chat__form" onSubmit={onSubmit}>
          <textarea
            ref={textareaRef}
            className="prompton-chat__input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => onActivate?.()}
            placeholder={
              offline
                ? "Reconnecting…"
                : pageContext
                  ? `Ask about ${pageContext.title}…`
                  : "Ask about the docs…"
            }
            rows={1}
            aria-label="Chat message"
            disabled={(busy && !onStop) || offline}
          />
          {busy && onStop ? (
            <button type="button" className="prompton-chat__submit" onClick={onStop}>
              Stop
            </button>
          ) : (
            <button
              type="submit"
              className="prompton-chat__submit"
              disabled={!input.trim() || !canSend}
            >
              Send
            </button>
          )}
        </form>
        <div
          className={[
            "prompton-chat__status",
            connection === "disconnected" ? "prompton-chat__status--warn" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <span
            className={[
              "prompton-chat__dot",
              connection === "connected"
                ? "prompton-chat__dot--ok"
                : connection === "connecting"
                  ? "prompton-chat__dot--pending"
                  : connection === "idle"
                    ? "prompton-chat__dot--idle"
                    : "prompton-chat__dot--bad",
            ].join(" ")}
            aria-hidden
          />
          {statusLabel}
        </div>
      </div>
    </section>
  );
}

export function sessionIdFromCookie(cookieName = "prompton_sid"): string {
  if (typeof document === "undefined") return crypto.randomUUID();
  const match = document.cookie.match(new RegExp(`(?:^|; )${cookieName}=([^;]*)`));
  if (match?.[1]) {
    return decodeURIComponent(match[1]);
  }
  const id = crypto.randomUUID();
  document.cookie = `${cookieName}=${encodeURIComponent(id)}; path=/; max-age=31536000; SameSite=Lax`;
  // Sidebar entry is created on the first user message (touchChatSession).
  return id;
}

export function browseUrlForSlug(slug: string, heading?: string, title?: string): string {
  const path = docsUrlForChunk(slug, heading, title);
  const hashIdx = path.indexOf("#");
  const pathname = hashIdx >= 0 ? path.slice(0, hashIdx) : path;
  const hash = hashIdx >= 0 ? path.slice(hashIdx) : "";
  const url = new URL(pathname, window.location.origin);
  url.searchParams.delete("mode");
  return url.pathname + url.search + hash;
}

/** Start a fresh chat session (new Durable Object name via cookie). */
export function resetChatSession(cookieName = "prompton_sid"): string {
  return startNewChatSession(cookieName);
}

export type { PromptonClientConfig, PageContext, Citation };

export {
  listChatSessions,
  ensureChatSession,
  pruneEmptyChatSessions,
  deleteChatSession,
  touchChatSession,
  titleFromUserText,
  switchChatSession,
  startNewChatSession,
  readSessionIdFromCookie,
  DEFAULT_CHAT_TITLE,
  SESSIONS_EVENT,
  type ChatSessionMeta,
} from "./sessions.js";
