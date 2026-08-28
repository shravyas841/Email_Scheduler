import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { prisma } from '../config/database.js';
import { z } from 'zod';

export const senderRouter = Router();
senderRouter.use(requireAuth);
senderRouter.get('/', async (request, response, next) => { try { response.json({ senders: await prisma.sender.findMany({ where: { userId: request.userId, isActive: true }, select: { id: true, email: true, displayName: true, hourlyLimit: true, minimumDelayMs: true } }) }); } catch (error) { next(error); } });
senderRouter.post('/', async (request, response, next) => { try { const input = z.object({ email: z.string().email(), displayName: z.string().trim().min(1).max(120) }).parse(request.body); const sender = await prisma.sender.create({ data: { userId: request.userId, email: input.email.toLowerCase(), displayName: input.displayName }, select: { id: true, email: true, displayName: true } }); response.status(201).json({ sender }); } catch (error) { next(error); } });
