-- AlterTable
ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

-- Existing accounts predate signup verification and remain verified.
UPDATE "User"
SET "emailVerifiedAt" = "createdAt"
WHERE "emailVerifiedAt" IS NULL;

-- CreateTable
CREATE TABLE "PendingSignup" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "otpHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastSentAt" TIMESTAMP(3) NOT NULL,
    "deliveryAcceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PendingSignup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailOtpSendEvent" (
    "id" TEXT NOT NULL,
    "emailHash" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailOtpSendEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PendingSignup_email_key" ON "PendingSignup"("email");

-- CreateIndex
CREATE INDEX "PendingSignup_expiresAt_idx" ON "PendingSignup"("expiresAt");

-- CreateIndex
CREATE INDEX "EmailOtpSendEvent_emailHash_createdAt_idx" ON "EmailOtpSendEvent"("emailHash", "createdAt");

-- CreateIndex
CREATE INDEX "EmailOtpSendEvent_ipHash_createdAt_idx" ON "EmailOtpSendEvent"("ipHash", "createdAt");

-- CreateIndex
CREATE INDEX "EmailOtpSendEvent_createdAt_idx" ON "EmailOtpSendEvent"("createdAt");
