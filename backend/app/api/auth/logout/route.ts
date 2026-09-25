import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashRefreshToken } from "@/lib/auth/tokens";
import { clearWebRefreshCookie, readRefreshToken } from "@/lib/auth/webSession";

const logoutSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required").optional(),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json().catch(() => ({}));
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = logoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const rawToken = readRefreshToken(request, parsed.data.refreshToken);
  if (!rawToken) {
    const response = NextResponse.json({ success: true }, { status: 200 });
    clearWebRefreshCookie(request, response);
    return response;
  }
  const tokenHash = hashRefreshToken(rawToken);

  // Mark matching token as revoked if found and not already revoked.
  // Using updateMany ensures idempotency and does not throw if no match is found.
  await prisma.refreshToken.updateMany({
    where: {
      tokenHash,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });

  const response = NextResponse.json({ success: true }, { status: 200 });
  clearWebRefreshCookie(request, response);
  return response;
}
