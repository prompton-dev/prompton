# @prompton-dev/ui

React chat components for [Prompton](https://prompton.dev) — the chat pane rendered inside an Astro
Starlight docs site.

Most people never install this directly: [`@prompton-dev/starlight`](https://www.npmjs.com/package/@prompton-dev/starlight)
pulls it in and wires it up. Install it yourself only to build a custom chat surface.

```bash
npm install @prompton-dev/ui
```

Peers: `react`, `react-dom`, `@ai-sdk/react`, `@cloudflare/ai-chat`, `agents`.

## Usage

`PromptonChat` is presentational — you own the transport. Pass messages in, handle `onSend`.

```tsx
import { PromptonChat } from "@prompton-dev/ui";
import "@prompton-dev/ui/styles.css";

<PromptonChat
  config={{ agentName: "DocsAgent", sessionId, pageContext }}
  messages={messages}
  status={status}          // "ready" | "submitted" | "streaming" | "error"
  onSend={(text) => send(text)}
  onStop={stop}
  suggestions={["How do I deploy?"]}
  followUps={followUps}
  connection="connected"
/>;
```

Renders markdown (via `marked`), citation lists, suggestion and follow-up chips, copy buttons, and
connection state. `/` focuses the composer; Enter sends, Shift+Enter inserts a newline.

## Session helpers

Chat sessions are Durable Object names, tracked with a `prompton_sid` cookie plus a browser-local
list:

```ts
import {
  listChatSessions,
  startNewChatSession,
  switchChatSession,
  deleteChatSession,
  titleFromUserText,
} from "@prompton-dev/ui";
```

Sessions live in `localStorage` only — they are never sent anywhere, and clearing site data clears
the list (the conversation itself lives in the Durable Object).

## License

MIT
