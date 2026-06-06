import { prisma } from "../../services/prisma";
import { ReferralService } from "../referral/referral.service";

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

    const user = await prisma.user.upsert({
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
        referralCode: `ref${tgUser.id}`,
      },
    });

    if (!user.referralCode) {
      await ReferralService.ensureReferralCode(user.id, user.telegramId);
    }

    return user;
  }

  static async getByTelegramId(telegramId: number | string) {
    return prisma.user.findUnique({ where: { telegramId: String(telegramId) } });
  }
}
