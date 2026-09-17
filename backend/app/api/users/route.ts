import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAuth } from "@/lib/auth/requireAuth";
import { prisma } from "@/lib/prisma";

const searchSchema = z.object({
  query: z
    .string({ required_error: "Query is required" })
    .trim()
    .min(1, "Query must contain at least 1 character")
    .max(100, "Query must not exceed 100 characters"),
});

export async function GET(request: NextRequest) {
  let userId: string;
  try {
    ({ userId } = requireAuth(request));
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = searchSchema.safeParse({
    query: request.nextUrl.searchParams.get("query"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid query" },
      { status: 400 },
    );
  }

  const { query } = parsed.data;
  const users = await prisma.user.findMany({
    where: {
      id: { not: userId },
      OR: [
        { displayName: { contains: query, mode: "insensitive" } },
        { email: { contains: query, mode: "insensitive" } },
      ],
    },
    orderBy: { displayName: "asc" },
    select: { id: true, displayName: true, email: true },
    take: 20,
  });

  return NextResponse.json({ users });
}
