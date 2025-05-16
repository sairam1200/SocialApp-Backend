import { LinkedAccount } from "../entities/linkedAccount.entity";

export interface ILinkedAccountRepository {
  createAsync(linkedAccount: LinkedAccount): Promise<LinkedAccount>;
  updateAsync(linkedAccount: LinkedAccount): Promise<void>;
  getByIdAsync(id: string): Promise<LinkedAccount | null>;
  getByUserIdAsync(userId: string): Promise<LinkedAccount[]>;
  getByEmailAsync(email: string): Promise<LinkedAccount | null>;

  deleteAsync(linkedAccount: LinkedAccount): Promise<LinkedAccount>;
  getByPlatformAndIdAsync(platform: string, id: string): Promise<LinkedAccount | null>;
  getByPlatformAndEmailAsync(platform: string, email: string): Promise<LinkedAccount | null>;
}