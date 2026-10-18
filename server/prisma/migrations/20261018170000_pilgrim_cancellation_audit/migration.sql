-- Audit action for the pilgrim cancellation (استبعاد) flow. Pilgrim.status /
-- cancelledAt / cancelledById / cancelReason already exist.
-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'PILGRIM_CANCELLED';

