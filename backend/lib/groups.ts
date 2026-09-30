import { ConversationType, ParticipantRole, Prisma } from "@prisma/client";
import { z } from "zod";

import { isImageKitUrl } from "@/lib/media";
import { prisma } from "@/lib/prisma";

const groupName = z.string().trim().min(1).max(100);
const memberIds = z
  .array(z.string().trim().min(1))
  .refine(
    (ids) => new Set(ids).size === ids.length,
    "memberIds cannot contain duplicates",
  );
const photoUrl = z
  .string()
  .trim()
  .url()
  .refine(isImageKitUrl, "photoUrl must use the configured media service");

export const createGroupSchema = z.object({
  name: groupName,
  photoUrl: photoUrl.optional(),
  description: z.string().trim().max(1000).optional(),
  memberIds,
});

export const updateGroupSchema = z
  .object({
    name: groupName.optional(),
    photoUrl: photoUrl.nullable().optional(),
    description: z.string().trim().max(1000).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "No changes supplied");

export const addGroupMembersSchema = z.object({ memberIds });

export const groupSelect = {
  id: true,
  name: true,
  photoUrl: true,
  description: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true,
  participants: {
    where: { leftAt: null },
    select: {
      role: true,
      mutedAt: true,
      user: {
        select: {
          id: true,
          displayName: true,
          email: true,
          avatarUrl: true,
        },
      },
    },
  },
} satisfies Prisma.ConversationSelect;

type GroupRecord = Prisma.ConversationGetPayload<{
  select: typeof groupSelect;
}>;

export function toGroupDetail(group: GroupRecord, currentUserId: string) {
  const current = group.participants.find(
    (participant) => participant.user.id === currentUserId,
  );
  return {
    id: group.id,
    name: group.name,
    photoUrl: group.photoUrl,
    description: group.description,
    createdBy: group.createdBy,
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString(),
    mutedAt: current?.mutedAt?.toISOString() ?? null,
    members: group.participants.map(({ role, user }) => ({ ...user, role })),
  };
}

export class GroupActionError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export function groupErrorResponse(error: unknown) {
  return error instanceof GroupActionError
    ? { error: error.message, status: error.status }
    : null;
}

async function groupTransaction<T>(
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
      ) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1)));
    }
  }
}

async function requireActiveMember(
  tx: Prisma.TransactionClient,
  groupId: string,
  userId: string,
) {
  const member = await tx.conversationParticipant.findFirst({
    where: {
      conversationId: groupId,
      userId,
      leftAt: null,
      conversation: { type: ConversationType.GROUP },
    },
    select: { id: true, role: true },
  });
  if (!member)
    throw new GroupActionError("Active group membership required", 403);
  return member;
}

async function requireAdmin(
  tx: Prisma.TransactionClient,
  groupId: string,
  userId: string,
) {
  const member = await requireActiveMember(tx, groupId, userId);
  if (member.role !== ParticipantRole.ADMIN) {
    throw new GroupActionError("Group admin required", 403);
  }
  return member;
}

async function requireFriends(
  tx: Prisma.TransactionClient,
  userId: string,
  ids: string[],
) {
  if (ids.length === 0) return;
  const friendships = await tx.friendship.findMany({
    where: {
      status: "ACCEPTED",
      OR: [
        { requesterId: userId, addresseeId: { in: ids } },
        { addresseeId: userId, requesterId: { in: ids } },
      ],
    },
    select: { requesterId: true, addresseeId: true },
  });
  const friends = new Set(
    friendships.map(({ requesterId, addresseeId }) =>
      requesterId === userId ? addresseeId : requesterId,
    ),
  );
  const missing = ids.find((id) => !friends.has(id));
  if (missing) {
    throw new GroupActionError(`${missing} is not an accepted friend`, 403);
  }
}

async function readGroup(tx: Prisma.TransactionClient, groupId: string) {
  return tx.conversation.findUniqueOrThrow({
    where: { id: groupId },
    select: groupSelect,
  });
}

export async function getGroup(groupId: string, userId: string) {
  const group = await prisma.conversation.findFirst({
    where: {
      id: groupId,
      type: ConversationType.GROUP,
      participants: { some: { userId, leftAt: null } },
    },
    select: groupSelect,
  });
  if (!group) throw new GroupActionError("Group not found", 404);
  return toGroupDetail(group, userId);
}

export async function createGroup(
  userId: string,
  input: z.infer<typeof createGroupSchema>,
) {
  if (input.memberIds.includes(userId)) {
    throw new GroupActionError("You cannot add yourself twice", 400);
  }
  return groupTransaction(async (tx) => {
    await requireFriends(tx, userId, input.memberIds);
    const group = await tx.conversation.create({
      data: {
        type: ConversationType.GROUP,
        name: input.name,
        photoUrl: input.photoUrl ?? null,
        description: input.description ?? null,
        createdBy: userId,
        participants: {
          create: [
            { userId, role: ParticipantRole.ADMIN },
            ...input.memberIds.map((memberId) => ({
              userId: memberId,
              role: ParticipantRole.MEMBER,
            })),
          ],
        },
      },
      select: groupSelect,
    });
    return toGroupDetail(group, userId);
  });
}

