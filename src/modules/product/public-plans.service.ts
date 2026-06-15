import { prisma } from "../../services/prisma";
import { activeCategoryWhere, activeProductWhere, availableInventoryWhere } from "./visibility";

export class PublicPlansService {
  private static availableStock(product: { mode: string; stockLimit: number | null; soldCount: number; _count: { accounts: number } }) {
    return product.mode === "xray_auto" ? Math.max((product.stockLimit ?? 0) - product.soldCount, 0) : product._count.accounts;
  }
  static getSetting() {
    return prisma.publicPlansSetting.upsert({ where: { id: "singleton" }, update: {}, create: { id: "singleton", enabled: true } });
  }
  static async setEnabled(enabled: boolean, actorId: string) {
    const setting = await prisma.publicPlansSetting.upsert({ where: { id: "singleton" }, update: { enabled }, create: { id: "singleton", enabled } });
    await prisma.auditLog.create({ data: { actorId, action: "public_plans.status", metadata: JSON.stringify({ enabled }) } });
    return setting;
  }
  static async listPublicPlans(takeCategories = 6, takeProducts = 4) {
    const categories = await prisma.category.findMany({
      where: {
        AND: [activeCategoryWhere(), {
          products: { some: { AND: [activeProductWhere(), { OR: [{ accounts: { some: availableInventoryWhere() } }, { mode: "xray_auto", stockLimit: { gt: 0 } }] }] } },
        }],
      },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      take: takeCategories,
      include: { products: { where: activeProductWhere(), orderBy: [{ price: "asc" }, { title: "asc" }], include: { _count: { select: { accounts: { where: availableInventoryWhere() } } } } } },
    });
    return categories
      .map((category) => ({ ...category, products: category.products.filter((product) => this.availableStock(product) > 0).slice(0, takeProducts).map((product) => ({ ...product, availableStock: this.availableStock(product) })) }))
      .filter((category) => category.products.length > 0);
  }
}
