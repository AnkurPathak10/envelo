# Feature 09: Mobile Chat Screen and Live Text Messaging

## Goal

Build the authenticated mobile conversation screen. A participant can open a
direct conversation, read its persisted text history, send a text message, and
receive new messages live over the existing Socket.io server.

This feature turns the work from Features 05, 07, and 08 into the first
end-to-end chat experience. The mobile client is a renderer and transport
client; Neon and the socket server remain the source of truth for messages.

## Scope boundary

This is a **mobile-only** feature. It may change files under `mobile/` and
`files/`, but must not modify `backend/`, `socket-server/`, the Prisma schema,
or migrations.

The REST history endpoint and socket event contracts already exist:

```text
GET /api/conversations/:conversationId/messages?cursor=<messageId>
  -> { messages: TextMessage[], nextCursor: string | null }

socket client -> server
  message:send({ conversationId, content }, acknowledgement)

socket server -> client
  message:new(TextMessage)
```

`TextMessage` is exactly:

```ts
interface TextMessage {
  id: string;
  conversationId: string;
  senderId: string;
  content: string | null;
  createdAt: string;
}
```

For a successful socket acknowledgement, `content` is always a non-empty
trimmed string. History keeps `content` nullable because that is the existing
database contract; this v1 screen should render only text messages with a
non-null `content` and must not invent support for media.

## In scope

- A dynamic Expo Router conversation route
- Navigation from the existing conversation list into that route
- A typed mobile wrapper for Feature 07 message history
- Initial history loading and an explicit "Load earlier messages" control
- One authenticated, app-level Socket.io connection while a user is signed in
- Typed sending with acknowledgement handling
- Live `message:new` handling for the currently open conversation
- Message-ID de-duplication between socket broadcast, acknowledgement, and
  REST history
- Loading, empty, error, disconnected, and send-failure UI states
- Light/dark token-based styling, keyboard-safe composer layout, TypeScript,
  linting, Prettier, and real-device verification

## Out of scope

- Any backend or socket-server change
- New database fields, status updates, receipt UI, typing indicators,
  presence, notifications, media, files, reactions, edit/delete, group chat,
  search, or calls
- Optimistic/fake messages, message retry, offline queueing, or local message
  persistence
- Automatic reconnection policy or token-refresh changes. The app must show a
  clear disconnected state instead of silently pretending sends succeeded.
- Changing protected refresh-token code or adding AsyncStorage

## Why this design

Feature 08 persists before it broadcasts. Therefore the mobile client should
only render a newly sent message after a successful server acknowledgement or
a `message:new` broadcast with the server-created ID. This avoids temporary
client-only messages that can disappear after a restart.

The sender receives both a successful acknowledgement and its own
`message:new` event. The UI must merge by durable message ID, so the sender
still sees one bubble, not two.

```text
Open chat
  ├─ subscribe to message:new for this screen
  └─ fetch latest 50 persisted messages
           │
           └─ merge by message ID, chronological order

Tap Send
  └─ message:send -> Socket.io validates/authorizes/persists
                           ├─ message:new -> every active device of both users
                           └─ success ack -> same durable message
                                      │
                                      └─ upsert by message ID -> one bubble
```

If a message arrives while a conversation is closed, it is intentionally not
stored in another mobile cache. Feature 08 already persisted it, so a later
history request retrieves it.

## Required files and responsibilities

```text
mobile/
  app/
    _layout.tsx                         — nest SocketProvider inside AuthProvider
    (app)/_layout.tsx                   — register conversation/[conversationId]
    (app)/home.tsx                      — navigate a row to the chat route
    (app)/conversation/[conversationId].tsx — route/screen composition only
  components/
    conversations/conversation-row.tsx  — make an existing row pressable
    chat/message-bubble.tsx             — presentational incoming/outgoing bubble
    chat/message-composer.tsx           — presentational text input and Send action
  lib/
    api/conversations.ts                — typed Feature 07 history wrapper
    socket/SocketContext.tsx            — one authenticated socket lifecycle
    chat/messages.ts                    — pure merge/sort/type helpers, if useful
```

Equivalent small-module organization is acceptable. Keep route/navigation,
socket lifecycle, API access, and presentational UI separate; do not put all
of them in one large screen file.

## 1. Route and navigation

Create `mobile/app/(app)/conversation/[conversationId].tsx`. Register it in
the authenticated native stack with normal back navigation.

When a user presses an existing `ConversationRow` on Home, push this route:

```ts
router.push({
  pathname: "/(app)/conversation/[conversationId]",
  params: {
    conversationId: conversation.id,
    participantName: conversation.participant.displayName,
  },
});
```

`participantName` is display-only route state used for the header title, with
`"Conversation"` as a fallback. Never treat it as authorization or as a
source of message data; the REST endpoint and socket server enforce access
using the authenticated user and `conversationId`.

The native header should show that display name, respect the active color
scheme, and retain the platform back button. Do not add a second custom header
inside the screen.

