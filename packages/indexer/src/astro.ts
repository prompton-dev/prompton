import type { AstroIntegration } from "astro";
import { indexDocs } from "./index.js";
import { cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface PromptonIndexerIntegrationOptions {
  contentDir?: string;
  outDir?: string;
  locale?: string;
  /** Also copy index into public/ so Workers ASSETS can serve it for reindex */
  publicOutDir?: string;
}

export function promptonIndexer(
  options: PromptonIndexerIntegrationOptions = {},
): AstroIntegration {
  return {
    name: "prompton-indexer",
    hooks: {
      "astro:build:done": async ({ dir, logger }) => {
        const root = process.cwd();
        const contentDir = path.resolve(root, options.contentDir ?? "src/content/docs");
        const outDir = path.resolve(root, options.outDir ?? ".prompton/index");
        const publicOut = path.resolve(
          root,
          options.publicOutDir ?? "public/.prompton/index",
        );

        const manifest = await indexDocs({
          contentDir,
          outDir,
          locale: options.locale ?? "en",
        });

        await mkdir(publicOut, { recursive: true });
        await cp(outDir, publicOut, { recursive: true });

        // Also copy beside client assets for the current build
        try {
          const clientDir = fileURLToPath(dir);
          const assetOut = path.join(clientDir, ".prompton", "index");
          await mkdir(assetOut, { recursive: true });
          await cp(outDir, assetOut, { recursive: true });
        } catch {
          /* dir may be server output in some adapters */
        }

        logger.info(
          `Prompton indexed ${manifest.pageCount} pages (${manifest.chunkCount} chunks) → ${path.relative(root, outDir)} (+ public/.prompton/index)`,
        );
      },
    },
  };
}

export default promptonIndexer;
