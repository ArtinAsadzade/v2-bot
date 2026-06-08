import { Prisma } from "@prisma/client";

const fieldMissingOrNull = <T>(field: keyof T) => ({
  OR: [{ [field]: null }, { [field]: { isSet: false } }],
});

export function categoryNotDeletedWhere(): Prisma.CategoryWhereInput {
  return fieldMissingOrNull<Prisma.CategoryWhereInput>("deletedAt") as Prisma.CategoryWhereInput;
}

export function productNotDeletedWhere(): Prisma.ProductWhereInput {
  return fieldMissingOrNull<Prisma.ProductWhereInput>("deletedAt") as Prisma.ProductWhereInput;
}

export function activeCategoryWhere(): Prisma.CategoryWhereInput {
  return {
    AND: [
      categoryNotDeletedWhere(),
      { isActive: true },
    ],
  };
}

export function activeProductWhere(): Prisma.ProductWhereInput {
  return {
    AND: [
      productNotDeletedWhere(),
      { isActive: true },
    ],
  };
}

export function availableInventoryWhere(productId?: string): Prisma.ProductAccountWhereInput {
  return {
    ...(productId ? { productId } : {}),
    status: "available",
  };
}

export function unassignedInventoryWhere(): Prisma.ProductAccountWhereInput {
  return {
    AND: [
      fieldMissingOrNull<Prisma.ProductAccountWhereInput>("soldTo") as Prisma.ProductAccountWhereInput,
      fieldMissingOrNull<Prisma.ProductAccountWhereInput>("soldAt") as Prisma.ProductAccountWhereInput,
    ],
  };
}
