import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';

export interface AccessTokenPayload {
  sub: string; // user id
  email: string;
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string; // user id
  sessionId: string;
  type: 'refresh';
}

export function signAccessToken(userId: string, email: string): string {
  const payload: AccessTokenPayload = { sub: userId, email, type: 'access' };
  return jwt.sign(payload, env.jwt.accessSecret, {
    expiresIn: env.jwt.accessTtl,
  } as SignOptions);
}

export function signRefreshToken(userId: string, sessionId: string): string {
  const payload: RefreshTokenPayload = { sub: userId, sessionId, type: 'refresh' };
  return jwt.sign(payload, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshTtl,
  } as SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, env.jwt.accessSecret) as AccessTokenPayload;
    if (decoded.type !== 'access') throw new AppError('TOKEN_INVALID', 'Invalid token type.');
    return decoded;
  } catch {
    throw new AppError('UNAUTHORIZED', 'Invalid or expired access token.');
  }
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    const decoded = jwt.verify(token, env.jwt.refreshSecret) as RefreshTokenPayload;
    if (decoded.type !== 'refresh') throw new AppError('TOKEN_INVALID', 'Invalid token type.');
    return decoded;
  } catch {
    throw new AppError('TOKEN_INVALID', 'Invalid or expired refresh token.');
  }
}
