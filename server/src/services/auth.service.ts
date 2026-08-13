import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt.js';
import { randomToken, sha256 } from '../utils/crypto.js';
import { sendMail } from './mail.service.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function issueTokens(userId: string, email: string, sessionId: string) {
  return {
    accessToken: signAccessToken(userId, email),
    refreshToken: signRefreshToken(userId, sessionId),
  };
}

async function createSession(userId: string, userAgent?: string, ip?: string) {
  const sessionId = crypto.randomUUID();
  const refreshToken = signRefreshToken(userId, sessionId);
  await prisma.session.create({
    data: {
      id: sessionId,
      userId,
      refreshTokenHash: sha256(refreshToken),
      userAgent,
      ip,
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    },
  });
  return { sessionId, refreshToken };
}

export async function register(input: {
  email: string;
  name: string;
  password: string;
  userAgent?: string;
  ip?: string;
}) {
  const email = input.email.toLowerCase().trim();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new AppError('EMAIL_ALREADY_EXISTS', 'An account with this email already exists.');
  }

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: { email, name: input.name.trim(), passwordHash },
  });

  const { sessionId, refreshToken } = await createSession(user.id, input.userAgent, input.ip);
  await sendVerificationEmail(user.id, email);

  return {
    user: { id: user.id, email: user.email, name: user.name, emailVerified: user.emailVerified },
    ...issueTokens(user.id, user.email, sessionId),
    refreshToken,
  };
}

export async function login(input: {
  email: string;
  password: string;
  userAgent?: string;
  ip?: string;
}) {
  const email = input.email.toLowerCase().trim();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    // Constant-ish response to reduce user enumeration (hash a dummy anyway).
    await verifyPassword(input.password, '$2a$12$C6UzMDM.H6dfI/f/IKcEeO');
    throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password.');
  }

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password.');
  }

  const { sessionId, refreshToken } = await createSession(user.id, input.userAgent, input.ip);
  return {
    user: { id: user.id, email: user.email, name: user.name, emailVerified: user.emailVerified },
    ...issueTokens(user.id, user.email, sessionId),
    refreshToken,
  };
}

export async function refresh(refreshToken: string, userAgent?: string, ip?: string) {
  const payload = verifyRefreshToken(refreshToken);
  const session = await prisma.session.findUnique({ where: { id: payload.sessionId } });

  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    throw new AppError('TOKEN_INVALID', 'Session is no longer valid.');
  }
  if (session.refreshTokenHash !== sha256(refreshToken)) {
    throw new AppError('TOKEN_INVALID', 'Refresh token mismatch.');
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) throw new AppError('TOKEN_INVALID', 'Session is no longer valid.');

  await prisma.session.update({
    where: { id: session.id },
    data: { lastUsedAt: new Date(), userAgent, ip },
  });

  return issueTokens(user.id, user.email, session.id);
}

export async function logout(refreshToken: string): Promise<void> {
  try {
    const payload = verifyRefreshToken(refreshToken);
    await prisma.session.update({
      where: { id: payload.sessionId },
      data: { revokedAt: new Date() },
    });
  } catch {
    // Logout is idempotent — invalid token is fine.
  }
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, avatarUrl: true, emailVerified: true, createdAt: true },
  });
  if (!user) throw new AppError('UNAUTHORIZED', 'User not found.');
  return user;
}

async function sendVerificationEmail(userId: string, email: string) {
  const token = randomToken();
  await prisma.token.create({
    data: {
      userId,
      type: 'EMAIL_VERIFY',
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  const link = `${env.webBaseUrl}/verify-email?token=${token}`;
  await sendMail({
    to: email,
    subject: 'Verify your WebPulse account',
    text: `Welcome to WebPulse! Verify your email: ${link}`,
  });
  // In dev, surface the token for convenience.
  if (!env.isProd) logger.debug({ token }, 'email verification token');
}

export async function verifyEmail(token: string) {
  const tokenHash = sha256(token);
  const record = await prisma.token.findUnique({ where: { tokenHash } });
  if (!record || record.type !== 'EMAIL_VERIFY' || record.usedAt || record.expiresAt < new Date()) {
    throw new AppError('TOKEN_INVALID', 'Invalid or expired verification token.');
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { emailVerified: new Date() } }),
    prisma.token.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);
}

export async function forgotPassword(email: string) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  // Always respond success to avoid user enumeration.
  if (!user) return;

  const token = randomToken();
  await prisma.token.create({
    data: {
      userId: user.id,
      type: 'PASSWORD_RESET',
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  const link = `${env.webBaseUrl}/reset-password?token=${token}`;
  await sendMail({
    to: user.email,
    subject: 'Reset your WebPulse password',
    text: `Reset your password: ${link}`,
  });
}

export async function resetPassword(token: string, newPassword: string) {
  const tokenHash = sha256(token);
  const record = await prisma.token.findUnique({ where: { tokenHash } });
  if (!record || record.type !== 'PASSWORD_RESET' || record.usedAt || record.expiresAt < new Date()) {
    throw new AppError('TOKEN_INVALID', 'Invalid or expired reset token.');
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.token.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    // Revoke all existing sessions on password reset.
    prisma.session.updateMany({ where: { userId: record.userId }, data: { revokedAt: new Date() } }),
  ]);
}
