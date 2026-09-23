# Feature 18: Light Theme Colors for Chat and Conversations

## Goal

Apply the new five-color palette to the **light-mode conversation list and open chat**. The attached screenshots show which surfaces should receive each color. They are color references, not requests to copy their layout, add controls, or build new messaging features.

This is a mobile presentation change. Keep the current chat, inbox, theme preference, navigation, media, offline, and message-status behavior intact.

## Source of truth and scope

- Palette supplied by the user: `C:\Users\ap331\Downloads\palette.txt`. It contains the exact hex values below. Use those values for the normal state of each assigned surface, with no sampling from the screenshots or substitute tints. Existing pressed and disabled feedback may still use opacity.
- Visual references supplied by the user:
  - `D:\OneDrive\Pictures\Screenshots\Screenshot 2026-09-21 012452.png` — open chat.
  - `D:\OneDrive\Pictures\Screenshots\Screenshot 2026-09-21 012505.png` — conversations list at left and open chat at right.
- Implement and review **light mode on these two screens only**. The shared palette definitions may live in the theme system for future reuse, but do not recolor login, signup, profile, or new-conversation screens merely as a side effect of changing a global token.
- Keep the existing dark palette and Light / Dark / System preference behavior. A new dark palette has not been decided; do not derive or invent one in this feature.
- Feature 17 has active media work in the chat and composer. Preserve those controls and their behavior while applying colors.

## Exact palette and assignments

| Palette name | Hex | Light-mode role on the two target screens |
| --- | --- | --- |
| Rosy Taupe | `#D39A86` | Primary action accent: the existing send control, attach/add action icon, new-conversation action, active or selected accents, and loading/progress accent where appropriate. |
| Cotton Rose | `#E3C4C9` | Softer secondary accent: unread badge fill, subtle separators/borders, and selected theme-toggle fill if that toggle is shown in the inbox. |
| Soft Blush | `#FEE3E2` | **Outgoing/sent message bubble** background, including the background around captions on sent image messages. |
| Platinum | `#F1F0F1` | **Incoming/received message bubble** background and the neutral message input surface. Use for other neutral inset surfaces on these screens where the current gray surface belongs. |
| White | `#FEFFFE` | Base background for the inbox, open chat, header, and composer area. |

The user confirmed this mapping. The current blue sent-message bubble becomes `#FEE3E2`. The received bubble becomes `#F1F0F1`. The reference's muted rose action color is `#D39A86`; avoid retaining blue action accents on either target screen.

### Text and icon legibility

The supplied palette defines surfaces and accents, not text, error, or success colors. Keep the existing semantic dark text (`#11181C`) and muted text (`#5B6572`) for light mode unless an existing state requires its semantic error/success color. Use dark text and icons on the light pink, gray, and taupe fills. In particular, **do not put white text on `#D39A86`**: it has only about 2.4:1 contrast against `#FEFFFE`, while `#11181C` on `#D39A86` has about 7.5:1. Keep timestamps and status ticks readable on both message bubble colors.

When the send affordance is an icon, tint the icon `#D39A86` as in the reference. The current repository composer uses a `Send` text button; recolor that existing control to the same accent with readable dark foreground, preserving its label and behavior. Do not add microphone, plus, or other screenshot controls solely for visual similarity. If Feature 17 has since changed the send control to an icon, tint that existing icon instead.

Do not replace semantic error or success colors with a palette color merely to force every element into five colors. Preserve disabled and pressed-state feedback without changing the base assigned hex values.

## Screen requirements

### 1. Open conversation

- Use `#FEFFFE` for the chat's main background, navigation/header surface, bottom composer area, and safe-area fill.
- Use `#FEE3E2` for every outgoing text bubble, optimistic/pending bubble, and outgoing media caption bubble. Keep their message text dark.
- Use `#F1F0F1` for incoming text and media-caption bubbles. Keep their message text dark and metadata legible.
- Use `#F1F0F1` for the composer text input. Use `#E3C4C9` for its subtle border or adjacent separator where a border already exists.
- Use `#D39A86` for the existing send and attachment action treatment, along with applicable loading, retry, and link accents on this screen. Keep the send control's enabled/disabled behavior and accessible name.
- Keep image content, image viewer, status semantics, timestamps, draft/pending/offline flow, and keyboard handling unchanged.

