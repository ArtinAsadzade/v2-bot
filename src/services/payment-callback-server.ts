import http from "http";
import { PaymentInvoiceService } from "../modules/payment/payment.service";
import { prisma } from "./prisma";
import { logger } from "./logger";
import type { AppBot } from "../types/bot";

const money = (value: number) => `${value.toLocaleString("fa-IR")} تومان`;

function invoiceIdFromRequest(req: http.IncomingMessage) {
  const url = new URL(req.url ?? "/", "http://localhost");
  return url.searchParams.get("invoice_id") ?? url.searchParams.get("id") ?? url.pathname.split("/").filter(Boolean).pop() ?? "";
}

async function notifyUser(bot: AppBot, result: Awaited<ReturnType<typeof PaymentInvoiceService.processCallback>>["result"]) {
  if (!result) return;
  const invoice = result.invoice;
  const user = await prisma.user.findUnique({ where: { id: invoice.userId } });
  if (!user) return;

  if (result.type === "WALLET_TOPUP" && "user" in result && result.user) {
    await bot.telegram.sendMessage(Number(user.telegramId), `✅ پرداخت با موفقیت انجام شد\n\n💰 مبلغ شارژ:\n${money(invoice.amount)}\n\n💳 موجودی جدید:\n${money(result.user.balance)}`).catch((error) => logger.error("Payment wallet notification failed", { error: error instanceof Error ? error.message : String(error), invoiceId: invoice.id }));
    return;
  }

  if ("product" in result && "account" in result) {
    await bot.telegram.sendMessage(Number(user.telegramId), `✅ خرید با موفقیت انجام شد\n\n📦 محصول:\n${result.product.title}\n\n👤 نام کاربری:\n${result.account.username}\n\n🔗 لینک اشتراک:\n${result.account.subscriptionLink}\n\n⚙️ کانفیگ:\n${result.account.configLink}`).catch((error) => logger.error("Payment product notification failed", { error: error instanceof Error ? error.message : String(error), invoiceId: invoice.id }));
  }
}

export function startPaymentCallbackServer(bot: AppBot) {
  const port = Number(process.env.PAYMENT_CALLBACK_PORT ?? process.env.PORT ?? 3000);
  const server = http.createServer(async (req, res) => {
    if (req.method !== "GET" || !req.url?.startsWith("/payments/callback")) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const invoiceId = invoiceIdFromRequest(req);
    const url = new URL(req.url ?? "/", "http://localhost");
    const result = await PaymentInvoiceService.processCallback(invoiceId, { url: req.url, remoteAddress: req.socket.remoteAddress, token: url.searchParams.get("token") });
    if (result.result) await notifyUser(bot, result.result);
    res.writeHead(result.statusCode, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(result.text);
  });

  server.listen(port, () => logger.info("Payment callback server is running", { port }));
  return server;
}
