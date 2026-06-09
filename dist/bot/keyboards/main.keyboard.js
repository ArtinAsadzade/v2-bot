"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.homeKeyboard = homeKeyboard;
exports.navigationKeyboard = navigationKeyboard;
const design_system_1 = require("./design-system");
function homeKeyboard(isAdmin = false) {
    const rows = [
        [{ text: design_system_1.labels.shop, action: "shop", tone: "primary" }, { text: design_system_1.labels.wallet, action: "wallet", tone: "primary" }],
        [{ text: design_system_1.labels.orders, action: "account", tone: "success" }, { text: design_system_1.labels.support, action: "support" }],
        [{ text: "🆓 اکانت تست", action: "freeAccount" }, { text: "🎁 دعوت دوستان", action: "referral" }],
    ];
    if (isAdmin) {
        rows.push([{ text: design_system_1.labels.adminDashboard, action: "admin:dashboard", tone: "primary" }]);
    }
    return (0, design_system_1.buildInlineKeyboard)(rows);
}
function navigationKeyboard(backTo = "home") {
    return (0, design_system_1.buildInlineKeyboard)([
        [{ text: design_system_1.labels.back, action: backTo }, { text: design_system_1.labels.home, action: "home" }],
        [{ text: design_system_1.labels.cancel, action: "cancel", tone: "danger" }],
    ]);
}
