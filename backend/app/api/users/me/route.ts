import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAuth } from "@/lib/auth/requireAuth";
import { isImageKitUrl } from "@/lib/media";
import { prisma } from "@/lib/prisma";

const updateProfileSchema = z.object({
  avatarUrl: z
    .string({ required_error: "avatarUrl is required" })
    .trim()
    .min(1, "avatarUrl cannot be empty")
    .url("avatarUrl must be a valid URL")
    .refine(isImageKitUrl, "avatarUrl must use the configured media service"),
});

export async function PATCH(request: NextRequest) {
  let userId: string;
  try {
    ({ userId } = requireAuth(request));
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { avatarUrl: parsed.data.avatarUrl },
    select: {
      id: true,
      displayName: true,
      email: true,
      avatarUrl: true,
    },
  });

  return NextResponse.json(user);
}
