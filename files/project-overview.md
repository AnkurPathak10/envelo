# Envelo

## Overview

Envelo is a minimal, Telegram/WhatsApp-style real-time chat
application for Android, built with Expo/React Native on the
frontend. It is a personal learning project for Ankur, focused on
gaining hands-on production-style experience with WebSockets and
building a custom authentication system from scratch, while
producing a genuinely usable 1:1 messaging app.

## Goals

1. Build real, working knowledge of WebSockets (Socket.io) by
   implementing real-time messaging end to end, rather than using a
   managed real-time service.
2. Build a custom JWT-based authentication system from scratch
   (no Clerk/Auth0), to understand session and token security
   properly.
3. Ship a minimal but functional 1:1 chat app with message
   persistence and delivery/read receipts, deployable and usable
   outside of localhost.
4. Keep the entire stack on free tiers — no paid infrastructure.

## Core User Flow

1. User signs up or logs in (email/password, custom auth).
2. User lands on a conversation list screen.
3. User opens or starts a 1:1 conversation with another user.
4. User sends a message — it is persisted to Postgres and
   broadcast in real time over WebSocket to the recipient.
5. Message status updates live: sent → delivered → read.
6. User can send images/media within a conversation.

## Features

### Authentication

- Email/password signup and login (custom-built, no third-party
  auth provider)
- JWT access token (short-lived) + refresh token (long-lived,
  rotated on use) issued by the backend
- Refresh tokens stored hashed server-side; access tokens used to
  authenticate both REST calls and the Socket.io handshake

### Messaging

- Real-time 1:1 text messaging over WebSocket (Socket.io)
- Message persistence in Postgres via Prisma
- Delivery and read receipts (sent / delivered / read states,
  WhatsApp-style ticks)
- Conversation list with most recent message preview

### Media

- Image sharing within a conversation, uploaded to Cloudinary and
  referenced by URL in the message record

## Scope

### In Scope

- 1:1 real-time messaging
- Custom JWT authentication
- Message delivery/read receipts
- Image sharing in chat
- Android app (Expo)
- Deployment of both the Next.js backend and the Socket.io server

### Out of Scope (v1)

- Group chats (planned for a later phase)
- Voice/video calls
- End-to-end encryption
- Web client
- Redis / multi-instance horizontal scaling of the socket server
- OAuth/social login (may be added later on top of the custom
  auth system)

## Success Criteria

1. A user can sign up and log in, and the session persists via
   refresh token across app restarts.
2. Two users can exchange real-time messages that are saved and
   visible again after closing and reopening the app.
3. Message status accurately reflects sent, delivered, and read
   states in the UI.
4. Images can be sent and received within a conversation.
5. The app works against deployed infrastructure (not just
   localhost) — Next.js backend on Vercel, Socket.io server on
   Render.
