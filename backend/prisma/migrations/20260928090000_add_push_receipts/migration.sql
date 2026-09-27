CREATE TABLE "PushReceipt" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkAfter" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "PushReceipt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PushReceipt_checkAfter_idx" ON "PushReceipt"("checkAfter");
