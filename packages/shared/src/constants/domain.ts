export const serviceStatuses = ['ACTIVE', 'PAUSED', 'EXPIRED', 'DELETED'] as const;
export const supportedCurrencies = ['IRT', 'USDT', 'BTC', 'ETH', 'TRX'] as const;
export const queueNames = {
  notifications: 'notifications',
  referralRewards: 'referral-rewards',
  analyticsAggregation: 'analytics-aggregation',
  serviceLifecycle: 'service-lifecycle',
  ticketProcessing: 'ticket-processing',
  xraySync: 'xray-sync',
  audit: 'audit',
  provisionRetry: 'xray-sync',
  trafficSync: 'xray-sync',
} as const;

export const systemEventTypes = [
  'USER_CREATED',
  'REFERRAL_ACTIVATED',
  'PURCHASE_COMPLETED',
  'SERVICE_EXPIRING',
  'SERVICE_EXPIRED',
  'PAYMENT_SUCCESS',
  'TICKET_CREATED',
  'NOTIFICATION_SENT',
] as const;
