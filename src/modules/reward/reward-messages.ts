import type { ProductDeliverySuccess } from "../payment/payment.types";

export const productRewardClaimKeyboard = [
  [{ text: "📦 سرویس‌های من", callback_data: "nav:services" }],
  [{ text: "🎁 جوایز من", callback_data: "nav:account.rewards" }],
];

export const productRewardFailedKeyboard = [
  [{ text: "🎫 پشتیبانی", callback_data: "nav:support" }],
  [{ text: "🎁 جوایز من", callback_data: "nav:account.rewards" }],
];

export function formatRewardTraffic(bytes?: bigint | number | null) {
  if (bytes === undefined || bytes === null) return "—";
  const numericBytes = typeof bytes === "bigint" ? Number(bytes) : bytes;
  if (!Number.isFinite(numericBytes) || numericBytes < 0) return "—";
  if (numericBytes === 0) return "نامحدود";
  const gb = numericBytes / 1024 / 1024 / 1024;
  return `${gb.toLocaleString("fa-IR", { maximumFractionDigits: gb < 10 ? 1 : 0 })} گیگابایت`;
}

export function productRewardSuccessMessage(delivery: ProductDeliverySuccess) {
  const duration = delivery.product.durationDays ?? delivery.product.duration;
  const traffic = formatRewardTraffic(delivery.product.trafficBytes);
  const expiresAt = delivery.expiresAt ? `\n\n📅 تاریخ انقضا:\n${delivery.expiresAt.toLocaleDateString("fa-IR")}` : "";

  return `🎁 جایزه شما با موفقیت فعال شد

سرویس جایزه‌ای شما آماده استفاده است.
برای مشاهده مشخصات سرویس، لینک اشتراک، QR و کانفیگ‌ها وارد بخش «سرویس‌های من» شوید.

📦 محصول:
${delivery.product.title}

⏳ اعتبار:
${duration.toLocaleString("fa-IR")} روز

📊 حجم:
${traffic}${expiresAt}`;
}

export function productRewardAlreadyClaimedMessage() {
  return `✅ این جایزه قبلاً دریافت و فعال شده است.

برای مشاهده مشخصات سرویس وارد بخش «سرویس‌های من» شوید.`;
}

export function productRewardManualReviewMessage() {
  return "⚠️ جایزه شما ثبت شد، اما فعال‌سازی سرویس نیاز به بررسی پشتیبانی دارد.";
}
