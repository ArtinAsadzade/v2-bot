import {
  AdminKeyboard,
  MainMenuKeyboard,
  PaymentKeyboard,
  PurchaseKeyboard,
  SettingsKeyboard,
  SupportKeyboard,
  WalletKeyboard,
  buildReplyKeyboard,
  quickReplyRoutes,
  type ReplyKeyboardScope,
} from "./design-system";

const keyboardFactories: Record<ReplyKeyboardScope, () => ReturnType<typeof buildReplyKeyboard>> = {
  home: () => MainMenuKeyboard(),
  shop: PurchaseKeyboard,
  profile: () => buildReplyKeyboard([[{ text: "📦 سفارش‌های من" }, { text: "👛 کیف پول" }], [{ text: "🏠 منوی اصلی" }]]),
  wallet: WalletKeyboard,
  payment: PaymentKeyboard,
  support: SupportKeyboard,
  freeAccount: () => buildReplyKeyboard([[{ text: "🎁 دریافت اکانت تست" }, { text: "📦 سفارش‌های من" }], [{ text: "🏠 منوی اصلی" }]]),
  admin: AdminKeyboard,
  settings: SettingsKeyboard,
};

export type { ReplyKeyboardScope };

export function replyKeyboard(scope: ReplyKeyboardScope) {
  return keyboardFactories[scope]();
}

export function replyKeyboardSignature(scope: ReplyKeyboardScope) {
  return JSON.stringify(replyKeyboard(scope).reply_markup.keyboard.map((row) => row.map((button) => (typeof button === "string" ? button : button.text))));
}

export function quickReplyTarget(text: string) {
  return quickReplyRoutes[text];
}

export { MainMenuKeyboard, WalletKeyboard, PaymentKeyboard, PurchaseKeyboard, SupportKeyboard, AdminKeyboard, SettingsKeyboard };