export async function updateGroup(
  groupId: string,
  userId: string,
  input: z.infer<typeof updateGroupSchema>,
) {
  return groupTransaction(async (tx) => {
    await requireAdmin(tx, groupId, userId);
    const group = await tx.conversation.update({
      where: { id: groupId },
      data: input,
      select: groupSelect,
    });
    return toGroupDetail(group, userId);
  });
}

export async function addGroupMembers(
  groupId: string,
  userId: string,
  ids: string[],
) {
  if (ids.includes(userId)) {
    throw new GroupActionError("You cannot add yourself twice", 400);
  }
  return groupTransaction(async (tx) => {
    await requireAdmin(tx, groupId, userId);
    const existing = await tx.conversationParticipant.findMany({
      where: { conversationId: groupId, userId: { in: ids } },
      select: { userId: true, leftAt: true },
    });
    const active = new Set(
      existing
        .filter(({ leftAt }) => leftAt === null)
        .map(({ userId }) => userId),
    );
    const newIds = ids.filter((id) => !active.has(id));
    await requireFriends(tx, userId, newIds);
    for (const memberId of newIds) {
      await tx.conversationParticipant.upsert({
        where: {
          conversationId_userId: { conversationId: groupId, userId: memberId },
        },
        create: { conversationId: groupId, userId: memberId },
        update: {
          leftAt: null,
          mutedAt: null,
          role: ParticipantRole.MEMBER,
        },
      });
    }
    return toGroupDetail(await readGroup(tx, groupId), userId);
  });
}

export async function removeGroupMember(
  groupId: string,
  userId: string,
  targetUserId: string,
) {
  return groupTransaction(async (tx) => {
    const actor = await requireActiveMember(tx, groupId, userId);
    if (targetUserId !== userId && actor.role !== ParticipantRole.ADMIN) {
      throw new GroupActionError("Group admin required", 403);
    }
    const target = await tx.conversationParticipant.findFirst({
      where: { conversationId: groupId, userId: targetUserId, leftAt: null },
      select: { id: true, role: true },
    });
    if (!target) throw new GroupActionError("Active member not found", 404);

    if (target.role === ParticipantRole.ADMIN) {
      const adminCount = await tx.conversationParticipant.count({
        where: {
          conversationId: groupId,
          role: ParticipantRole.ADMIN,
          leftAt: null,
        },
      });
      if (adminCount === 1) {
        const memberCount = await tx.conversationParticipant.count({
          where: { conversationId: groupId, leftAt: null },
        });
        if (memberCount > 1) {
          throw new GroupActionError("Promote another member first", 409);
        }
        await tx.conversation.delete({ where: { id: groupId } });
        return { deleted: true as const };
      }
    }

    await tx.conversationParticipant.update({
      where: { id: target.id },
      data: { leftAt: new Date() },
    });
    return { deleted: false as const };
  });
}

export async function setGroupRole(
  groupId: string,
  userId: string,
  targetUserId: string,
  role: "ADMIN" | "MEMBER",
) {
  return groupTransaction(async (tx) => {
    await requireAdmin(tx, groupId, userId);
    const target = await tx.conversationParticipant.findFirst({
      where: { conversationId: groupId, userId: targetUserId, leftAt: null },
      select: { id: true, role: true },
    });
    if (!target) throw new GroupActionError("Active member not found", 404);
    if (role === "MEMBER" && target.role === ParticipantRole.ADMIN) {
      const adminCount = await tx.conversationParticipant.count({
        where: {
          conversationId: groupId,
          role: ParticipantRole.ADMIN,
          leftAt: null,
        },
      });
      if (adminCount === 1) {
        throw new GroupActionError("Promote another member first", 409);
      }
    }
    await tx.conversationParticipant.update({
      where: { id: target.id },
      data: { role },
    });
    return toGroupDetail(await readGroup(tx, groupId), userId);
  });
}

export async function setGroupMuted(
  groupId: string,
  userId: string,
  muted: boolean,
) {
  return groupTransaction(async (tx) => {
    const member = await requireActiveMember(tx, groupId, userId);
    await tx.conversationParticipant.update({
      where: { id: member.id },
      data: { mutedAt: muted ? new Date() : null },
    });
    return toGroupDetail(await readGroup(tx, groupId), userId);
  });
}

export async function dissolveGroup(groupId: string, userId: string) {
  return groupTransaction(async (tx) => {
    await requireAdmin(tx, groupId, userId);
    const adminCount = await tx.conversationParticipant.count({
      where: {
        conversationId: groupId,
        role: ParticipantRole.ADMIN,
        leftAt: null,
      },
    });
    if (adminCount !== 1) {
      throw new GroupActionError(
        "Only the group's sole admin may dissolve it",
        409,
      );
    }
    await tx.conversation.delete({ where: { id: groupId } });
    return { deleted: true as const };
  });
}
