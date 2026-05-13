import { MockTrc20PaymentProvider } from './mock-trc20.provider.js';

import type { PaymentProvider } from './payment-provider.js';

export const createPaymentProvider = (): PaymentProvider => new MockTrc20PaymentProvider();
