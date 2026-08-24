import react from "@astrojs/react";
import { fileURLToPath } from "node:url";
import path from "node:path";

export interface PromptonStarlightOptions {
  /** Durable Object agent class name (default DocsAgent) */
  agentName?: string;
  /** Suggested prompts shown in empty chat state */
  suggestions?: string[];
}

function pkgRoot(): string {
  return path.dirname(fileURLToPath(import.meta.url));
}

function component(name: string): string {
  return path.resolve(pkgRoot(), "../src/components", name);
}

/** Starlight plugin — Cloudflare-only conversational docs chrome. */
export default function promptonStarlight(options: PromptonStarlightOptions = {}) {
  const agentName = options.agentName ?? "DocsAgent";
  const suggestions = options.suggestions ?? [
    "How do I get started?",
    "How does Browse / Chat work?",
    "Which Cloudflare products does Prompton use?",
  ];

  return {
    name: "@prompton-dev/starlight",
    hooks: {
      "config:setup"({
        config,
        updateConfig,
        addIntegration,
        astroConfig,
        logger,
      }: {
        config: { components?: Record<string, string>; customCss?: string[] };
        updateConfig: (config: Record<string, unknown>) => void;
        addIntegration: (integration: unknown) => void;
        astroConfig: { integrations: Array<{ name: string }> };
        logger: { info: (msg: string) => void };
      }) {
        const hasReact = astroConfig.integrations.some((i) => i.name === "@astrojs/react");
        if (!hasReact) {
          addIntegration(react());
          logger.info("Added @astrojs/react for Prompton chat islands");
        }

        updateConfig({
          components: {
            ...config.components,
            Head: component("Head.astro"),
            PageFrame: component("PageFrame.astro"),
            Header: component("Header.astro"),
            Search: component("Search.astro"),
            Sidebar: component("Sidebar.astro"),
          },
          customCss: [
            ...(config.customCss ?? []),
            "@prompton-dev/starlight/styles.css",
            "@prompton-dev/ui/styles.css",
          ],
        });

        (globalThis as { __PROMPTON__?: unknown }).__PROMPTON__ = {
          agentName,
          suggestions,
        };

        logger.info(`Prompton Starlight plugin ready (Cloudflare Agents: ${agentName})`);
      },
    },
  };
}
