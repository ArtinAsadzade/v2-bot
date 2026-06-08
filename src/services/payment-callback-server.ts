import http from "http";
import { PaymentInvoiceService } from "../modules/payment/payment.service";
import { prisma } from "./prisma";
import { logger } from "./logger";
import type { AppBot } from "../types/bot";

const money = (value: number) => `${value.toLocaleString("fa-IR")} تومان`;

function parsedCallbackUrl(req: http.IncomingMessage) {
  return new URL(req.url ?? "/", "http://localhost");
}

type CallbackReference = { token?: string; invoice?: string; invoice_id?: string; pay_id?: string };

type PaymentNotificationPayload = {
  invoice: { id: string; userId: string; amount: number };
  type?: string;
  user?: { balance: number };
  product?: { id: string; title: string };
  account?: { id: string; username: string | null; subscriptionLink: string | null; configLink: string | null; config: string | null };
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

function paymentReplyKeyboard() {
  return {
    keyboard: [["🏠 منوی اصلی"], ["📦 اکانت‌های من", "💳 شارژ کیف پول"]],
    resize_keyboard: true,
  };
}

async function notifyUser(bot: AppBot, result: unknown) {
  if (!result || typeof result !== "object" || !("invoice" in result)) return;
  const payload = result as PaymentNotificationPayload;
  const invoice = payload.invoice;
  const user = await prisma.user.findUnique({ where: { id: invoice.userId } });
  if (!user) return;

  try {
    if ("error" in payload) {
      await bot.telegram.sendMessage(Number(user.telegramId), "❌ پرداخت انجام نشد\n\nدر صورت کسر وجه و عدم دریافت سرویس با پشتیبانی تماس بگیرید.", { reply_markup: paymentReplyKeyboard() });
      await PaymentInvoiceService.markNotification(invoice.id, "SENT", { type: "failed", error: payload.error });
      return;
    }

    if (payload.type === "WALLET_TOPUP" && "user" in payload && payload.user) {
      await bot.telegram.sendMessage(Number(user.telegramId), `✅ پرداخت با موفقیت انجام شد\n\n💰 مبلغ:\n${money(invoice.amount)}\n\n💳 موجودی جدید:\n${money(payload.user.balance)}`, { reply_markup: paymentReplyKeyboard() });
      await PaymentInvoiceService.markNotification(invoice.id, "SENT", { type: "wallet_topup", amount: invoice.amount, balance: payload.user.balance });
      return;
    }

    if ("product" in payload && "account" in payload && payload.product && payload.account) {
      await bot.telegram.sendMessage(Number(user.telegramId), `✅ خرید با موفقیت انجام شد\n\n📦 محصول:\n${payload.product.title}\n\n👤 نام کاربری:\n${payload.account.username ?? "—"}\n\n🔗 لینک اشتراک:\n${payload.account.subscriptionLink ?? "—"}\n\n⚙️ کانفیگ:\n${payload.account.configLink ?? payload.account.config ?? "—"}`, { reply_markup: paymentReplyKeyboard() });
      await PaymentInvoiceService.markNotification(invoice.id, "SENT", { type: "product_purchase", productId: payload.product.id, accountId: payload.account.id });
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
    if (req.method !== "GET" || callbackUrl.pathname !== "/payments/callback") {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    try {
      const reference = callbackReferenceFromUrl(callbackUrl);
      const result = await PaymentInvoiceService.processCallback(reference, { url: req.url, remoteAddress: req.socket.remoteAddress, query: callbackQueryMetadata(callbackUrl) });
      if (result.result) await notifyUser(bot, result.result);
      if (result.failed) await notifyUser(bot, result.failed);
      res.writeHead(result.statusCode, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(result.text);
    } catch (error) {
      logger.error("Payment callback crashed", { error: error instanceof Error ? error.message : String(error), url: req.url, remoteAddress: req.socket.remoteAddress });
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Payment callback failed.");
    }
  });

  server.listen(port, () => logger.info("Payment callback server is running", { port, route: "GET /payments/callback?token=...&invoice=..." }));
  return server;
}
