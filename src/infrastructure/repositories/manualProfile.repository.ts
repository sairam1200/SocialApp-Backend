import { Repository } from "typeorm";
import { InjectRepository } from "@nestjs/typeorm";
import { ManualProfile } from "../../domain/entities";
import { Injectable, NotFoundException } from "@nestjs/common";
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
}