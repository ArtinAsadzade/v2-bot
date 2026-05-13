import { randomUUID } from 'node:crypto';

import fp from 'fastify-plugin';

export const correlationIdPlugin = fp(async (app) => {
  app.addHook('onRequest', async (request, reply) => {
    const incoming = request.headers['x-request-id'];
    const requestId = typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();
    request.id = requestId;
    reply.header('x-request-id', requestId);
  });
});
