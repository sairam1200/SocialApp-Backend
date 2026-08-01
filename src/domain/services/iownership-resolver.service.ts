import { LinkedAccount } from '../entities';

export interface IOwnershipResolver {
  resolveAsync(userId: string, platform: string): Promise<LinkedAccount>;
}
