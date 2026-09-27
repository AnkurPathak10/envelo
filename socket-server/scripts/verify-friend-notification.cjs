const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
const { io } = require("socket.io-client");

const baseUrl = process.env.TEST_SOCKET_URL || "http://127.0.0.1:4000";
const userId = crypto.randomUUID();
const requestId = crypto.randomUUID();
const status = "PENDING";
const token = jwt.sign({ sub: userId }, process.env.JWT_ACCESS_SECRET, {
  expiresIn: "2m",
});
const socket = io(baseUrl, {
  auth: { token },
  autoConnect: false,
  reconnection: false,
});

async function main() {
  const eventPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Timed out waiting for friend:request")),
      10_000,
    );
    socket.once("friend:request", (event) => {
      clearTimeout(timer);
      resolve(event);
    });
    socket.once("connect_error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
  socket.connect();
  if (!socket.connected) {
    await new Promise((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("connect_error", reject);
    });
  }
  const timestamp = Date.now().toString();
  const signature = crypto
    .createHmac("sha256", process.env.JWT_ACCESS_SECRET)
    .update(`${timestamp}.${requestId}.${status}.${userId}`)
    .digest("hex");
  const response = await fetch(`${baseUrl}/internal/friend-event`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Envelo-Timestamp": timestamp,
      "X-Envelo-Signature": signature,
    },
    body: JSON.stringify({ requestId, status, userIds: [userId] }),
  });
  assert.equal(response.status, 202);
  assert.deepEqual(await eventPromise, { requestId, status });
  const rejected = await fetch(`${baseUrl}/internal/friend-event`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Envelo-Timestamp": timestamp,
      "X-Envelo-Signature": "0".repeat(64),
    },
    body: JSON.stringify({ requestId, status, userIds: [userId] }),
  });
  assert.equal(rejected.status, 401);
  console.log(
    "Friend socket notification delivered to the authenticated user room.",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => socket.disconnect());
