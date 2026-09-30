-- CreateEnum
CREATE TYPE "ConversationType" AS ENUM ('DIRECT', 'GROUP');
CREATE TYPE "ParticipantRole" AS ENUM ('MEMBER', 'ADMIN');

-- AlterTable
ALTER TABLE "Conversation"
ADD COLUMN "type" "ConversationType" NOT NULL DEFAULT 'DIRECT',
ADD COLUMN "name" TEXT,
ADD COLUMN "photoUrl" TEXT,
ADD COLUMN "description" TEXT,
ADD COLUMN "createdBy" TEXT;

ALTER TABLE "ConversationParticipant"
ADD COLUMN "role" "ParticipantRole" NOT NULL DEFAULT 'MEMBER',
ADD COLUMN "leftAt" TIMESTAMP(3),
ADD COLUMN "mutedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ConversationParticipant_conversationId_leftAt_idx" ON "ConversationParticipant"("conversationId", "leftAt");
