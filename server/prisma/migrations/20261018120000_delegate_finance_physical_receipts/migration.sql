-- Delegate-only finance model + physical paper receipts.
--
-- * The amount required from a delegate is now computed live from
--   DelegateTrip.pricePerPerson x active pilgrim count, so the per-pilgrim
--   ledger charges (PILGRIM_CHARGE / TRANSFER_ADJUSTMENT) are derived data and
--   are removed together with LedgerEntry.pilgrimId.
-- * Receipt numbers are no longer generated. Payments carry the physical
--   receipt number + scan. Old generated numbers are kept on the payment as
--   legacyReceiptNumber only.
-- * Payments, voids, refunds and corrections are preserved untouched.

BEGIN;

-- Pilgrim operational status (cancellation foundation) ---------------------
CREATE TYPE "PilgrimStatus" AS ENUM ('ACTIVE', 'CANCELLED');

ALTER TABLE "Pilgrim" ADD COLUMN "cancelReason" VARCHAR(500),
ADD COLUMN "cancelledAt" TIMESTAMP(3),
ADD COLUMN "cancelledById" UUID,
ADD COLUMN "status" "PilgrimStatus" NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE "Pilgrim" ADD CONSTRAINT "Pilgrim_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Pilgrim_delegateId_tripId_status_idx" ON "Pilgrim"("delegateId", "tripId", "status");

-- Physical receipt fields on Payment ---------------------------------------
ALTER TABLE "Payment" ADD COLUMN "activeReceiptKey" VARCHAR(120),
ADD COLUMN "legacyReceiptNumber" VARCHAR(24),
ADD COLUMN "receiptNumber" VARCHAR(40),
ADD COLUMN "receiptScanKey" VARCHAR(300),
ADD COLUMN "receiptScanMimeType" VARCHAR(120),
ADD COLUMN "receiptScanOriginalName" VARCHAR(255),
ADD COLUMN "receiptScanSizeBytes" INTEGER;

-- Keep the old system-generated number for debugging only.
UPDATE "Payment" p
SET "legacyReceiptNumber" = r."number"
FROM "Receipt" r
WHERE r."paymentId" = p."id";

CREATE UNIQUE INDEX "Payment_activeReceiptKey_key" ON "Payment"("activeReceiptKey");
CREATE UNIQUE INDEX "Payment_receiptScanKey_key" ON "Payment"("receiptScanKey");
CREATE INDEX "Payment_receiptNumber_idx" ON "Payment"("receiptNumber");

-- Every payment is either a legacy record or carries a physical receipt
-- number and its scan.
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_physical_receipt_check"
CHECK (
  "legacyReceiptNumber" IS NOT NULL
  OR ("receiptNumber" IS NOT NULL AND "receiptScanKey" IS NOT NULL)
);

-- Remove per-pilgrim financial charges --------------------------------------
DELETE FROM "LedgerEntry" WHERE "sourceType" IN ('PILGRIM_CHARGE', 'TRANSFER_ADJUSTMENT');

ALTER TABLE "LedgerEntry" DROP CONSTRAINT "LedgerEntry_pilgrimId_fkey";
DROP INDEX "LedgerEntry_pilgrimId_idx";
ALTER TABLE "LedgerEntry" DROP COLUMN "pilgrimId";

CREATE TYPE "LedgerSourceType_new" AS ENUM ('PAYMENT', 'PAYMENT_VOID', 'REFUND', 'CORRECTION');
ALTER TABLE "LedgerEntry" ALTER COLUMN "sourceType" TYPE "LedgerSourceType_new" USING ("sourceType"::text::"LedgerSourceType_new");
ALTER TYPE "LedgerSourceType" RENAME TO "LedgerSourceType_old";
ALTER TYPE "LedgerSourceType_new" RENAME TO "LedgerSourceType";
DROP TYPE "public"."LedgerSourceType_old";

-- Remove generated receipts --------------------------------------------------
ALTER TABLE "Receipt" DROP CONSTRAINT "Receipt_issuedById_fkey";
ALTER TABLE "Receipt" DROP CONSTRAINT "Receipt_paymentId_fkey";
ALTER TABLE "Receipt" DROP CONSTRAINT "Receipt_voidedById_fkey";
DROP TABLE "Receipt";
DROP TABLE "ReceiptCounter";
DROP TYPE "ReceiptStatus";

COMMIT;
