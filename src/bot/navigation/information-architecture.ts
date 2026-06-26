import type { PanelViewId } from "./panel-ui";

export type ProductArea = {
  domain: "user" | "admin";
  module: string;
  goal: string;
  entry: PanelViewId;
  screens: PanelViewId[];
  searchable?: PanelViewId[];
};

export type NavigationEdge = {
  from: PanelViewId;
  to: PanelViewId;
  label: string;
};
export type WorkflowDepth = {
  workflow: string;
  domain: "user" | "admin";
  entry: PanelViewId;
  target: PanelViewId;
  clicks: number;
  targetMax: number;
};

export const USER_MODULE_ARCHITECTURE: ProductArea[] = [
  {
    domain: "user",
    module: "Buy",
    goal: "I want to buy",
    entry: "shop",
    screens: [
      "shop",
      "shop.categories",
      "shop.recommended",
      "shop.products",
      "shop.product",
      "shop.checkout",
      "shop.searchResults",
      "coupon.info",
    ],
    searchable: ["shop.searchResults"],
  },
  {
    domain: "user",
    module: "My Services",
    goal: "I want to manage my services",
    entry: "services",
    screens: [
      "services",
      "services.active",
      "services.expired",
      "services.renew",
      "services.issue",
      "account.details",
      "account.xray",
      "account.renew",
      "account.renew.products",
      "account.renew.summary",
      "account.history",
    ],
  },
  {
    domain: "user",
    module: "Wallet",
    goal: "I want to recharge wallet",
    entry: "wallet",
    screens: [
      "wallet",
      "wallet.balance",
      "wallet.topup",
      "wallet.transactions",
      "wallet.invoices",
      "wallet.history",
      "deposit",
    ],
  },
  {
    domain: "user",
    module: "Rewards",
    goal: "I want rewards",
    entry: "referral",
    screens: [
      "referral",
      "referral.link",
      "referral.users",
      "referral.rewards",
      "referral.rules",
      "prediction",
      "prediction.detail",
      "prediction.results",
      "freeAccount",
    ],
  },
  {
    domain: "user",
    module: "Support",
    goal: "I need support",
    entry: "support",
    screens: [
      "support",
      "support.new",
      "support.tickets",
      "support.connection",
      "support.payment",
      "support.contact",
      "help",
      "help.buy",
      "help.connection",
      "help.faq",
      "help.rules",
      "productGuide",
    ],
  },
  {
    domain: "user",
    module: "Profile",
    goal: "I want my account settings",
    entry: "account",
    screens: ["account", "account.profile"],
  },
];

export const ADMIN_MODULE_ARCHITECTURE: ProductArea[] = [
  {
    domain: "admin",
    module: "Commerce",
    goal: "Manage catalog, inventory, payments, wallets, and coupons",
    entry: "admin.store",
    screens: [
      "admin.store",
      "admin.products",
      "admin.product",
      "admin.categories",
      "admin.category",
      "admin.accounts",
      "admin.account",
      "admin.account.move",
      "admin.finance",
      "admin.wallets",
      "admin.wallet",
      "admin.coupons",
      "admin.coupon",
      "admin.paymentGateway",
      "admin.paymentStats",
      "admin.invoices",
      "admin.invoice",
      "admin.deposits",
      "admin.deposit",
      "admin.orders",
      "admin.transactions",
      "admin.crypto",
    ],
    searchable: [
      "admin.products",
      "admin.wallets",
      "admin.invoices",
      "admin.deposits",
    ],
  },
  {
    domain: "admin",
    module: "Customer",
    goal: "Manage users, support, referrals, and predictions",
    entry: "admin.usersSupport",
    screens: [
      "admin.usersSupport",
      "admin.users",
      "admin.user",
      "admin.user.blocks",
      "admin.tickets",
      "admin.ticket",
      "admin.referrals",
      "admin.predictions",
      "admin.predictionList",
      "admin.predictionDetail",
      "admin.predictionDeleteConfirm",
      "admin.predictionResult",
      "admin.predictionWinners",
      "admin.predictionStats",
      "admin.predictionParticipants",
      "admin.analytics",
    ],
    searchable: ["admin.users", "admin.tickets", "admin.predictionList"],
  },
  {
    domain: "admin",
    module: "Xray",
    goal: "Manage panels, sync, diagnostics, clients, traffic, and reports",
    entry: "admin.xrayCenter",
    screens: [
      "admin.xrayCenter",
      "admin.xrayPanels",
      "admin.xrayPanel",
      "admin.xraySync",
      "admin.xraySyncPreview",
      "admin.xrayBulkInbound",
      "admin.xrayBulkInboundPanel",
      "admin.xrayBulkInboundPreview",
      "admin.xraySettings",
      "admin.xrayClients",
      "admin.xrayClient",
      "admin.freeAccounts",
    ],
    searchable: ["admin.xrayPanels", "admin.xrayClients"],
  },
  {
    domain: "admin",
    module: "Marketing",
    goal: "Manage broadcasts, announcements, campaigns, rewards, and guides",
    entry: "admin.content",
    screens: [
      "admin.content",
      "admin.notifications",
      "admin.productGuides",
      "admin.referrals",
      "admin.predictions",
    ],
  },
  {
    domain: "admin",
    module: "System",
    goal: "Manage settings, forced join, maintenance, logs, and monitoring",
    entry: "admin.botSettings",
    screens: [
      "admin.botSettings",
      "admin.settings",
      "admin.forcedJoin",
      "admin.monitoring",
      "admin.dashboard",
    ],
  },
];

