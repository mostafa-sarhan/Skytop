import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma } from '../config/database';
import { AuthUser } from '../types';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';

interface AccessTokenPayload extends AuthUser {
  iat: number;
  exp: number;
}

export const COOKIE_NAME = 'skytop_access_token';

export const signAccessToken = (user: AuthUser): string =>
  jwt.sign(
    { id: user.id, username: user.username, fullName: user.fullName, role: user.role },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'], algorithm: 'HS256' },
  );

export const setAuthCookie = (res: Response, token: string): void => {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.COOKIE_SECURE,
    maxAge: 12 * 60 * 60 * 1000,
    path: '/',
  });
};

export const clearAuthCookie = (res: Response): void => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
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
      select: { id: true, username: true, fullName: true, role: true, isActive: true },
    });

    if (!user) throw AppError.unauthorized('حسابك لم يعد متاحاً، يرجى مراجعة الإدارة');
    if (!user.isActive) throw AppError.unauthorized('حسابك موقوف، يرجى مراجعة الإدارة');

    req.user = { id: user.id, username: user.username, fullName: user.fullName, role: user.role };
    next();
  },
);
