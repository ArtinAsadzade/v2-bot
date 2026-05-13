export const serviceStatuses = ['ACTIVE', 'PAUSED', 'EXPIRED', 'DELETED'] as const;
export const supportedCurrencies = ['IRT', 'USDT', 'BTC', 'ETH', 'TRX'] as const;
export const queueNames = {
  notifications: 'notifications',
  xraySync: 'xray-sync',
  audit: 'audit',
} as const;
