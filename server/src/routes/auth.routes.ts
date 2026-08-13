import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import * as authService from '../services/auth.service.js';
import {
  forgotPasswordSchema,
  loginSchema,
  logoutSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '../validators/auth.validators.js';

export const authRouter = Router();

/**
 * @swagger
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new account
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, name, password]
 *             properties:
 *               email: { type: string }
 *               name: { type: string }
 *               password: { type: string, minLength: 8 }
 *     responses:
 *       201:
 *         description: Account created with access/refresh tokens
 */
authRouter.post(
  '/register',
  validateBody(registerSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.register({
      email: req.body.email,
      name: req.body.name,
      password: req.body.password,
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });
    res.status(201).json({ success: true, data: result });
  }),
);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Log in
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Access + refresh tokens
 */
authRouter.post(
  '/login',
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.login({
      email: req.body.email,
      password: req.body.password,
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });
    res.json({ success: true, data: result });
  }),
);

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Rotate tokens using a refresh token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200:
 *         description: New access token
 */
authRouter.post(
  '/refresh',
  validateBody(refreshSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.refresh(req.body.refreshToken, req.headers['user-agent'], req.ip);
    res.json({ success: true, data: result });
  }),
);

authRouter.post(
  '/logout',
  validateBody(logoutSchema),
  asyncHandler(async (req, res) => {
    await authService.logout(req.body.refreshToken);
    res.json({ success: true });
  }),
);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Current user
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Authenticated user
 */
authRouter.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await authService.getMe(req.user!.id);
    res.json({ success: true, data: user });
  }),
);

authRouter.post(
  '/verify-email',
  validateBody(verifyEmailSchema),
  asyncHandler(async (req, res) => {
    await authService.verifyEmail(req.body.token);
    res.json({ success: true, message: 'Email verified.' });
  }),
);

authRouter.post(
  '/forgot-password',
  validateBody(forgotPasswordSchema),
  asyncHandler(async (req, res) => {
    await authService.forgotPassword(req.body.email);
    res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
  }),
);

authRouter.post(
  '/reset-password',
  validateBody(resetPasswordSchema),
  asyncHandler(async (req, res) => {
    await authService.resetPassword(req.body.token, req.body.password);
    res.json({ success: true, message: 'Password reset successfully.' });
  }),
);
