import { test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readAdminViewsSource } from "./helpers/view-source";

const modernViewsSource = (readFileSync("src/bot/views/modern.views.ts", "utf8") + "\n" + readFileSync("src/bot/views/home.views.ts", "utf8") + "\n" + readFileSync("src/bot/views/product.views.ts", "utf8") + "\n" + readFileSync("src/bot/views/purchase.views.ts", "utf8") + "\n" + readFileSync("src/bot/views/account.views.ts", "utf8") + "\n" + readFileSync("src/bot/views/wallet.views.ts", "utf8") + "\n" + readFileSync("src/bot/views/support.views.ts", "utf8") + "\n" + readFileSync("src/bot/views/free-account.views.ts", "utf8") + "\n" + readAdminViewsSource());
const modernHandlersSource = (readFileSync("src/bot/handlers/modern/register-modern-handlers.ts", "utf8") + "\n" + readFileSync("src/bot/handlers/modern/navigation.handlers.ts", "utf8") + "\n" + readFileSync("src/bot/handlers/modern/home.handlers.ts", "utf8") + "\n" + readFileSync("src/bot/handlers/modern/product.handlers.ts", "utf8") + "\n" + readFileSync("src/bot/handlers/modern/purchase.handlers.ts", "utf8") + "\n" + readFileSync("src/bot/handlers/modern/wallet.handlers.ts", "utf8") + "\n" + readFileSync("src/bot/handlers/modern/coupon.handlers.ts", "utf8") + "\n" + readFileSync("src/bot/handlers/modern/account.handlers.ts", "utf8") + "\n" + readFileSync("src/bot/handlers/modern/xray.handlers.ts", "utf8") + "\n" + readFileSync("src/bot/handlers/modern/free-account.handlers.ts", "utf8") + "\n" + readFileSync("src/bot/handlers/modern/support.handlers.ts", "utf8") + "\n" + readFileSync("src/bot/handlers/modern/admin.handlers.ts", "utf8") + "\n" + readFileSync("src/bot/handlers/modern/admin/index.ts", "utf8") + "\n" + readFileSync("src/bot/handlers/modern/admin/admin-products.handlers.ts", "utf8") + "\n" + readFileSync("src/bot/handlers/modern/admin/admin-payments.handlers.ts", "utf8") + "\n" + readFileSync("src/bot/handlers/modern/admin/admin-coupons.handlers.ts", "utf8") + "\n" + readFileSync("src/bot/handlers/modern/admin/admin-inventory.handlers.ts", "utf8") + "\n" + readFileSync("src/bot/handlers/modern/admin/admin-settings.handlers.ts", "utf8") + "\n" + readFileSync("src/bot/handlers/modern/admin/admin-support.handlers.ts", "utf8") + "\n" + readFileSync("src/bot/handlers/modern/admin/admin-users.handlers.ts", "utf8") + "\n" + readFileSync("src/bot/keyboards/purchase.keyboard.ts", "utf8") + "\n" + readFileSync("src/bot/messages/coupon.messages.ts", "utf8") + "\n" + readFileSync("src/bot/messages/purchase.messages.ts", "utf8") + "\n" + readFileSync("src/bot/callbacks/index.ts", "utf8"));
const paymentSource = (readFileSync("src/modules/payment/payment.service.ts", "utf8") + "\n" + readFileSync("src/modules/payment/payment.types.ts", "utf8") + "\n" + readFileSync("src/modules/payment/payment-fulfillment.service.ts", "utf8") + "\n" + readFileSync("src/modules/payment/payment-delivery.service.ts", "utf8") + "\n" + readFileSync("src/modules/payment/payment-callback.service.ts", "utf8") + "\n" + readFileSync("src/modules/payment/wallet-payment.service.ts", "utf8") + "\n" + readFileSync("src/modules/payment/gateway-payment.service.ts", "utf8") + "\n" + readFileSync("src/modules/payment/payment-discount.service.ts", "utf8") + "\n" + readFileSync("src/modules/payment/payment-notification.service.ts", "utf8") + "\n" + readFileSync("src/modules/payment/payment-repository.ts", "utf8"));
const xraySource = readFileSync("src/modules/xray/xray.service.ts", "utf8");

test("Xray purchase success does not render manual placeholder links", () => {
  const delivery = modernHandlersSource.match(/async function sendPurchaseDelivery[\s\S]*?async function ownedXrayClient/)?.[0] ?? "";
  assert.match(delivery, /result\.product\.mode === "xray_auto"/);
  assert.match(delivery, /✅ خرید با موفقیت انجام شد/);
  assert.doesNotMatch(delivery.match(/result\.product\.mode === "xray_auto"[\s\S]*?return;\n\s*}\n/)?.[0] ?? "", /purchaseSuccessMessage|subscriptionLink|configLink|XRAY_LIVE_LINKS|لینک اشتراک:\s*—|لینک کانفیگ:\s*—/);
});

