import { prisma } from "../../services/prisma";
import { eventBus } from "../../services/event-bus.service";
import { ReferralService } from "../referral/referral.service";

type TelegramUser = { id: number; username?: string; first_name?: string; last_name?: string };

export class UserService {
  static async findOrCreateUser(ctxOrUser: { from?: TelegramUser } | TelegramUser) {
    const tgUser: TelegramUser | undefined = "id" in ctxOrUser ? ctxOrUser : ctxOrUser.from;
    if (!tgUser?.id) throw new Error("Telegram user is missing from context");

    const existing = await prisma.user.findUnique({ where: { telegramId: String(tgUser.id) } });
    const user = existing
      ? await prisma.user.update({ where: { id: existing.id }, data: { username: tgUser.username ?? null, firstName: tgUser.first_name ?? null, lastName: tgUser.last_name ?? null } })
      : await prisma.user.create({ data: { telegramId: String(tgUser.id), username: tgUser.username ?? null, firstName: tgUser.first_name ?? null, lastName: tgUser.last_name ?? null, referralCode: `ref${tgUser.id}` } });

    if (!existing) eventBus.emit("user.created", { userId: user.id, telegramId: user.telegramId, referralCode: user.referralCode });
    if (!user.referralCode) await ReferralService.ensureReferralCode(user.id, user.telegramId);
    return user;
  }

  static async getByTelegramId(telegramId: number | string) {
    return prisma.user.findUnique({ where: { telegramId: String(telegramId) } });
  }
}
