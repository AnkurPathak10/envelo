-- Clear/delete are participant-scoped so one account cannot erase another
-- participant's copy of a shared conversation.
ALTER TABLE "ConversationParticipant"
ADD COLUMN "clearedAt" TIMESTAMP(3),
ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "ConversationParticipant_userId_deletedAt_idx"
ON "ConversationParticipant"("userId", "deletedAt");
