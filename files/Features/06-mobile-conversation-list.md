# Feature 06: Mobile Conversation List

## Goal

Replace the authenticated placeholder Home screen with a real mobile
conversation-list flow that consumes Feature 05's protected REST API.
An authenticated user can:

1. View their existing direct conversations.
2. Search for another registered user.
3. Create or retrieve a direct conversation by choosing that user.
4. Return to the refreshed conversation list and see the new row.

This is a **mobile-only** feature. The backend endpoints already exist
and must not be changed. Socket.io still has no messaging events, so
this feature must not create a chat screen, send messages, or invent
last-message data.

## Why this is next

Feature 05 now provides the secure persisted data contract needed by
the app. Building this screen next gives users a real entry point into
the chat product before Feature 07 adds the conversation/message
screen and real-time message events.

## Scope

### In scope

- Replace `mobile/app/(app)/home.tsx` with the conversation list.
- Add a `mobile/app/(app)/new-conversation.tsx` screen for user
  search and direct-conversation creation.
- Add typed Feature 05 API wrappers in `mobile/lib/api/`.
- Loading, empty, refresh, and error states.
- A log-out action on the conversation-list screen.
- Preserve the temporary authenticated Socket.io test connection
  from Feature 04 while the Home screen is refactored.
- Light/dark appearance using `useColorScheme()` and the existing
  `colors[scheme]` tokens.

### Out of scope

- Changes to `backend/`, `socket-server/`, Prisma schema, or any
  API contract.
- A conversation/chat-detail screen.
- Message history, message sending, delivery/read receipts, media,
  typing indicators, presence, reconnection logic, or offline queues.
- New npm packages, NativeWind, React Native Paper, or a component
  library.
- Pagination, pull-to-refresh, user profiles, avatars, or group chat.

## Existing API contracts — use exactly as implemented

All calls go through the existing `apiRequest<T>()` client. It already
adds the access token and handles one refresh/retry on `401`; do not
duplicate token logic, manually read SecureStore, or create another
fetch wrapper.

### `GET /api/conversations`

Success:

```ts
{
  conversations: Array<{
    id: string;
    createdAt: string;
    updatedAt: string;
    participant: {
      id: string;
      displayName: string;
      email: string;
    };
  }>;
}
```

There is intentionally no `lastMessage`, unread count, avatar, or
message timestamp. Do not fake these values in the UI.

### `GET /api/users?query=<text>`

Success:

```ts
{
  users: Array<{
    id: string;
    displayName: string;
    email: string;
  }>;
}
```

The server requires a trimmed query of 1–100 characters and returns
at most 20 users. The current user is already excluded by the server.

### `POST /api/conversations/direct`

Request:

```ts
{ participantId: string }
```

Success:

```ts
{
  conversation: {
    id: string;
    createdAt: string;
    participant: {
      id: string;
      displayName: string;
      email: string;
    };
  };
}
```

The endpoint is idempotent: choosing someone with an existing direct
conversation returns the existing one. The mobile UI must rely on
that behavior and must not attempt to find/create duplicates itself.

## File organization

Use the existing Expo Router layout and keep files single-purpose:

```text
mobile/
  app/
    (app)/
      _layout.tsx
      home.tsx                 — conversation list (replace placeholder)
      new-conversation.tsx     — search and create flow
  lib/
    api/
      conversations.ts         — typed API types and wrappers only
    socket/
      useTemporarySocketTest.ts — move the existing Feature 04
                                  temporary connection lifecycle here
                                  if Home currently owns it
  components/
    conversations/
      conversation-row.tsx     — reusable presentational list row
      empty-conversation-list.tsx
      user-search-result.tsx   — reusable presentational search row
```

Small presentational components are preferred over a large `home.tsx`.
Do not add state-management libraries.

## Navigation

1. `(app)/home` remains the authenticated landing screen.
2. `new-conversation.tsx` is pushed from the Home screen with Expo
   Router (`router.push('/(app)/new-conversation')`).
3. After `POST /api/conversations/direct` succeeds, call
   `router.back()` — do **not** navigate to a non-existent chat route.
4. Home must re-fetch conversations when it becomes focused again so
   the created/retrieved conversation appears.
5. Existing conversation rows are visual list rows only in this
   feature. Do not make them navigate to a chat route yet.

Use Expo Router / React Navigation's focus lifecycle (for example,
`useFocusEffect`) or a clearly equivalent focus-aware pattern. A
one-time `useEffect` fetch is insufficient because Home must refresh
after returning from New Conversation.

## Typed API wrapper: `mobile/lib/api/conversations.ts`

Create explicit types matching the contracts above:

```ts
export interface ConversationParticipant {
  id: string;
  displayName: string;
  email: string;
}

export interface ConversationListItem {
  id: string;
  createdAt: string;
  updatedAt: string;
  participant: ConversationParticipant;
}
```

Export only these functions:

```ts
getConversations(): Promise<ConversationListItem[]>
searchUsers(query: string): Promise<ConversationParticipant[]>
createDirectConversation(
  participantId: string,
): Promise<{ id: string; createdAt: string; participant: ConversationParticipant }>
```

Implementation rules:

- Call the existing `apiRequest` helper.
- URL-encode the search query with `encodeURIComponent`.
- Keep response unwrapping in this module, so screen components work
  with arrays/domain values instead of endpoint envelope objects.
- Do not change `client.ts`, `auth.ts`, SecureStore helpers, or the
  backend.

## Home: conversation-list behavior

### Header

Render a simple header with:

- Title: `Envelo`
- A clearly accessible `New conversation` button that opens the new
  conversation screen. Use a text label for v1; an icon may be added
  alongside it using `@expo/vector-icons` only if it improves clarity.
