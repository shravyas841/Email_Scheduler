import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { prisma } from '../config/database.js';

export const senderRouter = Router();
senderRouter.use(requireAuth);
senderRouter.get('/', async (request, response, next) => { try { response.json({ senders: await prisma.sender.findMany({ where: { userId: request.userId, isActive: true }, select: { id: true, email: true, displayName: true, hourlyLimit: true, minimumDelayMs: true } }) }); } catch (error) { next(error); } });
