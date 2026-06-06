import { prisma } from "../../services/prisma";

type TelegramUser = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
};

export class UserService {
  static async findOrCreateUser(ctxOrUser: { from?: TelegramUser } | TelegramUser) {
    const tgUser: TelegramUser | undefined = "id" in ctxOrUser ? ctxOrUser : ctxOrUser.from;

    if (!tgUser?.id) {
      throw new Error("Telegram user is missing from context");
    }

    return prisma.user.upsert({
      where: { telegramId: String(tgUser.id) },
      update: {
        username: tgUser.username ?? null,
        firstName: tgUser.first_name ?? null,
        lastName: tgUser.last_name ?? null,
      },
      create: {
        telegramId: String(tgUser.id),
        username: tgUser.username ?? null,
        firstName: tgUser.first_name ?? null,
        lastName: tgUser.last_name ?? null,
      },
    });
  }

  static async getByTelegramId(telegramId: number | string) {
    return prisma.user.findUnique({ where: { telegramId: String(telegramId) } });
  }
}
