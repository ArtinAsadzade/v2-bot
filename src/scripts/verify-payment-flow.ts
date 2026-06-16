import "dotenv/config";
import crypto from "crypto";
import { PaymentInvoiceService } from "../modules/payment/payment.service";
import { FreeAccountService } from "../modules/free-account/free-account.service";
import { UserService } from "../modules/user/user.service";
import { XrayClientService } from "../modules/xray/xray.service";
import { prisma } from "../services/prisma";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for payment-flow verification.");

const tag = `payment-flow-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };

function installMockXrayPanel() {
  const panel = new Map<string, { email: string; subId: string; uuid: string }>();
  (XrayClientService as any).listInbounds = async () => [{ id: 1, enabled: true, remark: "verify" }];
  (XrayClientService as any).createClient = async (input: { email: string }) => {
    const client = { email: input.email, subId: `sub-${input.email}`, uuid: `uuid-${input.email}` };
    panel.set(input.email, client);
    return { id: client.uuid, uuid: client.uuid, subId: client.subId };
  };
  (XrayClientService as any).getClient = async (email: string) => ({ obj: { client: panel.get(email) ?? { email, subId: `sub-${email}`, uuid: `uuid-${email}` } } });
  (XrayClientService as any).verifyPanelClient = async (input: { email: string }) => {
    const client = panel.get(input.email) ?? { email: input.email, subId: `sub-${input.email}`, uuid: `uuid-${input.email}` };
    return { exists: true, detail: { obj: { client } }, panelClientId: client.uuid, subId: client.subId };
  };
  (XrayClientService as any).subLinks = async (subId: string) => [`vless://${subId}`];
  (XrayClientService as any).subscriptionUrl = async (client: { clientSubId?: string | null; clientEmail: string }) => `https://sub.example.test/${client.clientSubId ?? `sub-${client.clientEmail}`}`;
}

async function createXrayFixture(prefix: string, price: number) {
  const user = await prisma.user.create({ data: { telegramId: `${prefix}-${tag}`, username: prefix, balance: price * 3 } });
  const category = await prisma.category.create({ data: { name: `${prefix}-${tag}`, isActive: true } });
  const product = await prisma.product.create({ data: { categoryId: category.id, title: `${prefix} xray ${tag}`, price, duration: 30, mode: "xray_auto", trafficBytes: 10n * 1024n * 1024n * 1024n, durationDays: 30, stockLimit: 50, inboundIds: [1], isActive: true } });
  await prisma.xrayPanelConfig.create({ data: { name: `${prefix}-${tag}`, apiBaseUrl: "https://panel.example.test", apiToken: "token", subscriptionBaseUrl: "https://sub.example.test", enabled: true } });
  return { user, category, product };
}

async function createPaidByCallbackInvoice(userId: string, amount: number, productId: string) {
  return prisma.paymentInvoice.create({ data: { userId, amount, originalAmount: amount, discountAmount: 0, type: "PRODUCT_PURCHASE", productId, status: "PENDING", callbackToken: crypto.randomBytes(32).toString("hex"), payId: `pay-${tag}-${crypto.randomBytes(3).toString("hex")}`, paymentLink: "https://example.test/pay" } });
}

async function assertVisibleInMyAccounts(userId: string, xrayClientId: string) {
  const dashboard = await UserService.dashboard(userId);
  const item = dashboard.purchasedAccounts.find((entry) => entry.xrayClientId === xrayClientId || entry.xrayClient?.id === xrayClientId);
  assert(item, "delivered Xray client must be returned by the My Accounts dashboard query");
  assert(item?.xrayClient?.status === "active", "My Accounts must see the active Xray client");
  return item!;
}

