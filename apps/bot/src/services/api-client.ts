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

type ApiEnvelope<T> = { data: T };

export class ApiClient {
  public constructor(private readonly baseUrl = botConfig.API_BASE_URL) {}

  public async syncTelegramUser(input: TelegramUserSyncInput, correlationId?: string): Promise<TelegramUserDto> {
    const response = await fetch(`${this.baseUrl}/telegram/users/sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(correlationId ? { 'x-request-id': correlationId } : {}) },
      body: JSON.stringify(input),
    });
    if (!response.ok) throw new Error(`API sync failed with status ${response.status}`);
    const envelope = (await response.json()) as ApiEnvelope<TelegramUserDto>;
    return envelope.data;
  }
}

export const apiClient = new ApiClient();
