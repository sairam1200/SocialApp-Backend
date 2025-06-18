import _const from 'core/utils/const';
import { Request, Response, NextFunction } from 'express';
import { Inject, Injectable, NestMiddleware } from '@nestjs/common';
import { IRateLimitRepository } from '../../domain/repositories/irateLimit.repository';
import { TooManyRequestsException } from '../../core/exceptions/tooManyRequest.exception';

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {

  constructor(
    @Inject(_const.IRATELIMIT_REPOSITORY)
    private readonly rateLimitRepository: IRateLimitRepository,
  ) { }

  private readonly limit = 20; // requests
  private readonly windowMs = 60 * 60 * 1000; // 1 hour

  async use(req: Request, res: Response, next: NextFunction) {
    const ip = req.ip || req.connection.remoteAddress;
    const route = req.route?.path || req.originalUrl;

    const now = new Date();
    const record = await this.rateLimitRepository.getAsync(ip, route);

    if (!record) {
      await this.rateLimitRepository.createAsync(ip, route, new Date(now.getTime() + this.windowMs));
    } else {
      if (record.expiresAt < now) {
        // Log the old window to RateLimitLog
        await this.rateLimitRepository.createRateLimitLog(record);

        record.count = 1;
        record.expiresAt = new Date(now.getTime() + this.windowMs);
        await this.rateLimitRepository.updateAsync(record);
      } else {
        if (record.count >= this.limit) {
          throw new TooManyRequestsException('Too many requests. Please try again later.');
        }
        record.count++;
        await this.rateLimitRepository.updateAsync(record);
      }
    }
    next();
  }
}