// Deterministic regression checks: no environment secrets, network or DB writes.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const root = path.join(__dirname, "../..");
function load(file, dependencies = {}, globals = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(
    fs.readFileSync(path.join(root, file), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    },
  ).outputText;
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    require: (name) => dependencies[name] ?? require(name),
    console,
    Date,
    process: { env: { JWT_ACCESS_SECRET: "test-only" } },
    Headers,
    Buffer,
    AbortSignal,
    ...globals,
  });
  return module.exports;
}
function harness() {
  let row = {
    id: "call",
    conversationId: "chat",
    initiatorId: "caller",
    status: "RINGING",
    startedAt: new Date(),
    connectedAt: null,
    endedAt: null,
    hadVideo: false,
    conversation: { realtimeMeetingId: "meeting" },
  };
  let provision = async () => ({ id: "participant", token: "test-only" });
  let beforeUpdate = () => {};
  const revocations = [];
  const prisma = {
    callLog: {
      findUnique: async () => ({ ...row }),
      findUniqueOrThrow: async () => ({ ...row }),
      updateMany: async ({ where, data }) => {
        beforeUpdate();
        if (row.id !== where.id || row.status !== where.status)
          return { count: 0 };
        row = { ...row, ...data };
        return { count: 1 };
      },
    },
    conversation: {
      findFirst: async () => ({
        type: "DIRECT",
        realtimeMeetingId: "meeting",
        participants: ["caller", "callee"].map((id) => ({
          user: { id, displayName: id, avatarUrl: null },
        })),
      }),
    },
  };
  const calls = load("backend/lib/calls.ts", {
    "./prisma": { prisma },
    "./callBridge": {
      CallError: class extends Error {
        constructor(message, status) {
          super(message);
          this.status = status;
        }
      },
    },
    "./realtimeKit": {
      addCallParticipant: (...args) => provision(...args),
      revokeCallParticipants: async (...args) => {
        revocations.push(args);
      },
    },
  });
  return {
    calls,
    revocations,
    get row() {
      return row;
    },
    setRow(data) {
      row = { ...row, ...data };
    },
    provision(fn) {
      provision = fn;
    },
    beforeUpdate(fn) {
      beforeUpdate = fn;
    },
  };
}
async function transitions() {
  for (const action of ["decline", "end"]) {
    const h = harness();
    h.provision(async () => {
      await h.calls.finishCall("call", "callee", action);
      return { id: "participant", token: "test-only" };
    });
    await assert.rejects(
      h.calls.acceptCall("call", "callee"),
      (e) => e.status === 409,
    );
    assert.equal(h.row.status, action === "decline" ? "DECLINED" : "MISSED");
    assert.deepEqual(h.revocations.at(-1), ["meeting", "call", "callee"]);
    assert.equal(h.row.connectedAt, null);
  }
  for (const action of ["timeout", "decline", "end"]) {
    const h = harness();
    h.setRow({ startedAt: new Date(Date.now() - 46000) });
    h.beforeUpdate(() => {
      h.beforeUpdate(() => {});
      h.setRow({
        status: "ONGOING",
        connectedAt: new Date(Date.now() - 12000),
      });
    });
    if (action === "end") {
      const result = await h.calls.finishCall("call", "callee", action);
      assert.equal(result.status, "COMPLETED");
      assert.equal(result.durationSeconds, 12);
      const endedAt = h.row.endedAt;
      await h.calls.finishCall("call", "callee", action);
      assert.equal(h.row.endedAt, endedAt, "Repeated end preserves timestamp");
    } else {
      await assert.rejects(
        h.calls.finishCall("call", "callee", action),
        (e) => e.status === (action === "timeout" ? 409 : 403),
      );
      assert.equal(h.row.status, "ONGOING");
      assert.equal(
        h.revocations.length,
        0,
        "Losing timeout/decline must not revoke accepted call",
      );
    }
  }
  const h = harness();
  assert.equal(
    (await h.calls.acceptCall("call", "callee")).call.status,
    "ONGOING",
  );
}
async function responses() {
  const z = require("zod").z;
  for (const status of [502, 503, 200]) {
    const fetch = async () => ({
      ok: status === 200,
      status,
      json: async () => {
        throw new SyntaxError("private HTML body");
      },
    });
    const bridge = load("backend/lib/callBridge.ts", {}, { fetch });
    const backend = load(
      "socket-server/src/lib/callBackend.ts",
      { "./env": { env: { jwtAccessSecret: "test-only" } } },
      { fetch },
    );
    for (const operation of [
      () => bridge.startViaSocket("caller", "chat"),
      () => backend.callBackend({}, z.object({ ok: z.boolean() })),
    ]) {
      await assert.rejects(
        operation(),
        (e) =>
          e.status === (status === 200 ? 502 : status) &&
          !e.message.includes("private"),
      );
    }
  }
  const backend = load(
    "socket-server/src/lib/callBackend.ts",
    { "./env": { env: { jwtAccessSecret: "test-only" } } },
    {
      fetch: async () => ({ ok: true, json: async () => ({ ok: true }) }),
    },
  );
  assert.equal(
    (await backend.callBackend({}, z.object({ ok: z.boolean() }))).ok,
    true,
  );
}
async function presetFailures() {
  const source = fs.readFileSync(
    path.join(root, "backend/scripts/verify-call-config.cjs"),
    "utf8",
  );
  for (const detail of [false, true]) {
    let count = 0,
      parsedError = false;
    const errors = [];
    const context = {
      require: () => ({
        PrismaClient: class {
          $disconnect() {}
        },
      }),
      process: { env: { CLOUDFLARE_REALTIME_PRESET_NAME: "test" } },
      AbortSignal,
      console: { log() {}, error: (message) => errors.push(message) },
      fetch: async () => {
        if (detail && count++ === 0)
          return {
            ok: true,
            json: async () => ({
              success: true,
              data: [{ name: "test", id: "preset" }],
            }),
          };
        return {
          ok: false,
          status: 502,
          json: async () => {
            parsedError = true;
            throw new Error("private");
          },
        };
      },
    };
    vm.runInNewContext(source, context);
    for (let i = 0; i < 12; i++) await Promise.resolve();
    assert.equal(parsedError, false);
    assert.equal(
      errors[0],
      detail
        ? "Preset detail lookup failed (502)"
        : "Preset lookup failed (502)",
    );
  }
}
async function guestTimer() {
  const timers = [];
  const { CallCoordinator } = load(
    "socket-server/src/lib/calls.ts",
    {
      "./callBackend": {},
      "./pushNotifications": {},
      "./rooms": {},
    },
    {
      setTimeout: (callback) => {
        timers.push(callback);
        return 1;
      },
    },
  );
  const coordinator = new CallCoordinator({});
  coordinator.calls.set("call", {
    invitations: new Map([["guest", { expiresAt: Date.now() + 60000 }]]),
  });
  await coordinator.expireGuest("call", "guest");
  let caught = false;
  coordinator.expireGuest = () => ({
    catch(handler) {
      caught = true;
      handler(new Error("backend unavailable"));
    },
  });
  timers[0]();
  assert.equal(caught, true, "Rescheduled guest expiry must contain rejection");
}
(async () => {
  await transitions();
  await responses();
  await presetFailures();
  await guestTimer();
  console.log(
    "Calling hardening passed: atomic races, scoped revocation, safe non-JSON/status failures, preset errors and guest timer rejection.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
