-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN "directKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_directKey_key" ON "Conversation"("directKey");
