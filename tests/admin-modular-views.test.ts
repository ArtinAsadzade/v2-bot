import { describe, expect, test } from "vitest";
import { readAdminViewsSource } from "./helpers/view-source";
import { registerAdminViews } from "../src/bot/views/admin";
import { callbackFor, isValidCallbackData, registeredPanelViewIds } from "../src/bot/navigation/panel-ui";

const source = readAdminViewsSource();
const knownAdminViews = [...source.matchAll(/registerView\("(admin\.[^"]+)"/g)].map((match) => match[1]);

describe("modular admin view registration", () => {
  test("central registration calls every admin domain registrar", () => {
    const index = source.match(/export function registerAdminViews\(\) \{[\s\S]*?\n\}/)?.[0] ?? "";
    for (const registrar of ["registerAdminDashboardViews", "registerAdminXrayViews", "registerAdminXrayPanelViews", "registerAdminXraySyncViews", "registerAdminSettingsViews", "registerAdminPaymentViews", "registerAdminSupportViews", "registerAdminCouponViews", "registerAdminReferralViews", "registerAdminBroadcastViews", "registerAdminProductViews", "registerAdminCategoryViews", "registerAdminUserViews", "registerAdminWalletViews"]) {
      expect(index).toContain(`${registrar}();`);
    }
  });

  test("known admin views remain registered without duplicates", () => {
    registerAdminViews();
    const registered = new Set(registeredPanelViewIds());
    expect(new Set(knownAdminViews).size).toBe(knownAdminViews.length);
    for (const view of knownAdminViews) expect(registered.has(view as never)).toBe(true);
  });

  test("critical admin features remain reachable", () => {
    for (const view of ["admin.xrayCenter", "admin.xrayBulkInbound", "admin.xrayBulkInboundPanel", "admin.xrayBulkInboundPreview", "admin.xraySettings", "admin.products", "admin.categories", "admin.users", "admin.paymentGateway", "admin.coupons", "admin.tickets", "admin.notifications"]) {
      expect(source).toContain(`registerView("${view}"`);
      expect(isValidCallbackData(callbackFor(view as never))).toBe(true);
    }
  });

  test("visible admin callbackFor targets exist and stay under Telegram callback_data limit", () => {
    const registered = new Set(knownAdminViews);
    for (const target of [...source.matchAll(/callbackFor\("(admin\.[^"]+)"/g)].map((match) => match[1])) {
      expect(registered.has(target)).toBe(true);
      expect(Buffer.byteLength(callbackFor(target as never), "utf8")).toBeLessThanOrEqual(64);
    }
  });
});
