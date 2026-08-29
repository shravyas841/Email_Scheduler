import { Prisma, PrismaClient } from '@prisma/client';

import { logger } from './logger.js';

export const prisma = new PrismaClient({
  log: [{ emit: 'event', level: 'error' }],
});

prisma.$on('error', (event: Prisma.LogEvent) => {
  logger.error({ message: event.message }, 'Prisma database error');
});

export const connectDatabase = async () => {
  await prisma.$connect();
  logger.info('PostgreSQL connection established');
};

export const disconnectDatabase = async () => {
  await prisma.$disconnect();
  logger.info('PostgreSQL connection closed');
};
