import _const from '../../core/utils/const';
import { Brackets, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { ManualProfile } from '../../domain/entities';
import { Injectable, NotFoundException } from '@nestjs/common';
import { IManualProfileRepository } from '../../domain/repositories';
import { HttpContext } from '../../core/middlewares/httpContext.middleware';

@Injectable()
export class ManualProfileRepository implements IManualProfileRepository {
  constructor(
    @InjectRepository(ManualProfile)
    private readonly manualProfileContext: Repository<ManualProfile>,
  ) {}

  public async getByUserIdAsync(userId: string): Promise<ManualProfile[]> {
    return await this.manualProfileContext.find({
      where: { userId },
      order: { displayOrder: 'ASC' },
    });
  }

  public async getByIdAsync(id: string): Promise<ManualProfile | null> {
    return await this.manualProfileContext.findOne({
      where: { id },
    });
  }

  public async getByUserIdAndPlatformAsync(
    userId: string,
    platform: string,
  ): Promise<ManualProfile> {
    return await this.manualProfileContext.findOne({
      where: { platform, userId },
    });
  }

  public async updateAsync(manualProfile: ManualProfile): Promise<void> {
    if (HttpContext.user) {
      manualProfile.setCurrentUser(HttpContext.getCurrentUserId);
    }
    await this.manualProfileContext.save(manualProfile);
  }

  public async deleteAsync(manualProfile: ManualProfile): Promise<void> {
    const userId = manualProfile.userId;
    const deletedDisplayOrder = manualProfile.displayOrder;

    await this.manualProfileContext.remove(manualProfile);

    await this.manualProfileContext
      .createQueryBuilder()
      .update()
      .set({ displayOrder: () => 'displayOrder - 1' })
      .where('userId = :userId', { userId })
      .andWhere('displayOrder > :deletedDisplayOrder', { deletedDisplayOrder })
      .execute();

    await this.normalizeDisplayOrdersAsync(userId);
  }

  public async createAsync(
    manualProfile: Partial<ManualProfile>,
  ): Promise<ManualProfile> {
    if (HttpContext.user) {
      manualProfile.setCurrentUser(HttpContext.getCurrentUserId);
    }

    if (manualProfile.displayOrder == 0 || manualProfile.displayOrder == null) {
      const countResult = await this.manualProfileContext
        .createQueryBuilder('manualProfile')
        .where('manualProfile.userId = :userId', {
          userId: manualProfile.userId,
        })
        .getCount();

      manualProfile.displayOrder = countResult + 1;
    }

    return await this.manualProfileContext.save(manualProfile);
  }

  public async reorderAsync(
    id: string,
    newDisplayOrder: number,
  ): Promise<void> {
    const profileToMove = await this.manualProfileContext.findOne({
      where: { id },
    });

    if (!profileToMove) {
      throw new NotFoundException(`ManualProfile not found`);
    }

    const userId = profileToMove.userId;
    const oldDisplayOrder = profileToMove.displayOrder;

    const totalCount = await this.manualProfileContext
      .createQueryBuilder('manualProfile')
      .where('manualProfile.userId = :userId', { userId })
      .getCount();

    let targetDisplayOrder = newDisplayOrder;
    if (targetDisplayOrder < 1) {
      targetDisplayOrder = 1;
    } else if (targetDisplayOrder > totalCount) {
      targetDisplayOrder = totalCount;
    }

    if (targetDisplayOrder === oldDisplayOrder) {
      return; // No change needed
    }

    if (targetDisplayOrder < oldDisplayOrder) {
      await this.manualProfileContext
        .createQueryBuilder()
        .update()
        .set({ displayOrder: () => 'displayOrder + 1' })
        .where('userId = :userId', { userId })
        .andWhere(
          'displayOrder >= :targetDisplayOrder AND displayOrder < :oldDisplayOrder',
          {
            targetDisplayOrder,
            oldDisplayOrder,
          },
        )
        .andWhere('id != :id', { id })
        .execute();
    } else {
      await this.manualProfileContext
        .createQueryBuilder()
        .update()
        .set({ displayOrder: () => 'displayOrder - 1' })
        .where('userId = :userId', { userId })
        .andWhere(
          'displayOrder <= :targetDisplayOrder AND displayOrder > :oldDisplayOrder',
          {
            targetDisplayOrder,
            oldDisplayOrder,
          },
        )
        .andWhere('id != :id', { id })
        .execute();
    }

    profileToMove.displayOrder = targetDisplayOrder;
    await this.manualProfileContext.save(profileToMove);

    await this.normalizeDisplayOrdersAsync(userId);
  }

  private async normalizeDisplayOrdersAsync(userId: string): Promise<void> {
    const profiles = await this.manualProfileContext.find({
      where: { userId },
      order: { displayOrder: 'ASC' },
    });

    for (let i = 0; i < profiles.length; i++) {
      const newOrder = i + 1;
      if (profiles[i].displayOrder !== newOrder) {
        profiles[i].displayOrder = newOrder;
        await this.manualProfileContext.save(profiles[i]);
      }
    }
  }

  public async searchAsync(
    page: number,
    pageSize: number,
    searchTerm?: string,
    viewerUserId?: string,
  ): Promise<[ManualProfile[], number]> {
    if (!searchTerm || !searchTerm.trim()) {
      return [[], 0];
    }

    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const queryBuilder = this.manualProfileContext
      .createQueryBuilder('manualProfile')
      .leftJoin('manualProfile.user', 'user')
      .addSelect([
        'user.id',
        'user.userName',
        'user.firstName',
        'user.lastName',
        'user.profileImage',
      ])
      .where('manualProfile.url IS NOT NULL')
      .andWhere('manualProfile.url NOT ILIKE ANY(:platforms)', {
        platforms: _const.KNOWN_PLATFORMS_URIS.map((p) => `%${p}%`),
      })
      .andWhere(
        new Brackets((qb) => {
          qb.where(
            `REGEXP_REPLACE(manualProfile.url, '^.*(?:/user/|/@|/u/|/c/|/)?([^/?#]+).*$','\\1') ILIKE :searchTerm`,
            { searchTerm },
          ).orWhere(
            `REGEXP_REPLACE(manualProfile.url, '^https?://([^/]+).*$','\\1') ILIKE :searchTerm`,
            { searchTerm },
          );
        }),
      );

    if (viewerUserId) {
      queryBuilder.andWhere(
        `(user.profilePrivacy = 'Public' OR user.id = CAST(:viewerUserId AS uuid) OR EXISTS (
            SELECT 1 FROM "identity"."user_follows" f
            WHERE f."followerId" = CAST(:viewerUserId AS uuid)
              AND f."followedId" = user.id AND f.status = 'accepted'
        ))`,
        { viewerUserId },
      );
    } else {
      queryBuilder.andWhere("user.profilePrivacy = 'Public'");
    }

    queryBuilder.skip(skip).take(take);

    // Execute the query and get the results
    const [results, count] = await queryBuilder.getManyAndCount();
    return [results, count];
  }
}
