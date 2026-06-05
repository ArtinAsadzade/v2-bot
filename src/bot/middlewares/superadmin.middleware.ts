import { prisma } from "../services/prisma";

export async function isSuperAdmin(telegramId: string) {
  const user = await prisma.user.findUnique({
    where: {
      telegramId,
    },
  });

  return user?.role === "superadmin";
}
