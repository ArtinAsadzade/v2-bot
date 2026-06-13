"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsKeyboard = exports.AdminSettingsKeyboard = exports.AdminUsersKeyboard = exports.AdminPaymentsKeyboard = exports.AdminProductsKeyboard = exports.AdminKeyboard = exports.SupportKeyboard = exports.PurchaseKeyboard = exports.PaymentKeyboard = exports.ShopKeyboard = exports.WalletKeyboard = exports.UserKeyboard = exports.MainMenuKeyboard = void 0;
exports.replyKeyboard = replyKeyboard;
exports.replyKeyboardSignature = replyKeyboardSignature;
exports.quickReplyTarget = quickReplyTarget;
const design_system_1 = require("./design-system");
Object.defineProperty(exports, "AdminKeyboard", { enumerable: true, get: function () { return design_system_1.AdminKeyboard; } });
Object.defineProperty(exports, "AdminPaymentsKeyboard", { enumerable: true, get: function () { return design_system_1.AdminPaymentsKeyboard; } });
Object.defineProperty(exports, "AdminProductsKeyboard", { enumerable: true, get: function () { return design_system_1.AdminProductsKeyboard; } });
Object.defineProperty(exports, "AdminSettingsKeyboard", { enumerable: true, get: function () { return design_system_1.AdminSettingsKeyboard; } });
Object.defineProperty(exports, "AdminUsersKeyboard", { enumerable: true, get: function () { return design_system_1.AdminUsersKeyboard; } });
Object.defineProperty(exports, "MainMenuKeyboard", { enumerable: true, get: function () { return design_system_1.MainMenuKeyboard; } });
Object.defineProperty(exports, "PaymentKeyboard", { enumerable: true, get: function () { return design_system_1.PaymentKeyboard; } });
Object.defineProperty(exports, "PurchaseKeyboard", { enumerable: true, get: function () { return design_system_1.PurchaseKeyboard; } });
Object.defineProperty(exports, "ShopKeyboard", { enumerable: true, get: function () { return design_system_1.ShopKeyboard; } });
Object.defineProperty(exports, "UserKeyboard", { enumerable: true, get: function () { return design_system_1.UserKeyboard; } });
Object.defineProperty(exports, "SettingsKeyboard", { enumerable: true, get: function () { return design_system_1.SettingsKeyboard; } });
Object.defineProperty(exports, "SupportKeyboard", { enumerable: true, get: function () { return design_system_1.SupportKeyboard; } });
Object.defineProperty(exports, "WalletKeyboard", { enumerable: true, get: function () { return design_system_1.WalletKeyboard; } });
const keyboardFactories = {
    home: () => (0, design_system_1.MainMenuKeyboard)(),
    shop: design_system_1.ShopKeyboard,
    profile: design_system_1.UserKeyboard,
    wallet: design_system_1.WalletKeyboard,
    payment: design_system_1.PaymentKeyboard,
    support: design_system_1.SupportKeyboard,
    freeAccount: design_system_1.UserKeyboard,
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
