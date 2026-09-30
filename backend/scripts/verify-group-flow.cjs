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
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  return { status: response.status, body: await response.json() };
}

async function testUser(name) {
  const user = await prisma.user.create({
    data: {
      email: `group-flow-${name}-${crypto.randomUUID()}@example.invalid`,
      displayName: `Group Flow ${name}`,
      passwordHash: "test-only",
      emailVerifiedAt: new Date(),
    },
  });
  createdIds.push(user.id);
  return user;
}

async function friend(a, b) {
  await prisma.friendship.create({
    data: { requesterId: a.id, addresseeId: b.id, status: "ACCEPTED" },
  });
}

async function expectStatus(user, path, method, body, status) {
  const result = await api(user, path, method, body);
  assert.equal(result.status, status, JSON.stringify(result.body));
  return result.body;
}

async function main() {
  const a = await testUser("A");
  const b = await testUser("B");
  const c = await testUser("C");
  const d = await testUser("D");
  const stranger = await testUser("Stranger");
  await Promise.all([friend(a, b), friend(a, c), friend(a, d), friend(b, c)]);

  await expectStatus(
    a,
    "/api/conversations/group",
    "POST",
    {
      name: "Denied",
      memberIds: [stranger.id],
    },
    403,
  );
  const group = await expectStatus(
    a,
    "/api/conversations/group",
    "POST",
    {
      name: "Test group",
      memberIds: [b.id, c.id, d.id],
    },
    201,
  );
  assert.equal(group.members.length, 4);
  assert.equal(group.members.find((m) => m.id === a.id).role, "ADMIN");
  assert.equal(group.members.find((m) => m.id === b.id).role, "MEMBER");
  const path = `/api/conversations/group/${group.id}`;

  const previewMessage = await prisma.message.create({
    data: { conversationId: group.id, senderId: b.id, content: "Hello" },
  });
  await prisma.conversation.update({
    where: { id: group.id },
    data: { updatedAt: new Date() },
  });

  await expectStatus(b, path, "PATCH", { name: "Denied" }, 403);
  await expectStatus(stranger, path, "GET", undefined, 404);
  await expectStatus(
    a,
    `${path}/members/${a.id}/demote`,
    "POST",
    undefined,
    409,
  );
  await expectStatus(a, `${path}/members/${a.id}`, "DELETE", undefined, 409);
  await expectStatus(
    a,
    `${path}/members`,
    "POST",
    { memberIds: [stranger.id] },
    403,
  );
  await expectStatus(
    a,
    `${path}/members/${b.id}/promote`,
    "POST",
    undefined,
    200,
  );
  await expectStatus(a, path, "DELETE", undefined, 409);
  await expectStatus(b, path, "PATCH", { description: "Updated by B" }, 200);
  await expectStatus(b, `${path}/members/${a.id}`, "DELETE", undefined, 200);
  assert.equal(
    (await expectStatus(a, path, "GET", undefined, 404)).error,
    "Group not found",
  );
  await expectStatus(
    a,
    `/api/conversations/${group.id}/messages`,
    "GET",
    undefined,
    404,
  );
  assert.equal(
    (await expectStatus(b, path, "GET", undefined, 200)).members.length,
    3,
  );
  await expectStatus(c, `${path}/mute`, "POST", undefined, 200);
  assert.ok((await expectStatus(c, path, "GET", undefined, 200)).mutedAt);
  await expectStatus(c, `${path}/unmute`, "POST", undefined, 200);
  assert.equal(
    (await expectStatus(c, path, "GET", undefined, 200)).mutedAt,
    null,
  );
  await expectStatus(c, `${path}/members/${c.id}`, "DELETE", undefined, 200);
  assert.equal(
    (await expectStatus(b, path, "GET", undefined, 200)).members.length,
    2,
  );
  await expectStatus(b, `${path}/members`, "POST", { memberIds: [c.id] }, 200);
  assert.equal(
    (await expectStatus(b, path, "GET", undefined, 200)).members.find(
      (member) => member.id === c.id,
    ).role,
    "MEMBER",
  );

  const direct = await expectStatus(
    a,
    "/api/conversations/direct",
    "POST",
    {
      participantId: b.id,
    },
    200,
  );
  const bInbox = (
    await expectStatus(b, "/api/conversations", "GET", undefined, 200)
  ).conversations;
  assert.ok(
    bInbox.some(
      (item) =>
        item.id === direct.conversation.id &&
        item.type === "DIRECT" &&
        item.participant.id === a.id,
    ),
  );
  assert.ok(
    bInbox.some(
      (item) =>
        item.id === group.id &&
        item.type === "GROUP" &&
        item.name === "Test group" &&
        !Object.hasOwn(item, "participant"),
    ),
  );
  assert.equal(
    bInbox.find((item) => item.id === group.id).lastMessage.preview,
    "Group Flow B: Hello",
  );
  assert.equal(
    bInbox.find((item) => item.id === group.id).lastMessage.id,
    previewMessage.id,
  );
  const aInbox = (
    await expectStatus(a, "/api/conversations", "GET", undefined, 200)
  ).conversations;
  assert.ok(aInbox.every((item) => item.id !== group.id));

  const solo = await expectStatus(
    a,
    "/api/conversations/group",
    "POST",
    {
      name: "Solo group",
      memberIds: [],
    },
    201,
  );
  await expectStatus(
    a,
    `/api/conversations/group/${solo.id}/members/${a.id}`,
    "DELETE",
    undefined,
    200,
  );
  assert.equal(await prisma.conversation.count({ where: { id: solo.id } }), 0);

  await expectStatus(b, path, "DELETE", undefined, 200);
  assert.equal(await prisma.conversation.count({ where: { id: group.id } }), 0);
  console.log(
    "Group API flow passed: creation, friendship gate, roles, admin invariant, leave/kick, mute, inbox/preview, solo delete and dissolve.",
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
