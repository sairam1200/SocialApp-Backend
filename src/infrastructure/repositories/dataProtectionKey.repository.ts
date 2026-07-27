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
    console.log(`[OAUTH-DBG] REPO.getAllAsync totalCount=${results.length}`);
    return results;
  }

  public async getByIdAsync(id: string): Promise<DataProtectionKey | null> {
    return await this.dataProtectionKeyContext.findOne({ where: { id } });
  }

  public async getByKeyAsync(key: string): Promise<DataProtectionKey | null> {
    console.log(`[OAUTH-DBG] REPO.getByKeyAsync LOOKUP lookupKey=${key}`);
    const result = await this.dataProtectionKeyContext.findOne({
      where: { key },
    });
    console.log(
      `[OAUTH-DBG] REPO.getByKeyAsync RESULT lookupKey=${key} found=${!!result} rowId=${result?.id ?? 'NULL'} rowKey=${result?.key ?? 'NULL'} rowUserId=${result?.userId ?? 'NULL'} rowExpiresIn=${result?.expiresIn ?? 'NULL'}`,
    );
    return result;
  }

  public async getByUserIdAsync(userId: string): Promise<DataProtectionKey[]> {
    const results = await this.dataProtectionKeyContext.find({
      where: { userId },
    });
    console.log(
      `[OAUTH-DBG] REPO.getByUserIdAsync userId=${userId} count=${results.length} keyIds=${results.map((k) => `${k.id}:${k.key}`).join(', ')}`,
    );
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

    console.log(
      `[OAUTH-DBG] REPO.createAsync BEFORE-SAVE lookupKey=${key} userId=${userId} expiresIn=${expiresIn} now=${Math.floor(Date.now() / 1000)}`,
    );

    const saved = await this.dataProtectionKeyContext.save(newKey);

    console.log(
      `[OAUTH-DBG] REPO.createAsync AFTER-SAVE lookupKey=${key} savedId=${saved?.id} savedKey=${saved?.key} savedUserId=${saved?.userId}`,
    );

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
    console.log(
      `[OAUTH-DBG] REPO.deleteAsync DELETE rowId=${dataProtectionKey.id} lookupKey=${dataProtectionKey.key} rowUserId=${dataProtectionKey.userId}`,
    );
    await this.dataProtectionKeyContext.delete(dataProtectionKey.id);
    console.log(
      `[OAUTH-DBG] REPO.deleteAsync DELETED rowId=${dataProtectionKey.id}`,
    );
  }

  public async deleteByUserIdAsync(
    userId: string,
    entityManager?: EntityManager,
  ): Promise<void> {
    const repo = entityManager
      ? entityManager.getRepository(DataProtectionKey)
      : this.dataProtectionKeyContext;
    const keys = await repo.find({ where: { userId } });
    console.log(
      `[OAUTH-DBG] REPO.deleteByUserIdAsync userId=${userId} keysFound=${keys.length} keyIds=${keys.map((k) => `${k.id}:${k.key}`).join(', ')}`,
    );
    for (const key of keys) {
      await repo.delete(key.id);
    }
    console.log(
      `[OAUTH-DBG] REPO.deleteByUserIdAsync COMPLETE userId=${userId} deletedCount=${keys.length}`,
    );
  }
}
