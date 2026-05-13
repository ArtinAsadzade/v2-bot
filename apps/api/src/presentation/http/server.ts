import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { purchaseRequestSchema, adminWalletChargeSchema } from '@v2bot/shared';
import { env } from '../../config/env.js';
import { prisma } from '../../infrastructure/database/prisma.js';
import { XrayPanelClient } from '../../infrastructure/xray/xray-panel.client.js';
import { ProductService } from '../../modules/products/product.service.js';
import { PurchaseService } from '../../modules/purchases/purchase.service.js';
import { WalletService } from '../../modules/wallet/wallet.service.js';

export const buildServer = async () => {
  const app = Fastify({ logger: true });
  await app.register(helmet);
  await app.register(cors, { origin: true, credentials: true });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  await app.register(jwt, { secret: env.ADMIN_JWT_SECRET });

  const products = new ProductService(prisma);
  const purchases = new PurchaseService(prisma, new XrayPanelClient());
  const wallets = new WalletService(prisma);

  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error);
    const statusCode = error.validation ? 422 : 500;
    reply.status(statusCode).send({ message: statusCode === 500 ? 'Internal server error' : error.message });
  });

  app.get('/health', async () => ({ ok: true, service: 'v2bot-api' }));

  app.get('/admin/dashboard', async () => {
    const [users, activeServices, revenue] = await Promise.all([
      prisma.user.count(),
      prisma.xrayClient.count({ where: { status: 'ACTIVE' } }),
      prisma.purchase.aggregate({ _sum: { amountToman: true } }),
    ]);
    return {
      users,
      activeServices,
      revenueToman: revenue._sum.amountToman?.toString() ?? '0',
    };
  });

  app.get('/products', async () => products.listActive());

  app.post('/purchases', async (request) => {
    const body = purchaseRequestSchema.parse(request.body);
    const userId = String(request.headers['x-user-id'] ?? '');
    return purchases.buy({ userId, ...body });
  });

  app.post('/admin/wallets/charge', async (request) => {
    const body = adminWalletChargeSchema.parse(request.body);
    return wallets.credit({
      userId: body.userId,
      amountToman: BigInt(body.amountToman),
      reason: body.reason,
      idempotencyKey: `admin:${crypto.randomUUID()}`,
    });
  });

  return app;
};
