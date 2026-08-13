import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import swaggerUi from 'swagger-ui-express';

import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { swaggerSpec } from './config/swagger.js';
import { authLimiter, apiLimiter, publicLimiter } from './config/rateLimit.js';

import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

import { healthRouter } from './routes/health.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { orgRouter } from './routes/org.routes.js';
import { monitorRouter } from './routes/monitor.routes.js';
import { incidentRouter } from './routes/incident.routes.js';
import { dashboardRouter } from './routes/dashboard.routes.js';
import { statusPageRouter } from './routes/status-page.routes.js';
import { publicRouter } from './routes/public.routes.js';
import { apiKeyRouter } from './routes/api-key.routes.js';
import { apiV1Router } from './routes/api-v1.routes.js';
import { resourcesRouter } from './routes/resources.routes.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: env.corsOrigins, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(pinoHttp({ logger, autoLogging: env.isProd }));

  app.use('/api/health', healthRouter);
  app.use('/api/auth', authLimiter, authRouter);

  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get('/api/docs.json', (_req, res) => res.json(swaggerSpec));

  // Public, unauthenticated endpoints.
  app.use('/api/public', publicLimiter, publicRouter);

  // Authenticated, organization-scoped endpoints.
  app.use('/api/orgs', apiLimiter, orgRouter);
  app.use('/api/orgs/:organizationId/monitors', apiLimiter, monitorRouter);
  app.use('/api/orgs/:organizationId/incidents', apiLimiter, incidentRouter);
  app.use('/api/orgs/:organizationId/dashboard', apiLimiter, dashboardRouter);
  app.use('/api/orgs/:organizationId/status-pages', apiLimiter, statusPageRouter);
  app.use('/api/orgs/:organizationId/api-keys', apiLimiter, apiKeyRouter);
  app.use('/api/orgs/:organizationId', apiLimiter, resourcesRouter);

  // Organization API (API-key authenticated).
  app.use('/api/v1', apiLimiter, apiV1Router);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
