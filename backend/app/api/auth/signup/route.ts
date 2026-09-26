import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { hashPassword } from "@/lib/auth/password";
import {
  requestInitialSignupOtp,
  signupClientAddress,
  SignupOtpError,
} from "@/lib/auth/signupOtp";
import { prisma } from "@/lib/prisma";

const signupSchema = z.object({
  email: z
    .string()
    .email("Invalid email address")
    .transform((value) => value.trim().toLowerCase()),
  password: z.string().min(8, "Password must be at least 8 characters long"),
  displayName: z
    .string()
    .trim()
    .min(1, "Display name cannot be empty")
    .max(100, "Display name is too long"),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  try {
    const existingUser = await prisma.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true },
    });
    if (existingUser) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 },
      );
    }
    const passwordHash = await hashPassword(parsed.data.password);
    const challenge = await requestInitialSignupOtp({
      email: parsed.data.email,
      displayName: parsed.data.displayName,
      passwordHash,
      clientAddress: signupClientAddress(request.headers),
    });
    return NextResponse.json(challenge, { status: 202 });
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
