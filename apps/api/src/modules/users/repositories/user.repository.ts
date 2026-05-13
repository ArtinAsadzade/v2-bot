export type UserReadModel = {
  id: string;
  telegramId: string;
  username: string | null;
  status: string;
};

export interface UserRepository {
  findByTelegramId(telegramId: string): Promise<UserReadModel | null>;
}