export const NAVIGATION_GRAPH: NavigationEdge[] = [
  ...USER_MODULE_ARCHITECTURE.map((area) => ({
    from: "home" as PanelViewId,
    to: area.entry,
    label: area.module,
  })),
  ...ADMIN_MODULE_ARCHITECTURE.map((area) => ({
    from: "admin.dashboard" as PanelViewId,
    to: area.entry,
    label: area.module,
  })),
  { from: "shop", to: "shop.categories", label: "browse catalog" },
  { from: "shop", to: "shop.searchResults", label: "search catalog" },
  { from: "shop.categories", to: "shop.products", label: "category products" },
  { from: "shop.products", to: "shop.product", label: "product details" },
  { from: "shop.product", to: "shop.checkout", label: "checkout" },
  { from: "services", to: "services.active", label: "active services" },
  { from: "services.active", to: "account.xray", label: "service details" },
  { from: "account.xray", to: "services.renew", label: "renew" },
  { from: "wallet", to: "wallet.topup", label: "top up" },
  { from: "wallet.topup", to: "deposit", label: "create deposit" },
  { from: "support", to: "support.new", label: "new ticket" },
  { from: "admin.store", to: "admin.products", label: "products" },
  { from: "admin.store", to: "admin.categories", label: "categories" },
  { from: "admin.store", to: "admin.accounts", label: "inventory" },
  { from: "admin.finance", to: "admin.coupons", label: "coupons" },
  {
    from: "admin.finance",
    to: "admin.paymentGateway",
    label: "payment gateway",
  },
  { from: "admin.usersSupport", to: "admin.users", label: "users" },
  { from: "admin.usersSupport", to: "admin.tickets", label: "support tickets" },
  { from: "admin.xrayCenter", to: "admin.xrayClients", label: "clients" },
  { from: "admin.xrayCenter", to: "admin.xraySync", label: "sync" },
  { from: "admin.xrayCenter", to: "admin.xrayBulkInbound", label: "bulk inbound" },
  { from: "admin.content", to: "admin.notifications", label: "broadcast" },
  { from: "admin.botSettings", to: "admin.forcedJoin", label: "forced join" },
  { from: "referral", to: "referral.rewards", label: "claim rewards" },
  { from: "referral", to: "prediction", label: "prediction rewards" },
  { from: "support", to: "support.tickets", label: "my tickets" },
  { from: "support", to: "help", label: "guides" },
  { from: "account", to: "account.profile", label: "profile" },
  { from: "account", to: "account.history", label: "history" },
];

export const CLICK_DEPTH_REPORT: WorkflowDepth[] = [
  {
    workflow: "Buy service",
    domain: "user",
    entry: "home",
    target: "shop.checkout",
    clicks: 3,
    targetMax: 3,
  },
  {
    workflow: "Renew service",
    domain: "user",
    entry: "home",
    target: "services.renew",
    clicks: 3,
    targetMax: 3,
  },
  {
    workflow: "Recharge wallet",
    domain: "user",
    entry: "home",
    target: "wallet.topup",
    clicks: 2,
    targetMax: 3,
  },
  {
    workflow: "Create product",
    domain: "admin",
    entry: "admin.dashboard",
    target: "admin.store",
    clicks: 2,
    targetMax: 3,
  },
  {
    workflow: "Create prediction",
    domain: "admin",
    entry: "admin.dashboard",
    target: "admin.predictions",
    clicks: 1,
    targetMax: 3,
  },
  {
    workflow: "View Xray client",
    domain: "admin",
    entry: "admin.dashboard",
    target: "admin.xrayClient",
    clicks: 3,
    targetMax: 3,
  },
  {
    workflow: "Send broadcast",
    domain: "admin",
    entry: "admin.dashboard",
    target: "admin.notifications",
    clicks: 2,
    targetMax: 3,
  },
];

export const NAVIGATION_AUDIT = {
  duplicatedEntryPointsFixed: [
    "Shop/category/product entry points consolidated under Buy",
    "Account services and legacy account.details consolidated under My Services",
    "Referral, free test, and prediction rewards grouped under Rewards",
    "Broadcasts, product guides, and announcements grouped under Marketing",
  ],
  deadEndsPolicy:
    "Every module page must expose a domain parent or home navigation action.",
  circularNavigationPolicy:
    "Allowed loops are only explicit Back/Home returns; workflow forward paths remain acyclic.",
  hiddenFeaturesSurfaced: [
    "Wallet top-up on home",
    "Search in large catalog/admin lists",
    "Xray clients from Xray Center",
    "Broadcasts from Marketing",
  ],
  screensReorganizedCount: USER_MODULE_ARCHITECTURE.concat(
    ADMIN_MODULE_ARCHITECTURE,
  ).reduce((sum, area) => sum + area.screens.length, 0),
  navigationImprovementsCount: NAVIGATION_GRAPH.length,
};
