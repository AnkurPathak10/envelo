import crypto from "node:crypto";
import { Expo } from "expo-server-sdk";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAuth } from "@/lib/auth/requireAuth";
import { prisma } from "@/lib/prisma";

const tokenSchema = z.object({
  token: z.string().max(255),
  revocationGrant: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
});

function grantFor(token: string, userId: string): string {
  return crypto
    .createHmac("sha256", process.env.JWT_ACCESS_SECRET!)
    .update(`push-token-revoke:v1:${userId}:${token}`)
    .digest("hex");
}

function authenticatedUserId(request: NextRequest): string | null {
  try {
    return requireAuth(request).userId;
  } catch {
    return null;
  }
}

async function readToken(
  request: NextRequest,
): Promise<z.infer<typeof tokenSchema> | null> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return null;
  }
  const parsed = tokenSchema.safeParse(body);
  return parsed.success && Expo.isExpoPushToken(parsed.data.token)
    ? parsed.data
    : null;
}

export async function POST(request: NextRequest) {
  const userId = authenticatedUserId(request);
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = await readToken(request);
  if (!parsed)
    return NextResponse.json({ error: "Invalid push token" }, { status: 400 });

  await prisma.pushToken.upsert({
    where: { token: parsed.token },
    create: { token: parsed.token, userId },
    update: { userId },
  });
  return NextResponse.json({
    registered: true,
    revocationGrant: grantFor(parsed.token, userId),
  });
}

export async function DELETE(request: NextRequest) {
  const parsed = await readToken(request);
  if (!parsed)
    return NextResponse.json({ error: "Invalid push token" }, { status: 400 });

  let userId = authenticatedUserId(request);
  if (parsed.revocationGrant) {
    const registration = await prisma.pushToken.findUnique({
      where: { token: parsed.token },
      select: { userId: true },
    });
    if (!registration)
      return NextResponse.json({ registered: false });
    const expected = Buffer.from(grantFor(parsed.token, registration.userId), "hex");
    const received = Buffer.from(parsed.revocationGrant, "hex");
    if (!crypto.timingSafeEqual(expected, received)) {
      return NextResponse.json({ error: "Invalid revocation grant" }, { status: 403 });
    }
    userId = registration.userId;
  }
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.pushToken.deleteMany({ where: { token: parsed.token, userId } });
  return NextResponse.json({ registered: false });
}
