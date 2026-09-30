const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
const { io } = require("socket.io-client");
const { PrismaClient } = require("../src/generated/prisma");

const prisma = new PrismaClient();
const socketUrl = process.env.TEST_SOCKET_URL || "http://127.0.0.1:4000";
const createdUserIds = [];
const createdConversationIds = [];
const sockets = [];

async function user(name) {
  const record = await prisma.user.create({
    data: {
      email: `group-socket-${name}-${crypto.randomUUID()}@example.invalid`,
      displayName: `Group Socket ${name}`,
      passwordHash: "test-only",
      emailVerifiedAt: new Date(),
    },
  });
  createdUserIds.push(record.id);
  return record;
}

function connect(userId) {
  return new Promise((resolve, reject) => {
    const socket = io(socketUrl, {
      auth: {
        token: jwt.sign({ sub: userId }, process.env.JWT_ACCESS_SECRET, {
          expiresIn: "10m",
        }),
      },
      reconnection: false,
    });
    sockets.push(socket);
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", reject);
  });
}

function send(socket, payload) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Message send timed out")),
      15_000,
    );
    socket.emit("message:send", payload, (result) => {
      clearTimeout(timer);
      resolve(result);
    });
  });
}

function emitWithAck(socket, event, payload) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${event} timed out`)),
      15_000,
    );
    socket.emit(event, payload, (result) => {
      clearTimeout(timer);
      resolve(result);
    });
  });
}

async function waitForCount(events, count) {
  const started = Date.now();
  while (events.length < count) {
    if (Date.now() - started > 15_000) {
      throw new Error(`Expected ${count} messages, got ${events.length}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

async function expectBroadcast(sender, payload, received, expectedUsers) {
  const before = Object.fromEntries(
    Object.entries(received).map(([name, events]) => [name, events.length]),
  );
  const result = await send(sender, payload);
  assert.equal(result.ok, true, JSON.stringify(result));
  await Promise.all(
    expectedUsers.map((name) => waitForCount(received[name], before[name] + 1)),
  );
  await new Promise((resolve) => setTimeout(resolve, 200));
  for (const [name, events] of Object.entries(received)) {
    assert.equal(
      events.length,
      before[name] + (expectedUsers.includes(name) ? 1 : 0),
      `Unexpected broadcast count for ${name}`,
    );
    if (expectedUsers.includes(name)) {
      assert.equal(events.at(-1).id, result.message.id);
    }
  }
  return result.message;
}

