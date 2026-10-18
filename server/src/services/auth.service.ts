import bcrypt from 'bcryptjs';
import { prisma } from '../config/database';
import { AuthUser } from '../types';
import { AppError } from '../utils/AppError';
import { signAccessToken } from '../middlewares/authenticate';

const BCRYPT_ROUNDS = 12;

export const hashPassword = async (plain: string): Promise<string> =>
  bcrypt.hash(plain, BCRYPT_ROUNDS);

export const verifyPassword = async (plain: string, hash: string): Promise<boolean> =>
  bcrypt.compare(plain, hash);

export interface LoginResult {
  user: AuthUser & { mustChangePassword: boolean };
  token: string;
}

export const login = async (username: string, password: string): Promise<LoginResult> => {
  const user = await prisma.user.findUnique({ where: { username: username.toLowerCase() } });

  // Constant-ish response: never reveal whether the username exists.
  if (!user) {
    await bcrypt.hash(password, BCRYPT_ROUNDS).catch(() => undefined);
    throw AppError.unauthorized('اسم المستخدم أو كلمة المرور غير صحيحة');
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) throw AppError.unauthorized('اسم المستخدم أو كلمة المرور غير صحيحة');
  if (!user.isActive) throw AppError.unauthorized('حسابك موقوف، يرجى مراجعة الإدارة');

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const authUser: AuthUser = {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
  };

  return {
    user: { ...authUser, mustChangePassword: user.mustChangePassword },
    token: signAccessToken(authUser),
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

export const changePassword = async (
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw AppError.notFound('الحساب غير موجود');

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) throw AppError.badRequest('كلمة المرور الحالية غير صحيحة');

  if (currentPassword === newPassword) {
    throw AppError.badRequest('كلمة المرور الجديدة يجب أن تختلف عن الحالية');
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, mustChangePassword: false },
  });
};
