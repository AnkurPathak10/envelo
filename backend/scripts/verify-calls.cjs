// Exercises real API handlers, Socket.IO handlers/coordinator, and the configured
// Neon database. Default mode mocks only Cloudflare; --live uses its real API.
// No media is joined/recorded. Never prints participant tokens or credentials.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const { createServer } = require("node:http");
const ts = require("typescript");
const jwt = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");
const { NextRequest } = require("next/server");
const socketRequire = createRequire(
  path.resolve("../socket-server/package.json"),
);
const express = socketRequire("express");
const { Server } = socketRequire("socket.io");
const { io: connectClient } = socketRequire("socket.io-client");
const backendRoot = path.resolve(".");
const socketRoot = path.resolve("../socket-server/src");
const prisma = new PrismaClient();
const live = process.argv.includes("--live");
const originalFetch = global.fetch;
const realNow = Date.now.bind(Date);
let timeOffset = 0;
class TestDate extends Date {
  constructor(...args) {
    super(...(args.length ? args : [realNow() + timeOffset]));
  }
  static now() {
    return realNow() + timeOffset;
  }
}
const cache = new Map();
const cloudMeetings = new Map();
const calls = [];
const conversationIds = [];
const userIds = [];
const clients = [];
const pushAttempts = [];
let failProvider = false;
let failRevoke = false;
let expireGuestProvision = false;
let participantCreates = 0;
let createMeetingCount = 0;
let timerCounter = 0;
const timers = new Map();
const app = express();
const http = createServer(app);
const io = new Server(http);
let backendRoute;
let coordinator;

function fakeTimer(fn, delay) {
  const timer = { id: ++timerCounter, fn, delay, unref() {} };
  timers.set(timer.id, timer);
  return timer;
}
function clearFakeTimer(timer) {
  if (timer) timers.delete(timer.id);
}

async function providerFetch(url, options) {
  if (live) return originalFetch(url, options);
  const u = new URL(url);
  const suffix = u.pathname.split("/realtime/kit/")[1].split("/").slice(1);
  const method = options?.method ?? "GET";
  const body = options?.body ? JSON.parse(options.body) : null;
  if (failProvider || (failRevoke && method === "DELETE"))
    return Response.json(
      { success: false, errors: [{ message: "secret provider details" }] },
      { status: 500 },
    );
  if (suffix.length === 1 && method === "POST") {
    createMeetingCount++;
    assert.equal(body.record_on_start, false);
    const id = crypto.randomUUID();
    cloudMeetings.set(id, new Map());
    return Response.json({ success: true, data: { id } });
  }
  const meeting = cloudMeetings.get(suffix[1]);
  assert.ok(meeting, "Provider meeting exists");
  if (suffix[2] === "active-session") {
    assert.ok(
      body.custom_participant_ids.every((id) => id.startsWith("envelo:")),
    );
    return Response.json({ success: true, data: {} });
  }
  if (method === "GET") {
    const page = Number(u.searchParams.get("page_no"));
    return Response.json({
      success: true,
      data: [...meeting.values()].slice((page - 1) * 100, page * 100),
    });
  }
  if (method === "DELETE") {
    meeting.delete(suffix[3]);
    return Response.json({ success: true, data: {} });
  }
  participantCreates++;
  const participant = {
    id: crypto.randomUUID(),
    custom_participant_id: body.custom_participant_id,
  };
  meeting.set(participant.id, participant);
  if (expireGuestProvision) {
    expireGuestProvision = false;
    timeOffset += 46_000;
  }
  return Response.json({
    success: true,
    data: {
      ...participant,
      token: jwt.sign(
        { meetingId: suffix[1], participantId: participant.id },
        "test-provider-only",
        { expiresIn: "100d" },
      ),
    },
  });
}

async function routedFetch(url, options) {
  if (String(url).startsWith("https://api.cloudflare.com/"))
    return providerFetch(url, options);
  if (new URL(url).pathname === "/api/internal/calls") {
    return backendRoute.POST(new NextRequest(url, options));
  }
  return originalFetch(url, options);
}

