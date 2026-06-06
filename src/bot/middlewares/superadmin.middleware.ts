import { prisma } from "../../services/prisma";

export async function isSuperAdmin(telegramId: string | number) {
  const user = await prisma.user.findUnique({ where: { telegramId: String(telegramId) }, select: { role: true } });
  return user?.role === "superadmin";
}
