import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { callbackFor, isValidCallbackData } from "../src/bot/navigation/panel-ui";
import { adminDashboardViewKeyboard } from "../src/bot/keyboards/view-keyboards";
import { homeKeyboard } from "../src/bot/keyboards/common.keyboard";

const adminViews = readFileSync("src/bot/views/admin.views.ts", "utf8");
const predictionViews = readFileSync("src/bot/views/prediction.views.ts", "utf8");
const registerModern = readFileSync("src/bot/handlers/modern/register-modern-handlers.ts", "utf8");
const predictionHandlers = readFileSync("src/bot/handlers/modern/prediction.handlers.ts", "utf8");
const xrayHandlers = readFileSync("src/bot/handlers/modern/admin/admin-xray.handlers.ts", "utf8");
const flowEngine = readFileSync("src/bot/flows/flow-engine.ts", "utf8");

const flatten = (keyboard: ReturnType<typeof homeKeyboard>) => keyboard.flat().map((button) => button.text);
const actions = (keyboard: ReturnType<typeof homeKeyboard>) => keyboard.flat().map((button) => button.action);

describe("full feature integration audit", () => {
  test("prediction is reachable from user and admin panels and handlers are registered", () => {
    expect(flatten(homeKeyboard(false))).toContain("🔮 پیش‌بینی");
    expect(flatten(adminDashboardViewKeyboard())).toContain("🔮 پیش‌بینی‌ها");
    for (const view of ["prediction", "prediction.detail", "prediction.results", "admin.predictions", "admin.predictionList", "admin.predictionDetail", "admin.predictionResult", "admin.predictionStats", "admin.predictionParticipants"]) {
      expect(predictionViews).toContain(`registerView("${view}"`);
    }
    for (const handler of ["pr:p", "pr:c", "pr:cl", "ap:res", "ap:win", "ap:ann", "ap:close", "ap:arc", "ap:del"]) expect(predictionHandlers).toContain(handler);
    expect(flowEngine).toContain('name !== "prediction_create"');
    expect(registerModern).toContain("registerPredictionHandlers(bot)");
  });

  test("bulk inbound update is visible, previewed, applied, and uses short callbacks", () => {
    for (const view of ["admin.xrayBulkInbound", "admin.xrayBulkInboundPanel", "admin.xrayBulkInboundPreview"]) expect(adminViews).toContain(`registerView("${view}"`);
    expect(adminViews).toContain("📦 بروزرسانی گروهی اینباند");
    expect(adminViews).toContain("productNotDeletedWhere()");
    expect(xrayHandlers).toContain("productNotDeletedWhere()");
    for (const handler of ["admin:xb:t", "admin:xb:all", "admin:xb:clear", "admin:xb:p", "admin:xb:i", "admin:xb:apply"]) expect(xrayHandlers).toContain(handler);
    expect(xrayHandlers).toContain("bulkUpdateXrayInbounds");
    for (const callback of [callbackFor("admin.xrayBulkInbound"), callbackFor("admin.xrayBulkInboundPanel"), callbackFor("admin.xrayBulkInboundPreview"), "admin:xb:all", "admin:xb:clear", "admin:xb:apply"]) {
      expect(isValidCallbackData(callback)).toBe(true);
      expect(Buffer.byteLength(callback, "utf8")).toBeLessThanOrEqual(64);
    }
  });

  test("xray center and settings expose only working operational buttons", () => {
    for (const label of ["📡 پنل‌ها", "👥 کاربران Xray", "🔄 همگام‌سازی", "🧪 تست اتصال", "📦 بروزرسانی گروهی اینباند", "⚙️ تنظیمات Xray"]) expect(adminViews).toContain(label);
    expect(adminViews).not.toContain('{ text: "👤 یوزرنیم"');
    expect(adminViews).toContain('callbackFor("admin.monitoring")');
    expect(adminViews).toContain('callbackFor("admin.paymentGateway")');
  });

  test("visible home/dashboard callbacks are valid and under Telegram limit", () => {
    for (const action of [...actions(homeKeyboard(true)), ...actions(adminDashboardViewKeyboard())]) {
      expect(isValidCallbackData(action)).toBe(true);
      expect(Buffer.byteLength(action, "utf8")).toBeLessThanOrEqual(64);
    }
  });
});
