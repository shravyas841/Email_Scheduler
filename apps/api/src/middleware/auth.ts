import type { RequestHandler } from 'express';
import { AppError } from '../errors/app-error.js';

export const requireAuth: RequestHandler = (request, _response, next) => {
  if (!request.session.userId) return next(new AppError(401, 'UNAUTHENTICATED', 'Authentication required.'));
  request.userId = request.session.userId;
  next();
};
