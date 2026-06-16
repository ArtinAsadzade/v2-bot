"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifyUser = notifyUser;
exports.startPaymentCallbackServer = startPaymentCallbackServer;
const http_1 = __importDefault(require("http"));
const payment_service_1 = require("../modules/payment/payment.service");
const prisma_1 = require("./prisma");
const logger_1 = require("./logger");
const design_system_1 = require("../bot/keyboards/design-system");
const custom_emoji_1 = require("../bot/keyboards/custom-emoji");
const messages_1 = require("../utils/messages");
const money = (value) => `${value.toLocaleString("fa-IR")} تومان`;
function parsedCallbackUrl(req) {
    return new URL(req.url ?? "/", "http://localhost");
}
function callbackReferenceFromUrl(url) {
    return {
        token: url.searchParams.get("token") ?? undefined,
        invoice: url.searchParams.get("invoice") ?? undefined,
        invoice_id: url.searchParams.get("invoice_id") ?? undefined,
        pay_id: url.searchParams.get("pay_id") ?? undefined,
    };
}
function callbackQueryMetadata(url) {
    return Object.fromEntries(url.searchParams.entries());
}
async function notifyUser(bot, result) {
    if (!result || typeof result !== "object" || !("invoice" in result))
        return;
    const payload = result;
    const invoice = payload.invoice;
    const user = await prisma_1.prisma.user.findUnique({ where: { id: invoice.userId } });
    if (!user)
        return;
    try {
        logger_1.logger.info("PAYMENT NOTIFY USER", {
            invoiceId: invoice.id,
            userId: invoice.userId,
            payloadType: payload.type,
            hasProduct: Boolean(payload.product),
            hasAccount: Boolean(payload.account),
        });
        if ("error" in payload) {
            const failure = (0, custom_emoji_1.composeCustomEmojiMessage)([
                (0, custom_emoji_1.customEmoji)("❌", "TELEGRAM_EMOJI_ERROR_ID"),
                " ",
                (0, messages_1.errorMessage)("پرداخت ثبت شد اما تحویل ناموفق بود", "پرداخت شما با موفقیت ثبت شد، اما تحویل اکانت با مشکل مواجه شد.", "پشتیبانی بررسی می‌کند و نتیجه را اطلاع می‌دهد."),
            ]);
            await bot.telegram.sendMessage(Number(user.telegramId), failure.text, { ...(0, design_system_1.paymentFailureKeyboard)(), entities: failure.entities });
            await payment_service_1.PaymentInvoiceService.markNotification(invoice.id, "SENT", { type: "failed", error: payload.error });
            return;
        }
        if (payload.type === "WALLET_TOPUP" && "user" in payload && payload.user) {
            const success = (0, custom_emoji_1.composeCustomEmojiMessage)([
                (0, custom_emoji_1.customEmoji)("✅", "TELEGRAM_EMOJI_SUCCESS_ID"),
                " ",
                (0, messages_1.walletSummaryMessage)(payload.user.balance, `مبلغ شارژ شده: ${money(invoice.amount)}`),
            ]);
            await bot.telegram.sendMessage(Number(user.telegramId), success.text, { ...(0, design_system_1.paymentSuccessKeyboard)("wallet"), entities: success.entities });
            await payment_service_1.PaymentInvoiceService.markNotification(invoice.id, "SENT", {
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
            await payment_service_1.PaymentInvoiceService.markNotification(invoice.id, "SENT", { type: "xray_renewal", xrayClientId: payload.xrayClient.id });
            return;
        }
        if ("product" in payload && "account" in payload && payload.product && payload.account) {
            if (payload.xrayClient) {
                const expiry = payload.xrayClient.expiresAt ? new Date(payload.xrayClient.expiresAt).toLocaleDateString("fa-IR") : "ثبت نشده";
                const subscription = payload.account.subscriptionLink ? `\n\n🔗 لینک اشتراک:\n${payload.account.subscriptionLink}` : "";
                const config = payload.account.configLink || payload.account.config ? `\n\n⚙️ کانفیگ/لینک کانفیگ:\n${payload.account.configLink ?? payload.account.config}` : "";
                await bot.telegram.sendMessage(Number(user.telegramId), `🎉 Your Xray account is ready\n\n━━━━━━━━━━━━━━━━\n\n👤 Service ID:\n${payload.xrayClient.clientEmail}\n\n⏳ Valid until:\n${expiry}\n\n📦 This service has been added to “My Accounts”.${subscription}${config}`, {
                    reply_markup: { inline_keyboard: [[{ text: "View My Accounts", callback_data: "nav:account.details" }], [{ text: "📦 مشاهده سرویس", callback_data: `nav:account.xray?xid=${payload.xrayClient.id}` }]] },
                });
                await payment_service_1.PaymentInvoiceService.markNotification(invoice.id, "SENT", {
                    type: "xray_product_purchase",
                    productId: payload.product.id,
                    accountId: payload.account.id,
                    xrayClientId: payload.xrayClient.id,
                });
                return;
            }
            const success = (0, custom_emoji_1.composeCustomEmojiMessage)([
                (0, custom_emoji_1.customEmoji)("✅", "TELEGRAM_EMOJI_SUCCESS_ID"),
                " ",
                (0, messages_1.purchaseSuccessMessage)({
                    productTitle: payload.product.title,
                    username: payload.account.username,
                    subscriptionLink: payload.account.subscriptionLink,
                    config: payload.account.configLink ?? payload.account.config,
                }),
            ]);
            await bot.telegram.sendMessage(Number(user.telegramId), success.text, { ...(0, design_system_1.paymentSuccessKeyboard)("product"), entities: success.entities });
            await payment_service_1.PaymentInvoiceService.markNotification(invoice.id, "SENT", {
                type: "product_purchase",
                productId: payload.product.id,
                accountId: payload.account.id,
            });
        }
    }
    catch (error) {
        logger_1.logger.error("Payment notification failed", { error: error instanceof Error ? error.message : String(error), invoiceId: invoice.id });
        await payment_service_1.PaymentInvoiceService.markNotification(invoice.id, "FAILED", { error: error instanceof Error ? error.message : String(error) });
    }
}
function startPaymentCallbackServer(bot) {
    const port = Number(process.env.PAYMENT_CALLBACK_PORT ?? process.env.PORT ?? 3000);
    const server = http_1.default.createServer(async (req, res) => {
        const callbackUrl = parsedCallbackUrl(req);
        logger_1.logger.info("PAYMENT CALLBACK HIT", {
            url: req.url,
            method: req.method,
            path: callbackUrl.pathname,
            query: Object.fromEntries(callbackUrl.searchParams.entries()),
            remoteAddress: req.socket.remoteAddress,
        });
        if (callbackUrl.pathname === "/test-payment" && process.env.NODE_ENV !== "production" && process.env.ENABLE_TEST_PAYMENT_ROUTE === "true") {
            try {
                const user = await prisma_1.prisma.user.findFirst({
                    where: {
                        telegramId: "8793993570",
                    },
                });
                if (!user) {
                    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
                    res.end("user not found");
                    return;
                }
                await notifyUser(bot, {
                    invoice: {
                        id: "test",
                        userId: user.id,
                        amount: 72000,
                    },
                    product: {
                        id: "prod1",
                        title: "10GB | 30 روز",
                    },
                    account: {
                        id: "acc1",
                        username: "testuser",
                        subscriptionLink: "https://example.com/sub",
                        configLink: null,
                        config: "vless://test",
                    },
                });
                res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
                res.end("ok");
                return;
            }
            catch (error) {
                logger_1.logger.error("TEST PAYMENT FAILED", {
                    error: error instanceof Error ? error.message : String(error),
                });
                res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
                res.end(error instanceof Error ? error.message : "test failed");
                return;
            }
        }
        if (req.method !== "GET" || !["/payments/callback", "/api/payment/callback"].includes(callbackUrl.pathname)) {
            res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
            res.end("درخواست پیدا نشد.");
            return;
        }
        try {
            const reference = callbackReferenceFromUrl(callbackUrl);
            const result = await payment_service_1.PaymentInvoiceService.processCallback(reference, {
                url: req.url,
                remoteAddress: req.socket.remoteAddress,
                query: callbackQueryMetadata(callbackUrl),
            });
            logger_1.logger.info("PAYMENT CALLBACK RESULT", {
                reference,
                statusCode: result.statusCode,
                text: result.text,
                hasResult: Boolean(result.result),
                hasFailed: Boolean(result.failed),
                resultType: result.result && typeof result.result === "object" ? result.result.type : null,
                resultKeys: result.result && typeof result.result === "object" ? Object.keys(result.result) : [],
                failedKeys: result.failed && typeof result.failed === "object" ? Object.keys(result.failed) : [],
            });
            if (result.result)
                await notifyUser(bot, result.result);
            if (result.failed)
                await notifyUser(bot, result.failed);
            res.writeHead(result.statusCode, { "Content-Type": "text/plain; charset=utf-8" });
            res.end(result.text);
        }
        catch (error) {
            logger_1.logger.error("Payment callback crashed", {
                error: error instanceof Error ? error.message : String(error),
                url: req.url,
                remoteAddress: req.socket.remoteAddress,
            });
            res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
            res.end("پرداخت بررسی نشد.");
        }
    });
    server.listen(port, () => logger_1.logger.info("Payment callback server is running", { port, route: "GET /payments/callback or /api/payment/callback?invoice_id=...&token=..." }));
    return server;
}
