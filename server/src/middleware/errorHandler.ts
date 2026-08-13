import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError, isAppError } from '../lib/errors.js';
import { logger } from '../config/logger.js';

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found.` },
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (isAppError(err)) {
    res.status(err.status).json(err.toJSON());
    return;
  }

  if (err instanceof ZodError) {
    res.status(422).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed.',
        details: err.flatten(),
      },
    });
    return;
  }

  // Never leak internal error details to clients.
  logger.error({ err, url: req.originalUrl }, 'unhandled error');
  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL', message: 'An unexpected error occurred.' },
  });
}