- A `Log out` button using `useAuth().signOut()`.

### Data states

While fetching for the first time, show a centered `ActivityIndicator`
and a short loading label.

On API failure, show:

- A human-readable error message (`ApiError.message` when available)
- A `Try again` button that retries the request
- The header still usable, including logout

When `conversations.length === 0`, show a calm empty state:

- Heading: `No conversations yet`
- Supporting text: `Start a conversation with someone on Envelo.`
- `Start a conversation` button opening the new-conversation screen

When there are conversations, render a `FlatList` keyed by
conversation ID. Each row shows:

- Participant display name (primary text)
- Participant email (muted text)
- A subtle separator/border

Do not show a made-up last message, timestamp, unread badge, or
avatar. Those belong to later features once message data exists.

### Refresh behavior

- Fetch on initial render.
- Re-fetch whenever the screen gains focus.
- Avoid state updates after unmount; use a cancellation/active flag
  in the effect callback where appropriate.
- Do not add pull-to-refresh in this feature; the `Try again` state
  and focus refresh are enough for the first version.

## New Conversation screen

### Layout

- Standard stack header with title `New conversation` and the native
  back button. Configure this in `(app)/_layout.tsx` or the screen's
  `Stack.Screen` options. Do not hand-build a back button.
- A focused search input near the top with placeholder `Search by
  name or email`.
- An explanatory empty-before-search state: `Search for someone to
  start a conversation.`

### Search behavior

1. Keep `query` in local React state.
2. Trim before deciding whether to search.
3. If the trimmed query is empty, clear prior results and show the
   empty-before-search state; do not call the API.
4. Debounce network search by 300 ms after the user stops typing.
5. Show a compact loading indicator while a non-empty query is being
   searched.
6. If the request fails, show the error and retain the query so the
   user can edit or retry.
7. If it succeeds with no results, show `No users found.`
8. Render each result with display name and email.

Guard against stale results: a slower request for an older query must
not overwrite results for a newer query. A request sequence counter
or an `AbortController` with the existing fetch client's `signal`
support is acceptable. Keep this logic local to the screen; do not
introduce a global search store.

### Choosing a person

When a result is pressed:

1. Disable additional presses while creation is in progress.
2. Call `createDirectConversation(result.id)`.
3. On success, call `router.back()`.
4. On failure, re-enable the list and show the server/network error.
5. Do not pass a user ID through navigation as a substitute for the
   server-created conversation ID.

## Theming and styling requirements

Follow `ui-context.md` and the current Feature 03 implementation:

```ts
import { useColorScheme } from 'react-native';
import { colors, radius } from '@/constants/theme';

const scheme = useColorScheme() ?? 'light';
const c = colors[scheme];
const styles = createStyles(c);
```

- Use `c.bgBase`, `c.bgSurface`, `c.textPrimary`, `c.textMuted`,
  `c.accentPrimary`, `c.border`, and `c.error` as appropriate.
- Use `radius.sm` for controls and `radius.md` for list-card-like
  surfaces where a rounded surface is actually needed.
- Do not write hardcoded hex color values in any new or changed
  `mobile/app/` or `mobile/components/` file.
- Use plain React Native `StyleSheet`, functional components, and
  hooks only.
- Use system fonts; do not add custom font loading.

## Feature 04 temporary socket test hook

Feature 04's Home-screen connection code is temporary but must not be
lost during this refactor. If it currently sits directly inside
`home.tsx`, move it into `mobile/lib/socket/useTemporarySocketTest.ts`
and call the hook from the new Home screen.

Requirements:

- Preserve the existing authenticated token handshake and cleanup.
- Keep the `TEMPORARY — Feature 04 connection verification` comment.
- Do not log raw tokens.
- Do not add message events or reconnection behavior.
- Feature 07 will remove/replace this hook with the real socket
  lifecycle.

## No manual infrastructure setup required

Feature 05 already uses the current backend URL. No new environment
variable, account, package, migration, or socket-server process is
needed for this feature.

For manual verification, start the backend and Expo as usual:

```powershell
# Terminal 1
cd backend
npm run dev

# Terminal 2
cd mobile
npx expo start -c
```

Use the existing `EXPO_PUBLIC_API_URL` in `mobile/.env`. Keep the
socket server running only if you also want to keep verifying the
Feature 04 temporary connection hook.

## Manual test checklist

Use two existing test users created during Feature 05.

1. Log in as User A and open Home. The conversation list loads.
2. If A has no conversations, the empty state appears with its start
   button.
3. Open New Conversation. Before typing, no API search occurs and the
   explanatory state appears.
4. Search for User B by part of their name and then by part of their
   email. B appears; A does not.
5. Search for impossible text. `No users found.` appears.
6. Choose B. The app returns to Home and shows B's conversation row.
7. Repeat the search and choose B again. Home still contains one row
   for B, because direct conversation creation is idempotent.
8. Simulate a backend/network error and confirm an error plus retry
   UI appears without crashing or logging the user out unnecessarily.
9. Toggle Android system light/dark mode. Every changed screen and
   component uses the matching token palette with no unreadable text.
10. Log out from Home. The protected-route guard returns the app to
    Login.
11. `npx tsc --noEmit` and `npm run lint` pass in `mobile/`.
12. Run `npx prettier --write .` inside `mobile/` as the final
    implementation step.

## Before marking Feature 06 complete

1. All manual tests above pass on Expo Go.
2. No changes were made outside `mobile/`.
3. No raw tokens are logged and the temporary socket hook still
   disconnects on cleanup.
4. Mobile TypeScript, lint, and Prettier checks pass.
5. Update `progress-tracker.md` with the completed feature and set
   **Feature 07 — Conversation Screen and Real-Time Text Messages**
   as next.