export const pendingInvoiceExistsMessage = () =>
  "شما از قبل یک فاکتور پرداخت‌نشده برای این محصول دارید. می‌توانید پرداخت را ادامه دهید یا آن را لغو کرده و فاکتور جدید بسازید.";
export const previousPurchaseProcessingMessage = () =>
  "Your previous purchase is still being processed. Please wait or cancel it if it is stuck.";
export const unauthorizedMessage = () => "⛔ دسترسی غیرمجاز";

export function purchaseStepMessage(step: 1 | 2 | 3 | 4 | 5, title: string) {
  const labels = {
    1: "مرحله ۱ از ۵: انتخاب سرویس",
    2: "مرحله ۲ از ۵: انتخاب پرداخت",
    3: "مرحله ۳ از ۵: تایید نهایی",
    4: "مرحله ۴ از ۵: ساخت اکانت",
    5: "مرحله ۵ از ۵: تحویل",
  } as const;
  return `🛒 ${labels[step]}\n\n${title}`;
}

export const purchaseUxMessages = {
  creatingAccount: "🛠 در حال ساخت اکانت...",
  paymentConfirmedPreparing: "✅ پرداخت تایید شد، در حال آماده‌سازی سرویس...",
  serviceReady: "✅ سرویس شما آماده شد.",
} as const;