async function verifyGatewayXrayProductCallback() {
  const fixture = await createXrayFixture("gateway-xray", 50_000);
  const invoice = await createPaidByCallbackInvoice(fixture.user.id, fixture.product.price, fixture.product.id);
  const first = await PaymentInvoiceService.processCallback({ invoice_id: invoice.id });
  assert(first.statusCode === 200, "gateway Xray callback should succeed");
  const result: any = first.result;
  assert(result?.xrayClient?.id && result?.account?.id === result.xrayClient.id, "notification payload must use the persisted Xray client account");
  const client = await prisma.xrayClient.findUniqueOrThrow({ where: { id: result.xrayClient.id } });
  assert(client.userId === fixture.user.id && client.productId === fixture.product.id && client.status === "active", "persisted Xray client must contain user/product/status fields");
  assert(client.panelClientId && client.clientSubId, "persisted Xray client must contain panel identifiers");
  const item = await assertVisibleInMyAccounts(fixture.user.id, client.id);
  assert(item.xrayClientId === client.id, "My Accounts order item must point at the same Xray client");
  const countBeforeDuplicate = await prisma.xrayClient.count({ where: { userId: fixture.user.id, productId: fixture.product.id } });
  const duplicate = await PaymentInvoiceService.processCallback({ invoice_id: invoice.id });
  const countAfterDuplicate = await prisma.xrayClient.count({ where: { userId: fixture.user.id, productId: fixture.product.id } });
  assert(duplicate.statusCode === 200 && duplicate.result, "duplicate gateway callback should return existing persisted delivery");
  assert(countBeforeDuplicate === 1 && countAfterDuplicate === 1, "duplicate gateway callback must not create another Xray client");
}

async function verifyWalletXrayPurchase() {
  const fixture = await createXrayFixture("wallet-xray", 40_000);
  const before = await prisma.user.findUniqueOrThrow({ where: { id: fixture.user.id } });
  const result: any = await PaymentInvoiceService.purchaseProductWithWallet(fixture.user.id, fixture.product.id);
  assert(result.xrayClient?.status === "active", "wallet Xray purchase must activate a real client");
  await assertVisibleInMyAccounts(fixture.user.id, result.xrayClient.id);
  const after = await prisma.user.findUniqueOrThrow({ where: { id: fixture.user.id } });
  assert(after.balance === before.balance - fixture.product.price, "wallet Xray purchase must deduct balance once");
  const balanceAfterDuplicateAttempt = after.balance;
  let duplicateBlocked = false;
  try { await PaymentInvoiceService.purchaseProductWithWallet(fixture.user.id, fixture.product.id); } catch { duplicateBlocked = true; }
  const finalUser = await prisma.user.findUniqueOrThrow({ where: { id: fixture.user.id } });
  const clientCount = await prisma.xrayClient.count({ where: { userId: fixture.user.id, productId: fixture.product.id } });
  assert(duplicateBlocked, "duplicate wallet Xray purchase should be blocked by delivery idempotency");
  assert(finalUser.balance === balanceAfterDuplicateAttempt && clientCount === 1, "duplicate wallet purchase must not deduct again or duplicate delivery");
}

async function verifyFreeTestXrayFlow() {
  const user = await prisma.user.create({ data: { telegramId: `free-test-${tag}`, username: "free-test" } });
  await prisma.freeTestConfig.upsert({ where: { id: "singleton" }, create: { id: "singleton", enabled: true, trafficBytes: 1024n * 1024n * 1024n, durationDays: 1, stockLimit: 1000, usedCount: 0, inboundIds: [1] }, update: { enabled: true, trafficBytes: 1024n * 1024n * 1024n, durationDays: 1, stockLimit: 1000, inboundIds: [1] } });
  const client = await FreeAccountService.claimXray(user.id);
  assert(client.isFreeTest && client.status === "active", "free test Xray flow must still activate a test client");
  const freeClients = await prisma.xrayClient.findMany({ where: { userId: user.id, isFreeTest: true, status: { in: ["active", "provisioning", "creating"] } } });
  assert(freeClients.some((entry) => entry.id === client.id), "free test Xray client must still be discoverable by My Accounts free-test query");
}

async function main() {
  installMockXrayPanel();
  await verifyGatewayXrayProductCallback();
  await verifyWalletXrayPurchase();
  await verifyFreeTestXrayFlow();
  console.log("✅ payment flow verification passed", { tag });
}

main().finally(async () => prisma.$disconnect());
