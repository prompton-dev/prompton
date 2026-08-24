/** Browser-local chat session list (Durable Object names via cookie). */

export interface ChatSessionMeta {
  id: string;
  title: string;
  updatedAt: number;
}

const STORAGE_KEY = "prompton_sessions";
const MAX_SESSIONS = 20;
export const DEFAULT_CHAT_TITLE = "New chat";
export const SESSIONS_EVENT = "prompton:sessions";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function readAll(): ChatSessionMeta[] {
  if (!canUseStorage()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (s): s is ChatSessionMeta =>
          !!s &&
          typeof s === "object" &&
          typeof (s as ChatSessionMeta).id === "string" &&
          typeof (s as ChatSessionMeta).title === "string" &&
          typeof (s as ChatSessionMeta).updatedAt === "number",
      )
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

function writeAll(sessions: ChatSessionMeta[]): void {
  if (!canUseStorage()) return;
  const trimmed = sessions
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_SESSIONS);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  window.dispatchEvent(new CustomEvent(SESSIONS_EVENT));
}

function isEmptyTitle(title: string): boolean {
  const t = title.trim();
  return !t || t === DEFAULT_CHAT_TITLE;
}

function setSessionCookie(id: string, cookieName = "prompton_sid"): void {
  document.cookie = `${cookieName}=${encodeURIComponent(id)}; path=/; max-age=31536000; SameSite=Lax`;
}

export function listChatSessions(): ChatSessionMeta[] {
  return readAll();
}

/**
 * Drop unused empty "New chat" rows. Keeps `keepId` even if still untitled
 * (the active draft), and always keeps sessions with a real title.
 */
export function pruneEmptyChatSessions(keepId?: string | null): ChatSessionMeta[] {
  const next = readAll().filter(
    (s) => !isEmptyTitle(s.title) || (keepId != null && s.id === keepId),
  );
  writeAll(next);
  return next;
}

export function ensureChatSession(
  id: string,
  title = DEFAULT_CHAT_TITLE,
): ChatSessionMeta {
  const all = readAll();
  const existing = all.find((s) => s.id === id);
  if (existing) return existing;
  const next: ChatSessionMeta = { id, title, updatedAt: Date.now() };
  writeAll([next, ...all]);
  return next;
}

/** Update timestamp; set title only when still the default or empty. */
export function touchChatSession(id: string, title?: string): void {
  const all = readAll();
  const idx = all.findIndex((s) => s.id === id);
  const now = Date.now();
  if (idx === -1) {
    // First message creates the sidebar entry; bare cookie visits do not.
    writeAll([
      {
        id,
        title: title?.trim() || DEFAULT_CHAT_TITLE,
        updatedAt: now,
      },
      ...all,
    ]);
    return;
  }
  const cur = all[idx]!;
  const nextTitle =
    title?.trim() && isEmptyTitle(cur.title)
      ? title.trim().slice(0, 72)
      : cur.title;
  const next = [...all];
  next[idx] = { ...cur, title: nextTitle, updatedAt: now };
  writeAll(next);
}

export function titleFromUserText(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return DEFAULT_CHAT_TITLE;
  return cleaned.length > 56 ? `${cleaned.slice(0, 53)}…` : cleaned;
}

export function switchChatSession(id: string, cookieName = "prompton_sid"): void {
  pruneEmptyChatSessions(id);
  setSessionCookie(id, cookieName);
  navigateToChat();
}

export function startNewChatSession(cookieName = "prompton_sid"): string {
  const id = crypto.randomUUID();
  // Drop prior empty drafts; do not list this draft until the first message.
  pruneEmptyChatSessions(null);
  setSessionCookie(id, cookieName);
  navigateToChat();
  return id;
}

function navigateToChat(): void {
  const u = new URL(window.location.href);
  u.searchParams.set("mode", "chat");
  const next = u.pathname + "?" + u.searchParams.toString();
  const current = window.location.pathname + window.location.search;
  if (current === next) window.location.reload();
  else window.location.href = next;
}

export function readSessionIdFromCookie(cookieName = "prompton_sid"): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${cookieName}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}
