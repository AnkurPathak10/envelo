import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signAccessToken, createRefreshTokenInDb } from "@/lib/auth/tokens";

const signupSchema = z.object({
  email: z.string().email("Invalid email address").transform((val) => val.trim().toLowerCase()),
  password: z.string().min(8, "Password must be at least 8 characters long"),
  displayName: z.string().trim().min(1, "Display name cannot be empty").max(100, "Display name is too long"),
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
      { status: 400 }
    );
  }

  const { email, password, displayName } = parsed.data;

  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    return NextResponse.json(
      { error: "An account with this email already exists" },
      { status: 409 }
    );
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      displayName,
    },
    select: {
      id: true,
      email: true,
      displayName: true,
    },
  });

  const accessToken = signAccessToken(user.id);
  const refreshToken = await createRefreshTokenInDb(user.id);

  return NextResponse.json(
    {
      accessToken,
      refreshToken,
      user,
    },
    { status: 201 }
  );
}
