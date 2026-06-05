import { prisma } from "../../services/prisma";

export class UserService {
  static async findOrCreateUser(ctx: any) {
    const tgUser = ctx.from;

    let user = await prisma.user.findUnique({
      where: { telegramId: String(tgUser.id) },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          telegramId: String(tgUser.id),
          username: tgUser.username,
          firstName: tgUser.first_name,
          lastName: tgUser.last_name,
        },
      });
    }

    return user;
  }
}
