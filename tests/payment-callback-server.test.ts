import { describe, it, expect, vi, beforeEach } from "vitest";
import { notifyUser } from "../src/services/payment-callback-server";
import { prisma } from "../src/services/prisma";
import { PaymentInvoiceService } from "../src/modules/payment/payment.service";

vi.mock("../src/services/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("../src/modules/payment/payment.service", () => ({
  PaymentInvoiceService: {
    markNotification: vi.fn(),
  },
}));

vi.mock("../src/bot/keyboards/design-system", () => ({
  paymentSuccessKeyboard: vi.fn(() => ({ reply_markup: { inline_keyboard: [] } })),
  paymentFailureKeyboard: vi.fn(() => ({ reply_markup: { inline_keyboard: [] } })),
  PaymentKeyboard: vi.fn(() => ({ keyboard: [] })),
  MainMenuKeyboard: vi.fn(() => ({ keyboard: [] })),
  ShopKeyboard: vi.fn(() => ({ keyboard: [] })),
  UserKeyboard: vi.fn(() => ({ keyboard: [] })),
  WalletKeyboard: vi.fn(() => ({ keyboard: [] })),
  SupportKeyboard: vi.fn(() => ({ keyboard: [] })),
  AdminKeyboard: vi.fn(() => ({ keyboard: [] })),
  SettingsKeyboard: vi.fn(() => ({ keyboard: [] })),
}));

vi.mock("../src/bot/keyboards/custom-emoji", () => ({
  composeCustomEmojiMessage: vi.fn((parts: any[]) => ({
    text: parts.map((p) => (typeof p === "string" ? p : (p?.emoji ?? ""))).join(""),
    entities: [],
  })),
  customEmoji: vi.fn((emoji: string) => ({ emoji })),
}));

vi.mock("../src/utils/messages", () => ({
  errorMessage: vi.fn(() => "ERROR_MESSAGE"),
  walletSummaryMessage: vi.fn(() => "WALLET_MESSAGE"),
  purchaseSuccessMessage: vi.fn(
    ({ productTitle, username, subscriptionLink, config }) => `SUCCESS ${productTitle} ${username} ${subscriptionLink ?? ""} ${config ?? ""}`,
  ),
}));

describe("payment notification", () => {
  const sendMessage = vi.fn();

  const bot: any = {
    telegram: {
      sendMessage,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("بعد از پرداخت موفق محصول، اکانت را برای کاربر ارسال می‌کند", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user_1",
      telegramId: "123456789",
    } as any);

    const payload = {
      invoice: {
        id: "inv_1",
        userId: "user_1",
        amount: 72000,
      },
      product: {
        id: "product_1",
        title: "10GB | 30 روز",
      },
      account: {
        id: "acc_1",
        username: "test-user",
        subscriptionLink: "https://sub.example.com/abc",
        configLink: null,
        config: "vless://test-config",
      },
    };

    await notifyUser(bot, payload);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "user_1" },
    });

    expect(sendMessage).toHaveBeenCalledTimes(1);

    expect(sendMessage).toHaveBeenCalledWith(
      123456789,
      expect.stringContaining("SUCCESS"),
      expect.objectContaining({
        entities: [],
      }),
    );

    expect(PaymentInvoiceService.markNotification).toHaveBeenCalledWith("inv_1", "SENT", {
      type: "product_purchase",
      productId: "product_1",
      accountId: "acc_1",
    });
  });

  it("اگر payload محصول یا اکانت نداشته باشد، پیام موفقیت محصول ارسال نمی‌کند", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user_1",
      telegramId: "123456789",
    } as any);

    await notifyUser(bot, {
      invoice: {
        id: "inv_2",
        userId: "user_1",
        amount: 72000,
      },
    });

    expect(sendMessage).not.toHaveBeenCalled();
    expect(PaymentInvoiceService.markNotification).not.toHaveBeenCalled();
  });

  it("اگر ارسال پیام تلگرام خطا بدهد، notification را FAILED می‌کند", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user_1",
      telegramId: "123456789",
    } as any);

    sendMessage.mockRejectedValueOnce(new Error("Telegram blocked bot"));

    await notifyUser(bot, {
      invoice: {
        id: "inv_3",
        userId: "user_1",
        amount: 72000,
      },
      product: {
        id: "product_1",
        title: "10GB | 30 روز",
      },
      account: {
        id: "acc_1",
        username: "test-user",
        subscriptionLink: "https://sub.example.com/abc",
        configLink: null,
        config: "vless://test-config",
      },
    });

    expect(PaymentInvoiceService.markNotification).toHaveBeenCalledWith("inv_3", "FAILED", {
      error: "Telegram blocked bot",
    });
  });
});
