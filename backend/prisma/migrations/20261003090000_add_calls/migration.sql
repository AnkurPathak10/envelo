CREATE TYPE "CallStatus" AS ENUM ('RINGING', 'ONGOING', 'COMPLETED', 'MISSED', 'DECLINED');
ALTER TABLE "Conversation" ADD COLUMN "realtimeMeetingId" TEXT;
CREATE TABLE "CallLog" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "initiatorId" TEXT NOT NULL,
  "status" "CallStatus" NOT NULL,
  "hadVideo" BOOLEAN NOT NULL DEFAULT false,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "connectedAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  CONSTRAINT "CallLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CallLog_conversationId_startedAt_id_idx" ON "CallLog"("conversationId", "startedAt", "id");
CREATE INDEX "CallLog_status_idx" ON "CallLog"("status");
CREATE UNIQUE INDEX "CallLog_one_active_per_conversation" ON "CallLog"("conversationId") WHERE "status" IN ('RINGING', 'ONGOING');
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_initiatorId_fkey" FOREIGN KEY ("initiatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
