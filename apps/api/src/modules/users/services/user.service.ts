import type { UserReadModel, UserRepository } from '../repositories/user.repository.js';

export class UserService {
  public constructor(private readonly users: UserRepository) {}

  public findByTelegramId(telegramId: string): Promise<UserReadModel | null> {
    return this.users.findByTelegramId(telegramId);
  }
}
