import { UserProfile } from '../entities/userProfile.entity';
import { UserProfileModel } from '../contracts/userProfile.model';

export const mapToUserProfileModel = (p: UserProfile): UserProfileModel => ({
  id: p.id,
  userId: p.userId,
  displayName: p.displayName ?? null,
  bio: p.bio ?? null,
  theme: p.theme,
  settings: (p.settings ?? {}) as Record<string, unknown>,
});
