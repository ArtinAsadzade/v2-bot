import { createHmac, timingSafeEqual } from 'node:crypto';

import axios from 'axios';
import Decimal from 'decimal.js';

import { config } from '../../../config/index.js';

import type {
  CreateInvoiceInput,
  ParsedWebhook,
  PaymentProvider,
  PaymentVerification,
  ProviderInvoice,
} from './payment-provider.js';

export class MockTrc20PaymentProvider implements PaymentProvider {
  public readonly name = config.cryptoPayments.provider || 'mock-trc20';

  public async createInvoice(input: CreateInvoiceInput): Promise<ProviderInvoice> {
    // Adapter seam: real providers can use axios here; mock keeps tests deterministic.
    await Promise.resolve(axios.defaults.timeout);
    const assetAmount = new Decimal(input.amountToman.toString())
      .div(60_000)
      .toDecimalPlaces(6, Decimal.ROUND_UP)
      .toFixed(6);
    return {
      provider: this.name,
      providerInvoiceId: `inv_${input.invoiceId}`,
      assetAmount,
      payAddress: 'TMockUsdtTrc20DepositAddressxxxxxxxx',
      requiredConfirmations: 20,
      metadata: { deterministic: true, network: input.network, asset: input.asset },
    };
  }

  public async verifyPayment(_providerInvoiceId: string): Promise<PaymentVerification> {
    return { paid: false, confirmations: 0, raw: { provider: this.name, deterministic: true } };
  }

  public verifyWebhookSignature(payload: string, signature: string, timestamp: string): boolean {
    const age = Math.abs(Date.now() - Number(timestamp));
    if (!Number.isFinite(age) || age > 5 * 60_000) return false;
    const digest = createHmac('sha256', config.cryptoPayments.webhookSecret)
      .update(`${timestamp}.${payload}`)
      .digest('hex');
    const left = Buffer.from(digest);
    const right = Buffer.from(signature);
    return left.length === right.length && timingSafeEqual(left, right);
  }

  public parseWebhook(payload: unknown): ParsedWebhook {
    const body = payload as Record<string, unknown>;
    return {
      eventId: String(body.eventId ?? body.id ?? ''),
      providerInvoiceId: body.providerInvoiceId ? String(body.providerInvoiceId) : undefined,
      invoiceId: body.invoiceId ? String(body.invoiceId) : undefined,
      txHash: body.txHash ? String(body.txHash) : undefined,
      confirmations: typeof body.confirmations === 'number' ? body.confirmations : undefined,
      paid: typeof body.paid === 'boolean' ? body.paid : undefined,
    };
  }
}
