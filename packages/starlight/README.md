# @prompton-dev/starlight

The [Starlight](https://starlight.astro.build/) plugin for [Prompton](https://prompton.dev) — adds a
**Chat** pane to your docs site that shares the exact same chrome as **Browse**.

```bash
npm install @prompton-dev/starlight @prompton-dev/ui
```

Peers: `astro`, `@astrojs/starlight`, `react`, `react-dom`, `@ai-sdk/react`, `@cloudflare/ai-chat`,
`agents`.

## Usage

```js
import starlight from "@astrojs/starlight";
import prompton from "@prompton-dev/starlight";

export default defineConfig({
  integrations: [
    starlight({
      title: "Docs",
      plugins: [
        prompton({
          agentName: "DocsAgent",
          suggestions: ["How do I get started?", "How does indexing work?"],
        }),
      ],
    }),
  ],
});
```

`@astrojs/react` is added automatically if you haven't already.

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `agentName` | `"DocsAgent"` | Durable Object class name to connect to |
| `suggestions` | three generic prompts | Prompts shown in the empty chat state |

## How mode switching works

Mode is a URL param — `?mode=chat` — surfaced as `html[data-prompton-mode]`:

- An inline script in `Head` sets the attribute **before first paint**, because Starlight prerenders
  pages and cannot see the query string at build time.
- Both panes stay mounted; visibility is CSS. Toggling uses `history.pushState`, so the chat
  WebSocket survives switching back and forth.
- Keyboard: `b` for Browse, `c` for Chat, `/` to focus the composer.

The plugin overrides Starlight's `Head`, `PageFrame`, `Header`, `Search`, and `Sidebar` components.
If you also override any of these, yours will conflict.

## Requirements

Needs a Worker running [`@prompton-dev/agent`](https://www.npmjs.com/package/@prompton-dev/agent)
with an indexed docs corpus. The fastest path to a working site is the scaffold:

```bash
npm create prompton@latest my-docs
```

## License

MIT
