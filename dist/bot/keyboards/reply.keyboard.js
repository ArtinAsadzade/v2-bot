"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsKeyboard = exports.AdminKeyboard = exports.SupportKeyboard = exports.PurchaseKeyboard = exports.PaymentKeyboard = exports.WalletKeyboard = exports.MainMenuKeyboard = void 0;
exports.replyKeyboard = replyKeyboard;
exports.replyKeyboardSignature = replyKeyboardSignature;
exports.quickReplyTarget = quickReplyTarget;
const design_system_1 = require("./design-system");
Object.defineProperty(exports, "AdminKeyboard", { enumerable: true, get: function () { return design_system_1.AdminKeyboard; } });
Object.defineProperty(exports, "MainMenuKeyboard", { enumerable: true, get: function () { return design_system_1.MainMenuKeyboard; } });
Object.defineProperty(exports, "PaymentKeyboard", { enumerable: true, get: function () { return design_system_1.PaymentKeyboard; } });
Object.defineProperty(exports, "PurchaseKeyboard", { enumerable: true, get: function () { return design_system_1.PurchaseKeyboard; } });
Object.defineProperty(exports, "SettingsKeyboard", { enumerable: true, get: function () { return design_system_1.SettingsKeyboard; } });
Object.defineProperty(exports, "SupportKeyboard", { enumerable: true, get: function () { return design_system_1.SupportKeyboard; } });
Object.defineProperty(exports, "WalletKeyboard", { enumerable: true, get: function () { return design_system_1.WalletKeyboard; } });
const keyboardFactories = {
    home: () => (0, design_system_1.MainMenuKeyboard)(),
    shop: design_system_1.PurchaseKeyboard,
    profile: () => (0, design_system_1.buildReplyKeyboard)([[{ text: "📦 سفارش‌های من" }, { text: "👛 کیف پول" }], [{ text: "🏠 منوی اصلی" }]]),
    wallet: design_system_1.WalletKeyboard,
    payment: design_system_1.PaymentKeyboard,
    support: design_system_1.SupportKeyboard,
    freeAccount: () => (0, design_system_1.buildReplyKeyboard)([[{ text: "🎁 دریافت اکانت تست" }, { text: "📦 سفارش‌های من" }], [{ text: "🏠 منوی اصلی" }]]),
    admin: design_system_1.AdminKeyboard,
    settings: design_system_1.SettingsKeyboard,
};
function replyKeyboard(scope) {
    return keyboardFactories[scope]();
}
function replyKeyboardSignature(scope) {
    return JSON.stringify(replyKeyboard(scope).reply_markup.keyboard.map((row) => row.map((button) => (typeof button === "string" ? button : button.text))));
}
function quickReplyTarget(text) {
    return design_system_1.quickReplyRoutes[text];
}
