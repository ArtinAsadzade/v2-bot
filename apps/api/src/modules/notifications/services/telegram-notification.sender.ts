import { config } from '../../../config/index.js';
import { logger } from '../../../core/logger/logger.js';

export class TelegramNotificationSender {
  public async send(telegramId: string, text: string): Promise<string> {
    const url = `https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegramId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    const payload = (await response.json()) as { ok: boolean; result?: { message_id: number }; description?: string };
    if (!response.ok || !payload.ok) {
      logger.warn({ telegramId, description: payload.description }, 'telegram send failed');
      throw new Error(payload.description ?? 'Telegram send failed');
    }
    return String(payload.result?.message_id ?? '');
  }
}
