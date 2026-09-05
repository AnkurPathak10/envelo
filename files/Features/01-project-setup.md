# Feature 01: Project Setup

## Status

Infrastructure setup is complete (done manually by Ankur, outside
the agent's scope — documented here for reference). No code
implementation is required for this feature; it exists to give the
agent accurate context on what already exists before Feature 02
(Authentication) begins.

## What Exists

### Repository structure

- `mobile/` — Expo/React Native app (moved here from repo root)
- `backend/` — Next.js app; owns auth, REST APIs, and the Prisma
  schema/client
- `socket-server/` — Node/Express/Socket.io app (scaffolded,
  not yet implemented)
- `prisma/` — lives inside `backend/prisma/` (not at repo root —
  this repo does not use a shared root-level prisma folder)
- `files/` — this context-file folder

### Database

- Neon Postgres project created and linked
- Connection strings stored in `backend/.env` as `DATABASE_URL`
  (pooled) and `DATABASE_URL_UNPOOLED` (direct)
- `backend/.env` is gitignored — never commit it

### Prisma

- Installed in `backend/` only, pinned to the stable v6 line
  (not the `latest` dist-tag, which currently resolves to an
  8.0.0 release-candidate line with a different, incompatible CLI
  — do not upgrade Prisma without explicitly checking the target
  version's release status first)
- `backend/prisma/schema.prisma` defines the initial data model:
  `User`, `RefreshToken`, `Conversation`, `ConversationParticipant`,
  `Message`, `MessageStatus` (with a `MessageStatusType` enum:
  SENT / DELIVERED / READ)
- Initial migration has been run against the Neon database via
  `npx prisma migrate dev --name init` — Prisma Client is
  generated and usable from `backend/`

## Agent Instructions

- Do not re-run `prisma init` or reinstall Prisma — it is already
  set up correctly as described above.
- Do not create a root-level `prisma/` folder — the schema lives
  at `backend/prisma/schema.prisma` only.
- When implementing future features that need schema changes,
  edit `backend/prisma/schema.prisma` directly and note in
  `progress-tracker.md` that a new migration needs to be run
  manually by Ankur (the agent should not assume it can run
  database migrations itself unless explicitly instructed to).
- `socket-server/` will need its own `@prisma/client` install and
  its own `.env` with the same DB values later, but should never
  run migrations — see `architecture.md`.
