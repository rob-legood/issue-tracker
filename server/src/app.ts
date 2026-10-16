import express, { Router } from 'express';
import type { Express } from 'express';
import { healthRouter } from './routes/health.ts';
import { errorHandler, notFound } from './middleware/errors.ts';

/**
 * Builds the Express app without connecting to a database or listening,
 * so tests can drive it with Supertest. `extend` lets tests mount extra
 * routes before the 404 and error handlers.
 */
export function createApp(extend?: (api: Router) => void): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  const api = Router();
  api.use(healthRouter);
  extend?.(api);
  api.use(notFound);

  app.use('/api', api);
  app.use(errorHandler);

  return app;
}
