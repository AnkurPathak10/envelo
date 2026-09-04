# UI Context

> **Status: provisional.** Ankur and the assistant have not yet
> had a dedicated UI discussion. The defaults below are a minimal,
> sensible starting point (common for chat apps) so implementation
> isn't blocked — revisit and confirm/override each section below.

## Theme

Dark-first, minimal chat UI (WhatsApp/Telegram-style layout: chat
list screen + conversation screen). Light mode not required for v1.

## Colors

Placeholder token set — confirm before building UI components.

| Role            | CSS Variable       | Value         |
| --------------- | ------------------- | ------------- |
| Page background | `--bg-base`         | `#0B0F14`     |
| Surface         | `--bg-surface`      | `#151A21`     |
| Primary text    | `--text-primary`    | `#F5F7FA`     |
| Muted text      | `--text-muted`      | `#8A93A2`     |
| Primary accent  | `--accent-primary`  | `#2F80ED`     |
| Border          | `--border-default`  | `#242B33`     |
| Error           | `--state-error`     | `#E5484D`     |
| Success         | `--state-success`   | `#30A46C`     |

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

Not yet decided. Options to discuss:
- Plain React Native `StyleSheet` (no dependency, full control)
- NativeWind (Tailwind-style utility classes for React Native)
- React Native Paper (Material Design component kit)

## Layout Patterns

- **Conversation list**: full-screen scrollable list, avatar +
  name + last message preview + timestamp + unread badge per row
- **Chat screen**: message bubbles (sender right-aligned/accent
  color, recipient left-aligned/surface color), input bar pinned
  to bottom, delivery/read tick icons on sent messages
- **Navigation**: stack navigation (list → conversation), standard
  header with back button

## Icons

Not yet decided — likely `lucide-react-native` or
`@expo/vector-icons` (bundled with Expo, no extra install).

## Open Items to Discuss

- Confirm color palette (or replace with Ankur's own preference)
- Confirm component library choice
- Confirm icon set
- Decide on avatar/profile picture treatment