async function main() {
  const [a, b, c] = await Promise.all([user("A"), user("B"), user("C")]);
  const group = await prisma.conversation.create({
    data: {
      type: "GROUP",
      name: "Socket test group",
      createdBy: a.id,
      participants: {
        create: [
          { userId: a.id, role: "ADMIN" },
          { userId: b.id },
          { userId: c.id },
        ],
      },
    },
  });
  createdConversationIds.push(group.id);
  const direct = await prisma.conversation.create({
    data: {
      directKey: [a.id, b.id].sort().join(":"),
      participants: { create: [{ userId: a.id }, { userId: b.id }] },
    },
  });
  createdConversationIds.push(direct.id);

  const [aSocket, bSocket, cSocket] = await Promise.all([
    connect(a.id),
    connect(b.id),
    connect(c.id),
  ]);
  const received = { A: [], B: [], C: [] };
  const statusEvents = [];
  aSocket.on("message:new", (message) => received.A.push(message));
  bSocket.on("message:new", (message) => received.B.push(message));
  cSocket.on("message:new", (message) => received.C.push(message));
  aSocket.on("message:status", (status) => statusEvents.push(status));

  const firstClientId = `group-first-${crypto.randomUUID()}`;
  const first = await expectBroadcast(
    aSocket,
    {
      conversationId: group.id,
      content: "Hello group",
      clientMessageId: firstClientId,
    },
    received,
    ["A", "B", "C"],
  );
  assert.equal(first.inboxPreview, "Group Socket A: Hello group");
  assert.equal(
    await prisma.messageStatus.count({ where: { messageId: first.id } }),
    0,
  );
  const duplicate = await send(aSocket, {
    conversationId: group.id,
    content: "Hello group",
    clientMessageId: firstClientId,
  });
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.message.id, first.id);
  assert.equal(received.B.length, 1);

  const delivered = await emitWithAck(bSocket, "message:delivered", {
    messageIds: [first.id],
  });
  const read = await emitWithAck(bSocket, "message:read", {
    conversationId: group.id,
    upToMessageId: first.id,
  });
  assert.deepEqual(delivered, { success: true, updated: 0 });
  assert.deepEqual(read, { success: true, updated: 0 });
  assert.equal(statusEvents.length, 0);

  const cClientId = `group-c-${crypto.randomUUID()}`;
  await expectBroadcast(
    cSocket,
    {
      conversationId: group.id,
      content: "Before kick",
      clientMessageId: cClientId,
    },
    received,
    ["A", "B", "C"],
  );
  await prisma.conversationParticipant.update({
    where: {
      conversationId_userId: { conversationId: group.id, userId: c.id },
    },
    data: { leftAt: new Date() },
  });
  await expectBroadcast(
    aSocket,
    { conversationId: group.id, content: "After kick" },
    received,
    ["A", "B"],
  );
  assert.equal(
    (await send(cSocket, { conversationId: group.id, content: "Blocked" })).ok,
    false,
  );
  assert.equal(
    (
      await send(cSocket, {
        conversationId: group.id,
        content: "Before kick",
        clientMessageId: cClientId,
      })
    ).ok,
    false,
  );

  await prisma.conversationParticipant.update({
    where: {
      conversationId_userId: { conversationId: group.id, userId: c.id },
    },
    data: { leftAt: null },
  });
  await prisma.conversationParticipant.update({
    where: {
      conversationId_userId: { conversationId: group.id, userId: b.id },
    },
    data: { mutedAt: new Date() },
  });
  await expectBroadcast(
    aSocket,
    { conversationId: group.id, content: "Muted B still receives live" },
    received,
    ["A", "B", "C"],
  );

  const imageUrl = `${process.env.IMAGEKIT_URL_ENDPOINT.replace(/\/+$/, "")}/group-test/${crypto.randomUUID()}.jpg`;
  const voiceUrl = `${process.env.IMAGEKIT_URL_ENDPOINT.replace(/\/+$/, "")}/voice-notes/${crypto.randomUUID()}.m4a`;
  const image = await expectBroadcast(
    aSocket,
    { conversationId: group.id, content: null, mediaUrl: imageUrl },
    received,
    ["A", "B", "C"],
  );
  const voice = await expectBroadcast(
    aSocket,
    {
      conversationId: group.id,
      content: null,
      mediaUrl: voiceUrl,
      audioDurationMs: 1500,
    },
    received,
    ["A", "B", "C"],
  );
  assert.equal(image.mediaUrl, imageUrl);
  assert.equal(voice.audioDurationMs, 1500);
  assert.equal(
    await prisma.messageStatus.count({
      where: { messageId: { in: [image.id, voice.id] } },
    }),
    0,
  );

  await prisma.conversationParticipant.update({
    where: {
      conversationId_userId: { conversationId: group.id, userId: c.id },
    },
    data: { leftAt: new Date() },
  });
  await expectBroadcast(
    aSocket,
    { conversationId: group.id, content: "After voluntary leave" },
    received,
    ["A", "B"],
  );

  aSocket.disconnect();
  const reconnectedA = await connect(a.id);
  const reconnectEvents = [];
  const reconnectStatusEvents = [];
  reconnectedA.on("message:new", (message) => reconnectEvents.push(message));
  reconnectedA.on("message:status", (status) =>
    reconnectStatusEvents.push(status),
  );
  const queuedClientId = `group-queued-${crypto.randomUUID()}`;
  const queued = await expectBroadcast(
    reconnectedA,
    {
      conversationId: group.id,
      content: "Queued then reconnected",
      clientMessageId: queuedClientId,
    },
    { A: reconnectEvents, B: received.B, C: received.C },
    ["A", "B"],
  );
  const queuedRetry = await send(reconnectedA, {
    conversationId: group.id,
    content: "Queued then reconnected",
    clientMessageId: queuedClientId,
  });
  assert.equal(queuedRetry.ok, true);
  assert.equal(queuedRetry.message.id, queued.id);
  assert.equal(
    await prisma.message.count({
      where: { senderId: a.id, clientMessageId: queuedClientId },
    }),
    1,
  );

  const directMessage = await expectBroadcast(
    reconnectedA,
    { conversationId: direct.id, content: "Direct regression" },
    { A: reconnectEvents, B: received.B, C: received.C },
    ["A", "B"],
  );
  assert.equal(directMessage.inboxPreview, undefined);
  assert.equal(
    await prisma.messageStatus.count({
      where: { messageId: directMessage.id, status: "SENT" },
    }),
    1,
  );
  assert.deepEqual(
    await emitWithAck(bSocket, "message:delivered", {
      messageIds: [directMessage.id],
    }),
    { success: true, updated: 1 },
  );
  await waitForCount(reconnectStatusEvents, 1);
  assert.equal(reconnectStatusEvents[0].status, "DELIVERED");
  assert.deepEqual(
    await emitWithAck(bSocket, "message:read", {
      conversationId: direct.id,
      upToMessageId: directMessage.id,
    }),
    { success: true, updated: 1 },
  );
  await waitForCount(reconnectStatusEvents, 2);
  assert.equal(reconnectStatusEvents[1].status, "READ");
  console.log(
    "Group socket flow passed: active fan-out, kick/leave, mute-live delivery, media payloads, no group receipts, idempotent reconnect and direct-chat regression.",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    for (const socket of sockets) socket.disconnect();
    if (createdConversationIds.length > 0) {
      await prisma.conversation.deleteMany({
        where: { id: { in: createdConversationIds } },
      });
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
  });
