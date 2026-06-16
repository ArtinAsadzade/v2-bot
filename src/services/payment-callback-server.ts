import http from "http";
import { PaymentInvoiceService } from "../modules/payment/payment.service";
import { prisma } from "./prisma";
import { logger } from "./logger";
import type { AppBot } from "../types/bot";
import { paymentFailureKeyboard, paymentSuccessKeyboard } from "../bot/keyboards/design-system";
import { composeCustomEmojiMessage, customEmoji } from "../bot/keyboards/custom-emoji";
import { errorMessage, purchaseSuccessMessage, walletSummaryMessage } from "../utils/messages";
import { callbackFor } from "../bot/navigation/panel-ui";

const money = (value: number) => `${value.toLocaleString("fa-IR")} تومان`;

function parsedCallbackUrl(req: http.IncomingMessage) {
  return new URL(req.url ?? "/", "http://localhost");
}

type CallbackReference = { token?: string; invoice?: string; invoice_id?: string; pay_id?: string };

type PaymentNotificationPayload = {
  invoice: { id: string; userId: string; amount: number };
  type?: string;
  user?: { balance: number };
  product?: { id: string; title: string; mode?: string };
  account?: {
    id: string;
    username: string | null;
    subscriptionLink: string | null;
    configLink: string | null;
    config: string | null;
  };
  order?: unknown;
  orderItem?: {
    id?: string;
    xrayClientId?: string | null;
    deliveredConfig?: string | null;
    deliveredConfigLink?: string | null;
    deliveredSubscriptionLink?: string | null;
    expiresAt?: Date | string | null;
  } | null;
  xrayClient?: { id: string; clientEmail: string; expiresAt?: Date | string | null };
  renewal?: { id: string; newExpiry?: Date };
  expiresAt?: Date | string | null;
  error?: string;
};

function callbackReferenceFromUrl(url: URL): CallbackReference {
  return {
    token: url.searchParams.get("token") ?? undefined,
    invoice: url.searchParams.get("invoice") ?? undefined,
    invoice_id: url.searchParams.get("invoice_id") ?? undefined,
    pay_id: url.searchParams.get("pay_id") ?? undefined,
  };
}

function callbackQueryMetadata(url: URL) {
  return Object.fromEntries(url.searchParams.entries());
}

