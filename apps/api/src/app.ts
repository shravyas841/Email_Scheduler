import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';

import { environment } from './config/environment.js';
import { logger } from './config/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { emailRouter } from './routes/email-routes.js';
import { searchRouter } from './routes/search-routes.js';
import { healthRouter } from './routes/health-routes.js';
import { emailSendQueue } from './queues/email-send-queue.js';

const boardAdapter = new ExpressAdapter();
boardAdapter.setBasePath('/admin/queues');
createBullBoard({ queues: [new BullMQAdapter(emailSendQueue)], serverAdapter: boardAdapter });

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
  app.use('/admin/queues', boardAdapter.getRouter());

  app.use('/health', healthRouter);
  app.use('/api/emails', emailRouter);
  app.use('/api/emails', searchRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
