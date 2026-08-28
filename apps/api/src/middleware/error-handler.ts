import type { ErrorRequestHandler, RequestHandler } from 'express';

import { logger } from '../config/logger.js';

export const notFoundHandler: RequestHandler = (request, response) => {
  response.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route ${request.method} ${request.path} was not found.`,
    },
  });
};

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  logger.error({ err: error }, 'Unhandled API error');

  response.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
    },
  });
};
