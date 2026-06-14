import { prisma } from "../../services/prisma";
import { activeCategoryWhere, activeProductWhere, availableInventoryWhere } from "./visibility";

export class PublicPlansService {
  static getSetting() {
    return prisma.publicPlansSetting.upsert({ where: { id: "singleton" }, update: {}, create: { id: "singleton", enabled: true } });
  }
  static async setEnabled(enabled: boolean, actorId: string) {
    const setting = await prisma.publicPlansSetting.upsert({ where: { id: "singleton" }, update: { enabled }, create: { id: "singleton", enabled } });
    await prisma.auditLog.create({ data: { actorId, action: "public_plans.status", metadata: JSON.stringify({ enabled }) } });
    return setting;
  }
  static listPublicPlans(takeCategories = 6, takeProducts = 4) {
    return prisma.category.findMany({
      where: { AND: [activeCategoryWhere(), { products: { some: { AND: [activeProductWhere(), { accounts: { some: availableInventoryWhere() } }] } } }] },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      take: takeCategories,
      include: { products: { where: { AND: [activeProductWhere(), { accounts: { some: availableInventoryWhere() } }] }, orderBy: [{ price: "asc" }, { title: "asc" }], take: takeProducts, include: { _count: { select: { accounts: { where: availableInventoryWhere() } } } } } },
    });
  }
}
