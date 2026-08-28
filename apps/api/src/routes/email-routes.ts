import { Router, type Request, type Response, type NextFunction } from 'express';

import { scheduleEmailsSchema, EmailSchedulingService } from '../services/email-scheduling-service.js';
import { requireAuth } from '../middleware/auth.js';
import { prisma } from '../config/database.js';

export const emailRouter = Router();

const emailSchedulingService = new EmailSchedulingService();

emailRouter.post('/schedule', requireAuth, async (request, response, next) => {
  try {
    const input = scheduleEmailsSchema.parse({ ...request.body, userId: request.userId });
    const result = await emailSchedulingService.schedule(input);
    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

const list = (status: 'SCHEDULED' | 'SENT' | 'FAILED') => async (request: Request, response: Response, next: NextFunction) => {
  try { response.json({ emails: await prisma.emailJob.findMany({ where: { userId: request.userId, status }, orderBy: { scheduledAt: 'asc' }, take: 100, select: { id: true, recipient: true, subject: true, scheduledAt: true, sentAt: true, status: true } }) }); } catch (error) { next(error); }
};
emailRouter.get('/scheduled', requireAuth, list('SCHEDULED'));
emailRouter.get('/sent', requireAuth, async (request, response, next) => { try { response.json({ emails: await prisma.emailJob.findMany({ where: { userId: request.userId, status: { in: ['SENT', 'FAILED'] } }, orderBy: { sentAt: 'desc' }, take: 100, select: { id: true, recipient: true, subject: true, scheduledAt: true, sentAt: true, status: true, previewUrl: true } }) }); } catch (error) { next(error); } });
