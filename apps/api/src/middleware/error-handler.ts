import type { ErrorRequestHandler, RequestHandler } from 'express';

import { logger } from '../config/logger.js';
import { AppError } from '../errors/app-error.js';

export const notFoundHandler: RequestHandler = (request, response) => {
  response.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route ${request.method} ${request.path} was not found.`,
    },
  });
};

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof AppError) {
    response.status(error.statusCode).json({
      error: { code: error.code, message: error.message },
    });
    return;
  }

  logger.error({ err: error }, 'Unhandled API error');

  response.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
    },
  });
};
