import { Router } from 'express';

import { prisma } from '../config/database.js';

export const healthRouter = Router();

healthRouter.get('/', async (_request, response, next) => {
  try {
    await prisma.user.count();

    response.status(200).json({
      status: 'ok',
      service: 'reachinbox-api',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});
