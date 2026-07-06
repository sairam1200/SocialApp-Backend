import { EntityManager } from 'typeorm';

export interface IPlatformDisconnectService {
  disconnectPlatformAsync(
    userId: string,
    platform: string,
    entityManager?: EntityManager,
  ): Promise<void>;
}
