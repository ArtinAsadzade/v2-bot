import { describe, expect, it } from "vitest";
import {
  formatRewardTraffic,
  productRewardAlreadyClaimedMessage,
  productRewardClaimKeyboard,
  productRewardFailedKeyboard,
  productRewardManualReviewMessage,
  productRewardSuccessMessage,
} from "../src/modules/reward/reward-messages";
import type { ProductDeliverySuccess } from "../src/modules/payment/payment.types";

const delivery = {
  ok: true,
  product: {
    id: "internal-product-id",
    title: "اشتراک طلایی ۳۰ روزه",
    duration: 30,
    durationDays: 30,
    trafficBytes: 20n * 1024n * 1024n * 1024n,
  },
  expiresAt: new Date("2026-08-01T00:00:00.000Z"),
  order: {},
  account: { id: "account-id", username: null, subscriptionLink: null, configLink: null, config: null },
  orderItem: null,
  totalAmount: 0,
  originalAmount: 0,
  discountAmount: 0,
  couponId: null,
} as unknown as ProductDeliverySuccess;

describe("product reward claim UX messages", () => {
  it("product reward claim success message includes activation and services guidance", () => {
    const message = productRewardSuccessMessage(delivery);

    expect(message).toContain("جایزه شما با موفقیت فعال شد");
    expect(message).toContain("سرویس‌های من");
    expect(message).toContain("اشتراک طلایی ۳۰ روزه");
    expect(message).toContain("۳۰ روز");
    expect(message).toContain("۲۰ گیگابایت");
    expect(message).toContain("تاریخ انقضا");
  });

  it("product reward claim success keyboard includes my services", () => {
    expect(productRewardClaimKeyboard[0][0]).toMatchObject({ text: "📦 سرویس‌های من" });
  });

  it("duplicate product reward claim shows already activated message and services keyboard", () => {
    expect(productRewardAlreadyClaimedMessage()).toContain("قبلاً دریافت و فعال شده است");
    expect(productRewardAlreadyClaimedMessage()).toContain("سرویس‌های من");
    expect(productRewardClaimKeyboard.flat().map((button) => button.text)).toContain("📦 سرویس‌های من");
  });

  it("failed product reward delivery does not show success and shows support button", () => {
    expect(productRewardManualReviewMessage()).not.toContain("جایزه شما با موفقیت فعال شد");
    expect(productRewardManualReviewMessage()).toContain("بررسی پشتیبانی");
    expect(productRewardFailedKeyboard.flat().map((button) => button.text)).toContain("🎫 پشتیبانی");
  });

  it("wallet reward claim message remains wallet-specific", () => {
    const walletMessage = "🎁 جایزه شما با موفقیت دریافت شد.";

    expect(walletMessage).not.toContain("فعال شد");
    expect(walletMessage).not.toContain("سرویس‌های من");
  });

  it("all product reward messages are Persian and user-facing", () => {
    const text = [
      productRewardSuccessMessage(delivery),
      productRewardAlreadyClaimedMessage(),
      productRewardManualReviewMessage(),
    ].join("\n");

    expect(text).toMatch(/[آ-ی]/);
    expect(text).not.toMatch(/internal-product-id|account-id|undefined|null/);
  });

  it("callback_data values are under Telegram 64-byte limit", () => {
    const callbacks = [...productRewardClaimKeyboard, ...productRewardFailedKeyboard]
      .flat()
      .map((button) => button.callback_data);

    expect(callbacks.every((callback) => Buffer.byteLength(callback, "utf8") < 64)).toBe(true);
  });

  it("formats unavailable or unlimited traffic in Persian", () => {
    expect(formatRewardTraffic(null)).toBe("—");
    expect(formatRewardTraffic(0n)).toBe("نامحدود");
  });
});
