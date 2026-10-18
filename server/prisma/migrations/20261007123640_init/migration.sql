-- CreateEnum
CREATE TYPE "Role" AS ENUM ('EMPLOYEE', 'MANAGER');

-- CreateEnum
CREATE TYPE "DelegateStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('OPEN', 'CLOSED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "FlightType" AS ENUM ('DIRECT', 'INDIRECT');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('PASSPORT_IMAGE', 'PERSONAL_PHOTO');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'TRANSFER');

-- CreateEnum
CREATE TYPE "TransferType" AS ENUM ('INSTAPAY', 'BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('ACTIVE', 'VOIDED');

-- CreateEnum
CREATE TYPE "ReceiptStatus" AS ENUM ('ACTIVE', 'VOIDED');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "LedgerSourceType" AS ENUM ('PILGRIM_CHARGE', 'PAYMENT', 'PAYMENT_VOID', 'REFUND', 'CORRECTION', 'TRANSFER_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "FinancialAdjustmentType" AS ENUM ('PAYMENT_VOID', 'REFUND', 'CORRECTION');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('DELEGATE_PRICE_CHANGE', 'PAYMENT_VOID', 'RECEIPT_VOID', 'REFUND', 'FINANCIAL_CORRECTION', 'PILGRIM_TRANSFER', 'USER_CREATED', 'USER_ACTIVATED', 'USER_DEACTIVATED', 'PASSWORD_RESET', 'DELEGATE_CREATED', 'DELEGATE_UPDATED', 'DELEGATE_STATUS_CHANGED', 'TRIP_PRICE_LOCK_OVERRIDE');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "fullName" VARCHAR(160) NOT NULL,
    "username" VARCHAR(80) NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'EMPLOYEE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "passwordResetAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Delegate" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "phone" VARCHAR(40) NOT NULL,
    "address" VARCHAR(255) NOT NULL,
    "status" "DelegateStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Delegate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trip" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "departureDate" DATE NOT NULL,
    "returnDate" DATE NOT NULL,
    "flightType" "FlightType" NOT NULL,
    "status" "TripStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DelegateTrip" (
    "id" UUID NOT NULL,
    "delegateId" UUID NOT NULL,
    "tripId" UUID NOT NULL,
    "pricePerPerson" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DelegateTrip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pilgrim" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "passportNumber" VARCHAR(40) NOT NULL,
    "nationalId" VARCHAR(40),
    "birthDate" DATE,
    "job" VARCHAR(120),
    "notes" TEXT,
    "delegateId" UUID NOT NULL,
    "tripId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pilgrim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PilgrimTransfer" (
    "id" UUID NOT NULL,
    "pilgrimId" UUID NOT NULL,
    "fromTripId" UUID NOT NULL,
    "toTripId" UUID NOT NULL,
    "reason" TEXT,
    "performedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PilgrimTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PilgrimDocument" (
    "id" UUID NOT NULL,
    "pilgrimId" UUID NOT NULL,
    "type" "DocumentType" NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "originalName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(120) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" VARCHAR(300) NOT NULL,
    "uploadedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PilgrimDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" UUID NOT NULL,
    "delegateId" UUID NOT NULL,
    "type" "LedgerEntryType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "sourceType" "LedgerSourceType" NOT NULL,
    "sourceId" UUID,
    "pilgrimId" UUID,
    "description" VARCHAR(400) NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "performedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "delegateId" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "transferType" "TransferType",
    "referenceNumber" VARCHAR(120),
    "paymentDate" DATE NOT NULL,
    "notes" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" UUID NOT NULL,
    "voidedById" UUID,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "ledgerEntryId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" UUID NOT NULL,
    "number" VARCHAR(24) NOT NULL,
    "paymentId" UUID NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedById" UUID NOT NULL,
    "status" "ReceiptStatus" NOT NULL DEFAULT 'ACTIVE',
    "voidedById" UUID,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceiptCounter" (
    "year" INTEGER NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ReceiptCounter_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "FinancialAdjustment" (
    "id" UUID NOT NULL,
    "type" "FinancialAdjustmentType" NOT NULL,
    "delegateId" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "relatedPaymentId" UUID,
    "ledgerEntryId" UUID NOT NULL,
    "performedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "action" "AuditAction" NOT NULL,
    "entityType" VARCHAR(60) NOT NULL,
    "entityId" UUID NOT NULL,
    "oldData" JSONB,
    "newData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_isActive_idx" ON "User"("isActive");

-- CreateIndex
CREATE INDEX "Delegate_status_idx" ON "Delegate"("status");

-- CreateIndex
CREATE INDEX "Delegate_name_idx" ON "Delegate"("name");

-- CreateIndex
CREATE INDEX "Delegate_phone_idx" ON "Delegate"("phone");

-- CreateIndex
CREATE INDEX "Trip_status_idx" ON "Trip"("status");

-- CreateIndex
CREATE INDEX "Trip_departureDate_idx" ON "Trip"("departureDate");

-- CreateIndex
CREATE INDEX "Trip_name_idx" ON "Trip"("name");

-- CreateIndex
CREATE INDEX "DelegateTrip_tripId_idx" ON "DelegateTrip"("tripId");

-- CreateIndex
CREATE UNIQUE INDEX "DelegateTrip_delegateId_tripId_key" ON "DelegateTrip"("delegateId", "tripId");

-- CreateIndex
CREATE INDEX "Pilgrim_delegateId_idx" ON "Pilgrim"("delegateId");

-- CreateIndex
CREATE INDEX "Pilgrim_tripId_idx" ON "Pilgrim"("tripId");

-- CreateIndex
CREATE INDEX "Pilgrim_name_idx" ON "Pilgrim"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Pilgrim_tripId_passportNumber_key" ON "Pilgrim"("tripId", "passportNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Pilgrim_tripId_nationalId_key" ON "Pilgrim"("tripId", "nationalId");

-- CreateIndex
CREATE INDEX "PilgrimTransfer_pilgrimId_idx" ON "PilgrimTransfer"("pilgrimId");

-- CreateIndex
CREATE INDEX "PilgrimTransfer_fromTripId_idx" ON "PilgrimTransfer"("fromTripId");

-- CreateIndex
CREATE INDEX "PilgrimTransfer_toTripId_idx" ON "PilgrimTransfer"("toTripId");

-- CreateIndex
CREATE INDEX "PilgrimTransfer_createdAt_idx" ON "PilgrimTransfer"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PilgrimDocument_storageKey_key" ON "PilgrimDocument"("storageKey");

-- CreateIndex
CREATE INDEX "PilgrimDocument_pilgrimId_idx" ON "PilgrimDocument"("pilgrimId");

-- CreateIndex
CREATE UNIQUE INDEX "PilgrimDocument_pilgrimId_type_key" ON "PilgrimDocument"("pilgrimId", "type");

-- CreateIndex
CREATE INDEX "LedgerEntry_delegateId_createdAt_idx" ON "LedgerEntry"("delegateId", "createdAt");

-- CreateIndex
CREATE INDEX "LedgerEntry_delegateId_type_idx" ON "LedgerEntry"("delegateId", "type");

-- CreateIndex
CREATE INDEX "LedgerEntry_sourceType_sourceId_idx" ON "LedgerEntry"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "LedgerEntry_pilgrimId_idx" ON "LedgerEntry"("pilgrimId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_ledgerEntryId_key" ON "Payment"("ledgerEntryId");

-- CreateIndex
CREATE INDEX "Payment_delegateId_createdAt_idx" ON "Payment"("delegateId", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "Payment_paymentDate_idx" ON "Payment"("paymentDate");

-- CreateIndex
CREATE INDEX "Payment_createdById_idx" ON "Payment"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_number_key" ON "Receipt"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_paymentId_key" ON "Receipt"("paymentId");

-- CreateIndex
CREATE INDEX "Receipt_status_idx" ON "Receipt"("status");

-- CreateIndex
CREATE INDEX "Receipt_issuedAt_idx" ON "Receipt"("issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialAdjustment_ledgerEntryId_key" ON "FinancialAdjustment"("ledgerEntryId");

-- CreateIndex
CREATE INDEX "FinancialAdjustment_delegateId_createdAt_idx" ON "FinancialAdjustment"("delegateId", "createdAt");

-- CreateIndex
CREATE INDEX "FinancialAdjustment_type_idx" ON "FinancialAdjustment"("type");

-- CreateIndex
CREATE INDEX "FinancialAdjustment_relatedPaymentId_idx" ON "FinancialAdjustment"("relatedPaymentId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "DelegateTrip" ADD CONSTRAINT "DelegateTrip_delegateId_fkey" FOREIGN KEY ("delegateId") REFERENCES "Delegate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DelegateTrip" ADD CONSTRAINT "DelegateTrip_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pilgrim" ADD CONSTRAINT "Pilgrim_delegateId_fkey" FOREIGN KEY ("delegateId") REFERENCES "Delegate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pilgrim" ADD CONSTRAINT "Pilgrim_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilgrimTransfer" ADD CONSTRAINT "PilgrimTransfer_pilgrimId_fkey" FOREIGN KEY ("pilgrimId") REFERENCES "Pilgrim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilgrimTransfer" ADD CONSTRAINT "PilgrimTransfer_fromTripId_fkey" FOREIGN KEY ("fromTripId") REFERENCES "Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilgrimTransfer" ADD CONSTRAINT "PilgrimTransfer_toTripId_fkey" FOREIGN KEY ("toTripId") REFERENCES "Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilgrimTransfer" ADD CONSTRAINT "PilgrimTransfer_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilgrimDocument" ADD CONSTRAINT "PilgrimDocument_pilgrimId_fkey" FOREIGN KEY ("pilgrimId") REFERENCES "Pilgrim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilgrimDocument" ADD CONSTRAINT "PilgrimDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_delegateId_fkey" FOREIGN KEY ("delegateId") REFERENCES "Delegate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_pilgrimId_fkey" FOREIGN KEY ("pilgrimId") REFERENCES "Pilgrim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_delegateId_fkey" FOREIGN KEY ("delegateId") REFERENCES "Delegate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_ledgerEntryId_fkey" FOREIGN KEY ("ledgerEntryId") REFERENCES "LedgerEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialAdjustment" ADD CONSTRAINT "FinancialAdjustment_delegateId_fkey" FOREIGN KEY ("delegateId") REFERENCES "Delegate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialAdjustment" ADD CONSTRAINT "FinancialAdjustment_relatedPaymentId_fkey" FOREIGN KEY ("relatedPaymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialAdjustment" ADD CONSTRAINT "FinancialAdjustment_ledgerEntryId_fkey" FOREIGN KEY ("ledgerEntryId") REFERENCES "LedgerEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialAdjustment" ADD CONSTRAINT "FinancialAdjustment_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
