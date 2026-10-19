-- Session invalidation: every token carries the user's sessionVersion; bumping
-- it (password change / reset, deactivation) ends all existing sessions.
-- Additive: existing rows start at 0 and existing tokens stay valid.
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- Audit trail for credential changes.
ALTER TYPE "AuditAction" ADD VALUE 'USERNAME_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'PASSWORD_CHANGED';
