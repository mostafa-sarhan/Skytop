-- Dedicated audit action for user role changes (previously logged as USER_CREATED).
ALTER TYPE "AuditAction" ADD VALUE 'USER_ROLE_CHANGED';
