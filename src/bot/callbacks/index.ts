import { callbackFor, actionFor } from "../navigation/panel-ui";

export const CallbackAction = {
  cancel: "cancel",
  freeConfig: "free_config",
  freeConfigClaim: "free_config:claim",
  flowCancel: "flow:cancel",
  freeAccountClaim: "freeAccount:claim",
  supportChatStart: "support:chat:start",
  referralClaim: "referral:claim",
  referralCopy: "referral:copy",
} as const;

export const nav = {
  home: () => callbackFor("home"),
  shopCategories: () => callbackFor("shop.categories"),
  productGuide: () => callbackFor("productGuide"),
  product: (productId: string) => callbackFor("shop.product", { productId }),
  checkout: (productId: string) => callbackFor("shop.checkout", { productId }),
  wallet: () => callbackFor("wallet"),
  walletHistory: () => callbackFor("wallet.history"),
  deposit: () => callbackFor("deposit"),
  support: () => callbackFor("support"),
  referral: () => callbackFor("referral"),
  account: () => callbackFor("account"),
  accountDetails: () => callbackFor("account.details"),
  renewService: () => callbackFor("account.renew"),
  accountXray: (xrayClientId: string) => callbackFor("account.xray", { xrayClientId }),
  freeAccount: () => callbackFor("freeAccount"),
  adminDashboard: () => callbackFor("admin.dashboard"),
} as const;

export const buyCallbacks = {
  confirm: (productId: string) => actionFor("buy:confirm", productId),
  instant: (productId: string) => actionFor("buy:instant", productId),
  cancelExisting: (productId: string) => actionFor("buy:cancel_existing", productId),
} as const;

export const couponCallbacks = {
  start: (productId: string) => actionFor("flow:start", "coupon_code", productId),
  remove: (productId: string) => actionFor("coupon:remove", productId),
  change: (productId: string) => actionFor("coupon:change", productId),
} as const;

export const supportCallbacks = {
  close: (ticketId: string) => actionFor("support:close", ticketId),
  chat: (ticketId: string) => `support:chat:${ticketId}`,
} as const;

export const xrayCallbacks = {
  subscription: (clientId: string) => `xray:sub:${clientId}`,
  qr: (clientId: string) => `xray:qr:${clientId}`,
  configs: (clientId: string) => `xray:configs:${clientId}`,
} as const;
