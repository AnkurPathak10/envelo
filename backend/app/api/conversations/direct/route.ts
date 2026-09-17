import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  createDirectKey,
  directConversationSelect,
  toCreatedDirectConversation,
} from "@/lib/conversations";
import { requireAuth } from "@/lib/auth/requireAuth";
import { prisma } from "@/lib/prisma";

const directConversationSchema = z.object({
  participantId: z
    .string({ required_error: "participantId is required" })
    .trim()
    .min(1, "participantId cannot be empty"),
});

async function findDirectConversation(directKey: string) {
  return prisma.conversation.findUnique({
    where: { directKey },
    select: directConversationSelect,
  });
}

export async function POST(request: NextRequest) {
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

  const parsed = directConversationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const { participantId } = parsed.data;
  if (participantId === userId) {
    return NextResponse.json(
      { error: "You cannot create a conversation with yourself" },
      { status: 400 },
    );
  }

  const participant = await prisma.user.findUnique({
    where: { id: participantId },
    select: { id: true },
  });
  if (!participant) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const directKey = createDirectKey(userId, participantId);
  let conversation = await findDirectConversation(directKey);

  if (!conversation) {
    try {
      conversation = await prisma.$transaction((transaction) =>
        transaction.conversation.create({
          data: {
            directKey,
            participants: {
              create: [{ userId }, { userId: participantId }],
            },
          },
          select: directConversationSelect,
        }),
      );
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2002"
      ) {
        throw error;
      }

      conversation = await findDirectConversation(directKey);
      if (!conversation) throw error;
    }
  }

  return NextResponse.json({
    conversation: toCreatedDirectConversation(conversation, userId),
  });
}
