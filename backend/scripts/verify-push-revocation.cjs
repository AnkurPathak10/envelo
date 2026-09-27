const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const baseUrl = process.env.TEST_API_URL || "http://127.0.0.1:3000";
const users = [];
const token = `ExpoPushToken[${crypto.randomUUID().replaceAll("-", "")}]`;

async function user(name) {
  const created = await prisma.user.create({
    data: {
      email: `push-revocation-${name}-${crypto.randomUUID()}@example.invalid`,
      displayName: `Push Revocation ${name}`,
      passwordHash: "test-only",
      emailVerifiedAt: new Date(),
    },
  });
  users.push(created.id);
  return created;
}

async function api(method, body, actor) {
  const response = await fetch(`${baseUrl}/api/push/register`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(actor
        ? {
            Authorization: `Bearer ${jwt.sign(
              { sub: actor.id },
              process.env.JWT_ACCESS_SECRET,
              { expiresIn: "5m" },
            )}`,
          }
        : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  return { status: response.status, body: await response.json() };
}

async function main() {
  const first = await user("first");
  const second = await user("second");
  const firstRegistration = await api("POST", { token }, first);
  assert.equal(firstRegistration.status, 200);
  const firstGrant = firstRegistration.body.revocationGrant;
  assert.match(firstGrant, /^[a-f0-9]{64}$/i);

  const wrongGrant = await api("DELETE", {
    token,
    revocationGrant: "0".repeat(64),
  });
  assert.equal(wrongGrant.status, 403);
  assert.equal((await prisma.pushToken.findUnique({ where: { token } })).userId, first.id);

  const secondRegistration = await api("POST", { token }, second);
  assert.equal(secondRegistration.status, 200);
  assert.equal(
    (await api("DELETE", { token, revocationGrant: firstGrant })).status,
    403,
  );
  assert.equal((await prisma.pushToken.findUnique({ where: { token } })).userId, second.id);
  assert.equal(
    (
      await api("DELETE", {
        token,
        revocationGrant: secondRegistration.body.revocationGrant,
      })
    ).status,
    200,
  );
  assert.equal(await prisma.pushToken.findUnique({ where: { token } }), null);
  console.log("Push token removal grants passed: invalid, reassigned, and offline-safe removal.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      if (users.length > 0) {
        await prisma.pushToken.deleteMany({ where: { token } });
        await prisma.user.deleteMany({ where: { id: { in: users } } });
      }
    } finally {
      await prisma.$disconnect();
    }
  });
