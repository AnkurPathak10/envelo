import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  hashRefreshToken,
  signAccessToken,
  createRefreshTokenInDb,
} from "@/lib/auth/tokens";
import {
  exposeRefreshToken,
  readRefreshToken,
  setWebRefreshCookie,
} from "@/lib/auth/webSession";

const refreshSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required").optional(),
});

const INVALID_REFRESH_TOKEN_ERROR = "Invalid or expired refresh token";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json().catch(() => ({}));
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = refreshSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const rawToken = readRefreshToken(request, parsed.data.refreshToken);
  if (!rawToken) {
    return NextResponse.json(
      { error: INVALID_REFRESH_TOKEN_ERROR },
      { status: 401 },
    );
  }
  const tokenHash = hashRefreshToken(rawToken);

  const existingToken = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          displayName: true,
          avatarUrl: true,
        },
      },
    },
  });

  if (
    !existingToken ||
    existingToken.revokedAt !== null ||
    existingToken.expiresAt <= new Date()
  ) {
    return NextResponse.json(
      { error: INVALID_REFRESH_TOKEN_ERROR },
      { status: 401 },
    );
  }

  // Compare-and-set rotation: only one concurrent request may consume this
  // token. A loser returns 401 without touching the browser's cookie because
  // the winning response may already have installed the replacement token.
  const rotation = await prisma.refreshToken.updateMany({
    where: {
      id: existingToken.id,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { revokedAt: new Date() },
  });
  if (rotation.count !== 1) {
    return NextResponse.json(
      { error: INVALID_REFRESH_TOKEN_ERROR },
      { status: 401 },
    );
  }

  const newAccessToken = signAccessToken(existingToken.userId);
  const newRefreshToken = await createRefreshTokenInDb(existingToken.userId);

  const response = NextResponse.json({
    accessToken: newAccessToken,
    refreshToken: exposeRefreshToken(request, newRefreshToken),
    user: existingToken.user,
  });
  setWebRefreshCookie(request, response, newRefreshToken);
  return response;
}
