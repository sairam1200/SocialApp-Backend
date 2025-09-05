import _const from "../../core/utils/const";
import { Brackets, Repository } from "typeorm";
import { InjectRepository } from "@nestjs/typeorm";
import { ManualProfile } from "../../domain/entities";
import { Injectable, NotFoundException } from "@nestjs/common";
import { QueryOptions } from "../../domain/types/queryOptions.type";
import { IManualProfileRepository } from "../../domain/repositories";
import { HttpContext } from "../../core/middlewares/httpContext.middleware";

@Injectable()
export class ManualProfileRepository implements IManualProfileRepository {

  constructor(
    @InjectRepository(ManualProfile)
    private readonly manualProfileContext: Repository<ManualProfile>
  ) { }

  public async getByUserIdAsync(userId: string): Promise<ManualProfile[]> {
    return await this.manualProfileContext.find({
      where: { userId }
    });
  }

  public async getByIdAsync(id: string): Promise<ManualProfile | null> {
    return await this.manualProfileContext.findOne({
      where: { id }
    });
  }

  public async getByUserIdAndPlatformAsync(userId: string, platform: string): Promise<ManualProfile> {
    return await this.manualProfileContext.findOne({
      where: { platform, userId }
    })
  }

  public async updateAsync(manualProfile: ManualProfile): Promise<void> {
    if (HttpContext.user) {
      manualProfile.setCurrentUser(HttpContext.getCurrentUserId);
    }
    await this.manualProfileContext.update(manualProfile.id, manualProfile);
  }

  public async deleteAsync(manualProfile: ManualProfile): Promise<void> {
    await this.manualProfileContext.remove(manualProfile);
  }

  public async createAsync(manualProfile: Partial<ManualProfile>): Promise<ManualProfile> {
    if (HttpContext.user) {
      manualProfile.setCurrentUser(HttpContext.getCurrentUserId);
    }

    if (manualProfile.displayOrder == 0 || manualProfile.displayOrder == null) {
      const maxDisplayOrder = await this.manualProfileContext
        .createQueryBuilder('manualProfile')
        .select('MAX(manualProfile.displayOrder)', 'max')
        .where('manualProfile.userId = :userId', { userId: manualProfile.userId })
        .getRawOne();

      const nextDisplayOrder = (maxDisplayOrder?.max ?? 0) + 1;
      manualProfile.displayOrder = nextDisplayOrder;
    }

    return await this.manualProfileContext.save(manualProfile);
  }

  public async reorderAsync(id: string, newDisplayOrder: number): Promise<void> {
    const profileToMove = await this.manualProfileContext.findOne({ where: { id } });

    if (!profileToMove) {
      throw new NotFoundException(`ManualProfile not found`);
    }

    const userId = profileToMove.userId;
    const oldDisplayOrder = profileToMove.displayOrder;

    if (newDisplayOrder === oldDisplayOrder) {
      return; // No change needed
    }

    if (newDisplayOrder < oldDisplayOrder) {
      await this.manualProfileContext
        .createQueryBuilder()
        .update()
        .set({ displayOrder: () => 'displayOrder + 1' })
        .where('userId = :userId', { userId })
        .andWhere('displayOrder >= :newDisplayOrder AND displayOrder < :oldDisplayOrder', {
          newDisplayOrder,
          oldDisplayOrder,
        })
        .execute();
    } else {
      await this.manualProfileContext
        .createQueryBuilder()
        .update()
        .set({ displayOrder: () => 'displayOrder - 1' })
        .where('userId = :userId', { userId })
        .andWhere('displayOrder <= :newDisplayOrder AND displayOrder > :oldDisplayOrder', {
          newDisplayOrder,
          oldDisplayOrder,
        })
        .execute();
    }

    profileToMove.displayOrder = newDisplayOrder;
    await this.manualProfileContext.save(profileToMove);
  }

  public async getEntriesAsync(params: QueryOptions): Promise<[ManualProfile[], number]> {
    let { page, pageSize, orderBy, order, searchQuery, filter } = params;
    const queryBuilder = this.manualProfileContext.createQueryBuilder("profile");

    queryBuilder
      .leftJoin("profile.user", "user")
      .addSelect([
        "user.id",
        "user.userName",
        "user.firstName",
        "user.lastName",
        "user.profileImage"
      ]);

    if (!orderBy) {
      orderBy = "url";
    }

    const whereConditions: string[] = [];
    const parameters: any = {};

    // WHERE conditions
    // queryBuilder
    //   .where("manualProfile.url IS NOT NULL")
    //   .andWhere("manualProfile.url NOT ILIKE ANY(:platforms)", {
    //     platforms: _const.KNOWN_PLATFORMS_URIS.map(p => `%${p}%`),
    //   });

    if (searchQuery) {
      const searchTerm = `%${searchQuery}%`;
      queryBuilder.andWhere(
        new Brackets(qb => {
          qb.where(
            `REGEXP_REPLACE(manualProfile.url, '^.*(?:/user/|/@|/u/|/c/|/)?([^/?#]+).*$','\\1') ILIKE :searchTerm`,
            { searchTerm }
          ).orWhere(
            `REGEXP_REPLACE(manualProfile.url, '^https?://([^/]+).*$','\\1') ILIKE :searchTerm`,
            { searchTerm }
          );
        })
      );
    }

    if (filter?.platform) {
      whereConditions.push("profile.platform = :platform");
      parameters.platform = filter.platform;
    }

    if (filter?.userId) {
      whereConditions.push("profile.userId = :userId");
      parameters.userId = filter.userId;
    }

    if (whereConditions.length > 0) {
      queryBuilder.where(whereConditions.join(" AND "), parameters);
    }

    if (searchQuery) {
      const exactSearch = searchQuery.toLowerCase();
      queryBuilder.orderBy(
        `CASE 
        WHEN manualProfile.url ILIKE :exactSearch THEN 0 
        WHEN manualProfile.url ILIKE :searchTerm THEN 1 
        ELSE 2 
      END`,
        "ASC"
      )
        .addOrderBy(`manualProfile.${orderBy}`, order)
        .setParameter("exactSearch", exactSearch)
        .setParameter("searchTerm", `%${searchQuery}%`);
    } else {
      queryBuilder.orderBy(`manualProfile.${orderBy}`, order);
    }

    queryBuilder.skip((page - 1) * pageSize)
      .take(pageSize);

    return await queryBuilder.getManyAndCount();
  }

}