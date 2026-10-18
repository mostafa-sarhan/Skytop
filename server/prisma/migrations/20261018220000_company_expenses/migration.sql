-- Company expenses: a new, separate table. No existing table or data is changed
-- (only two audit action values are added).

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('ELECTRICITY', 'INTERNET', 'RENT', 'OFFICE_SUPPLIES', 'MAINTENANCE', 'TRANSPORTATION', 'HOSPITALITY', 'OTHER');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('ACTIVE', 'VOIDED');

-- AlterEnum (audit actions for the new module)
ALTER TYPE "AuditAction" ADD VALUE 'EXPENSE_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'EXPENSE_VOIDED';

-- CreateTable
CREATE TABLE "Expense" (
    "id" UUID NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "expenseDate" DATE NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "transferType" "TransferType",
    "referenceNumber" VARCHAR(120),
    "description" VARCHAR(500) NOT NULL,
    "notes" TEXT,
    "attachmentKey" VARCHAR(300),
    "attachmentOriginalName" VARCHAR(255),
    "attachmentMimeType" VARCHAR(120),
    "attachmentSizeBytes" INTEGER,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" UUID NOT NULL,
    "voidedById" UUID,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Expense_attachmentKey_key" ON "Expense"("attachmentKey");

-- CreateIndex
CREATE INDEX "Expense_expenseDate_idx" ON "Expense"("expenseDate");

-- CreateIndex
CREATE INDEX "Expense_status_expenseDate_idx" ON "Expense"("status", "expenseDate");

-- CreateIndex
CREATE INDEX "Expense_category_expenseDate_idx" ON "Expense"("category", "expenseDate");

-- CreateIndex
CREATE INDEX "Expense_createdById_idx" ON "Expense"("createdById");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Money guards at the database level.
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_transfer_type_only_for_transfer"
  CHECK ("paymentMethod" = 'TRANSFER' OR "transferType" IS NULL);
