import { botConfig } from '../config/env.js';

export type TelegramUserSyncInput = {
  telegramId: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  languageCode?: string;
  referralCode?: string;
};

export type TelegramUserDto = {
  id: string;
  telegramId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  languageCode: string | null;
  referralCode: string;
  referralCount: number;
  createdAt: string;
};

export type WalletDto = {
  balanceToman: string;
  frozenBalanceToman: string;
  lifetimeDepositsToman: string;
  lifetimeSpendingToman: string;
};

export type ProductDto = {
  id: string;
  name: string;
  slug: string;
  protocol: string;
  category: string;
  priceToman: string;
  trafficGb: number;
  durationDays: number;
  nodeRegion: string | null;
};

export type PricingQuoteDto = {
  trafficGb: number;
  pricePerGbToman: string;
  baseAmountToman: string;
  discountToman: string;
  finalAmountToman: string;
};

export type PurchaseDraftDto = {
  id: string;
  productId: string;
  trafficGb: number;
  finalAmountToman: string;
  status: string;
  expiresAt: string;
};

export type ProvisionResultDto = {
  service: {
    id: string;
    status: string;
    trafficLimitGb: number;
    usedBytes: string;
    expiresAt: string;
    product: { id: string; name: string; protocol: string };
  };
  subscription: {
    subscriptionUrl: string;
    configLinks: Array<{ protocol: string; url: string; label: string | null }>;
    subscriptionLinks: Array<{ protocol: string; url: string; isPrimary: boolean }>;
  } | null;
};

export type ReferralStatsDto = {
  referralCode: string;
  inviteLink: string;
  totalInvites: number;
  rewardedCount: number;
  pendingCount: number;
  totalRewardToman: string;
};

export type TicketSummaryDto = {
  id: string;
  subject: string;
  status: string;
  category: string;
  updatedAt: string;
};

export type NotificationDto = {
  id: string;
  type: string;
  title: string;
  body: string;
  status: string;
  sentAt: string | null;
  createdAt: string;
};

export type EngagementProfileDto = {
  activityScore: number;
  level: number;
  streakDays: number;
  lastLoginAt: string | null;
};

export type ServiceSummaryDto = {
  id: string;
  status: string;
  trafficLimitGb: number;
  usedBytes: string;
  expiresAt: string;
  productName: string;
  protocol: string;
  hasConfig: boolean;
};

type ApiEnvelope<T> = { data: T };
type ApiFailure = { error: { code: string; message: string } };

export class ApiClient {
  public constructor(private readonly baseUrl = botConfig.API_BASE_URL) {}

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    correlationId?: string,
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(correlationId ? { 'x-request-id': correlationId } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = (await response.json()) as ApiEnvelope<T> | ApiFailure;
    if (!response.ok) {
      const message =
        'error' in payload && payload.error?.message
          ? payload.error.message
          : `API request failed (${response.status})`;
      throw new Error(message);
    }
    return (payload as ApiEnvelope<T>).data;
  }

  public syncTelegramUser(
    input: TelegramUserSyncInput,
    correlationId?: string,
  ): Promise<TelegramUserDto> {
    return this.request('POST', '/telegram/users/sync', input, correlationId);
  }

  public getWallet(userId: string, correlationId?: string): Promise<WalletDto> {
    return this.request('GET', `/wallets/${userId}`, undefined, correlationId);
  }

  public listProducts(correlationId?: string): Promise<ProductDto[]> {
    return this.request('GET', '/products', undefined, correlationId);
  }

  public calculatePricing(
    input: { trafficGb: number; couponCode?: string },
    correlationId?: string,
  ): Promise<PricingQuoteDto> {
    return this.request('POST', '/pricing/calculate', input, correlationId);
  }

  public createPurchaseDraft(
    input: {
      userId: string;
      productId: string;
      trafficGb: number;
      reserveFunds: boolean;
      idempotencyKey: string;
      couponCode?: string;
    },
    correlationId?: string,
  ): Promise<PurchaseDraftDto> {
    return this.request('POST', '/purchases/drafts', input, correlationId);
  }

  public finalizePurchase(
    input: {
      userId: string;
      draftId: string;
      idempotencyKey: string;
      telegramId?: string;
    },
    correlationId?: string,
  ): Promise<ProvisionResultDto> {
    return this.request('POST', '/purchases/finalize', input, correlationId);
  }

  public listServices(userId: string, correlationId?: string): Promise<ServiceSummaryDto[]> {
    return this.request('GET', `/services/${userId}`, undefined, correlationId);
  }

  public getService(
    userId: string,
    serviceId: string,
    correlationId?: string,
  ): Promise<Record<string, unknown>> {
    return this.request('GET', `/services/${userId}/${serviceId}`, undefined, correlationId);
  }

  public getReferralStats(userId: string, correlationId?: string): Promise<ReferralStatsDto> {
    return this.request('GET', `/referrals/${userId}/stats`, undefined, correlationId);
  }

  public listTickets(userId: string, correlationId?: string): Promise<TicketSummaryDto[]> {
    return this.request('GET', `/tickets/user/${userId}`, undefined, correlationId);
  }

  public createTicket(
    input: {
      userId: string;
      subject: string;
      body: string;
      category: 'PAYMENT' | 'TECHNICAL' | 'ACCOUNT' | 'GENERAL';
      idempotencyKey: string;
    },
    correlationId?: string,
  ): Promise<{ id: string; subject: string; status: string }> {
    return this.request('POST', '/tickets', input, correlationId);
  }

  public listNotifications(userId: string, correlationId?: string): Promise<NotificationDto[]> {
    return this.request('GET', `/notifications/${userId}`, undefined, correlationId);
  }

  public recordEngagementLogin(
    userId: string,
    correlationId?: string,
  ): Promise<EngagementProfileDto> {
    return this.request('POST', `/engagement/${userId}/login`, {}, correlationId);
  }

  public regenerateLinks(
    userId: string,
    serviceId: string,
    correlationId?: string,
  ): Promise<Record<string, unknown>> {
    return this.request(
      'POST',
      `/services/${userId}/${serviceId}/regenerate-links`,
      {},
      correlationId,
    );
  }
}

export const apiClient = new ApiClient();
