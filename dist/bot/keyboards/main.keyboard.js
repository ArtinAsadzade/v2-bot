"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.homeKeyboard = homeKeyboard;
exports.navigationKeyboard = navigationKeyboard;
const panel_ui_1 = require("../navigation/panel-ui");
const design_system_1 = require("./design-system");
function homeKeyboard(isAdmin = false) {
    const rows = [
        [{ text: design_system_1.labels.shop, action: (0, panel_ui_1.callbackFor)("shop.categories"), tone: "primary" }, { text: design_system_1.labels.wallet, action: (0, panel_ui_1.callbackFor)("wallet"), tone: "primary" }],
        [{ text: design_system_1.labels.orders, action: (0, panel_ui_1.callbackFor)("account.details"), tone: "success" }, { text: design_system_1.labels.support, action: (0, panel_ui_1.callbackFor)("support") }],
        [{ text: "🆓 اکانت تست", action: (0, panel_ui_1.callbackFor)("freeAccount") }, { text: "🎁 دعوت دوستان", action: (0, panel_ui_1.callbackFor)("referral") }],
    ];
    if (isAdmin) {
        rows.push([{ text: design_system_1.labels.adminDashboard, action: (0, panel_ui_1.callbackFor)("admin.dashboard"), tone: "primary" }]);
    }
    return (0, design_system_1.buildInlineKeyboard)(rows);
}
function navigationKeyboard(backTo = "home") {
    return (0, design_system_1.buildInlineKeyboard)([
        [{ text: design_system_1.labels.back, action: backTo.startsWith("nav:") || backTo.includes(":") ? backTo : (0, panel_ui_1.callbackFor)(backTo) }, { text: design_system_1.labels.home, action: (0, panel_ui_1.callbackFor)("home") }],
        [{ text: design_system_1.labels.cancel, action: "cancel", tone: "danger" }],
    ]);
}
