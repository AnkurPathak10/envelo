const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const baseUrl = process.env.TEST_API_URL || "http://127.0.0.1:3000";
const createdIds = [];

async function api(user, path, method = "GET", body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${jwt.sign({ sub: user.id }, process.env.JWT_ACCESS_SECRET, { expiresIn: "10m" })}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  return { status: response.status, body: await response.json() };
}

async function testUser(name) {
  const user = await prisma.user.create({
    data: {
      email: `friend-flow-${name}-${crypto.randomUUID()}@example.invalid`,
      displayName: `Friend Flow ${name}`,
      passwordHash: "test-only",
      emailVerifiedAt: new Date(),
    },
  });
  createdIds.push(user.id);
  return user;
}

async function main() {
  const a = await testUser("A");
  const b = await testUser("B");
  const c = await testUser("C");
  const d = await testUser("D");
  const e = await testUser("E");
  assert.equal(
    (await api(a, "/api/conversations/direct", "POST", { participantId: b.id }))
      .status,
    403,
  );
  assert.equal(
    (await api(a, `/api/users?query=${encodeURIComponent(b.email)}`)).body
      .users[0].friendStatus,
    "NONE",
  );

  const sent = await api(a, "/api/friends/request", "POST", {
    addresseeId: b.id,
  });
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  assert.equal(sent.body.friendship.status, "PENDING");
  assert.equal((await api(a, "/api/conversations")).body.conversations.length, 0);
  assert.equal((await api(b, "/api/conversations")).body.conversations.length, 0);
  const incoming = await api(b, "/api/friends/requests");
  assert.equal(incoming.body.requests.length, 1);
  assert.equal(incoming.body.requests[0].requester.id, a.id);
  assert.equal(
    (await api(a, `/api/users?query=${encodeURIComponent(b.email)}`)).body
      .users[0].friendStatus,
    "PENDING_OUTGOING",
  );
  assert.equal(
    (await api(b, `/api/users?query=${encodeURIComponent(a.email)}`)).body
      .users[0].friendStatus,
    "PENDING_INCOMING",
  );
  assert.equal(
    (
      await api(
        c,
        `/api/friends/requests/${sent.body.friendship.id}/accept`,
        "POST",
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await api(
        b,
        `/api/friends/requests/${sent.body.friendship.id}/accept`,
        "POST",
      )
    ).status,
    200,
  );
  assert.equal((await api(a, "/api/friends")).body.friends[0].id, b.id);
  assert.equal((await api(b, "/api/friends")).body.friends[0].id, a.id);
  const aInbox = (await api(a, "/api/conversations")).body.conversations;
  const bInbox = (await api(b, "/api/conversations")).body.conversations;
  assert.equal(aInbox.length, 1);
  assert.equal(bInbox.length, 1);
  assert.equal(aInbox[0].id, bInbox[0].id);
  assert.equal(aInbox[0].lastMessage, null);
  assert.equal(bInbox[0].lastMessage, null);
  assert.equal(
    (await api(a, `/api/users?query=${encodeURIComponent(b.email)}`)).body
      .users[0].friendStatus,
    "FRIENDS",
  );
  const chat = await api(a, "/api/conversations/direct", "POST", {
    participantId: b.id,
  });
  assert.equal(chat.status, 200, JSON.stringify(chat.body));
  assert.equal(chat.body.conversation.id, aInbox[0].id);
  assert.equal(
    (await api(a, "/api/conversations/direct", "POST", { participantId: b.id }))
      .body.conversation.id,
    chat.body.conversation.id,
  );

  const toC = await api(a, "/api/friends/request", "POST", {
    addresseeId: c.id,
  });
  assert.equal(toC.status, 200);
  assert.equal(
    (
      await api(
        c,
        `/api/friends/requests/${toC.body.friendship.id}/reject`,
        "POST",
      )
    ).status,
    200,
  );
  assert.equal(
    (await api(a, "/api/friends/request", "POST", { addresseeId: c.id }))
      .status,
    400,
  );
  assert.equal(
    (await api(a, `/api/users?query=${encodeURIComponent(c.email)}`)).body
      .users[0].friendStatus,
    "COOLDOWN",
  );
  assert.equal(
    (await api(c, "/api/friends/request", "POST", { addresseeId: a.id })).body
      .friendship.status,
    "PENDING",
  );
  assert.equal(
    (await api(a, "/api/friends/request", "POST", { addresseeId: c.id })).body
      .friendship.status,
    "ACCEPTED",
  );
  const aAndC = (await api(a, "/api/conversations")).body.conversations.find(
    (conversation) => conversation.participant.id === c.id,
  );
  const cAndA = (await api(c, "/api/conversations")).body.conversations.find(
    (conversation) => conversation.participant.id === a.id,
  );
  assert.ok(aAndC);
  assert.equal(aAndC.id, cAndA?.id);
  assert.equal(aAndC.lastMessage, null);

  assert.equal(
    (await api(d, "/api/friends/request", "POST", { addresseeId: e.id })).body
      .friendship.status,
    "PENDING",
  );
  assert.equal(
    (await api(e, "/api/friends/request", "POST", { addresseeId: d.id })).body
      .friendship.status,
    "ACCEPTED",
  );
  const dInbox = (await api(d, "/api/conversations")).body.conversations;
  const eInbox = (await api(e, "/api/conversations")).body.conversations;
  assert.equal(dInbox.length, 1);
  assert.equal(eInbox.length, 1);
  assert.equal(dInbox[0].id, eInbox[0].id);
  assert.equal(dInbox[0].lastMessage, null);
  console.log(
    "Friend API flow passed: authorization, search states, request/accept/reject, cooldown, crossing requests, automatic empty chats, direct-chat gate/reuse.",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (createdIds.length) {
      await prisma.conversation.deleteMany({
        where: { participants: { some: { userId: { in: createdIds } } } },
      });
      await prisma.user.deleteMany({ where: { id: { in: createdIds } } });
    }
    await prisma.$disconnect();
  });
