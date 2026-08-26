---
title: Browse and Chat
description: How the shared Starlight chrome puts docs and conversation side by side.
---

## One page, two panes

Prompton keeps one Starlight shell, and chat is an affordance of the page rather
than a place you travel to:

- **Browse** — classic sidebar, Markdown page, table of contents, Pagefind search,
  plus a sticky **ask composer** at the foot of the article column.
- **Chat** — the answer panel docks to the right. The docs stay on screen and get
  *wider*, because the table of contents yields its slot to the panel.

Below the sidebar breakpoint there is no room for two columns, so narrow screens
fall back to swapping the panes.

## Opening chat

Any of these work:

- Type into the composer at the bottom of the page and press Enter
- **Ask** in the header, or `C` (`B` returns to browsing)
- `⌘I` / `Ctrl+I`, or `/`, to focus the composer from anywhere
- **Ask the docs about "…"** at the foot of the search results, which carries your
  query straight into the composer

Close the panel with **×** in its toolbar, `Escape`, or `B`. Switching updates
`?mode=chat` without a full page reload, so the chat connection stays alive.

The Durable Object is not woken by page views: the composer is inert until you
engage it, and only then does the connection open.

## Sessions

Each chat maps to a Durable Object instance (cookie `prompton_sid`). The sidebar
**Chats** list is stored in the browser and shows in both modes:

- Titles come from the first user message (empty drafts are not listed)
- **New** starts a fresh session
- Click a past chat to switch (history lives in that Durable Object)
- **×** removes a chat from the local list (the Durable Object may still exist)

Splash/home pages have no docs sidebar; use **New chat** in the panel toolbar instead.

## Page context

The agent receives the current page's title and slug and prefers it when
answering — the composer's placeholder names the page it will ask about. The
panel's opening suggestions are drawn from that page's own headings.

## Citations and follow-ups

Each answer includes **Sources** chips from retrieved chunks. Clicking a citation
returns to **Browse** on that page and scrolls to the heading when available.
Suggested follow-ups appear under the latest reply when the agent is idle.
