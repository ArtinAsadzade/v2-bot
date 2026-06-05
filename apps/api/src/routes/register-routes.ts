import { adminPhase5Routes } from '../modules/admin/routes/admin-phase5.routes.js';
import { engagementRoutes } from '../modules/engagement/routes/engagement.routes.js';
import { financeRoutes } from '../modules/finance/routes/finance.routes.js';
import { notificationRoutes } from '../modules/notifications/routes/notification.routes.js';
import { provisioningRoutes } from '../modules/provisioning/routes/provisioning.routes.js';
import { referralRoutes } from '../modules/referrals/routes/referral.routes.js';
import { healthRoutes } from '../modules/health/routes/health.routes.js';
import { telegramUserRoutes } from '../modules/telegram/routes/telegram-user.routes.js';
import { ticketRoutes } from '../modules/support/routes/ticket.routes.js';
import { userRoutes } from '../modules/users/routes/user.routes.js';

import type { FastifyInstance } from 'fastify';

export const registerRoutes = async (app: FastifyInstance): Promise<void> => {
  await app.register(healthRoutes, { prefix: '/v1' });
  await app.register(userRoutes, { prefix: '/v1' });
  await app.register(telegramUserRoutes, { prefix: '/v1' });
  await app.register(financeRoutes, { prefix: '/v1' });
  await app.register(provisioningRoutes, { prefix: '/v1' });
  await app.register(referralRoutes, { prefix: '/v1' });
  await app.register(notificationRoutes, { prefix: '/v1' });
  await app.register(ticketRoutes, { prefix: '/v1' });
  await app.register(engagementRoutes, { prefix: '/v1' });
  await app.register(adminPhase5Routes, { prefix: '/v1' });
};
