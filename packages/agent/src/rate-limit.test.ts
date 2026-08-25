import { afterEach, describe, expect, it, vi } from "vitest";
import { clientIp, consumeRateLimit } from "./rate-limit.js";

/** Minimal KV stand-in: get/put only, with TTLs recorded but not enforced. */
function fakeKv() {
  const store = new Map<string, string>();
  const ttls = new Map<string, number | undefined>();
  return {
    store,
    ttls,
    kv: {
      get: async (key: string) => store.get(key) ?? null,
      put: async (key: string, value: string, opts?: { expirationTtl?: number }) => {
        store.set(key, value);
        ttls.set(key, opts?.expirationTtl);
      },
    } as unknown as KVNamespace,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("consumeRateLimit", () => {
  it("allows up to the limit, then denies with a retry hint", async () => {
    const { kv } = fakeKv();
    const opts = { limit: 3, windowSec: 60 };

    const first = await consumeRateLimit(kv, "chat:a", opts);
    expect(first).toEqual({ ok: true, remaining: 2 });

    await consumeRateLimit(kv, "chat:a", opts);
    const third = await consumeRateLimit(kv, "chat:a", opts);
    expect(third).toEqual({ ok: true, remaining: 0 });

    const denied = await consumeRateLimit(kv, "chat:a", opts);
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.retryAfter).toBeGreaterThan(0);
      expect(denied.retryAfter).toBeLessThanOrEqual(60);
    }
  });

  it("counts each key independently", async () => {
    const { kv } = fakeKv();
    const opts = { limit: 1, windowSec: 60 };
    expect((await consumeRateLimit(kv, "chat:a", opts)).ok).toBe(true);
    expect((await consumeRateLimit(kv, "chat:b", opts)).ok).toBe(true);
    expect((await consumeRateLimit(kv, "chat:a", opts)).ok).toBe(false);
  });

  it("starts a fresh bucket in the next window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const { kv } = fakeKv();
    const opts = { limit: 1, windowSec: 60 };

    expect((await consumeRateLimit(kv, "k", opts)).ok).toBe(true);
    expect((await consumeRateLimit(kv, "k", opts)).ok).toBe(false);

    vi.setSystemTime(new Date("2026-01-01T00:01:00Z"));
    expect((await consumeRateLimit(kv, "k", opts)).ok).toBe(true);
  });

  it("sets a TTL that outlives the window", async () => {
    const { kv, ttls } = fakeKv();
    await consumeRateLimit(kv, "k", { limit: 5, windowSec: 60 });
    expect([...ttls.values()][0]).toBe(65);
  });

  it("clamps nonsense options instead of throwing", async () => {
    const { kv } = fakeKv();
    const result = await consumeRateLimit(kv, "k", { limit: 0, windowSec: 0 });
    expect(result.ok).toBe(true);
  });
});

describe("clientIp", () => {
  it("prefers the Cloudflare header", () => {
    const req = new Request("https://example.com", {
      headers: { "cf-connecting-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2" },
    });
    expect(clientIp(req)).toBe("1.1.1.1");
  });

  it("falls back to the first forwarded-for entry", () => {
    const req = new Request("https://example.com", {
      headers: { "x-forwarded-for": "2.2.2.2, 3.3.3.3" },
    });
    expect(clientIp(req)).toBe("2.2.2.2");
  });

  it("returns a sentinel when nothing identifies the caller", () => {
    expect(clientIp(new Request("https://example.com"))).toBe("unknown");
  });
});
