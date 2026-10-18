-- Simplify the finance records after the delegate-account model change.
--
-- * LedgerEntry is removed. It was a second copy of information that already
--   lives elsewhere: payments/voids in "Payment" (status, voidedAt/By,
--   voidReason) and refunds/corrections in "FinancialAdjustment". The account
--   is computed from DelegateTrip x active pilgrims, ACTIVE payments and
--   FinancialAdjustment only.
-- * FinancialAdjustment keeps only explicit manager actions (REFUND,
--   CORRECTION). The correction direction and the refund date that used to be
--   read from the ledger row are copied onto the adjustment first.
-- * PAYMENT_VOID adjustment rows duplicated the voided payment; they are
--   removed only after checking the payment still holds the void details.
-- * Unused audit actions RECEIPT_VOID / TRIP_PRICE_LOCK_OVERRIDE are dropped.

BEGIN;

CREATE TYPE "AdjustmentDirection" AS ENUM ('INCREASE', 'DECREASE');

ALTER TABLE "FinancialAdjustment"
  ADD COLUMN "direction" "AdjustmentDirection",
  ADD COLUMN "effectiveDate" DATE;

-- Copy what the ledger row knew. Corrections: DEBIT added to what the
-- delegate owes, CREDIT deducted from it. Refund date was the ledger entryDate.
UPDATE "FinancialAdjustment" fa
SET "direction" = CASE
      WHEN fa."type" = 'CORRECTION' AND le."type" = 'DEBIT' THEN 'INCREASE'::"AdjustmentDirection"
      WHEN fa."type" = 'CORRECTION' AND le."type" = 'CREDIT' THEN 'DECREASE'::"AdjustmentDirection"
      ELSE NULL
    END,
    "effectiveDate" = le."entryDate"::date
FROM "LedgerEntry" le
WHERE le."id" = fa."ledgerEntryId";

-- Void adjustments must be fully represented on their payment before removal.
DO $$
DECLARE orphan INT;
BEGIN
  SELECT count(*) INTO orphan
  FROM "FinancialAdjustment" fa
  LEFT JOIN "Payment" p ON p."id" = fa."relatedPaymentId"
  WHERE fa."type" = 'PAYMENT_VOID'
    AND (p."id" IS NULL OR p."status" <> 'VOIDED' OR p."voidReason" IS NULL OR p."voidedById" IS NULL OR p."voidedAt" IS NULL);
  IF orphan > 0 THEN
    RAISE EXCEPTION '% PAYMENT_VOID adjustment(s) are not reflected on their payment; resolve before migrating', orphan;
  END IF;
END $$;

DELETE FROM "FinancialAdjustment" WHERE "type" = 'PAYMENT_VOID';

ALTER TABLE "FinancialAdjustment" ALTER COLUMN "effectiveDate" SET NOT NULL;

CREATE TYPE "FinancialAdjustmentType_new" AS ENUM ('REFUND', 'CORRECTION');
ALTER TABLE "FinancialAdjustment" ALTER COLUMN "type" TYPE "FinancialAdjustmentType_new" USING ("type"::text::"FinancialAdjustmentType_new");
ALTER TYPE "FinancialAdjustmentType" RENAME TO "FinancialAdjustmentType_old";
ALTER TYPE "FinancialAdjustmentType_new" RENAME TO "FinancialAdjustmentType";
DROP TYPE "public"."FinancialAdjustmentType_old";

-- A correction always has a direction; a refund never does.
ALTER TABLE "FinancialAdjustment" ADD CONSTRAINT "FinancialAdjustment_direction_check"
  CHECK (("type" = 'CORRECTION') = ("direction" IS NOT NULL));

-- Drop the ledger.
ALTER TABLE "FinancialAdjustment" DROP CONSTRAINT "FinancialAdjustment_ledgerEntryId_fkey";
DROP INDEX "FinancialAdjustment_ledgerEntryId_key";
ALTER TABLE "FinancialAdjustment" DROP COLUMN "ledgerEntryId";

ALTER TABLE "Payment" DROP CONSTRAINT "Payment_ledgerEntryId_fkey";
DROP INDEX "Payment_ledgerEntryId_key";
ALTER TABLE "Payment" DROP COLUMN "ledgerEntryId";

ALTER TABLE "LedgerEntry" DROP CONSTRAINT "LedgerEntry_delegateId_fkey";
ALTER TABLE "LedgerEntry" DROP CONSTRAINT "LedgerEntry_performedById_fkey";
DROP TABLE "LedgerEntry";
DROP TYPE "LedgerEntryType";
DROP TYPE "LedgerSourceType";

-- Unused audit actions (no rows use them).
CREATE TYPE "AuditAction_new" AS ENUM ('DELEGATE_PRICE_CHANGE', 'PAYMENT_VOID', 'REFUND', 'FINANCIAL_CORRECTION', 'PILGRIM_TRANSFER', 'PILGRIM_CANCELLED', 'USER_CREATED', 'USER_ACTIVATED', 'USER_DEACTIVATED', 'PASSWORD_RESET', 'DELEGATE_CREATED', 'DELEGATE_UPDATED', 'DELEGATE_STATUS_CHANGED');
ALTER TABLE "AuditLog" ALTER COLUMN "action" TYPE "AuditAction_new" USING ("action"::text::"AuditAction_new");
ALTER TYPE "AuditAction" RENAME TO "AuditAction_old";
ALTER TYPE "AuditAction_new" RENAME TO "AuditAction";
DROP TYPE "public"."AuditAction_old";

COMMIT;
