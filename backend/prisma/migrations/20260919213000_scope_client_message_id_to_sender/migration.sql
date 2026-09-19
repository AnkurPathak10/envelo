-- DropIndex
DROP INDEX "Message_clientMessageId_key";

-- CreateIndex
CREATE UNIQUE INDEX "Message_senderId_clientMessageId_key" ON "Message"("senderId", "clientMessageId");
