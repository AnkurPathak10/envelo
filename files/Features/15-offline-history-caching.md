# Feature 15: Offline Viewing — Conversation List & History Caching

## Note on sequencing

Inserted ahead of the previously planned "Feature 15: Mobile Live
Inbox and UX Polish," which is renumbered to **Feature 16** (and
now also includes a manual light/dark toggle, per Ankur's testing
feedback — there is currently no in-app way to switch themes, only
the device's system setting via `useColorScheme()`). Update
`progress-tracker.md`'s "Next Up" section accordingly.

## Goal

Fix the gap found during Feature 14 real-device testing: right now,
losing connectivity makes the app show a hard error instead of the
data it already has. A real chat app should always show you what it
last knew — instantly, from local cache — and only refresh live data
in the background when connected. Being offline should degrade
gracefully, not block navigation or show error screens for data
that's already been seen once.

## What's currently broken (confirmed by real-device testing)

- Opening a conversation while offline shows a connection-error
  state instead of previously-loaded messages.
- Switching to a different conversation while offline fails to
  load, even for a conversation whose history was already fetched
  earlier in the same session.
- There is currently no local cache at all — every screen open
  triggers a fresh network fetch with no fallback.

## Scope

### In scope

- A local cache for conversation history (per conversation) and for
  the conversation list, written after every successful fetch
- Cache-first rendering: on screen mount, show cached data
  immediately if present, then fetch live data in the background and
  merge it in using the existing durable-ID de-duplication logic
  from Features 09/11
- Distinguishing a **connectivity failure** from other errors
  (401/404/500): only a connectivity failure should fall back to
  cached data with an unobtrusive "You're offline" indicator: other
  errors keep their existing explicit error/retry UI, since those
  represent real problems a cache can't and shouldn't paper over
- Free navigation between conversations while offline, as long as
  each one has been opened/cached before
- A reasonable cache size bound, so it doesn't grow unbounded over
  time

### Out of scope

- Full offline-first architecture (e.g. SQLite, a proper local
  database) — this is a pragmatic cache using the same storage
  approach as Feature 14's queue, not a rearchitecture
- Caching for a conversation that has genuinely never been opened
  before (nothing to show — a "can't load, check your connection"
  state is acceptable and expected here, same as any messaging app)
- Any backend or socket-server change — this is entirely local
  client-side caching of data the APIs already return
- Search results caching (Feature 06's user search) — that's
  inherently a live, per-query action; caching it adds little value
  and is not requested

## Implementation Details

### Cache storage

Reuse the same durable-storage approach as Feature 14's pending
queue (`@react-native-async-storage/async-storage` or whatever was
chosen there — stay consistent, don't introduce a second storage
mechanism).

Cache structure:
- **Conversation list**: one cache entry holding the last
  successfully fetched `GET /api/conversations` response.
- **Message history**: one cache entry per conversation ID, holding
  the most recently loaded page(s) of messages for that
  conversation (cap to a reasonable number, e.g. the newest 100
  messages — older paginated history beyond that does not need to
  be cached; if the user scrolls back further while offline and it
  isn't cached, showing "can't load earlier messages while offline"
  for that specific action is acceptable).

Bound total cache growth: cap the number of conversations with a
cached history to a reasonable number (e.g. the 20 most recently
opened) and evict the least-recently-used entry beyond that, so a
user with many conversations doesn't accumulate unbounded local
storage over time.

### Cache-first loading pattern

For both the conversation list and an individual conversation's
history:

1. On mount, synchronously check for a cached entry and render it
   immediately if present (no loading spinner needed if cache exists
   — show it instantly).
2. Simultaneously (or immediately after), attempt the live fetch.
3. On fetch success: merge the fresh data with the existing
   de-duplication/merge logic already built for socket + REST merges
   in Features 09/11, and update the cache with the fresh data.
4. On fetch failure:
   - If the failure is a **connectivity** failure (use the existing
     `NetInfo`-based connection awareness from Feature 11, or the
     fetch layer's own network-error detection — not an HTTP error
     response): keep showing the cached data (if any) with a small,
     understated "You're offline — showing saved messages" notice.
     Do not show a blocking error screen in this case.
   - If the failure is an HTTP error (401, 404, 500, etc.): this is
     a real problem, not a connectivity gap — keep the existing
     explicit error/retry behavior from Features 06/09 unchanged.
5. If there is no cache and the fetch fails for connectivity
   reasons, the existing "can't load, check your connection" state
   is the correct fallback — there's nothing to show yet.

### Free navigation while offline

The conversation list and any previously-opened conversation's chat
screen must remain navigable while offline — tapping into a cached
conversation should render its cached history immediately, per the
pattern above, rather than blocking navigation entirely.

## File organization

```text
mobile/
  lib/
    cache/
      conversationCache.ts   — conversation-list cache read/write
      messageCache.ts        — per-conversation history cache
                                read/write, LRU-style eviction
  app/
    (app)/
      home.tsx                       — cache-first list loading
      conversation/
        [conversationId].tsx         — cache-first history loading
```

Adjust to match whatever the actual current file names/locations
are from Features 06/09/11/14 — do not create parallel duplicates,
and reuse the existing merge/de-duplication helpers rather than
writing new ones.

## Security Notes

- Cached message content is not sensitive/credential data — same
  reasoning as Feature 14's queue storage. Plain (non-SecureStore)
  local storage remains appropriate.
- Do not cache anything from a conversation the user is no longer a
  participant of (not currently a real scenario in this app, but
  worth the reminder as a principle: cache eviction should never
  become a stale-authorization bug).

## Testing Checklist

Use two real devices/accounts, with conversations that already have
some message history.

1. Open a conversation while online, see its messages, then put the
   device in airplane mode and re-open the same conversation (from
   the list, or by force-closing and reopening the app entirely) —
   the previously-seen messages appear immediately, with an
   "offline" notice, no error screen.
2. While still offline, navigate back to the conversation list — it
   shows the previously-loaded conversations (not a blank/error
   screen).
3. While still offline, open a *different* conversation that was
   also previously opened before going offline — its cached history
   loads too (this is the exact scenario that failed during Feature
   14 testing — confirm it's fixed).
4. Attempt to open a conversation that was never opened before, while
   offline — a reasonable "can't load, check your connection" state
   appears (this is expected, not a bug).
5. Reconnect — the offline notice disappears and fresh data
   (including anything sent/received while offline, via Feature 14's
   queue and Feature 11's reconnect resync) merges in correctly with
   no duplicates.
6. Trigger a genuine HTTP error unrelated to connectivity (if
   feasible to simulate) — confirm it still shows the existing
   explicit error/retry state, not silently falling back to stale
   cached data as if everything were fine.
7. `npx tsc --noEmit`, `npm run lint`, and `npx prettier --write .`
   pass in `mobile/`.

## Before Marking This Feature Complete

Per `ai-workflow-rules.md`:

1. All seven checks above pass on real devices.
2. No backend or socket-server changes were made.
3. Mobile TypeScript, lint, and Prettier checks pass.
4. Update `progress-tracker.md`: mark this feature complete, apply
   the renumbering noted above, and set **Feature 16 — Mobile Live
   Inbox, UX Polish, and Theme Toggle** as next.
