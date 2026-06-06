"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerHandlers = registerHandlers;
const start_1 = require("./start");
const wallet_1 = require("./wallet");
const shop_1 = require("./shop");
const start_2 = require("./deposit/start");
const start_3 = require("./support/start");
const panel_1 = require("./admin/panel");
const referral_1 = require("./referral");
const free_config_1 = require("./free-config");
function registerHandlers(bot) {
    (0, start_1.registerStartHandlers)(bot);
    (0, wallet_1.registerWalletHandlers)(bot);
    (0, shop_1.registerShopHandlers)(bot);
    (0, start_2.registerDepositHandlers)(bot);
    (0, start_3.registerSupportHandlers)(bot);
    (0, referral_1.registerReferralHandlers)(bot);
    (0, free_config_1.registerFreeConfigHandlers)(bot);
    (0, panel_1.registerAdminHandlers)(bot);
}
