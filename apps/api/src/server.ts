import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { environment } from './config/environment.js';
import { logger } from './config/logger.js';

const app = createApp();

await connectDatabase();

const server = app.listen(environment.PORT, () => {
  logger.info({ port: environment.PORT }, 'API server started');
});

const shutdown = (signal: string) => {
  logger.info({ signal }, 'API server shutting down');
  server.close(async (error) => {
    if (error) {
      logger.error({ err: error }, 'API server shutdown failed');
      process.exitCode = 1;
    }

    await disconnectDatabase();
  });
};

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