export async function notifyUser(bot: AppBot, result: unknown) {
  if (!result || typeof result !== "object" || !("invoice" in result)) return;
  const payload = result as PaymentNotificationPayload;
  const invoice = payload.invoice;
  const user = await prisma.user.findUnique({ where: { id: invoice.userId } });
  if (!user) return;

  try {
    logger.info("PAYMENT NOTIFY USER", {
      invoiceId: invoice.id,
      userId: invoice.userId,
      payloadType: payload.type,
      hasProduct: Boolean(payload.product),
      hasAccount: Boolean(payload.account),
    });

    if ("error" in payload) {
      const failure = composeCustomEmojiMessage([
        customEmoji("❌", "TELEGRAM_EMOJI_ERROR_ID"),
        " ",
        errorMessage(
          "پرداخت ثبت شد اما تحویل ناموفق بود",
          "پرداخت شما با موفقیت ثبت شد، اما تحویل اکانت با مشکل مواجه شد.",
          "پشتیبانی بررسی می‌کند و نتیجه را اطلاع می‌دهد.",
        ),
      ]);
      await bot.telegram.sendMessage(Number(user.telegramId), failure.text, { ...paymentFailureKeyboard(), entities: failure.entities });
      await PaymentInvoiceService.markNotification(invoice.id, "SENT", { type: "failed", error: payload.error });
      return;
    }

    if (payload.type === "WALLET_TOPUP" && "user" in payload && payload.user) {
      const success = composeCustomEmojiMessage([
        customEmoji("✅", "TELEGRAM_EMOJI_SUCCESS_ID"),
        " ",
        walletSummaryMessage(payload.user.balance, `مبلغ شارژ شده: ${money(invoice.amount)}`),
      ]);
      await bot.telegram.sendMessage(Number(user.telegramId), success.text, { ...paymentSuccessKeyboard("wallet"), entities: success.entities });
      await PaymentInvoiceService.markNotification(invoice.id, "SENT", {
        type: "wallet_topup",
        amount: invoice.amount,
        balance: payload.user.balance,
      });
      return;
    }

    if (payload.type === "XRAY_RENEWAL" && payload.xrayClient) {
      await bot.telegram.sendMessage(Number(user.telegramId), `✅ تمدید سرویس Xray با موفقیت انجام شد.\n\nشناسه: ${payload.xrayClient.clientEmail}`, {
        reply_markup: { inline_keyboard: [[{ text: "🧩 مشاهده سرویس", callback_data: `nav:account.xray?xid=${payload.xrayClient.id}` }]] },
      });
      await PaymentInvoiceService.markNotification(invoice.id, "SENT", { type: "xray_renewal", xrayClientId: payload.xrayClient.id });
      return;
    }

    if ("product" in payload && "account" in payload && payload.product && payload.account) {
      if (payload.xrayClient || payload.orderItem?.xrayClientId || payload.product?.mode === "xray_auto") {
        const client =
          payload.xrayClient ??
          (payload.orderItem?.xrayClientId
            ? await prisma.xrayClient.findUnique({
                where: { id: payload.orderItem.xrayClientId },
              })
            : null);

        if (!client) {
          await bot.telegram.sendMessage(
            Number(user.telegramId),
            `✅ خرید با موفقیت انجام شد

سرویس ساخته شده است. لطفاً از بخش «📦 اکانت‌های من» آن را باز کنید.`,
            {
              reply_markup: {
                inline_keyboard: [
                  [{ text: "📦 اکانت‌های من", callback_data: callbackFor("account.details") }],
                  [{ text: "🏠 خانه", callback_data: callbackFor("home") }],
                ],
              },
            },
          );

          await PaymentInvoiceService.markNotification(invoice.id, "SENT", {
            type: "xray_product_purchase",
            productId: payload.product.id,
            accountId: payload.account.id,
            xrayClientId: payload.orderItem?.xrayClientId ?? null,
          });
          return;
        }

        await bot.telegram.sendMessage(
          Number(user.telegramId),
          `✅ خرید با موفقیت انجام شد

سرویس شما ساخته شد و آماده استفاده است.

برای دریافت لینک اشتراک، QR و کانفیگ‌ها از دکمه‌های زیر استفاده کنید.`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: "📦 مشاهده سرویس", callback_data: callbackFor("account.xray", { xrayClientId: client.id }) }],
                [
                  { text: "🔗 دریافت لینک اشتراک", callback_data: `xray:sub:${client.id}` },
                  { text: "⚙️ دریافت کانفیگ‌ها", callback_data: `xray:configs:${client.id}` },
                ],
                [{ text: "🏠 خانه", callback_data: callbackFor("home") }],
              ],
            },
          },
        );

        await PaymentInvoiceService.markNotification(invoice.id, "SENT", {
          type: "xray_product_purchase",
          productId: payload.product.id,
          accountId: payload.account.id,
          xrayClientId: client.id,
        });
        return;
      }

      const success = composeCustomEmojiMessage([
        customEmoji("✅", "TELEGRAM_EMOJI_SUCCESS_ID"),
        " ",
        purchaseSuccessMessage({
          productTitle: payload.product.title,
          username: payload.account.username,
          subscriptionLink: payload.account.subscriptionLink,
          config: payload.account.configLink ?? payload.account.config,
          expiresAt: payload.expiresAt ?? payload.orderItem?.expiresAt ?? undefined,
        }),
      ]);
      await bot.telegram.sendMessage(Number(user.telegramId), success.text, { ...paymentSuccessKeyboard("product"), entities: success.entities });
      await PaymentInvoiceService.markNotification(invoice.id, "SENT", {
        type: "product_purchase",
        productId: payload.product.id,
        accountId: payload.account.id,
      });
    }
  } catch (error) {
    logger.error("Payment notification failed", { error: error instanceof Error ? error.message : String(error), invoiceId: invoice.id });
    await PaymentInvoiceService.markNotification(invoice.id, "FAILED", { error: error instanceof Error ? error.message : String(error) });
  }
}

export function startPaymentCallbackServer(bot: AppBot) {
  const port = Number(process.env.PAYMENT_CALLBACK_PORT ?? process.env.PORT ?? 3000);
  const server = http.createServer(async (req, res) => {
    const callbackUrl = parsedCallbackUrl(req);
    logger.info("PAYMENT CALLBACK HIT", {
      url: req.url,
      method: req.method,
      path: callbackUrl.pathname,
      query: Object.fromEntries(callbackUrl.searchParams.entries()),
      remoteAddress: req.socket.remoteAddress,
    });

    if (req.method !== "GET" || !["/payments/callback", "/api/payment/callback"].includes(callbackUrl.pathname)) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("درخواست پیدا نشد.");
      return;
    }

    try {
      const reference = callbackReferenceFromUrl(callbackUrl);
      const result = await PaymentInvoiceService.processCallback(reference, {
        url: req.url,
        remoteAddress: req.socket.remoteAddress,
        query: callbackQueryMetadata(callbackUrl),
      });
      logger.info("PAYMENT CALLBACK RESULT", {
        reference,
        statusCode: result.statusCode,
        text: result.text,
        hasResult: Boolean(result.result),
        hasFailed: Boolean(result.failed),
        resultType: result.result && typeof result.result === "object" ? (result.result as any).type : null,
        resultKeys: result.result && typeof result.result === "object" ? Object.keys(result.result as any) : [],
        failedKeys: result.failed && typeof result.failed === "object" ? Object.keys(result.failed as any) : [],
      });
      if (result.result) await notifyUser(bot, result.result);
      if (result.failed) await notifyUser(bot, result.failed);
      res.writeHead(result.statusCode, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(result.text);
    } catch (error) {
      logger.error("Payment callback crashed", {
        error: error instanceof Error ? error.message : String(error),
        url: req.url,
        remoteAddress: req.socket.remoteAddress,
      });
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("پرداخت بررسی نشد.");
    }
  });

  server.listen(port, () =>
    logger.info("Payment callback server is running", { port, route: "GET /payments/callback or /api/payment/callback?invoice_id=...&token=..." }),
  );
  return server;
}
