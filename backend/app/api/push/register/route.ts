import { Expo } from "expo-server-sdk";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAuth } from "@/lib/auth/requireAuth";
import { prisma } from "@/lib/prisma";

const tokenSchema = z.object({ token: z.string().max(255) });

function authenticatedUserId(request: NextRequest): string | null {
  try {
    return requireAuth(request).userId;
  } catch {
    return null;
  }
}

async function readToken(request: NextRequest): Promise<string | null> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return null;
  }
  const parsed = tokenSchema.safeParse(body);
  return parsed.success && Expo.isExpoPushToken(parsed.data.token)
    ? parsed.data.token
    : null;
}

export async function POST(request: NextRequest) {
  const userId = authenticatedUserId(request);
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const token = await readToken(request);
  if (!token)
    return NextResponse.json({ error: "Invalid push token" }, { status: 400 });

  await prisma.pushToken.upsert({
    where: { token },
    create: { token, userId },
    update: { userId },
  });
  return NextResponse.json({ registered: true });
}

export async function DELETE(request: NextRequest) {
  const userId = authenticatedUserId(request);
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const token = await readToken(request);
  if (!token)
    return NextResponse.json({ error: "Invalid push token" }, { status: 400 });

  await prisma.pushToken.deleteMany({ where: { token, userId } });
  return NextResponse.json({ registered: false });
}
