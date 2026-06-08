"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startPaymentCallbackServer = startPaymentCallbackServer;
const http_1 = __importDefault(require("http"));
const payment_service_1 = require("../modules/payment/payment.service");
const prisma_1 = require("./prisma");
const logger_1 = require("./logger");
const money = (value) => `${value.toLocaleString("fa-IR")} تومان`;
function invoiceIdFromRequest(req) {
    const url = new URL(req.url ?? "/", "http://localhost");
    return url.searchParams.get("invoice_id") ?? url.searchParams.get("id") ?? url.pathname.split("/").filter(Boolean).pop() ?? "";
}
async function notifyUser(bot, result) {
    if (!result)
        return;
    const invoice = result.invoice;
    const user = await prisma_1.prisma.user.findUnique({ where: { id: invoice.userId } });
    if (!user)
        return;
    if (result.type === "WALLET_TOPUP" && "user" in result && result.user) {
        await bot.telegram.sendMessage(Number(user.telegramId), `✅ پرداخت با موفقیت انجام شد\n\n💰 مبلغ شارژ:\n${money(invoice.amount)}\n\n💳 موجودی جدید:\n${money(result.user.balance)}`).catch((error) => logger_1.logger.error("Payment wallet notification failed", { error: error instanceof Error ? error.message : String(error), invoiceId: invoice.id }));
        return;
    }
    if ("product" in result && "account" in result) {
        await bot.telegram.sendMessage(Number(user.telegramId), `✅ خرید با موفقیت انجام شد\n\n📦 محصول:\n${result.product.title}\n\n👤 نام کاربری:\n${result.account.username}\n\n🔗 لینک اشتراک:\n${result.account.subscriptionLink}\n\n⚙️ کانفیگ:\n${result.account.configLink}`).catch((error) => logger_1.logger.error("Payment product notification failed", { error: error instanceof Error ? error.message : String(error), invoiceId: invoice.id }));
    }
}
function startPaymentCallbackServer(bot) {
    const port = Number(process.env.PAYMENT_CALLBACK_PORT ?? process.env.PORT ?? 3000);
    const server = http_1.default.createServer(async (req, res) => {
        if (req.method !== "GET" || !req.url?.startsWith("/payments/callback")) {
            res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
            res.end("Not found");
            return;
        }
        const invoiceId = invoiceIdFromRequest(req);
        const url = new URL(req.url ?? "/", "http://localhost");
        const result = await payment_service_1.PaymentInvoiceService.processCallback(invoiceId, { url: req.url, remoteAddress: req.socket.remoteAddress, token: url.searchParams.get("token") });
        if (result.result)
            await notifyUser(bot, result.result);
        res.writeHead(result.statusCode, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(result.text);
    });
    server.listen(port, () => logger_1.logger.info("Payment callback server is running", { port }));
    return server;
}
