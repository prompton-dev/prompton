---
title: Browse and Chat
description: How the shared Starlight chrome switches between docs and conversation.
---

## Same chrome, two modes

Prompton keeps one Starlight shell:

- **Browse** — classic sidebar, Markdown page, table of contents, Pagefind search.
- **Chat** — the main column becomes a conversational UI; the sidebar keeps docs nav and recent chats. The TOC is hidden.

Toggle with the **Browse / Chat** control in the header (or press `C` / `B`). The URL uses `?mode=chat` so links and refresh preserve mode. Press `/` to focus the composer.

## Sessions

Each chat maps to a Durable Object instance (cookie `prompton_sid`). The sidebar **Chats** list is stored in the browser:

- Titles come from the first user message
- **New** starts a fresh session
- Click a past chat to switch (history lives in that Durable Object)

Splash/home pages have no docs sidebar; use **New chat** in the chat toolbar instead.

## Page context

When you switch to Chat on a page like `/guides/cloudflare/`, the agent receives that page title and slug as context and prefers it when answering.

## Citations and follow-ups

Each answer includes **Sources** chips from retrieved chunks. Clicking a citation returns to **Browse** on that slug. Suggested follow-ups appear under the latest reply when the agent is idle.
