import bcrypt from 'bcryptjs';
import { prisma } from '../config/database';
import { AuthUser } from '../types';
import { AppError } from '../utils/AppError';
import { signAccessToken } from '../middlewares/authenticate';
import { accountLock } from '../middlewares/rateLimit';
import { writeAuditLog } from '../utils/audit';
import { withTransaction } from '../utils/transaction';

const BCRYPT_ROUNDS = 12;

export const hashPassword = async (plain: string): Promise<string> =>
  bcrypt.hash(plain, BCRYPT_ROUNDS);

export const verifyPassword = async (plain: string, hash: string): Promise<boolean> =>
  bcrypt.compare(plain, hash);

export interface LoginResult {
  user: AuthUser & { mustChangePassword: boolean };
  token: string;
}

export const login = async (rawUsername: string, password: string): Promise<LoginResult> => {
  const username = rawUsername.trim().toLowerCase();
  // Too many recent failures for this account (from any IP): refuse before
  // checking the password so guessing cannot continue.
  await accountLock.assertOpen(username);

  const user = await prisma.user.findUnique({ where: { username } });

  // Constant-ish response: never reveal whether the username exists.
  if (!user) {
    await bcrypt.hash(password, BCRYPT_ROUNDS).catch(() => undefined);
    await accountLock.recordFailure(username);
    throw AppError.unauthorized('اسم المستخدم أو كلمة المرور غير صحيحة');
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    await accountLock.recordFailure(username);
    throw AppError.unauthorized('اسم المستخدم أو كلمة المرور غير صحيحة');
  }
  if (!user.isActive) throw AppError.unauthorized('حسابك موقوف، يرجى مراجعة الإدارة');
  await accountLock.reset(username);

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const authUser: AuthUser = {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
  };

  return {
    user: { ...authUser, mustChangePassword: user.mustChangePassword },
    token: signAccessToken(user),
  };
};

export const getMe = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      fullName: true,
      username: true,
      role: true,
      isActive: true,
      mustChangePassword: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });
  if (!user) throw AppError.notFound('الحساب غير موجود');
  return user;
};

/**
 * The user changes their own password. Every other session of this account
 * ends (sessionVersion bump); the caller gets a fresh token for this one.
 */
export const changePassword = async (
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<{ token: string }> => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw AppError.notFound('الحساب غير موجود');

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) throw AppError.badRequest('كلمة المرور الحالية غير صحيحة', { field: 'currentPassword' });

  if (currentPassword === newPassword) {
    throw AppError.badRequest('كلمة المرور الجديدة يجب أن تختلف عن الحالية', { field: 'newPassword' });
  }
  if (newPassword.toLowerCase().includes(user.username.toLowerCase()) && user.username.length >= 3) {
    throw AppError.badRequest('كلمة المرور يجب ألا تحتوي على اسم المستخدم', { field: 'newPassword' });
  }

  const passwordHash = await hashPassword(newPassword);
  const updated = await withTransaction(async (tx) => {
    const row = await tx.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: false, sessionVersion: { increment: 1 } },
      select: { id: true, sessionVersion: true },
    });
    await writeAuditLog(
      {
        userId,
        action: 'PASSWORD_CHANGED',
        entityType: 'User',
        entityId: userId,
        // Never store passwords, hashes or tokens in the audit trail.
        newData: { username: user.username },
      },
      tx,
    );
    return row;
  });
  return { token: signAccessToken(updated) };
};
