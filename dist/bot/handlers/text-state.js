"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleStateText = handleStateText;
const coupon_service_1 = require("../../modules/coupon/coupon.service");
const product_service_1 = require("../../modules/product/product.service");
const support_service_1 = require("../../modules/support/support.service");
const user_service_1 = require("../../modules/user/user.service");
const start_1 = require("./deposit/start");
const main_keyboard_1 = require("../keyboards/main.keyboard");
async function handleStateText(ctx, next) {
    const state = ctx.session.state;
    if (!state || !ctx.message || !("text" in ctx.message))
        return next();
    const text = ctx.message.text.trim();
    switch (state.name) {
        case "deposit_amount": {
            const amount = Number(text.replace(/[,،]/g, ""));
            if (!Number.isInteger(amount) || amount <= 0) {
                await ctx.reply("❌ مبلغ معتبر وارد کنید.");
                return;
            }
            await ctx.reply("💱 ارز پرداخت را انتخاب کنید:", (0, start_1.currencyKeyboard)(amount));
            return;
        }
        case "deposit_receipt":
            await ctx.reply("لطفا تصویر رسید را ارسال کنید یا عملیات را لغو کنید.", (0, main_keyboard_1.navigationKeyboard)());
            return;
        case "support_message": {
            const user = await user_service_1.UserService.findOrCreateUser(ctx);
            await support_service_1.SupportService.addUserMessage(state.ticketId, user.id, text);
            await ctx.reply("📩 پیام شما در تیکت ثبت شد. در صورت نیاز پیام بعدی را ارسال کنید یا لغو را بزنید.", (0, main_keyboard_1.navigationKeyboard)());
            return;
        }
        case "coupon_code": {
            const user = await user_service_1.UserService.findOrCreateUser(ctx);
            try {
                const coupon = await coupon_service_1.CouponService.validateForUser(text, user.id);
                ctx.session.selectedCoupons = { ...(ctx.session.selectedCoupons ?? {}), [state.productId]: coupon.code };
                ctx.session.state = undefined;
                await ctx.reply(`✅ کد تخفیف ${coupon.discountPercent}% برای این خرید ثبت شد.`, (0, main_keyboard_1.navigationKeyboard)(`product:${state.productId}`));
            }
            catch (error) {
                await ctx.reply(`❌ ${error instanceof Error ? error.message : "کد تخفیف معتبر نیست"}`, (0, main_keyboard_1.navigationKeyboard)(`product:${state.productId}`));
            }
            return;
        }
        case "admin_coupon_create": {
            const [code, percentRaw, maxUsesRaw, daysRaw] = text.split(/\s+/);
            const percent = Number(percentRaw);
            const maxUses = Number(maxUsesRaw);
            const days = Number(daysRaw);
            if (!code || !Number.isInteger(percent) || !Number.isInteger(maxUses) || !Number.isInteger(days) || days <= 0) {
                await ctx.reply("فرمت کوپن معتبر نیست. نمونه: OFF20 20 10 7", (0, main_keyboard_1.navigationKeyboard)("admin:dashboard"));
                return;
            }
            const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
            const coupon = await coupon_service_1.CouponService.create(code, percent, expiresAt, maxUses);
            ctx.session.state = undefined;
            await ctx.reply(`✅ کوپن ${coupon.code} ساخته شد.`, (0, main_keyboard_1.navigationKeyboard)("admin:dashboard"));
            return;
        }
        case "admin_product_create": {
            const [categoryName, title, priceRaw, durationRaw] = text.split("|").map((part) => part.trim());
            const price = Number(priceRaw);
            const duration = Number(durationRaw);
            if (!categoryName || !title || !Number.isInteger(price) || price <= 0 || !Number.isInteger(duration) || duration <= 0) {
                await ctx.reply("فرمت محصول معتبر نیست. نمونه: VIP|VPN یک‌ماهه|50000|30", (0, main_keyboard_1.navigationKeyboard)("admin:dashboard"));
                return;
            }
            const product = await product_service_1.ProductService.create({ categoryName, title, price, duration });
            ctx.session.state = undefined;
            await ctx.reply(`✅ محصول ${product.title} ساخته شد.`, (0, main_keyboard_1.navigationKeyboard)("admin:dashboard"));
            return;
        }
        case "admin_account_create": {
            const [username, password, config] = text.split("|").map((part) => part.trim());
            if (!username || !password || !config) {
                await ctx.reply("فرمت اکانت معتبر نیست. نمونه: user|pass|config", (0, main_keyboard_1.navigationKeyboard)("admin:dashboard"));
                return;
            }
            const account = await product_service_1.ProductService.addAccount(state.productId, { username, password, config });
            ctx.session.state = undefined;
            await ctx.reply(`✅ اکانت ${account.username} اضافه شد.`, (0, main_keyboard_1.navigationKeyboard)("admin:dashboard"));
            return;
        }
        case "admin_ticket_reply": {
            const ticket = await support_service_1.SupportService.getTicketWithUser(state.ticketId);
            if (!ticket) {
                ctx.session.state = undefined;
                await ctx.reply("تیکت پیدا نشد.", (0, main_keyboard_1.navigationKeyboard)("admin:tickets"));
                return;
            }
            await support_service_1.SupportService.addAdminReply(ticket.id, String(ctx.from?.id), text);
            await ctx.telegram.sendMessage(Number(ticket.user.telegramId), `📨 پاسخ پشتیبانی:\n\n${text}`);
            ctx.session.state = undefined;
            await ctx.reply("✅ پاسخ ارسال شد.", (0, main_keyboard_1.navigationKeyboard)("admin:tickets"));
            return;
        }
    }
}