## 2. Message history API wrapper

Extend the existing `mobile/lib/api/conversations.ts`; do not create a second
fetch client and do not access SecureStore directly.

Add explicit types for `TextMessage` and the history envelope, plus a wrapper
such as:

```ts
getMessageHistory(
  conversationId: string,
  cursor?: string,
): Promise<MessageHistoryPage>
```

It must:

- call the existing token-refreshing `apiRequest`;
- URL-encode the path segment and optional cursor;
- return only the Feature 07 response shape;
- leave HTTP/token error mapping to the existing API client.

The first request has no cursor and returns the newest 50 messages in
chronological order. If `nextCursor` is non-null, show a top-of-list **Load
earlier messages** action. Pressing it requests that cursor, prepends the
returned messages, and replaces `nextCursor`. Disable only that action while
that page is loading. This explicit control is easier to reason about than
infinite-scroll pagination for the first chat implementation.

## 3. Authenticated socket lifecycle

Replace and delete the temporary Feature 04 hook
`mobile/lib/socket/useTemporarySocketTest.ts`. It must not remain imported.

Implement `SocketProvider` and `useSocket()` in
`mobile/lib/socket/SocketContext.tsx`. Nest the provider inside `AuthProvider`
and outside the root navigator:

```tsx
<AuthProvider>
  <SocketProvider>
    <RootNavigator />
  </SocketProvider>
</AuthProvider>
```

The provider reads the **in-memory** `accessToken` from `useAuth()` and:

1. Creates one `socket.io-client` instance only when that token exists.
2. Connects using `auth: { token: accessToken }` to
   `process.env.EXPO_PUBLIC_SOCKET_URL`.
3. Exposes a narrowly typed socket/send API and connection state to screens.
4. Disconnects and clears references when the token changes, on sign-out, and
   when the provider unmounts.
5. Handles `connect`, `disconnect`, and `connect_error` with concise,
   token-safe diagnostics. Never log an access token, event payload, or text.

There must not be one socket per chat screen; one signed-in user should have
one application socket connection. Do not join arbitrary client-selected
rooms—the Feature 08 server has already joined the authenticated user room.

Set an explicit, documented v1 behavior for a disconnected socket: the
composer cannot send and displays a reconnecting/disconnected notice. Do not
create automatic retry or an offline queue in this feature. Socket reconnection
and access-token refresh coordination remain the existing open question for a
separate, focused feature.

Use explicit TypeScript interfaces for:

- `message:send` payload;
- successful/failure acknowledgement union;
- `message:new` server event;
- the socket context value.

No `any`, and no client-supplied sender, timestamp, message ID, status, or
recipient fields.

## 4. Chat-screen state and race-safe merging

The screen gets `conversationId` from local route params and current user ID
from `useAuth()`. It needs independent state for:

- initial history loading/error;
- `messages`;
- `nextCursor` and older-page loading/error;
- current composer text;
- a single send in progress flag and send error;
- socket connection state supplied by `useSocket()`.

Subscribe to `message:new` while this screen is mounted. Ignore a payload
whose `conversationId` differs from the route's conversation ID. On a matching
message, merge it into screen state by `id` and sort ascending by
`createdAt`, with `id` as a stable tie-breaker.

Use that same merge helper for:

- initial REST history;
- an older REST page;
- the socket event; and
- the successful `message:send` acknowledgement.

Do not write `setMessages(response.messages)` after a request without merging:
a live event can arrive while the fetch is in flight. Merging makes that race
safe and ensures an acknowledgement plus broadcast creates exactly one bubble.

Messages are displayed oldest to newest. After initial loading or a newly
added latest message, scroll toward the end without interfering with someone
who deliberately loaded older history. A standard non-inverted `FlatList` is
preferred here because it keeps order and pagination understandable.

For the initial state:

- Show a centered activity indicator while the first page loads.
- Show a retryable, human-readable error if it fails.
- Show a calm empty state only after a successful empty response.
- For a 404 history response, show a safe unavailable/not-found message and
  offer Back; do not reveal authorization details.

## 5. Text composer and sending

Use a bottom composer made of a multiline `TextInput` and Send button inside a
`KeyboardAvoidingView` with safe-area-aware bottom spacing. It must work with
both Android and iOS keyboard behavior; use built-in React Native primitives,
not a new package.

Composer rules:

- `maxLength={2000}`.
- The Send button is disabled for blank/whitespace-only text, during a send,
  and while the socket is not connected.
- On press, trim only for validation/transport. Call the typed `message:send`
  API with the route conversation ID and trimmed content.
- Clear the input **only after** a successful acknowledgement.
- Merge the acknowledgement's durable message into the list.
- On a failure acknowledgement, timeout, or connection failure, retain the
  typed text and show a concise retryable send error. Do not automatically
  resend: Feature 08 has no idempotency key, so automatic retry can duplicate
  a persisted message.
- While disconnected, explain why Send is unavailable. Do not claim a message
  was queued or delivered.

