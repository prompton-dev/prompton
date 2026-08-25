import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Unit tests cover the pure logic only — slug/URL derivation, markdown
 * chunking, hit ranking, lexical search, rate limiting. Anything needing the
 * Workers runtime (DocsAgent, Vectorize, KV bindings) is out of scope here.
 *
 * Workspace packages alias to source so tests run without a build step.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@prompton-dev/core": path.resolve(__dirname, "packages/core/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["packages/*/src/**/*.test.ts"],
  },
});
