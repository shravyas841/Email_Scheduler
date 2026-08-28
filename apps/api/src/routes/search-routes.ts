import { Router } from 'express';
import { z } from 'zod';

import { EmailSearchService } from '../services/email-search-service.js';
import { requireAuth } from '../middleware/auth.js';

export const searchRouter = Router();
const searchService = new EmailSearchService();
const searchSchema = z.object({ userId: z.string().cuid(), q: z.string().trim().max(200).default('') });

searchRouter.get('/search', requireAuth, async (request, response, next) => {
  try {
    const { q } = searchSchema.parse({ userId: request.userId, q: request.query.q });
    response.json({ results: await searchService.search(request.userId, q) });
  } catch (error) { next(error); }
});
