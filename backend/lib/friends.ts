import { FriendshipStatus, Prisma, type Friendship } from "@prisma/client";

import { createDirectKey } from "@/lib/conversations";
import { prisma } from "@/lib/prisma";

export const FRIEND_REQUEST_COOLDOWN_MS = 5 * 24 * 60 * 60 * 1000;

export class FriendActionError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

async function serializable<T>(
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await prisma.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 15_000,
      });
    } catch (error) {
      if (
        attempt >= 2 ||
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        (error.code !== "P2034" && error.code !== "P2002")
      )
        throw error;
      await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1)));
    }
  }
}

async function ensureDirectConversation(
  tx: Prisma.TransactionClient,
  firstUserId: string,
  secondUserId: string,
): Promise<void> {
  const directKey = createDirectKey(firstUserId, secondUserId);
  const conversation = await tx.conversation.upsert({
    where: { directKey },
    create: {
      directKey,
      participants: {
        create: [{ userId: firstUserId }, { userId: secondUserId }],
      },
    },
    update: {},
    select: { id: true },
  });

  // A previously hidden direct chat becomes visible again if the users re-friend.
  await tx.conversationParticipant.updateMany({
    where: {
      conversationId: conversation.id,
      userId: { in: [firstUserId, secondUserId] },
      deletedAt: { not: null },
    },
    data: { deletedAt: null },
  });
}

export async function requestFriend(requesterId: string, addresseeId: string) {
  if (requesterId === addresseeId) {
    throw new FriendActionError(
      "You cannot send a friend request to yourself",
      400,
    );
  }

  return serializable(async (tx) => {
    const addressee = await tx.user.findUnique({
      where: { id: addresseeId },
      select: { id: true },
    });
    if (!addressee) throw new FriendActionError("User not found", 404);

    const [outgoing, incoming] = await Promise.all([
      tx.friendship.findUnique({
        where: { requesterId_addresseeId: { requesterId, addresseeId } },
      }),
      tx.friendship.findUnique({
        where: {
          requesterId_addresseeId: {
            requesterId: addresseeId,
            addresseeId: requesterId,
          },
        },
      }),
    ]);

    if (
      outgoing?.status === FriendshipStatus.ACCEPTED ||
      incoming?.status === FriendshipStatus.ACCEPTED
    ) {
      throw new FriendActionError("You are already friends", 400);
    }
    if (incoming?.status === FriendshipStatus.PENDING) {
      const friendship = await tx.friendship.update({
        where: { id: incoming.id },
        data: { status: FriendshipStatus.ACCEPTED, respondedAt: new Date() },
      });
      await ensureDirectConversation(tx, requesterId, addresseeId);
      return { friendship, action: "accepted" as const };
    }
    if (outgoing?.status === FriendshipStatus.PENDING) {
      throw new FriendActionError("Request already sent", 400);
    }

    const now = new Date();
    if (
      outgoing?.status === FriendshipStatus.REJECTED &&
      outgoing.respondedAt
    ) {
      const cooldownEndsAt = new Date(
        outgoing.respondedAt.getTime() + FRIEND_REQUEST_COOLDOWN_MS,
      );
      if (cooldownEndsAt > now) {
        throw new FriendActionError(
          `You can send another request after ${cooldownEndsAt.toISOString()}`,
          400,
        );
      }
    }

    const friendship = outgoing
      ? await tx.friendship.update({
          where: { id: outgoing.id },
          data: {
            status: FriendshipStatus.PENDING,
            respondedAt: null,
            createdAt: now,
          },
        })
      : await tx.friendship.create({
          data: { requesterId, addresseeId, status: FriendshipStatus.PENDING },
        });
    return { friendship, action: "requested" as const };
  });
}

export async function respondToFriendRequest(
  requestId: string,
  addresseeId: string,
  status: "ACCEPTED" | "REJECTED",
): Promise<Friendship> {
  return serializable(async (tx) => {
    const updated = await tx.friendship.updateMany({
      where: { id: requestId, addresseeId, status: FriendshipStatus.PENDING },
      data: { status, respondedAt: new Date() },
    });
    if (updated.count !== 1) {
      throw new FriendActionError("Friend request not found", 404);
    }
    const friendship = await tx.friendship.findUniqueOrThrow({
      where: { id: requestId },
    });
    if (status === FriendshipStatus.ACCEPTED) {
      await ensureDirectConversation(
        tx,
        friendship.requesterId,
        friendship.addresseeId,
      );
    }
    return friendship;
  });
}

export function friendErrorResponse(
  error: unknown,
): { error: string; status: number } | null {
  if (error instanceof FriendActionError)
    return { error: error.message, status: error.status };
  return null;
}
