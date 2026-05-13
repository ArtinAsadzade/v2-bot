import fp from 'fastify-plugin';

import { prisma } from '../infrastructure/prisma/client.js';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: typeof prisma;
  }
}

export const prismaPlugin = fp(async (app) => {
  app.decorate('prisma', prisma);
  app.addHook('onClose', async () => {
    await prisma.$disconnect();
  });
});
