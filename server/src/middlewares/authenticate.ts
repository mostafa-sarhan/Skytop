import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma } from '../config/database';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';

interface AccessTokenPayload {
  id: string;
  /** User.sessionVersion when the token was issued (absent on legacy tokens = 0). */
  sv?: number;
  iat: number;
  exp: number;
}

export const COOKIE_NAME = 'skytop_access_token';

/**
 * The token only identifies the user and the session generation; name, role
 * and active status are re-read from the database on every request, so role
 * changes and deactivation apply immediately.
 */
export const signAccessToken = (user: { id: string; sessionVersion: number }): string =>
  jwt.sign({ id: user.id, sv: user.sessionVersion }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    algorithm: 'HS256',
  });

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: env.COOKIE_SECURE,
  path: '/',
});

/** The cookie lives exactly as long as the token inside it. */
export const setAuthCookie = (res: Response, token: string): void => {
  const decoded = jwt.decode(token) as { exp?: number } | null;
  const maxAge = decoded?.exp ? Math.max(0, decoded.exp * 1000 - Date.now()) : undefined;
  res.cookie(COOKIE_NAME, token, { ...cookieOptions(), ...(maxAge !== undefined ? { maxAge } : {}) });
};

export const clearAuthCookie = (res: Response): void => {
  res.clearCookie(COOKIE_NAME, cookieOptions());
};

const extractToken = (req: Request): string | undefined => {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  const cookies = req.headers.cookie;
  if (cookies) {
    for (const part of cookies.split(';')) {
      const [name, ...rest] = part.trim().split('=');
      if (name === COOKIE_NAME) return rest.join('=');
    }
  }
  return undefined;
};

export const authenticate = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    const token = extractToken(req);
    if (!token) throw AppError.unauthorized('يجب تسجيل الدخول للوصول لهذا المورد');

    let payload: AccessTokenPayload;
    try {
      payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }) as AccessTokenPayload;
    } catch {
      throw AppError.unauthorized('جلسة الدخول منتهية أو غير صالحة، يرجى تسجيل الدخول مجدداً');
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: { id: true, username: true, fullName: true, role: true, isActive: true, sessionVersion: true },
    });

    if (!user) throw AppError.unauthorized('حسابك لم يعد متاحاً، يرجى مراجعة الإدارة');
    if (!user.isActive) throw AppError.unauthorized('حسابك موقوف، يرجى مراجعة الإدارة');
    // Password changed / reset or account deactivated since this token was issued.
    if ((payload.sv ?? 0) !== user.sessionVersion) {
      throw AppError.unauthorized('انتهت جلسة الدخول بعد تغيير بيانات الحساب، يرجى تسجيل الدخول مجدداً');
    }

    req.user = { id: user.id, username: user.username, fullName: user.fullName, role: user.role };
    next();
  },
);
