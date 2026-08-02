import { Repository, EntityManager } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { HttpContext } from '../../core/middlewares/httpContext.middleware';
import { DataProtectionKey } from '../../domain/entities/dataProtectionKey.entity';
import { IDataProtectionKeyRepository } from '../../domain/repositories/idataProtectionKey.repository';

export class DataProtectionKeyRepository implements IDataProtectionKeyRepository {
  constructor(
    @InjectRepository(DataProtectionKey)
    private readonly dataProtectionKeyContext: Repository<DataProtectionKey>,
  ) {}

  public async getAllAsync(): Promise<DataProtectionKey[]> {
    const results = await this.dataProtectionKeyContext.find();
    return results;
  }

  public async getByIdAsync(id: string): Promise<DataProtectionKey | null> {
    return await this.dataProtectionKeyContext.findOne({ where: { id } });
  }

  public async getByKeyAsync(key: string): Promise<DataProtectionKey | null> {
    const result = await this.dataProtectionKeyContext.findOne({
      where: { key },
    });
    return result;
  }

  public async getByUserIdAsync(userId: string): Promise<DataProtectionKey[]> {
    const results = await this.dataProtectionKeyContext.find({
      where: { userId },
    });
    return results;
  }

  public async getByUserIdAndKeyAsync(
    userId: string,
    key: string,
  ): Promise<DataProtectionKey | null> {
    return await this.dataProtectionKeyContext.findOne({
      where: { userId, key },
    });
  }

  public async createAsync(
    key: string,
    value: string,
    userId: string | null,
    expiresIn = 604800,
  ): Promise<DataProtectionKey> {
    const newKey = new DataProtectionKey({
      key,
      value,
      expiresIn,
      userId,
    });

    if (HttpContext.user) {
      newKey.setCurrentUser(HttpContext.getCurrentUserId);
    }

    const saved = await this.dataProtectionKeyContext.save(newKey);

    return saved;
  }

  public async updateAsync(
    dataProtectionKey: DataProtectionKey,
  ): Promise<void> {
    if (HttpContext.user) {
      dataProtectionKey.setCurrentUser(HttpContext.getCurrentUserId);
    }

    await this.dataProtectionKeyContext.save(dataProtectionKey);
  }

  public async deleteAsync(
    dataProtectionKey: DataProtectionKey,
  ): Promise<void> {
    await this.dataProtectionKeyContext.delete(dataProtectionKey.id);
  }

  public async deleteByUserIdAsync(
    userId: string,
    entityManager?: EntityManager,
  ): Promise<void> {
    const repo = entityManager
      ? entityManager.getRepository(DataProtectionKey)
      : this.dataProtectionKeyContext;
    const keys = await repo.find({ where: { userId } });
    for (const key of keys) {
      await repo.delete(key.id);
    }
  }
}