### 2. Conversations list (inbox)

- Use `#FEFFFE` for the list and header background.
- Keep the existing row structure, avatars, last-message previews, timestamps, status ticks, unread counts, theme toggle, new-conversation action, and states. Recolor the surrounding chrome to the palette.
- Use `#D39A86` for primary action treatment and `#E3C4C9` for the unread badge and subtle row separators. Badge count text must be dark and readable.
- Use `#F1F0F1` for existing neutral inset or pressed surfaces; do not give every row a gray card background if that changes the current layout.
- If an avatar photo exists, show it unchanged. For the initials fallback visible on the inbox, replace the current saturated blue/purple/red/etc. backgrounds with deterministic choices from the supplied warm palette, with readable dark initials. Keep avatar sizing and identity mapping behavior.
- Continue to show previews, timestamps, unread counts, and empty/loading/error/offline states as before. Their presentation should fit the light palette without altering data logic.

## Implementation guidance for the AI agent

1. Read `AGENTS.md` and the exact Expo SDK 54 documentation at <https://docs.expo.dev/versions/v54.0.0/> before editing code, as the repository requires.
2. Inspect the current files before editing; Feature 17 changes may still be in progress. Likely touch points are:
   - `mobile/constants/theme.ts`
   - `mobile/components/chat/message-bubble.tsx`
   - `mobile/components/chat/message-composer.tsx`
   - `mobile/components/chat/chat-screen.tsx`
   - `mobile/components/conversations/conversation-row.tsx`
   - `mobile/components/conversations/unread-badge.tsx`
   - `mobile/components/conversations/conversation-avatar.tsx`
   - `mobile/components/conversations/empty-conversation-list.tsx`
   - `mobile/components/theme/theme-toggle.tsx`
   - `mobile/app/(app)/home.tsx` and the conversation route/header in `mobile/app/(app)/`.
3. Define named light-palette values and semantic chat/inbox roles centrally. Apply them only when the effective scheme is light. Avoid scattering new hex literals through components. Preserve the current dark roles and the existing theme preference context.
4. Reconcile existing uses of `accentPrimary`, `onAccent`, `bgBase`, `bgSurface`, and `border` on the two target screens. A broad change to `colors.light.accentPrimary` would also recolor unrelated screens, so use scoped semantic roles or an equivalent approach.
5. Do not change backend, socket protocol, database, API data contracts, dependencies, or messaging behavior for this color task.
6. Feature 17's completion notes tentatively call authentication direction “Feature 18.” This user-requested spec is Feature 18; leave authentication for a separately numbered future feature and do not implement it here.

## Acceptance checklist

1. With Light selected, the inbox and open chat visibly use all five supplied hex colors in the roles above. Sent bubbles are `#FEE3E2`, received bubbles `#F1F0F1`, and the main backgrounds `#FEFFFE`.
2. No blue bubble or blue primary action remains on these two screens. Image content and user photos are naturally exempt.
3. Sent and received text, timestamps, status ticks, button labels/icons, unread counts, and input text are readable; dark foreground is used on filled rose/taupe controls.
4. A message with media and/or caption, an optimistic/pending message, an empty conversation, and an unread inbox row retain their existing behavior and receive the correct light colors.
5. Switching to Dark or System still works. The dark theme values are unchanged, and System follows the device setting as before.
6. Login, signup, profile, and new-conversation screens have no intentional visual redesign from this feature.
7. Check both screens on a real device against the supplied screenshots for **color placement only**. Do not treat differing icons, typography, spacing, or extra screenshot features as failures.
8. Run the existing mobile TypeScript and lint checks (`npx tsc --noEmit`, `npm run lint`) and format only changed code. Preserve any pre-existing uncommitted Feature 17 work.

This file is the implementation brief. Do not mark Feature 18 complete in `files/progress-tracker.md` until the implementation and visual checks are actually finished.
