import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { SignupOtpError, verifySignupOtp } from "@/lib/auth/signupOtp";
import { createRefreshTokenInDb, signAccessToken } from "@/lib/auth/tokens";
import { exposeRefreshToken, setWebRefreshCookie } from "@/lib/auth/webSession";

const verifySchema = z.object({
  challengeId: z.string().trim().min(1).max(128),
  code: z.string().regex(/^\d{6}$/, "Enter the six-digit verification code"),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = verifySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  try {
    const user = await verifySignupOtp(
      parsed.data.challengeId,
      parsed.data.code,
    );
    const accessToken = signAccessToken(user.id);
    const refreshToken = await createRefreshTokenInDb(user.id);
    const response = NextResponse.json({
      accessToken,
      refreshToken: exposeRefreshToken(request, refreshToken),
      user,
    });
    setWebRefreshCookie(request, response, refreshToken);
    return response;
  } catch (error: unknown) {
    if (error instanceof SignupOtpError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: "Unable to verify this code right now. Please try again." },
      { status: 500 },
    );
  }
}
