---
"@prompton-dev/starlight": minor
"@prompton-dev/ui": minor
---

Chat now docks beside the docs instead of replacing them.

A sticky ask-composer sits at the bottom of the article column on every page.
Focusing it opens the chat panel in the slot the table of contents gives up, so
the prose stays on screen and the reader keeps their place. Below the sidebar
breakpoint the two panes still swap, since there is no room to dock.

The Durable Object is no longer woken by page views. The chat island mounts
everywhere but stays disconnected until the reader engages the composer — both
the WebSocket (`enabled`) and the `/get-messages` hydration fetch
(`getInitialMessages: null`) are deferred, with prior history fetched explicitly
on activation. `setPageContext` now only fires on an open socket.

The header's Browse/Chat toggle collapses to a single **Ask** control, since the
rail is now the primary way in and the panel carries its own close button.
Search stays search — but a search now offers **"Ask the docs about …"** at the
foot of the results, carrying the typed query into the composer, so a search that
finds nothing becomes a question instead of a dead end.

The panel gains a close control and dismisses on `Escape`; `Cmd/Ctrl+I` and `/`
focus the rail while reading, and `/` only reaches the panel once it is open.
Empty-state suggestions are derived from the current page's headings rather than
a fixed site-wide list.

Fixes: the `b`/`c` shortcuts no longer fire while the search modal is open (every
matching letter typed into the search box was switching modes), and the chat
panel now opens on the newest message rather than the oldest.

The sidebar's **Chats** and **Docs** groups are now properly separated — the
divider previously sat between the "Docs" heading and the tree it labels — and
both render in either mode, so opening the panel no longer pushes the docs nav
down. The chat list is a real list, its active row reuses Starlight's own
current-page treatment, and the delete control is reachable by keyboard.

Removes a duplicate copy of the sidebar and mode-toggle styles from
`@prompton-dev/ui`, which loaded after the Starlight stylesheet and silently
overrode it. `@prompton-dev/ui` renders none of that markup.