Do not optimistic-render a temporary bubble. A bubble represents a message
the server has acknowledged or broadcast from its committed database row.

## 6. UI and theme requirements

Follow `files/ui-context.md` and the existing theme convention exactly:

```ts
const scheme = useColorScheme() ?? "light";
const c = colors[scheme];
const styles = createStyles(c);
```

- No hardcoded color hex values in screens or components.
- Use `bgBase`, `bgSurface`, `textPrimary`, `textMuted`, `accentPrimary`,
  `border`, and `error` appropriately, plus the shared `radius` tokens.
- Outgoing bubbles use the accent color and are visually aligned to the end;
  incoming bubbles use the surface color and are aligned to the start.
- Keep text readable in both themes. A message needs content and a modest
  timestamp; do not add unimplemented delivery/read labels.
- Support reasonable dynamic height for multiline input and long messages.

## Required checks

Before Feature 09 is marked complete:

```powershell
cd mobile
npx tsc --noEmit
npm run lint
npx prettier --write .
```

Run TypeScript and lint before formatting if desired; formatting is the final
command required by `code-standards.md`. Re-run TypeScript/lint if formatting
changes code. Confirm there are no imports of the deleted temporary socket hook
and no direct use of SecureStore outside the auth storage module.

## Manual end-to-end testing

Feature 09 is primarily frontend code, but live messaging is not frontend-only:
it proves the mobile UI can use the already-built REST API and socket server.
You need two different test accounts and ideally two devices on the same LAN
or hotspot.

### One-time configuration

1. In `socket-server/.env`, ensure `PORT`, `JWT_ACCESS_SECRET`, and
   `DATABASE_URL` are set. The secret and database URL must match `backend/.env`.
2. In `mobile/.env`, use your computer's reachable hotspot/LAN address, not
   `localhost`:

   ```env
   EXPO_PUBLIC_API_URL=http://<computer-LAN-IP>:3000
   EXPO_PUBLIC_SOCKET_URL=http://<computer-LAN-IP>:4000
   ```

3. Use the same Wi-Fi/hotspot for both phones. A physical phone cannot reach
   your computer through `localhost`.

### Start the three processes

Open three terminals:

```powershell
cd backend
npm run dev
```

```powershell
cd socket-server
npm run dev
```

```powershell
cd mobile
npx expo start -c
```

Open Expo Go on both devices, then sign in with two different accounts. Use
Feature 06 to create/open the same direct conversation between them.

### Test checklist

1. **Navigation and history** — Tap a conversation on device A. The chat opens
   with the other user's name in the native header. Existing messages load in
   chronological order. Go Back and return: the list still works.
2. **Send and receive live** — On A, send `hello from A`. A single outgoing
   bubble appears only after Send completes. B, with the same conversation
   open, receives one incoming bubble without manually refreshing.
3. **Reply** — Send a message from B and confirm A receives it immediately.
   Verify alignment/color follows the current signed-in sender, not the other
   person's name.
4. **No duplicate sender bubble** — A's sent message must appear once even
   though A receives both a socket broadcast and acknowledgement.
5. **Persistence** — Force-close/reload either app, reopen the conversation,
   and confirm messages are still there from REST history. Also close B, send
   on A, reopen B, and confirm the missed message appears in history.
6. **Input validation** — Try blank spaces (Send stays disabled); send a long
   multiline message; verify text is trimmed at its outer edges and a message
   cannot exceed 2,000 characters.
7. **Socket failure** — Stop the socket server while a chat is open. The UI
   clearly shows it is disconnected, disables Send, and does not clear the
   typed draft. Restarting the server is not a requirement to auto-reconnect
   in this feature; record the observed behavior.
8. **Pagination** — If your test conversation has more than 50 messages, load
   the newest page, press **Load earlier messages**, and confirm older messages
   prepend with no missing/duplicate boundary message.
9. **Theme and keyboard** — Test system light and dark appearance. Focus the
   multiline input; the composer remains reachable above the keyboard and the
   message list remains usable.
10. **Auth isolation** — Sign out, then confirm the app returns to auth and
    no active chat socket remains. Sign in as the other user and confirm only
    that user's conversations/messages are accessible.

If only one physical device is available, you can still verify navigation,
history, sending, persistence, validation, keyboard, and theme. For the true
live recipient test, use a second phone or an emulator with a second account.

## Completion criteria

Feature 09 is complete only when:

1. A user can open an authorized direct conversation and view server history.
2. A sent message is server-confirmed, persisted, and appears once locally.
3. A second signed-in participant receives a new message live.
4. Reloading a client retrieves messages that arrived while it was closed.
5. Disconnected and failed-send states never claim success or discard a draft.
6. No backend, socket-server, Prisma schema, or migration files changed.
7. `npx tsc --noEmit`, `npm run lint`, and `npx prettier --write .` pass in
   `mobile/`.
8. `files/progress-tracker.md` is updated after implementation, including the
   exact manual device tests completed and any remaining environment issue.
