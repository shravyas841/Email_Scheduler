import { Router } from 'express';

import { scheduleEmailsSchema, EmailSchedulingService } from '../services/email-scheduling-service.js';

export const emailRouter = Router();

const emailSchedulingService = new EmailSchedulingService();

emailRouter.post('/schedule', async (request, response, next) => {
  try {
    const input = scheduleEmailsSchema.parse(request.body);
    const result = await emailSchedulingService.schedule(input);
    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
});
