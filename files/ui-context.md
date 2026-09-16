# UI Context

## Theme

Both light and dark mode are supported, following the device's
system appearance setting (not a manual in-app toggle, unless
Ankur decides to add one later). Chat-app layout: chat list screen
+ conversation screen.

## Colors

Color tokens as plain JS constants (React Native has no CSS engine
— there is no equivalent of CSS custom properties/`globals.css`
here). All components should import these from
`mobile/constants/theme.ts` rather than hardcoding hex values.

| Role            | Light      | Dark       |
| ---------------- | ---------- | ---------- |
| Page background   | `#FFFFFF`  | `#0B0F14`  |
| Surface            | `#F5F7FA`  | `#151A21`  |
| Primary text        | `#11181C`  | `#F5F7FA`  |
| Muted text           | `#5B6572`  | `#8A93A2`  |
| Primary accent        | `#2F80ED`  | `#2F80ED`  |
| Border                  | `#E2E6EA`  | `#242B33`  |
| Error                    | `#D93036`  | `#E5484D`  |
| Success                   | `#1F9D5C`  | `#30A46C`  |

(Light-mode values above are a reasonable first pass to match the
dark palette's feel — revisit if they don't look right in practice.)

## Typography

| Role      | Font          | Notes                          |
| --------- | ------------- | ------------------------------- |
| UI text   | System default (San Francisco / Roboto via Expo) | Avoid custom font loading for v1 to keep things simple |
| Code/mono | Not needed    | No code display in-app          |

## Border Radius

| Context           | Value    |
| ------------------ | -------- |
| Inline / small UI  | 8px      |
| Cards / bubbles    | 16px     |
| Modals / sheets    | 20px     |

## Component Library

Resolved in Feature 03: plain React Native `StyleSheet` — no
NativeWind/React Native Paper dependency for now.

## Layout Patterns

- **Conversation list**: full-screen scrollable list, avatar +
  name + last message preview + timestamp + unread badge per row
- **Chat screen**: message bubbles (sender right-aligned/accent
  color, recipient left-aligned/surface color), input bar pinned
  to bottom, delivery/read tick icons on sent messages
- **Navigation**: Expo Router, file-based routing under `mobile/app/`

## Icons

Resolved in Feature 03: `@expo/vector-icons` (bundled with Expo).

## Theming Implementation Notes

- `mobile/constants/theme.ts` exports a `colors` object for each
  mode (`light` and `dark`), plus a `radius` object shared across
  both.
- Use React Native's `useColorScheme()` hook to detect the active
  system mode and select the matching color set at the point each
  screen builds its `StyleSheet.create()` — do not hardcode either
  mode's values directly into a screen.
- The old Expo-starter `theme.ts` (with `tabIconDefault`,
  `tabIconSelected`, etc.) has been replaced — those tokens were
  for the default tab-bar template, which this project doesn't use.

## Open Items to Discuss

- Light-mode color values above are a first pass, not confirmed
  against an actual design — check how they look once screens are
  refactored to use them
- Confirm icon usage conventions (sizes) as more screens are built