import {
  ProvisioningLogLevel,
  ServiceInstanceStatus,
  XrayClientStatus,
} from '@prisma/client';

import { AppError, NotFoundError } from '../../../core/errors/app-error.js';
import { ClientIdentityService } from '../../xray/services/client-identity.service.js';
import { XrayProvisionService } from '../../xray/services/xray-provision.service.js';
import { XraySubscriptionService } from '../../xray/services/xray-subscription.service.js';
import { XrayTrafficService } from '../../xray/services/xray-traffic.service.js';
import { detectLinkProtocol } from '../../xray/services/link-protocol.util.js';
import { ProvisioningRepository } from '../repositories/provisioning.repository.js';

import type { PrismaClient } from '@prisma/client';

export class ServiceLifecycleService {
  private readonly xrayProvision = new XrayProvisionService();
  private readonly xrayTraffic = new XrayTrafficService();
  private readonly xraySubscription = new XraySubscriptionService();

  public constructor(private readonly prisma: PrismaClient) {}

  public async listServices(userId: string) {
    const services = await new ProvisioningRepository(this.prisma).listUserServices(userId);
    return services.map((s) => ({
      id: s.id,
      status: s.status,
      trafficLimitGb: s.trafficLimitGb,
      usedBytes: s.usedBytes.toString(),
      expiresAt: s.expiresAt.toISOString(),
      productName: s.product.name,
      protocol: s.product.protocol,
      hasConfig: Boolean(s.xrayClient),
    }));
  }

  public async getService(userId: string, serviceId: string) {
    const service = await new ProvisioningRepository(this.prisma).findServiceForUser(
      serviceId,
      userId,
    );
    if (!service) throw new NotFoundError('Service');
    return service;
  }

  public async syncTraffic(serviceId: string) {
    const service = await this.prisma.serviceInstance.findUnique({
      where: { id: serviceId },
      include: { xrayClient: true, product: { include: { node: true } } },
    });
    if (!service?.xrayClient) throw new NotFoundError('Xray client');
    const snapshot = await this.xrayTraffic.fetchTraffic(
      service.xrayClient.email,
      service.trafficLimitGb,
      service.product.node?.baseUrl !== undefined ? { baseUrl: service.product.node.baseUrl } : {},
    );
    const status =
      snapshot.expiresAt && snapshot.expiresAt < new Date()
        ? ServiceInstanceStatus.EXPIRED
        : service.status;
    await this.prisma.$transaction([
      this.prisma.serviceInstance.update({
        where: { id: serviceId },
        data: {
          usedBytes: snapshot.usedBytes,
          lastSyncedAt: new Date(),
          status,
        },
      }),
      this.prisma.xrayClient.update({
        where: { id: service.xrayClient.id },
        data: {
          usedBytes: snapshot.usedBytes,
          lastSyncedAt: new Date(),
          status:
            status === ServiceInstanceStatus.EXPIRED
              ? XrayClientStatus.EXPIRED
              : service.xrayClient.status,
        },
      }),
      this.prisma.serviceUsageSnapshot.create({
        data: {
          serviceInstanceId: serviceId,
          usedBytes: snapshot.usedBytes,
          uploadBytes: snapshot.uploadBytes,
          downloadBytes: snapshot.downloadBytes,
          remainingBytes: snapshot.remainingBytes,
        },
      }),
    ]);
    return snapshot;
  }

  public async renew(input: {
    serviceId: string;
    userId: string;
    extraDays: number;
    extraTrafficGb?: number;
  }) {
    const service = await new ProvisioningRepository(this.prisma).findServiceForUser(
      input.serviceId,
      input.userId,
    );
    if (!service?.xrayClient) throw new NotFoundError('Service');
    const newExpires = new Date(service.expiresAt.getTime() + input.extraDays * 86_400_000);
    const trafficGb = input.extraTrafficGb
      ? service.trafficLimitGb + input.extraTrafficGb
      : service.trafficLimitGb;
    const identity = new ClientIdentityService().generate({
      userId: service.userId,
      productSlug: service.product.slug,
      purchaseId: service.purchaseId,
    });
    identity.clientUuid = service.xrayClient.clientUuid;
    identity.email = service.xrayClient.email;
    identity.subscriptionId = service.xrayClient.subscriptionId;
    await this.xrayProvision.updateClient({
      inboundId: service.inboundId,
      panelClientId: service.xrayClient.panelClientId ?? service.xrayClient.clientUuid,
      identity,
      trafficGb,
      durationDays: Math.ceil((newExpires.getTime() - Date.now()) / 86_400_000),
      ...(service.product.node?.baseUrl !== undefined ? { baseUrl: service.product.node.baseUrl } : {}),
    });
    return this.prisma.serviceInstance.update({
      where: { id: service.id },
      data: {
        expiresAt: newExpires,
        trafficLimitGb: trafficGb,
        status: ServiceInstanceStatus.ACTIVE,
      },
      include: { xrayClient: true, product: true },
    });
  }