test("Xray purchase success includes contextual account-detail and link buttons", () => {
  const delivery = modernHandlersSource.match(/async function sendPurchaseDelivery[\s\S]*?async function ownedXrayClient/)?.[0] ?? "";
  assert.match(modernHandlersSource, /xrayPurchaseDeliveryKeyboard\(client\.id\)/);
  assert.match(modernHandlersSource, /callbackFor\("account\.xray", \{ xrayClientId: clientId \}\)/);
  assert.match(modernHandlersSource, /xrayCallbacks\.subscription\(clientId\)/);
  assert.match(modernHandlersSource, /xrayCallbacks\.configs\(clientId\)/);
  assert.match(delivery, /سرویس ساخته شده است\. لطفاً از بخش «📦 اکانت‌های من» آن را باز کنید/);
});

test("account detail opens by xrayClientId and reuses live Xray fetchers", () => {
  const detail = modernViewsSource.match(/registerView\("account\.xray"[\s\S]*?registerView\("account\.renew"/)?.[0] ?? "";
  assert.match(detail, /id: params\.xrayClientId, userId: user\.id/);
  assert.match(detail, /XrayClientService\.getClient\(client\.clientEmail\)/);
  assert.match(detail, /XrayClientService\.traffic\(client\.clientEmail\)/);
  assert.match(detail, /xray:sub:\$\{client\.id\}/);
  assert.match(detail, /xray:configs:\$\{client\.id\}/);
});

test("renewal start loads selected XrayClient and lists active xray_auto categories", () => {
  const start = modernViewsSource.match(/const renderRenewService[\s\S]*?registerView\("account\.renew", renderRenewService\)/)?.[0] ?? "";
  assert.match(start, /id: params\.xrayClientId, userId: user\.id/);
  assert.match(start, /این سرویس برای تمدید پیدا نشد/);
  assert.match(start, /mode: "xray_auto"/);
  assert.match(start, /isActive: true/);
  assert.match(start, /callbackFor\("account\.renew\.products", \{ xrayClientId: client\.id, categoryId: category\.id \}\)/);
  assert.doesNotMatch(start, /سرویس موردنظر برای تمدید شناسه/);
});

test("renewal product list and summary use selected client/product context", () => {
  assert.match(modernViewsSource, /registerView\("account\.renew\.products"/);
  assert.match(modernViewsSource, /tokenAction\("xr:r:s", createCallbackToken\(ctx, "renewal", \{ xrayClientId: client\.id, productId: p\.id \}\)\)/);
  assert.match(modernViewsSource, /🔄 خلاصه تمدید/);
  assert.match(modernViewsSource, /حجم کل جدید/);
  assert.match(modernViewsSource, /باقی‌مانده جدید/);
});

test("renewal calculation and fulfillment update existing Xray client idempotently", () => {
  assert.match(paymentSource, /buildXrayRenewalQuote/);
  assert.match(paymentSource, /XrayClientService\.traffic\(client\.clientEmail\)/);
  assert.match(paymentSource, /const newTotalBytes = snapshot\.totalBytes \+ product\.trafficBytes/);
  assert.match(paymentSource, /if \(renewal\.status === "active"\) return renewal/);
  assert.match(paymentSource, /XrayClientService\.updateClient\(renewal\.xrayClient\.clientEmail/);
  assert.match(paymentSource, /prisma\.xrayClient\.update\(\{ where: \{ id: renewal\.xrayClientId \}/);
  assert.doesNotMatch(paymentSource.match(/private static async applyXrayRenewal[\s\S]*?static async/)?.[0] ?? "", /xrayClient\.create/);
});

test("wallet and direct renewal payment routes are wired", () => {
  assert.match(modernHandlersSource, /xr:r:w/);
  assert.match(modernHandlersSource, /xray:renew:wallet/);
  assert.match(modernHandlersSource, /PaymentInvoiceService\.renewXrayWithWallet/);
  assert.match(modernHandlersSource, /xr:r:i/);
  assert.match(modernHandlersSource, /xray:renew:instant/);
  assert.match(modernHandlersSource, /PaymentInvoiceService\.createXrayRenewalInvoice/);
  assert.match(paymentSource, /type: "XRAY_RENEWAL"/);
  assert.match(paymentSource, /fulfillXrayRenewal/);
});

test("renewal screens disable automatic Back and Home buttons", () => {
  const renewalBlock = modernViewsSource.slice(
    modernViewsSource.indexOf('registerView("account.renew"'),
    modernViewsSource.indexOf('registerView("account.history"'),
  );
  assert.match(renewalBlock, /registerView\("account\.renew"/);
  assert.match(renewalBlock, /registerView\("account\.renew\.products"/);
  assert.match(renewalBlock, /registerView\("account\.renew\.summary"/);
  assert.equal((renewalBlock.match(/navigation: \{ back: false, home: false \}/g) ?? []).length >= 3, true);
});

// Contract check for panel update units: update must keep the same byte convention as create.
test("Xray updateClient sends bytes through totalGB field like createClient", () => {
  assert.match(xraySource, /createClient[\s\S]*totalGB: Number\(input\.trafficBytes\)/);
  assert.match(xraySource, /updateClient[\s\S]*totalGB: Number\(input\.totalBytes\)/);
});
