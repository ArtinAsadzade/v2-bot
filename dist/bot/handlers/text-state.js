"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleStateText = handleStateText;
const coupon_service_1 = require("../../modules/coupon/coupon.service");
const support_service_1 = require("../../modules/support/support.service");
const user_service_1 = require("../../modules/user/user.service");
const start_1 = require("./deposit/start");
const main_keyboard_1 = require("../keyboards/main.keyboard");
const admin_service_1 = require("../../modules/admin/admin.service");
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
        case "admin_user_search": {
            const query = text.replace(/^@/, "");
            const users = await admin_service_1.AdminService.searchUsers(query);
            ctx.session.state = undefined;
            await ctx.reply(users.map((user) => `👤 ${user.telegramId} @${user.username ?? "-"} | ${user.balance.toLocaleString("fa-IR")} تومان`).join("\n") || "نتیجه‌ای پیدا نشد.", (0, main_keyboard_1.navigationKeyboard)("admin:users"));
            return;
        }
        case "admin_product_search": {
            const products = await admin_service_1.AdminService.searchProducts(text);
            const lines = products.map((product) => `📦 ${product.title} | ${product.category.name} | ${product.price.toLocaleString("fa-IR")} تومان`);
            ctx.session.state = undefined;
            await ctx.reply(lines.join("\n") || "نتیجه‌ای پیدا نشد.", (0, main_keyboard_1.navigationKeyboard)("admin:products"));
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
            ctx.session.state = undefined;
            await ctx.reply("✅ پاسخ ارسال شد.", (0, main_keyboard_1.navigationKeyboard)("admin:tickets"));
            return;
        }
    }
}