  public async suspend(serviceId: string, userId: string) {
    return this.setEnabled(serviceId, userId, false, ServiceInstanceStatus.SUSPENDED);
  }

  public async resume(serviceId: string, userId: string) {
    return this.setEnabled(serviceId, userId, true, ServiceInstanceStatus.ACTIVE);
  }

  public async delete(serviceId: string, userId: string) {
    const service = await new ProvisioningRepository(this.prisma).findServiceForUser(
      serviceId,
      userId,
    );
    if (!service?.xrayClient) throw new NotFoundError('Service');
    if (service.xrayClient.panelClientId) {
      await this.xrayProvision.deleteClient({
        inboundId: service.inboundId,
        panelClientId: service.xrayClient.panelClientId,
        ...(service.product.node?.baseUrl !== undefined ? { baseUrl: service.product.node.baseUrl } : {}),
      });
    }
    await this.prisma.$transaction([
      this.prisma.serviceInstance.update({
        where: { id: serviceId },
        data: { status: ServiceInstanceStatus.DELETED, deletedAt: new Date() },
      }),
      this.prisma.xrayClient.update({
        where: { id: service.xrayClient.id },
        data: { status: XrayClientStatus.DELETED, deletedAt: new Date() },
      }),
    ]);
    return { deleted: true };
  }

  public async regenerateLinks(serviceId: string, userId: string) {
    const service = await new ProvisioningRepository(this.prisma).findServiceForUser(
      serviceId,
      userId,
    );
    if (!service?.xrayClient) throw new NotFoundError('Service');
    const panelOpts =
      service.product.node?.baseUrl !== undefined ? { baseUrl: service.product.node.baseUrl } : {};
    const configLinks = await this.xraySubscription.fetchConfigLinks(
      service.inboundId,
      service.xrayClient.email,
      panelOpts,
    );
    const subLinks = await this.xraySubscription.fetchSubscriptionLinks(
      service.xrayClient.subscriptionId,
      panelOpts,
    );
    const subscriptionUrl = subLinks[0] ?? service.xrayClient.subscriptionUrl;
    await this.prisma.$transaction(async (tx) => {
      await tx.configLink.deleteMany({ where: { xrayClientId: service.xrayClient!.id } });
      await tx.subscriptionLink.deleteMany({ where: { xrayClientId: service.xrayClient!.id } });
      await tx.configLink.createMany({
        data: configLinks.map((url) => ({
          xrayClientId: service.xrayClient!.id,
          protocol: detectLinkProtocol(url),
          url,
        })),
      });
      await tx.subscriptionLink.createMany({
        data: subLinks.map((url, index) => ({
          xrayClientId: service.xrayClient!.id,
          protocol: detectLinkProtocol(url),
          url,
          isPrimary: index === 0,
        })),
      });
      await tx.xrayClient.update({
        where: { id: service.xrayClient!.id },
        data: { configLinks, subscriptionUrl },
      });
    });
    return { configLinks, subscriptionUrl, subLinks };
  }

  private async setEnabled(
    serviceId: string,
    userId: string,
    enable: boolean,
    status: ServiceInstanceStatus,
  ) {
    const service = await new ProvisioningRepository(this.prisma).findServiceForUser(
      serviceId,
      userId,
    );
    if (!service?.xrayClient) throw new NotFoundError('Service');
    if (!service.xrayClient.panelClientId) {
      throw new AppError('Panel client id missing', 'PANEL_CLIENT_MISSING', 409);
    }
    const identity = {
      clientUuid: service.xrayClient.clientUuid,
      email: service.xrayClient.email,
      subscriptionId: service.xrayClient.subscriptionId,
      tags: {},
    };
    await this.xrayProvision.updateClient({
      inboundId: service.inboundId,
      panelClientId: service.xrayClient.panelClientId,
      identity,
      trafficGb: service.trafficLimitGb,
      durationDays: Math.max(
        1,
        Math.ceil((service.expiresAt.getTime() - Date.now()) / 86_400_000),
      ),
      enable,
      ...(service.product.node?.baseUrl !== undefined ? { baseUrl: service.product.node.baseUrl } : {}),
    });
    await this.prisma.serviceInstance.update({
      where: { id: serviceId },
      data: { status },
    });
    await this.prisma.xrayClient.update({
      where: { id: service.xrayClient.id },
      data: { status: enable ? XrayClientStatus.ACTIVE : XrayClientStatus.PAUSED },
    });
    return { status };
  }
}
