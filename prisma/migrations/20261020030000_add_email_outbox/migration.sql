-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "email_messages" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastError" TEXT,
    "subject" TEXT,
    "text" TEXT,
    "html" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "email_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_messages_status_createdAt_idx" ON "email_messages"("status", "createdAt");

-- CreateIndex
CREATE INDEX "email_messages_bookingId_idx" ON "email_messages"("bookingId");

-- AddForeignKey
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

