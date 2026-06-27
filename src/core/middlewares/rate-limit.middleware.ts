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
  ) {}

  private readonly limit =
    process.env.NODE_ENV === 'production' ? 120 : 100000;

  private readonly windowMs = 60 * 1000; // 1 minute

  private readonly protectedRoutes = [
    '/api/v1/auth/login',
    '/api/v1/auth/register',
    '/api/v1/auth/forgot-password',
    '/api/v1/auth/verify-otp',
  ];

  async use(req: Request, res: Response, next: NextFunction) {
    // Apply rate limiting only to auth routes
    if (!this.protectedRoutes.some(route => req.path.startsWith(route))) {
      return next();
    }

    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const route = req.path;

    const now = new Date();
    const record = await this.rateLimitRepository.getAsync(ip, route);

    if (!record) {
      await this.rateLimitRepository.createAsync(
        ip,
        route,
        new Date(now.getTime() + this.windowMs),
      );
    } else {
      if (record.expiresAt < now) {
        // Archive previous window
        await this.rateLimitRepository.createRateLimitLog(record);

        record.count = 1;
        record.expiresAt = new Date(now.getTime() + this.windowMs);
        await this.rateLimitRepository.updateAsync(record);
      } else {
        if (record.count >= this.limit) {
          throw new TooManyRequestsException(
            'Too many requests. Please try again later.',
          );
        }

        record.count++;
        await this.rateLimitRepository.updateAsync(record);
      }
    }

    next();
  }
}