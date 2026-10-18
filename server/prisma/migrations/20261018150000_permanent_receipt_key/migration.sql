-- A physical receipt number is globally unique and can never be reused, even
-- after the payment is voided. Replace the active-only duplicate guard
-- (activeReceiptKey, nulled on void) with a permanent key unique across ALL
-- payments.

BEGIN;

ALTER TABLE "Payment" RENAME COLUMN "activeReceiptKey" TO "receiptKey";
ALTER INDEX "Payment_activeReceiptKey_key" RENAME TO "Payment_receiptKey_key";

-- Re-reserve receipt numbers whose key was released by a void. Mirrors
-- receiptKey() in src/utils/receiptNumber.ts: Arabic-Indic digits -> Latin,
-- upper case, no whitespace, leading zeros dropped for all-digit values.
CREATE TEMP TABLE "_receipt_backfill" ON COMMIT DROP AS
SELECT "id", CASE WHEN k ~ '^[0-9]+$' THEN COALESCE(NULLIF(ltrim(k, '0'), ''), '0') ELSE k END AS "key"
FROM (
  SELECT "id",
         regexp_replace(
           upper(translate("receiptNumber", '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789')),
           '\s', '', 'g'
         ) AS k
  FROM "Payment"
  WHERE "receiptNumber" IS NOT NULL AND "receiptKey" IS NULL
) s;

DO $$
DECLARE clash TEXT;
BEGIN
  SELECT string_agg(DISTINCT b."key", ', ') INTO clash
  FROM "_receipt_backfill" b
  WHERE EXISTS (SELECT 1 FROM "Payment" p WHERE p."receiptKey" = b."key")
     OR (SELECT count(*) FROM "_receipt_backfill" b2 WHERE b2."key" = b."key") > 1;
  IF clash IS NOT NULL THEN
    RAISE EXCEPTION 'Receipt numbers recorded more than once, resolve manually before migrating: %', clash;
  END IF;
END $$;

UPDATE "Payment" p SET "receiptKey" = b."key" FROM "_receipt_backfill" b WHERE p."id" = b."id";

-- Every non-legacy payment must carry its permanent receipt identity.
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_physical_receipt_check";
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_physical_receipt_check"
CHECK (
  "legacyReceiptNumber" IS NOT NULL
  OR ("receiptNumber" IS NOT NULL AND "receiptKey" IS NOT NULL AND "receiptScanKey" IS NOT NULL)
);

COMMIT;
