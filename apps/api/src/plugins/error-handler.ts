import { ZodError } from 'zod';

import { AppError } from '../core/errors/app-error.js';
import { toFailure } from '../core/http/api-response.js';

import type { FastifyPluginAsync } from 'fastify';

export const errorHandlerPlugin: FastifyPluginAsync = async (app) => {
  app.setErrorHandler((error, request, reply) => {
    request.log.error({ error }, 'Request failed');

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send(toFailure(error.code, error.message, request.id, error.details));
    }

    if (error instanceof ZodError) {
      return reply.status(400).send(toFailure('VALIDATION_ERROR', 'Validation failed', request.id, error.flatten()));
    }

    const statusCode = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
    return reply.status(statusCode).send(toFailure('INTERNAL_SERVER_ERROR', 'Unexpected server error', request.id));
  });
};