function load(file) {
  const absolute = path.resolve(file);
  if (cache.has(absolute)) return cache.get(absolute).exports;
  if (absolute === path.join(backendRoot, "lib/prisma.ts")) return { prisma };
  if (absolute === path.join(socketRoot, "lib/env.ts"))
    return { env: { jwtAccessSecret: process.env.JWT_ACCESS_SECRET } };
  if (absolute === path.join(socketRoot, "lib/pushNotifications.ts"))
    return {
      sendCallPush: async (...args) => {
        pushAttempts.push(args);
      },
    };
  const module = { exports: {} };
  cache.set(absolute, module);
  const source = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const requireExternal = createRequire(absolute);
  const localRequire = (specifier) => {
    if (specifier.startsWith("@/"))
      return load(path.join(backendRoot, `${specifier.slice(2)}.ts`));
    if (specifier.startsWith("."))
      return load(path.resolve(path.dirname(absolute), `${specifier}.ts`));
    return requireExternal(specifier);
  };
  const sandbox = {
    module,
    exports: module.exports,
    require: localRequire,
    console,
    process,
    fetch: routedFetch,
    Response,
    Headers,
    AbortSignal,
    Buffer,
    Date: live ? Date : TestDate,
    setTimeout: live ? setTimeout : fakeTimer,
    clearTimeout: live ? clearTimeout : clearFakeTimer,
  };
  vm.runInNewContext(source, sandbox, { filename: absolute });
  return module.exports;
}

function token(user) {
  return jwt.sign({ sub: user.id }, process.env.JWT_ACCESS_SECRET, {
    expiresIn: "10m",
  });
}
function connect(user) {
  return new Promise((resolve, reject) => {
    const client = connectClient(`http://127.0.0.1:${http.address().port}`, {
      auth: { token: token(user) },
      reconnection: false,
    });
    clients.push(client);
    client.once("connect", () => resolve(client));
    client.once("connect_error", reject);
  });
}
function event(client, name, payload) {
  return new Promise((resolve, reject) => {
    client
      .timeout(60_000)
      .emit(name, payload, (error, result) =>
        error ? reject(error) : resolve(result),
      );
  });
}
function once(client, name) {
  return new Promise((resolve) => client.once(name, resolve));
}
async function user(name) {
  const record = await prisma.user.create({
    data: {
      email: `call-test-${crypto.randomUUID()}@example.invalid`,
      displayName: name,
      passwordHash: "test-only",
      emailVerifiedAt: new Date(),
    },
  });
  userIds.push(record.id);
  return record;
}
async function conversation(a, b, type = "DIRECT") {
  const record = await prisma.conversation.create({
    data: {
      type,
      participants: { create: [{ userId: a.id }, { userId: b.id }] },
    },
  });
  conversationIds.push(record.id);
  return record.id;
}
async function expectOk(client, name, payload) {
  const result = await event(client, name, payload);
  assert.equal(result.ok, true, result.error);
  return result.data;
}
async function end(client, callId) {
  return expectOk(client, "call:end", { callId });
}

