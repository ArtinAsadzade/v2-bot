import { describe, expect, it } from "vitest";
import { MISSING_REWARD_PRODUCT_LABEL, PredictionService } from "../src/modules/prediction/prediction.service";

const product = {
  id: "64f000000000000000000101",
  title: "۵۰ گیگ | ۳۰ روز",
  price: 250000,
  duration: 30,
  trafficBytes: 50n * 1024n * 1024n * 1024n,
  mode: "xray_auto",
  category: { name: "VIP" },
};

describe("PredictionService reward display", () => {
  it("shows wallet reward as Persian wallet charge label", () => {
    expect(PredictionService.rewardLabel({ rewardType: "wallet", rewardWalletAmount: 120000 })).toBe("💰 ۱۲۰٬۰۰۰ تومان شارژ کیف پول");
  });

  it("shows product title and never generic product label when product is loaded", () => {
    const label = PredictionService.rewardLabel({ rewardType: "product", rewardProductId: product.id, rewardProduct: product });

    expect(label).toBe("📦 ۵۰ گیگ | ۳۰ روز");
    expect(label).not.toBe("📦 محصول");
  });

  it("shows Persian missing product fallback instead of generic product", () => {
    expect(PredictionService.rewardLabel({ rewardType: "product", rewardProductId: product.id })).toBe(MISSING_REWARD_PRODUCT_LABEL);
  });

  it("builds user product details with title duration and traffic", () => {
    const details = PredictionService.rewardDetails({ rewardType: "product", rewardProduct: product }, "user");

    expect(details).toContain("🎁 جایزه: 📦 ۵۰ گیگ | ۳۰ روز");
    expect(details).toContain("📅 اعتبار: ۳۰ روز");
    expect(details).toContain("📊 حجم: ۵۰ گیگابایت");
  });

  it("builds admin product details with title, category and value", () => {
    const details = PredictionService.rewardDetails({ rewardType: "product", rewardProduct: product }, "admin");

    expect(details).toContain("🎁 جایزه محصولی");
    expect(details).toContain("📦 محصول: ۵۰ گیگ | ۳۰ روز");
    expect(details).toContain("🏷 دسته‌بندی: VIP");
    expect(details).toContain("💰 ارزش محصول: ۲۵۰٬۰۰۰ تومان");
  });

  it("builds admin warning when product reward is missing", () => {
    expect(PredictionService.rewardDetails({ rewardType: "product", rewardProductId: product.id }, "admin")).toContain("⚠️ محصول جایزه پیدا نشد. لطفاً جایزه را دوباره انتخاب کنید.");
  });
});
