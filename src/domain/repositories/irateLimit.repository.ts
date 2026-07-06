import { RateLimit } from '../entities/rateLimit.entity';

export interface IRateLimitRepository {
  createAsync(ip: string, route: string, expiresAt: Date): Promise<RateLimit>;
  updateAsync(rateLimit: RateLimit): Promise<void>;
  getAsync(ip: string, route: string): Promise<RateLimit | null>;

  createRateLimitLog(rateLimit: RateLimit): Promise<void>;
}
