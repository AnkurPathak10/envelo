# AI Workflow Rules

## Approach

Build Envelo incrementally using a spec-driven workflow. The six
context files in this folder define what to build, how to build
it, and the current state of progress. Always implement against
these specs — do not infer or invent product behavior, schema
fields, or architectural decisions that aren't defined here. If
something is missing, stop and add it as an open question in
`progress-tracker.md` rather than guessing.

This is a learning-focused project — prefer clear, well-understood
implementations over clever shortcuts, especially for the
WebSocket layer and the authentication system, since understanding
those deeply is a primary goal of the project.

## Scoping Rules

- Work on one feature unit at a time (e.g. "user signup endpoint",
  not "the whole auth system" in one step)
- Prefer small, verifiable increments over large speculative
  changes
- Do not combine unrelated system boundaries in a single
  implementation step — e.g. do not touch the Socket.io server and
  the Next.js auth routes in the same change
- Do not introduce Redis, multi-instance scaling, or other
  infrastructure not called for in `architecture.md`, even if it
  seems like a reasonable improvement

## When to Split Work

Split an implementation step if it combines:

- Mobile (Expo) UI changes and backend/API changes
- Next.js backend changes and Socket.io server changes
- Auth/token logic and unrelated feature logic (e.g. messaging)
- Behavior not clearly defined in the context files

If a change cannot be verified end to end quickly (e.g. by sending
a real message between two logged-in test users), the scope is too
broad — split it.

## Handling Missing Requirements

- Do not invent product behavior not defined in the context files
- If a requirement is ambiguous (e.g. exact UI colors, exact retry
  behavior on socket disconnect), resolve it in the relevant
  context file (`ui-context.md` or `architecture.md`) before
  implementing, by asking Ankur
- If a requirement is missing entirely, add it as an open question
  in `progress-tracker.md` before continuing

## Protected Files

Do not modify the following unless explicitly instructed:

- `prisma/schema.prisma` — only change with explicit confirmation,
  since it affects both the Next.js backend and the Socket.io
  server
- Any generated Prisma client code
- Refresh token hashing/rotation logic, once implemented — this is
  security-sensitive and should not be casually refactored

## Keeping Docs in Sync

Update the relevant context file whenever implementation changes:

- System architecture or service boundaries → `architecture.md`
- Database schema or storage decisions → `architecture.md`
- Code conventions actually followed → `code-standards.md`
- Feature scope changes (e.g. group chat moves into scope) →
  `project-overview.md`

## Before Moving to the Next Unit

1. The current unit works end to end within its defined scope
   (e.g. a message sent from one test user is received in real
   time by the other, and persisted after app restart)
2. No invariant defined in `architecture.md` was violated
3. `progress-tracker.md` reflects the completed work
4. The relevant app (Next.js backend or Socket.io server) builds
   and runs without errors
