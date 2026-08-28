import pino from 'pino';

import { environment } from './environment.js';

export const logger = pino({
  level: environment.NODE_ENV === 'production' ? 'info' : 'debug',
  transport:
    environment.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:standard' },
        }
      : undefined,
});
