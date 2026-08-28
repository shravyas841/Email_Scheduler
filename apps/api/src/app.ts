import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import session from 'express-session';
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
import { authRouter } from './routes/auth-routes.js';
import { slackRouter } from './routes/slack-routes.js';
import { senderRouter } from './routes/sender-routes.js';
import { requireAuth } from './middleware/auth.js';

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
  app.use(session({ secret: environment.SESSION_SECRET, resave: false, saveUninitialized: false, cookie: { httpOnly: true, sameSite: 'lax', secure: environment.NODE_ENV === 'production', maxAge: 86_400_000 } }));
  app.use('/admin/queues', requireAuth, boardAdapter.getRouter());

  app.use('/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/slack', slackRouter);
  app.use('/api/senders', senderRouter);
  app.use('/api/emails', emailRouter);
  app.use('/api/emails', searchRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
