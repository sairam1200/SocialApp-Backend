import { Repository } from 'typeorm';
import { Injectable } from '@nestjs/common';
import { Globals } from '../../core/globals';
import { InjectRepository } from '@nestjs/typeorm';
import { RateLimit } from '../../domain/entities/rateLimit.entity';
import { RateLimitLog } from '../../domain/entities/rateLimitLog.entity';
import { HttpContext } from '../../core/middlewares/httpContext.middleware';
import { IRateLimitRepository } from '../../domain/repositories/irateLimit.repository';

@Injectable()
export class RateLimitRepository implements IRateLimitRepository {
  constructor(
    @InjectRepository(RateLimit)
    private readonly rateLimitContext: Repository<RateLimit>,
    @InjectRepository(RateLimitLog)
    private readonly rateLimitLogContext: Repository<RateLimitLog>,
  ) {}

  public async createAsync(
    ip: string,
    route: string,
    expiresAt: Date,
  ): Promise<RateLimit> {
    let rateLimit = await this.getAsync(ip, route);

    if (rateLimit) {
      await this.createRateLimitLog(rateLimit);

      rateLimit.count += 1;
      this.updateAsync(rateLimit);
    }

    rateLimit = new RateLimit({
      ip,
      route,
      count: 1,
      expiresAt,
    });

    if (HttpContext.user) {
      const userId = HttpContext.user[Globals.ClaimTypes.UserId];
      rateLimit.userId = userId;
    }

    return await this.rateLimitContext.save(rateLimit);
  }

  public async updateAsync(rateLimit: RateLimit): Promise<void> {
    if (HttpContext.user && !rateLimit.userId) {
      const userId = HttpContext.user[Globals.ClaimTypes.UserId];
      rateLimit.userId = userId;
    }

    await this.rateLimitContext.save(rateLimit);
  }

  public async getAsync(ip: string, route: string): Promise<RateLimit | null> {
    return await this.rateLimitContext.findOne({
      where: { ip, route },
    });
  }

  public async createRateLimitLog(rateLimit: RateLimit): Promise<void> {
    const rateLimitLog = new RateLimitLog({
      ip: rateLimit.ip,
      route: rateLimit.route,
      userId: rateLimit.userId,
      count: rateLimit.count,
      expiredAt: rateLimit.expiresAt,
    });

    await this.rateLimitLogContext.save(rateLimitLog);
  }
}
