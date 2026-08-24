export interface RateLimitOptions {
  /** Max events allowed in the window */
  limit: number;
  /** Window length in seconds */
  windowSec: number;
}

export interface RateLimitOk {
  ok: true;
  remaining: number;
}

export interface RateLimitDenied {
  ok: false;
  retryAfter: number;
}

export type RateLimitResult = RateLimitOk | RateLimitDenied;

/**
 * Fixed-window counter in KV. Best-effort under concurrent writers.
 */
export async function consumeRateLimit(
  kv: KVNamespace,
  key: string,
  opts: RateLimitOptions,
): Promise<RateLimitResult> {
  const windowSec = Math.max(1, opts.windowSec);
  const limit = Math.max(1, opts.limit);
  const bucket = Math.floor(Date.now() / 1000 / windowSec);
  const storageKey = `rl:${key}:${bucket}`;

  const raw = await kv.get(storageKey);
  const count = raw ? Number.parseInt(raw, 10) || 0 : 0;
  if (count >= limit) {
    const retryAfter = windowSec - (Math.floor(Date.now() / 1000) % windowSec);
    return { ok: false, retryAfter: Math.max(1, retryAfter) };
  }

  await kv.put(storageKey, String(count + 1), { expirationTtl: windowSec + 5 });
  return { ok: true, remaining: Math.max(0, limit - count - 1) };
}

export function clientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}
