import { handle } from "@astrojs/cloudflare/handler";
import { routeAgentRequest } from "agents";
import { DocsAgent, syncDocsIndex, type SyncPayload } from "@prompton/agent";
import type { DocChunk, IndexManifest, NavItem } from "@prompton/core";

export { DocsAgent };

let seedPromise: Promise<void> | null = null;

async function readAssetText(env: Env, path: string): Promise<string | null> {
  if (!env.ASSETS) return null;
  const res = await env.ASSETS.fetch(new Request(new URL(path, "http://assets.local")));
  if (!res.ok) return null;
  return res.text();
}

async function loadSyncPayloadFromAssets(env: Env): Promise<SyncPayload | null> {
  const manifestRaw = await readAssetText(env, "/.prompton/index/manifest.json");
  const navRaw = await readAssetText(env, "/.prompton/index/nav.json");
  const chunksRaw = await readAssetText(env, "/.prompton/index/chunks.jsonl");
  if (!manifestRaw || !navRaw || !chunksRaw) return null;

  const manifest = JSON.parse(manifestRaw) as IndexManifest;
  const nav = JSON.parse(navRaw) as NavItem[];
  const chunks = chunksRaw
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as DocChunk);

  const pages: Array<{ slug: string; body: string }> = [];
  for (const p of manifest.pages) {
    const safe = (p.slug || "index").replace(/\//g, "__");
    const body = await readAssetText(env, `/.prompton/index/pages/${safe}.md`);
    if (body != null) pages.push({ slug: p.slug, body });
  }

  return { manifest, nav, chunks, pages };
}

async function ensureSeeded(env: Env): Promise<void> {
  const existing = await env.DOCS.get("chunks");
  if (existing) return;
  const payload = await loadSyncPayloadFromAssets(env);
  if (!payload) return;
  const result = await syncDocsIndex(env, payload);
  console.log("Prompton auto-seeded docs index", result);
}

function seedOnce(env: Env): Promise<void> {
  if (!seedPromise) {
    seedPromise = ensureSeeded(env).catch((err) => {
      console.warn("Prompton seed failed", err);
      seedPromise = null;
    });
  }
  return seedPromise;
}

function authorizeReindex(request: Request, env: Env): Response | null {
  const expected = env.PROMPTON_REINDEX_SECRET;
  if (!expected) {
    return Response.json(
      {
        error:
          "Reindex is locked. Set the PROMPTON_REINDEX_SECRET Worker secret, then pass it as header x-prompton-reindex-secret.",
      },
      { status: 503 },
    );
  }
  const got = request.headers.get("x-prompton-reindex-secret");
  if (got !== expected) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}

async function handleReindex(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const denied = authorizeReindex(request, env);
  if (denied) return denied;

  let payload: SyncPayload | null = null;
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    payload = (await request.json()) as SyncPayload;
  } else {
    payload = await loadSyncPayloadFromAssets(env);
  }

  if (!payload) {
    return Response.json(
      {
        error:
          "No index payload. Run a build so `/.prompton/index/*` is in assets, then POST /api/prompton/reindex.",
      },
      { status: 400 },
    );
  }

  seedPromise = null;
  const result = await syncDocsIndex(env, payload);
  return Response.json({ ok: true, ...result });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/prompton/reindex") {
      return handleReindex(request, env);
    }

    // Seed KV (+ Vectorize when available) once so chat has retrieval data
    if (url.pathname.startsWith("/agents/")) {
      await seedOnce(env);
    } else {
      ctx.waitUntil(seedOnce(env));
    }

    const agentResponse = await routeAgentRequest(request, env);
    if (agentResponse) return agentResponse;
    return handle(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
