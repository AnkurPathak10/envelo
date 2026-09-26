import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  resendSignupOtp,
  signupClientAddress,
  SignupOtpError,
} from "@/lib/auth/signupOtp";

const resendSchema = z.object({
  challengeId: z.string().trim().min(1).max(128),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = resendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid signup challenge" },
      { status: 400 },
    );
  }

  try {
    const challenge = await resendSignupOtp(
      parsed.data.challengeId,
      signupClientAddress(request.headers),
    );
    return NextResponse.json(challenge);
  } catch (error: unknown) {
    if (error instanceof SignupOtpError) {
      return NextResponse.json(
        {
          error: error.message,
          ...(error.retryAfterSeconds
            ? { retryAfterSeconds: error.retryAfterSeconds }
            : {}),
        },
        {
          status: error.status,
          headers: error.retryAfterSeconds
            ? { "Retry-After": String(error.retryAfterSeconds) }
            : undefined,
        },
      );
    }
    return NextResponse.json(
      {
        error:
          "Verification email is temporarily unavailable. Please try again later.",
      },
      { status: 503 },
    );
  }
}
