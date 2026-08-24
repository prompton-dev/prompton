---
title: Browse and Chat
description: How the shared Starlight chrome switches between docs and conversation.
---

## Same chrome, two modes

Prompton keeps one Starlight shell:

- **Browse** — classic sidebar, Markdown page, table of contents, Pagefind search.
- **Chat** — the main column becomes a conversational UI; the sidebar keeps docs nav and session context. The TOC is hidden.

Toggle with the **Browse / Chat** control in the header. The URL uses `?mode=chat` so links and refresh preserve mode.

## Page context

When you switch to Chat on a page like `/guides/cloudflare/`, the agent receives that page title and slug as context and prefers it when answering.

## Citations

Each answer includes citation chips from the retrieved chunks. Clicking a citation returns to **Browse** on that slug.
