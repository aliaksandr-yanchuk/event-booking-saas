-- New booking states for paid bookings. PostgreSQL 12+ allows several ADD VALUE
-- statements in one transaction, as long as the new values are not used in it.
ALTER TYPE "BookingStatus" ADD VALUE 'PENDING';
ALTER TYPE "BookingStatus" ADD VALUE 'EXPIRED';
ALTER TYPE "BookingStatus" ADD VALUE 'REFUNDED';

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "checkoutSessionId" TEXT,
ADD COLUMN     "checkoutUrl" TEXT,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "paymentId" TEXT,
ADD COLUMN     "paymentProvider" TEXT,
ADD COLUMN     "refundedAt" TIMESTAMP(3),
ADD COLUMN     "seatIds" TEXT[];

-- Backfill: existing bookings get the seats they hold (none if cancelled).
UPDATE "bookings" b
SET "seatIds" = COALESCE(
  (SELECT array_agg(bs."seatId" ORDER BY bs."seatId") FROM "booking_seats" bs WHERE bs."bookingId" = b."id"),
  '{}'
);

-- CreateIndex
CREATE UNIQUE INDEX "bookings_checkoutSessionId_key" ON "bookings"("checkoutSessionId");

-- CreateIndex
CREATE INDEX "bookings_status_expiresAt_idx" ON "bookings"("status", "expiresAt");
