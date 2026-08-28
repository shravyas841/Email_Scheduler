import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';

import { environment } from './config/environment.js';
import { logger } from './config/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { emailRouter } from './routes/email-routes.js';
import { healthRouter } from './routes/health-routes.js';

export const createApp = () => {
  const app = express();

  app.use(pinoHttp({ logger }));
  app.use(helmet());
  app.use(
    cors({
      origin: environment.FRONTEND_URL,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  app.use('/health', healthRouter);
  app.use('/api/emails', emailRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
