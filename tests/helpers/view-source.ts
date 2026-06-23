import { readFileSync } from "node:fs";

const adminViewFiles = [
  "src/bot/views/admin.views.ts",
  "src/bot/views/admin/admin-xray.views.ts",
  "src/bot/views/admin/admin-xray-panels.views.ts",
  "src/bot/views/admin/admin-xray-sync.views.ts",
  "src/bot/views/admin/admin-dashboard.views.ts",
  "src/bot/views/admin/admin-users.views.ts",
  "src/bot/views/admin/admin-products.views.ts",
  "src/bot/views/admin/admin-categories.views.ts",
  "src/bot/views/admin/admin-wallets.views.ts",
  "src/bot/views/admin/admin-settings.views.ts",
  "src/bot/views/admin/admin-referrals.views.ts",
  "src/bot/views/admin/admin-coupons.views.ts",
  "src/bot/views/admin/admin-payments.views.ts",
  "src/bot/views/admin/admin-broadcast.views.ts",
  "src/bot/views/admin/admin-support.views.ts",
  "src/bot/views/admin/index.ts",
];

const originalAdminOrder = [
  "admin.xrayCenter", "admin.xrayPanels", "admin.xrayPanel", "admin.xraySync", "admin.xraySyncPreview", "admin.xrayBulkInbound", "admin.xrayBulkInboundPanel", "admin.xrayBulkInboundPreview", "admin.xraySettings", "admin.xrayClients", "admin.xrayClient",
  "admin.dashboard", "admin.store", "admin.finance", "admin.usersSupport", "admin.content", "admin.botSettings", "admin.monitoring", "admin.users", "admin.user", "admin.user.blocks", "admin.products", "admin.product", "admin.categories", "admin.category", "admin.accounts", "admin.account", "admin.account.move", "admin.wallets", "admin.wallet", "admin.freeAccounts", "admin.crypto", "admin.forcedJoin", "admin.productGuides", "admin.referrals", "admin.analytics", "admin.coupons", "admin.coupon", "admin.transactions", "admin.notifications", "admin.settings", "admin.paymentGateway", "admin.paymentStats", "admin.invoices", "admin.invoice", "admin.deposits", "admin.deposit", "admin.orders", "admin.tickets", "admin.ticket",
];

export function readAdminViewsSource(): string {
  const source = adminViewFiles.map((file) => readFileSync(file, "utf8")).join("\n");
  const chunks = new Map<string, string>();
  const matches = [...source.matchAll(/registerView\("(admin\.[^"]+)"[\s\S]*?(?=\n\s*registerView\("admin\.|\n}\n\nimport |\nexport function registerAdminViews|$)/g)];
  for (const match of matches) chunks.set(match[1], match[0]);
  return [readFileSync("src/bot/views/admin/index.ts", "utf8"), ...originalAdminOrder.map((view) => chunks.get(view) ?? "")].join("\n");
}
