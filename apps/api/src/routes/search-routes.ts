import { Router } from 'express';
import { z } from 'zod';

import { EmailSearchService } from '../services/email-search-service.js';

export const searchRouter = Router();
const searchService = new EmailSearchService();
const searchSchema = z.object({ userId: z.string().cuid(), q: z.string().trim().max(200).default('') });

searchRouter.get('/search', async (request, response, next) => {
  try {
    const { userId, q } = searchSchema.parse({ userId: request.query.userId, q: request.query.q });
    response.json({ results: await searchService.search(userId, q) });
  } catch (error) { next(error); }
});