async function main() {
  if (!live) {
    // Test credentials stay local to this process and are never written to .env.
    process.env.CLOUDFLARE_ACCOUNT_ID = "test-account";
    process.env.CLOUDFLARE_REALTIME_APP_ID = "test-app";
    process.env.CLOUDFLARE_API_TOKEN = "test-provider-token";
    process.env.CLOUDFLARE_REALTIME_PRESET_NAME = "test-participant";
  }
  process.env.CALL_BACKEND_URL = "http://test-backend";
  backendRoute = load(
    path.join(backendRoot, "app/api/internal/calls/route.ts"),
  );
  const { CallCoordinator } = load(path.join(socketRoot, "lib/calls.ts"));
  const handlers = load(path.join(socketRoot, "events/calls.ts"));
  const { verifySocketToken } = load(
    path.join(socketRoot, "auth/verifySocketToken.ts"),
  );
  coordinator = new CallCoordinator(io);
  // Avoid recovering actual users' calls: test only on an idle configured DB.
  assert.equal(
    await prisma.callLog.count({
      where: { status: { in: ["RINGING", "ONGOING"] } },
    }),
    0,
    "Run verifier only when no real calls are active",
  );
  await coordinator.initialize();
  handlers.registerCallStartRoute(app, coordinator);
  io.use(verifySocketToken);
  io.on("connection", (socket) => {
    socket.join(`user:${socket.data.userId}`);
    handlers.registerCallHandlers(coordinator, socket);
  });
  await new Promise((resolve) => http.listen(0, "127.0.0.1", resolve));
  process.env.CALL_SOCKET_URL = `http://127.0.0.1:${http.address().port}`;
  const [a, b, stranger] = await Promise.all([
    user("Call A"),
    user("Call B"),
    user("Call Stranger"),
  ]);
  const [sa, sb, sc] = await Promise.all([
    connect(a),
    connect(b),
    connect(stranger),
  ]);
  const id = await conversation(a, b);
  const other = await conversation(a, stranger);
  const group = await conversation(a, b, "GROUP");
  assert.equal(
    (await event(sc, "call:invite", { conversationId: id })).ok,
    false,
  );
  assert.equal(
    (await event(sa, "call:invite", { conversationId: group })).ok,
    false,
  );
  assert.equal(
    (await event(sa, "call:invite", { conversationId: "" })).ok,
    false,
  );
  const incoming = once(sb, "call:incoming");
  const first = await expectOk(sa, "call:invite", { conversationId: id });
  calls.push(first.call.id);
  assert.equal(first.call.status, "RINGING");
  assert.equal((await incoming).caller.id, a.id);
  assert.equal(
    (await event(sa, "call:invite", { conversationId: other })).error,
    "You're already on a call",
  );
  assert.equal(
    (await event(sc, "call:invite", { conversationId: other })).ok,
    false,
  );
  assert.equal(
    (await event(sc, "call:accept", { callId: first.call.id })).ok,
    false,
  );
  assert.equal(
    (await event(sa, "call:accept", { callId: first.call.id })).ok,
    false,
  );
  assert.equal(
    (await event(sa, "call:decline", { callId: first.call.id })).ok,
    false,
  );
  const acceptedEvent = once(sa, "call:accepted");
  const accepted = await expectOk(sb, "call:accept", { callId: first.call.id });
  assert.equal(accepted.call.status, "ONGOING");
  assert.equal((await acceptedEvent).call.id, first.call.id);
  assert.notEqual(first.authToken, accepted.authToken);
  assert.notEqual(first.participantId, accepted.participantId);
  if (live) assert.ok(jwt.decode(first.authToken), "Cloudflare returned a JWT");
  const createdBeforeRetry = participantCreates;
  assert.equal(
    (await event(sb, "call:accept", { callId: first.call.id })).ok,
    false,
  );
  if (!live) assert.equal(participantCreates, createdBeforeRetry);
  const synced = await expectOk(sa, "call:sync", {});
  assert.equal(synced.authToken, first.authToken);
  assert.equal((await expectOk(sc, "call:sync", {})).call, null);
  await expectOk(sa, "call:video-enabled", { callId: first.call.id });
  const endedEvent = once(sb, "call:ended");
  const ended = await end(sa, first.call.id);
  assert.equal(ended.call.status, "COMPLETED");
  assert.equal(ended.call.hadVideo, true);
  assert.equal((await endedEvent).call.id, first.call.id);
  if (!live) assert.equal(cloudMeetings.get(first.meetingId).size, 0);
  const second = await expectOk(sa, "call:invite", { conversationId: id });
  calls.push(second.call.id);
  assert.equal(second.meetingId, first.meetingId);
  assert.notEqual(second.authToken, first.authToken);
  const declineEvent = once(sa, "call:declined");
  const declined = await expectOk(sb, "call:decline", {
    callId: second.call.id,
  });
  assert.equal(declined.call.status, "DECLINED");
  await declineEvent;
  const missed = once(sa, "call:missed");
  const third = await expectOk(sa, "call:invite", { conversationId: id });
  calls.push(third.call.id);
  if (live) {
    console.log("Waiting for the real 45-second ring timeout...");
  } else {
    const timer = [...timers.values()].find((t) => t.delay > 30_000);
    assert.ok(timer);
    timeOffset += 45_001;
    timer.fn();
  }
  const missedCall = await missed;
  assert.equal(missedCall.call.status, "MISSED");
  if (!live) timeOffset = 0;
  const historyRoute = load(
    path.join(
      backendRoot,
      "app/api/conversations/[conversationId]/calls/route.ts",
    ),
  );
  const request = (viewer, query = "") =>
    new NextRequest(`http://test/api/conversations/${id}/calls${query}`, {
      headers: { Authorization: `Bearer ${token(viewer)}` },
    });
  const context = { params: Promise.resolve({ conversationId: id }) };
  const history = await (await historyRoute.GET(request(a), context)).json();
  assert.equal(history.calls.length, 3);
  assert.ok(
    history.calls.every(
      (c) => c.type === "call" && !c.authToken && !c.meetingId,
    ),
  );
  assert.equal(
    (await historyRoute.GET(request(stranger), context)).status,
    404,
  );
  assert.equal(
    (await historyRoute.GET(request(a, "?cursor=bad"), context)).status,
    400,
  );
  const startRoute = load(
    path.join(backendRoot, "app/api/calls/[conversationId]/start/route.ts"),
  );
  const rest = await startRoute.POST(
    new NextRequest(`http://test/api/calls/${id}/start`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token(a)}` },
    }),
    context,
  );
  assert.equal(rest.status, 201);
  const fourth = await rest.json();
  calls.push(fourth.call.id);
  assert.equal(
    (await event(sa, "call:invite", { conversationId: other })).ok,
    false,
  );
  await end(sa, fourth.call.id);
  // Feature 32: C is A's friend, D is B's friend; neither needs to be a
  // member of A/B's private conversation or friends with everybody else.
  const d = await user("Call D");
  const sd = await connect(d);
  await prisma.friendship.createMany({
    data: [
      { requesterId: a.id, addresseeId: stranger.id, status: "ACCEPTED" },
      { requesterId: b.id, addresseeId: d.id, status: "ACCEPTED" },
    ],
  });
  const multi = await expectOk(sa, "call:invite", { conversationId: id });
  calls.push(multi.call.id);
  await expectOk(sb, "call:accept", { callId: multi.call.id });
  assert.equal(
    (await expectOk(sa, "call:sync", {})).call.status,
    "ONGOING",
    "Sync must not overwrite current state with old caller credentials",
  );
  assert.equal(
    (await event(sa, "call:invite", { callId: multi.call.id, userId: d.id }))
      .ok,
    false,
    "Inviter must be the target's friend",
  );
  assert.equal(
    (await event(sc, "call:invite", { callId: multi.call.id, userId: d.id }))
      .ok,
    false,
    "Outsiders cannot add people",
  );
  const cRing = once(sc, "call:incoming");
  const cInvite = await expectOk(sa, "call:invite", {
    callId: multi.call.id,
    userId: stranger.id,
  });
  assert.equal(cInvite.call.id, multi.call.id);
  assert.equal((await cRing).guest, true);
  const cPending = await expectOk(sc, "call:sync", {});
  assert.equal(cPending.caller.id, a.id);
  assert.equal(
    cPending.authToken,
    undefined,
    "Ringing guests have no credentials",
  );
  assert.equal(
    (await event(sc, "call:video-enabled", { callId: multi.call.id })).ok,
    false,
  );
  await expectOk(sc, "call:decline", { callId: multi.call.id });
  assert.equal(
    (await expectOk(sa, "call:sync", {})).call.status,
    "ONGOING",
    "Guest decline cannot end the original call",
  );
  await expectOk(sa, "call:invite", {
    callId: multi.call.id,
    userId: stranger.id,
  });
  if (!live) {
    expireGuestProvision = true;
    assert.equal(
      (await event(sc, "call:accept", { callId: multi.call.id })).ok,
      false,
      "Slow provisioning cannot accept an expired guest invitation",
    );
    assert.equal((await expectOk(sc, "call:sync", {})).call, null);
    assert.equal((await expectOk(sa, "call:sync", {})).call.status, "ONGOING");
    assert.equal(
      cloudMeetings.get(multi.meetingId).size,
      2,
      "Late guest credential is revoked without touching A/B",
    );
    timeOffset = 0;
    await expectOk(sa, "call:invite", {
      callId: multi.call.id,
      userId: stranger.id,
    });
  }
  const cJoined = await expectOk(sc, "call:accept", { callId: multi.call.id });
  assert.equal(cJoined.meetingId, multi.meetingId);
  assert.equal(cJoined.groupCall, true);
  assert.equal(cJoined.participants.length, 3);
  assert.ok(
    !cJoined.participants.some((p) => p.authToken),
    "Roster never exposes tokens",
  );
  assert.equal(
    (await historyRoute.GET(request(stranger), context)).status,
    404,
    "Invited guest cannot read the private chat's history",
  );
  const dRing = once(sd, "call:incoming");
  await expectOk(sb, "call:invite", { callId: multi.call.id, userId: d.id });
  assert.equal(
    (await dRing).caller.id,
    b.id,
    "Non-initiator can invite their friend",
  );
  if (!live) {
    const dMissed = once(sd, "call:missed");
    timeOffset += 45_001;
    [...timers.values()]
      .filter((t) => t.delay === 45_000)
      .forEach((t) => t.fn());
    assert.equal((await dMissed).invitationEnded, true);
    assert.equal(
      (await expectOk(sc, "call:sync", {})).call.status,
      "ONGOING",
      "Guest timeout does not end anyone else's call",
    );
    timeOffset = 0;
    await expectOk(sb, "call:invite", { callId: multi.call.id, userId: d.id });
  }
  const dJoined = await expectOk(sd, "call:accept", { callId: multi.call.id });
  assert.equal(dJoined.participants.length, 4);
  await expectOk(sc, "call:video-enabled", { callId: multi.call.id });
  if (!live) {
    failRevoke = true;
    assert.equal(
      (await event(sa, "call:end", { callId: multi.call.id })).ok,
      false,
    );
    assert.equal(
      (await expectOk(sd, "call:sync", {})).participants.length,
      4,
      "Failed revocation keeps membership reserved for retry",
    );
    failRevoke = false;
  }
  const aLeft = await end(sa, multi.call.id);
  assert.equal(aLeft.call.status, "ONGOING");
  assert.equal((await expectOk(sa, "call:sync", {})).call, null);
  assert.equal((await expectOk(sd, "call:sync", {})).participants.length, 3);
  if (!live)
    assert.equal(
      cloudMeetings.get(multi.meetingId).size,
      3,
      "Only the leaving participant's credentials are revoked",
    );
  // A current guest can invite their own friend, even after the initiator left.
  await expectOk(sc, "call:invite", { callId: multi.call.id, userId: a.id });
  const aReinvited = await expectOk(sa, "call:sync", {});
  assert.equal(
    aReinvited.guest,
    true,
    "Re-invited original caller has a fresh incoming invitation",
  );
  assert.equal(aReinvited.caller.id, stranger.id);
  await expectOk(sa, "call:decline", { callId: multi.call.id });
  await end(sb, multi.call.id);
  await end(sd, multi.call.id);
  const alone = await expectOk(sc, "call:sync", {});
  assert.equal(alone.participants.length, 1);
  assert.equal(alone.call.status, "ONGOING");
  if (!live) timeOffset += 12_000;
  const groupEnded = await end(sc, multi.call.id);
  assert.equal(groupEnded.call.status, "COMPLETED");
  assert.equal(groupEnded.call.hadVideo, true);
  assert.ok(groupEnded.call.durationSeconds >= (live ? 0 : 12));
  if (!live) {
    timeOffset = 0;
    assert.equal(cloudMeetings.get(multi.meetingId).size, 0);
  }
  assert.equal(
    await prisma.callLog.count({ where: { id: multi.call.id } }),
    1,
    "One row for the entire group call",
  );
  const { bridgeHeaders } = load(path.join(backendRoot, "lib/callBridge.ts"));
  const raw = JSON.stringify({
    action: "members",
    userId: a.id,
    conversationId: id,
  });
  const headers = bridgeHeaders("/api/internal/calls", raw);
  const makeBridge = (body = raw, h = headers) =>
    new NextRequest("http://test/api/internal/calls", {
      method: "POST",
      headers: h,
      body,
    });
  assert.equal((await backendRoute.POST(makeBridge())).status, 200);
  assert.equal(
    (await backendRoute.POST(makeBridge())).status,
    401,
    "Replay rejected",
  );
  assert.equal(
    (await backendRoute.POST(makeBridge(raw.replace(a.id, stranger.id))))
      .status,
    401,
  );
  assert.equal((await backendRoute.POST(makeBridge(raw, {}))).status, 401);
  if (!live) {
    failProvider = true;
    const failed = await event(sa, "call:invite", { conversationId: other });
    assert.equal(failed.ok, false);
    assert.ok(!failed.error.includes("secret"));
    failProvider = false;
    const attempts = await Promise.all([
      event(sa, "call:invite", { conversationId: id }),
      event(sb, "call:invite", { conversationId: id }),
    ]);
    assert.equal(
      attempts.filter((r) => r.ok).length,
      1,
      "Concurrent starts serialize",
    );
    const winner = attempts.find((r) => r.ok).data;
    calls.push(winner.call.id);
    const starter = winner.call.initiatorId === a.id ? sa : sb;
    failRevoke = true;
    assert.equal(
      (await event(starter, "call:end", { callId: winner.call.id })).ok,
      false,
    );
    assert.equal(
      (await event(sa, "call:invite", { conversationId: id })).ok,
      false,
      "No reuse before revocation",
    );
    failRevoke = false;
    await end(starter, winner.call.id);
    const orphan = await expectOk(sa, "call:invite", { conversationId: id });
    calls.push(orphan.call.id);
    const freshCoordinator = new CallCoordinator(io);
    await freshCoordinator.initialize();
    assert.equal(
      (await prisma.callLog.findUnique({ where: { id: orphan.call.id } }))
        .status,
      "MISSED",
    );
    assert.equal(cloudMeetings.get(orphan.meetingId).size, 0);
    await end(sa, orphan.call.id);
    // The caller disconnects but another device remains: do not end its call.
    const extra = await connect(a);
    const alive = await expectOk(sa, "call:invite", { conversationId: id });
    calls.push(alive.call.id);
    sa.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 50));
    [...timers.values()]
      .filter((t) => t.delay === 15_000)
      .forEach((t) => t.fn());
    await expectOk(extra, "call:sync", {});
    assert.equal(
      (await prisma.callLog.findUnique({ where: { id: alive.call.id } }))
        .status,
      "RINGING",
    );
    await end(extra, alive.call.id);
    // Offline recipient gets exactly one best-effort push attempt.
    sb.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const offline = await expectOk(extra, "call:invite", {
      conversationId: id,
    });
    calls.push(offline.call.id);
    assert.equal(pushAttempts.length, 1);
    await end(extra, offline.call.id);
    assert.equal(createMeetingCount, 1, "One meeting per conversation");
  }
  await prisma.conversationParticipant.update({
    where: { conversationId_userId: { conversationId: id, userId: a.id } },
    data: { clearedAt: new Date(Date.now() + 1000) },
  });
  assert.equal(
    (await (await historyRoute.GET(request(a), context)).json()).calls.length,
    0,
  );
  console.log(
    `Calling verification passed (${live ? "REAL Cloudflare" : "mock Cloudflare"}, real Neon/REST handlers/Socket.IO).`,
  );
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Remove only disposable verifier records and owned provider participants.
    const callLib = cache.get(path.join(backendRoot, "lib/calls.ts"))?.exports;
    let cleanupFailed = false;
    for (const id of calls) {
      try {
        await callLib.finishCall(id, undefined, "end");
      } catch {
        cleanupFailed = true;
      }
    }
    clients.forEach((client) => client.disconnect());
    timers.clear();
    await new Promise((resolve) => io.close(resolve));
    // Keep recovery references if credential revocation failed. Deleting the
    // conversation first would orphan an unexpired provider token forever.
    if (cleanupFailed) {
      console.error(
        "Provider cleanup requires retry; disposable recovery records were preserved.",
      );
      process.exitCode = 1;
    } else {
      if (conversationIds.length)
        await prisma.conversation.deleteMany({
          where: { id: { in: conversationIds } },
        });
      if (userIds.length)
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await prisma.$disconnect();
  });
