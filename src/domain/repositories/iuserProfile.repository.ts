import { UserProfile } from '../entities/userProfile.entity';

export interface IUserProfileRepository {
  getByUserId(userId: string): Promise<UserProfile | null>;
  createAsync(
    profile: Omit<UserProfile, 'id' | 'createdOn' | 'lastModifiedOn'>,
  ): Promise<UserProfile>;
  updateByUserId(
    userId: string,
    patch: Partial<UserProfile>,
  ): Promise<UserProfile | null>;
  upsertByUserId(
    userId: string,
    patch: Partial<UserProfile>,
  ): Promise<UserProfile>;
}
