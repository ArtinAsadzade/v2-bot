import { prisma } from "../../services/prisma";

export type ProductGuideInput = { title: string; shortDescription: string; body: string; icon?: string; isActive?: boolean; displayOrder?: number };

const TITLE_MAX = 80;
const SHORT_MAX = 180;
const BODY_MAX = 900;

function clean(input: ProductGuideInput) {
  const title = input.title.trim();
  const shortDescription = input.shortDescription.trim();
  const body = input.body.trim();
  const icon = input.icon?.trim() || "📘";
  if (!title || !shortDescription || !body) throw new Error("عنوان، توضیح کوتاه و متن راهنما الزامی است");
  if (title.length > TITLE_MAX) throw new Error("عنوان راهنما بیش از حد طولانی است");
  if (shortDescription.length > SHORT_MAX) throw new Error("توضیح کوتاه راهنما بیش از حد طولانی است");
  if (body.length > BODY_MAX) throw new Error("متن راهنما باید کوتاه و قابل خواندن باشد");
  return { title, shortDescription, body, icon, isActive: input.isActive ?? true, displayOrder: input.displayOrder ?? 0 };
}

export class ProductGuideService {
  static listActive() {
    return prisma.productGuideSection.findMany({ where: { isActive: true }, orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }] });
  }

  static listAll() {
    return prisma.productGuideSection.findMany({ orderBy: [{ displayOrder: "asc" }, { createdAt: "desc" }] });
  }

  static save(input: ProductGuideInput, actorId: string, id?: string) {
    const data = clean(input);
    return prisma.$transaction(async (tx) => {
      const section = id ? await tx.productGuideSection.update({ where: { id }, data }) : await tx.productGuideSection.create({ data });
      await tx.auditLog.create({ data: { actorId, action: id ? "product_guide.update" : "product_guide.create", metadata: JSON.stringify({ sectionId: section.id }) } });
      return section;
    });
  }

  static setActive(id: string, isActive: boolean, actorId: string) {
    return prisma.$transaction(async (tx) => {
      const section = await tx.productGuideSection.update({ where: { id }, data: { isActive } });
      await tx.auditLog.create({ data: { actorId, action: "product_guide.status", metadata: JSON.stringify({ sectionId: id, isActive }) } });
      return section;
    });
  }

  static delete(id: string, actorId: string) {
    return prisma.$transaction(async (tx) => {
      const section = await tx.productGuideSection.delete({ where: { id } });
      await tx.auditLog.create({ data: { actorId, action: "product_guide.delete", metadata: JSON.stringify({ sectionId: id }) } });
      return section;
    });
  }
}
