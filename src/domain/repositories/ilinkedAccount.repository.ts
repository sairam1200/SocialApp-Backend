import { LinkedAccount } from '../entities';
import { QueryOptions } from 'domain/types/queryOptions.type';

export interface ILinkedAccountRepository {
  createAsync(linkedAccount: LinkedAccount): Promise<LinkedAccount>;
  updateAsync(linkedAccount: LinkedAccount): Promise<void>;
  getByIdAsync(id: string): Promise<LinkedAccount | null>;
  getByUserIdAsync(userId: string): Promise<LinkedAccount[]>;
  getByEmailAsync(email: string): Promise<LinkedAccount | null>;
  getEntriesAsync(params: QueryOptions): Promise<[LinkedAccount[], number]>;
  deleteAsync(linkedAccount: LinkedAccount): Promise<LinkedAccount>;
  getByPlatformAndUserIdAsync(
    platform: string,
    id: string,
  ): Promise<LinkedAccount | null>;
  getByPlatformAndUserNameAsync(
    platform: string,
    username: string,
  ): Promise<LinkedAccount | null>;
  getByPlatformAndExternalIdAsync(
    platform: string,
    externalId: string,
  ): Promise<LinkedAccount | null>;
  getByPlatformAndEmailAsync(
    platform: string,
    email: string,
  ): Promise<LinkedAccount | null>;
  getByPlatformAndMetaDataValueAsync(
    platform: string,
    metaKey: string,
    metaValue: string,
  ): Promise<LinkedAccount | null>;
}
