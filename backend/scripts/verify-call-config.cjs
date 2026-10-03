// Read-only check. Prints only preset names/numeric limits and record counts,
// never environment credentials, participant tokens, or personal data.
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();
async function main() {
  const e = process.env;
  const base = `https://api.cloudflare.com/client/v4/accounts/${e.CLOUDFLARE_ACCOUNT_ID}/realtime/kit/${e.CLOUDFLARE_REALTIME_APP_ID}`;
  const response = await fetch(`${base}/presets`, {
    headers: { Authorization: `Bearer ${e.CLOUDFLARE_API_TOKEN}` },
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error("Preset lookup failed");
  const rows = Array.isArray(result.data) ? result.data : result.data?.presets;
  const preset = rows?.find(
    (p) => p.name === e.CLOUDFLARE_REALTIME_PRESET_NAME,
  );
  if (!preset) throw new Error("Configured preset not found");
  const detailResponse = await fetch(
    `${base}/presets/${encodeURIComponent(preset.id)}`,
    {
      headers: { Authorization: `Bearer ${e.CLOUDFLARE_API_TOKEN}` },
      signal: AbortSignal.timeout(15000),
    },
  );
  const detail = await detailResponse.json();
  if (!detailResponse.ok || !detail.success)
    throw new Error("Preset detail lookup failed");
  const numericLimits = {};
  function visit(value, key) {
    if (typeof value === "number" && /max|limit|grid|page/i.test(key))
      numericLimits[key] = value;
    else if (value && typeof value === "object")
      for (const [name, nested] of Object.entries(value))
        visit(nested, `${key}.${name}`);
  }
  visit(detail.data, "preset");
  console.log(JSON.stringify({ configuredPreset: preset.name, numericLimits }));
  console.log(
    JSON.stringify({
      remainingTestUsers: await db.user.count({
        where: { email: { startsWith: "call-test-" } },
      }),
      activeCalls: await db.callLog.count({
        where: { status: { in: ["RINGING", "ONGOING"] } },
      }),
    }),
  );
}
main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
