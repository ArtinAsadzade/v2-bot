import {
  AdminKeyboard,
  AdminPaymentsKeyboard,
  AdminProductsKeyboard,
  AdminSettingsKeyboard,
  AdminUsersKeyboard,
  MainMenuKeyboard,
  PaymentKeyboard,
  PurchaseKeyboard,
  ShopKeyboard,
  UserKeyboard,
  SettingsKeyboard,
  SupportKeyboard,
  WalletKeyboard,
  buildReplyKeyboard,
  quickReplyRoutes,
  type ReplyKeyboardScope,
} from "./design-system";

const keyboardFactories: Record<ReplyKeyboardScope, () => ReturnType<typeof buildReplyKeyboard>> = {
  home: () => MainMenuKeyboard(),
  shop: ShopKeyboard,
  profile: UserKeyboard,
  wallet: WalletKeyboard,
  payment: PaymentKeyboard,
  support: SupportKeyboard,
  freeAccount: UserKeyboard,
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

export { MainMenuKeyboard, UserKeyboard, WalletKeyboard, ShopKeyboard, PaymentKeyboard, PurchaseKeyboard, SupportKeyboard, AdminKeyboard, AdminProductsKeyboard, AdminPaymentsKeyboard, AdminUsersKeyboard, AdminSettingsKeyboard, SettingsKeyboard };
