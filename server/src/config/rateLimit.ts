import rateLimit from 'express-rate-limit';
import { AppError } from '../lib/errors.js';

function makeLimiter(windowMs: number, max: number, message: string) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(new AppError('RATE_LIMITED', message));
    },
  });
}

// Auth endpoints: tighter limit to slow brute-force.
export const authLimiter = makeLimiter(15 * 60 * 1000, 30, 'Too many authentication attempts. Try again later.');

// General authenticated API.
export const apiLimiter = makeLimiter(60 * 1000, 300, 'Too many requests. Slow down.');

// Public status endpoints: generous but still bounded.
export const publicLimiter = makeLimiter(60 * 1000, 600, 'Too many requests. Slow down.');
