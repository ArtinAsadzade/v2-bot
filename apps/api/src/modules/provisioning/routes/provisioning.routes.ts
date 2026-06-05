import { ok } from '@v2bot/shared';

import { ValidationAppError } from '../../../core/errors/app-error.js';
import { serializeFinancial } from '../../finance/services/serializer.js';
import { ProductService } from '../../catalog/services/product.service.js';
import { PricingService } from '../../finance/services/pricing.service.js';
import { PurchaseProvisionService } from '../services/purchase-provision.service.js';
import { ServiceLifecycleService } from '../services/service-lifecycle.service.js';
import {
  createDraftWithProductSchema,
  finalizePurchaseSchema,
  renewServiceSchema,
  serviceParamsSchema,
  userIdParamsSchema,
} from '../validators/provisioning.validators.js';

import type { FastifyPluginAsync } from 'fastify';

export const provisioningRoutes: FastifyPluginAsync = async (app) => {
  app.get('/products', async () => {
    const products = await new ProductService(app.prisma).listActive();
    return ok(
      serializeFinancial(
        products.map((p) => ({
          id: p.id,
          name: p.name,
          slug: p.slug,
          description: p.description,
          inboundId: p.inboundId,
          protocol: p.protocol,
          category: p.category,
          priceToman: p.priceToman,
          trafficGb: p.trafficGb,
          durationDays: p.durationDays,
          pricingStrategy: p.pricingStrategy,
          nodeRegion: p.node?.region ?? null,
        })),
      ),
    );
  });

  app.get('/products/:productId', async (request) => {
    const productId = (request.params as { productId: string }).productId;
    const product = await new ProductService(app.prisma).getById(productId);
    return ok(serializeFinancial(product));
  });

  app.post('/purchases/drafts/with-product', async (request) => {
    const parsed = createDraftWithProductSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationAppError(parsed.error.flatten());
    await new ProductService(app.prisma).getById(parsed.data.productId);
    const draft = await new PricingService(app.prisma).createPurchaseDraft(parsed.data);
    return ok(serializeFinancial(draft));
  });

  app.post('/purchases/finalize', async (request) => {
    const parsed = finalizePurchaseSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationAppError(parsed.error.flatten());
    const result = await new PurchaseProvisionService(app.prisma).finalize(parsed.data);
    return ok(serializeFinancial(result));
  });

  app.get('/services/:userId', async (request) => {
    const parsed = userIdParamsSchema.safeParse(request.params);
    if (!parsed.success) throw new ValidationAppError(parsed.error.flatten());
    const services = await new ServiceLifecycleService(app.prisma).listServices(parsed.data.userId);
    return ok(serializeFinancial(services));
  });

  app.get('/services/:userId/:serviceId', async (request) => {
    const parsed = serviceParamsSchema.safeParse(request.params);
    if (!parsed.success) throw new ValidationAppError(parsed.error.flatten());
    const service = await new ServiceLifecycleService(app.prisma).getService(
      parsed.data.userId,
      parsed.data.serviceId,
    );
    return ok(serializeFinancial(service));
  });

  app.post('/services/:userId/:serviceId/sync-traffic', async (request) => {
    const parsed = serviceParamsSchema.safeParse(request.params);
    if (!parsed.success) throw new ValidationAppError(parsed.error.flatten());
    const snapshot = await new ServiceLifecycleService(app.prisma).syncTraffic(parsed.data.serviceId);
    return ok(serializeFinancial(snapshot));
  });

  app.post('/services/:userId/:serviceId/renew', async (request) => {
    const params = serviceParamsSchema.safeParse(request.params);
    const body = renewServiceSchema.safeParse(request.body);
    if (!params.success || !body.success)
      throw new ValidationAppError({
        params: params.success ? undefined : params.error.flatten(),
        body: body.success ? undefined : body.error.flatten(),
      });
    const updated = await new ServiceLifecycleService(app.prisma).renew({
      serviceId: params.data.serviceId,
      userId: params.data.userId,
      ...body.data,
    });
    return ok(serializeFinancial(updated));
  });

  app.post('/services/:userId/:serviceId/suspend', async (request) => {
    const parsed = serviceParamsSchema.safeParse(request.params);
    if (!parsed.success) throw new ValidationAppError(parsed.error.flatten());
    return ok(
      serializeFinancial(
        await new ServiceLifecycleService(app.prisma).suspend(
          parsed.data.serviceId,
          parsed.data.userId,
        ),
      ),
    );
  });

  app.post('/services/:userId/:serviceId/resume', async (request) => {
    const parsed = serviceParamsSchema.safeParse(request.params);
    if (!parsed.success) throw new ValidationAppError(parsed.error.flatten());
    return ok(
      serializeFinancial(
        await new ServiceLifecycleService(app.prisma).resume(
          parsed.data.serviceId,
          parsed.data.userId,
        ),
      ),
    );
  });

  app.post('/services/:userId/:serviceId/regenerate-links', async (request) => {
    const parsed = serviceParamsSchema.safeParse(request.params);
    if (!parsed.success) throw new ValidationAppError(parsed.error.flatten());
    return ok(
      serializeFinancial(
        await new ServiceLifecycleService(app.prisma).regenerateLinks(
          parsed.data.serviceId,
          parsed.data.userId,
        ),
      ),
    );
  });

  app.delete('/services/:userId/:serviceId', async (request) => {
    const parsed = serviceParamsSchema.safeParse(request.params);
    if (!parsed.success) throw new ValidationAppError(parsed.error.flatten());
    return ok(
      serializeFinancial(
        await new ServiceLifecycleService(app.prisma).delete(
          parsed.data.serviceId,
          parsed.data.userId,
        ),
      ),
    );
  });
};
