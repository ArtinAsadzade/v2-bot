import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';

import { config } from '../config/index.js';

import type { FastifyPluginAsync } from 'fastify';

export const securityPlugin: FastifyPluginAsync = async (app) => {
  await app.register(helmet, { global: true });
  await app.register(cors, { origin: config.api.corsOrigins, credentials: true });
  await app.register(cookie, { secret: config.jwt.refreshSecret, hook: 'onRequest' });
  await app.register(jwt, { secret: config.jwt.accessSecret });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
};
