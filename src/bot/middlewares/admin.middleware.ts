import { prisma } from "../services/prisma";

export async function isAdmin(telegramId: string) {
  const user = await prisma.user.findUnique({
    where: {
      telegramId,
    },
  });

  return user?.role === "admin" || user?.role === "superadmin";
}
