import http from "http";
import { PaymentInvoiceService } from "../modules/payment/payment.service";
import { prisma } from "./prisma";
import { logger } from "./logger";
import type { AppBot } from "../types/bot";

const money = (value: number) => `${value.toLocaleString("fa-IR")} تومان`;

function parsedCallbackUrl(req: http.IncomingMessage) {
  return new URL(req.url ?? "/", "http://localhost");
}

function invoiceIdFromUrl(url: URL) {
  return url.searchParams.get("invoice_id") ?? "";
}

function callbackQueryMetadata(url: URL) {
  return Object.fromEntries(url.searchParams.entries());
}

async function notifyUser(bot: AppBot, result: unknown) {
  if (!result || typeof result !== "object" || !("invoice" in result)) return;
  const payload = result as any;
  const invoice = payload.invoice;
  const user = await prisma.user.findUnique({ where: { id: invoice.userId } });
  if (!user) return;

  try {
    if ("error" in payload) {
      await bot.telegram.sendMessage(Number(user.telegramId), "❌ پرداخت انجام نشد\n\nدر صورت کسر وجه و عدم دریافت سرویس با پشتیبانی تماس بگیرید.");
      await PaymentInvoiceService.markNotification(invoice.id, "SENT", { type: "failed", error: payload.error });
      return;
    }

    if (payload.type === "WALLET_TOPUP" && "user" in payload && payload.user) {
      await bot.telegram.sendMessage(Number(user.telegramId), `✅ کیف پول با موفقیت شارژ شد\n\n💰 مبلغ:\n${money(invoice.amount)}\n\n💳 موجودی جدید:\n${money(payload.user.balance)}`);
      await PaymentInvoiceService.markNotification(invoice.id, "SENT", { type: "wallet_topup", amount: invoice.amount, balance: payload.user.balance });
      return;
    }

    if ("product" in payload && "account" in payload && payload.product && payload.account) {
      await bot.telegram.sendMessage(Number(user.telegramId), `✅ خرید با موفقیت انجام شد\n\n📦 محصول:\n${payload.product.title}\n\n👤 نام کاربری:\n${payload.account.username}\n\n🔗 Subscription:\n${payload.account.subscriptionLink ?? "—"}\n\n⚙️ Config:\n${payload.account.configLink ?? payload.account.config ?? "—"}`);
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

    const invoiceId = invoiceIdFromUrl(callbackUrl);
    const result = await PaymentInvoiceService.processCallback(invoiceId, { url: req.url, remoteAddress: req.socket.remoteAddress, query: callbackQueryMetadata(callbackUrl) });
    if (result.result) await notifyUser(bot, result.result);
    if (result.failed) await notifyUser(bot, result.failed);
    res.writeHead(result.statusCode, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(result.text);
  });

  server.listen(port, () => logger.info("Payment callback server is running", { port, route: "GET /payments/callback?invoice_id=..." }));
  return server;
}
