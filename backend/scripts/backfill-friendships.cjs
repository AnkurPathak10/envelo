// Run once from backend/: node --env-file=.env scripts/backfill-friendships.cjs
// Preview first: node --env-file=.env scripts/backfill-friendships.cjs --dry-run
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");

async function main() {
  const conversations = await prisma.conversation.findMany({
    select: { id: true },
    orderBy: { id: "asc" },
  });
  const summary = {
    checked: 0,
    createdOrUpdated: 0,
    deletedEmpty: 0,
    skippedMalformed: 0,
  };

  for (const conversation of conversations) {
    const outcome = await prisma.$transaction(async (tx) => {
      const current = await tx.conversation.findUnique({
        where: { id: conversation.id },
        select: {
          participants: { select: { userId: true } },
          _count: { select: { messages: true } },
        },
      });
      if (!current) return "gone";
      if (current._count.messages === 0) {
        if (!dryRun)
          await tx.conversation.delete({ where: { id: conversation.id } });
        return "empty";
      }
      if (current.participants.length !== 2) return "malformed";
      const [requesterId, addresseeId] = current.participants
        .map((participant) => participant.userId)
        .sort();
      const accepted = await tx.friendship.findFirst({
        where: {
          status: "ACCEPTED",
          OR: [
            { requesterId, addresseeId },
            { requesterId: addresseeId, addresseeId: requesterId },
          ],
        },
        select: { id: true },
      });
      if (accepted) return "alreadyAccepted";
      if (!dryRun) {
        await tx.friendship.upsert({
          where: { requesterId_addresseeId: { requesterId, addresseeId } },
          create: {
            requesterId,
            addresseeId,
            status: "ACCEPTED",
            respondedAt: new Date(),
          },
          update: { status: "ACCEPTED", respondedAt: new Date() },
        });
      }
      return "accepted";
    });
    if (outcome === "gone") continue;
    summary.checked += 1;
    if (outcome === "empty") summary.deletedEmpty += 1;
    if (outcome === "accepted") summary.createdOrUpdated += 1;
    if (outcome === "malformed") summary.skippedMalformed += 1;
  }
  console.log(`${dryRun ? "DRY RUN" : "APPLIED"} friendship backfill`, summary);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
