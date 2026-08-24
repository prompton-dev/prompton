import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import prompton from "@prompton/starlight";
import { promptonIndexer } from "@prompton/indexer/astro";

export default defineConfig({
  site: "https://prompton.dev",
  output: "server",
  adapter: cloudflare(),
  integrations: [
    react(),
    starlight({
      title: "Prompton",
      description: "Conversational documentation sites on Cloudflare",
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/prompton-dev/prompton",
        },
      ],
      sidebar: [
        {
          label: "Start here",
          items: [
            { label: "Introduction", slug: "" },
            { label: "Getting started", slug: "guides/getting-started" },
          ],
        },
        {
          label: "Guides",
          items: [
            { label: "Browse and Chat", slug: "guides/browse-chat" },
            { label: "Cloudflare stack", slug: "guides/cloudflare" },
            { label: "Indexing docs", slug: "guides/indexing" },
          ],
        },
      ],
      plugins: [
        prompton({
          agentName: "DocsAgent",
          suggestions: [
            "How do I get started with Prompton?",
            "How does Browse / Chat work?",
            "Which Cloudflare products does Prompton use?",
          ],
        }),
      ],
    }),
    promptonIndexer({
      contentDir: "src/content/docs",
      outDir: ".prompton/index",
    }),
  ],
});
