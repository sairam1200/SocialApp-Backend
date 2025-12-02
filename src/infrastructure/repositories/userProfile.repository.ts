import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { IUserProfileRepository } from '../../domain/repositories/iuserProfile.repository';
import { UserProfile } from '../../domain/entities/userProfile.entity';
import { Injectable } from '@nestjs/common';

@Injectable()
export class UserProfileRepository implements IUserProfileRepository {
  constructor(
    @InjectRepository(UserProfile)
    private readonly userProfileContext: Repository<UserProfile>,
  ) {}

  public async getByUserId(userId: string): Promise<UserProfile | null> {
    return await this.userProfileContext.findOne({ where: { userId } });
  }

  public async createAsync(
    profile: Omit<UserProfile, 'id' | 'createdOn' | 'lastModifiedOn'>,
  ): Promise<UserProfile> {
    const row = this.userProfileContext.create(profile);
    return await this.userProfileContext.save(row);
  }

  public async updateByUserId(
    userId: string,
    patch: Partial<UserProfile>,
  ): Promise<UserProfile | null> {
    const existing = await this.userProfileContext.findOne({
      where: { userId },
    });
    if (!existing) return null;
    const merged = this.userProfileContext.merge(existing, patch);
    return this.userProfileContext.save(merged);
  }

  public async upsertByUserId(
    userId: string,
    patch: Partial<UserProfile>,
  ): Promise<UserProfile> {
    const existing = await this.userProfileContext.findOne({
      where: { userId },
    });
    if (!existing) {
      const created = this.userProfileContext.create({ userId, ...patch });
      return this.userProfileContext.save(created);
    }
    const merged = this.userProfileContext.merge(existing, patch);
    return this.userProfileContext.save(merged);
  }
}
